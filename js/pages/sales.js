// Bood CRM — Sales Page
import { getRows, appendRow, appendRows, updateRow, genId, now, getSettings } from '../sheets.js';
import { calcCustomerBalance, calcOnHand, getEffectivePrice, formatCurrency, formatDate, formatDateTime, escHtml } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTable, pageHeader, formField, numberInput, selectInput, textareaInput, collectForm,
  createMovementChip } from '../ui.js';
import t from '../i18n.js';

let sales = [];
let customers = [];
let components = [];
let inventory = [];
let moneyLedger = [];
let batches = [];
let settings = {};
let _filterMonth = null;

function _monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

// Detect whether a sale uses the new items format
function isNewStyle(sale) {
  return !!sale.items;
}

// Parse items from either format; returns array of {type, name, qty_l?, price_per_l?, qty?, unit_price?, subtotal}
function parseSaleItems(sale) {
  if (sale.items) {
    try { return JSON.parse(sale.items); } catch { return []; }
  }
  if (sale.items_snapshot) {
    try {
      return JSON.parse(sale.items_snapshot).map(i => ({
        type: 'legacy',
        name: i.name || '?',
        qty: i.qty,
        unit_price: i.unit_price,
        subtotal: (parseFloat(i.qty)||0) * (parseFloat(i.unit_price)||0),
      }));
    } catch { return []; }
  }
  return [];
}

export async function renderSales(container) {
  showLoading(container);
  try {
    [sales, customers, components, inventory, moneyLedger, batches, settings] = await Promise.all([
      getRows('Sales'),
      getRows('Customers'),
      getRows('Components'),
      getRows('Inventory'),
      getRows('MoneyLedger'),
      getRows('Batches'),
      getSettings(),
    ]);
    _render(container);
  } catch (e) {
    showError(container, e);
  }
}

function _render(container) {
  const active = sales.filter(s => s.is_active !== 'FALSE');

  const months = [...new Set(
    active.map(s => s.created_at?.slice(0, 7)).filter(Boolean)
  )].sort().reverse();

  const filtered = _filterMonth
    ? active.filter(s => s.created_at?.startsWith(_filterMonth))
    : active;

  const postedSales = filtered.filter(s => s.status === 'posted' && s.sale_type !== 'gift');
  const totalAmount = postedSales.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);

  // Total liters: new style sums product lines qty_l, old style sums items_snapshot qty
  const totalLiters = filtered.reduce((s, r) => {
    const items = parseSaleItems(r);
    return s + items.reduce((ss, i) => {
      if (i.type === 'product') return ss + (parseFloat(i.qty_l) || 0);
      if (i.type === 'legacy')  return ss + (parseFloat(i.qty) || 0);
      return ss;
    }, 0);
  }, 0);

  const n = filtered.length;
  const dealWord = n === 1 ? 'сделка' : n > 1 && n < 5 ? 'сделки' : 'сделок';

  container.innerHTML = `
    ${pageHeader(t('sales'), `
      <button class="btn btn-primary" id="btn-new-sale">+ Продажа</button>
      <button class="btn btn-secondary" id="btn-new-gift" style="margin-left:8px">🎁 Подарок</button>
    `)}
    <div class="filter-chips" style="margin-bottom:12px">
      <button class="chip-filter${!_filterMonth ? ' active' : ''}" data-month="">Все</button>
      ${months.map(m => `<button class="chip-filter${_filterMonth === m ? ' active' : ''}" data-month="${escHtml(m)}">${_monthLabel(m)}</button>`).join('')}
    </div>
    <div class="sales-totals-bar">
      <span><strong>${n}</strong> ${dealWord}</span>
      <span><strong>${totalLiters.toFixed(1)} л</strong></span>
      <span class="sales-totals-amount">${formatCurrency(totalAmount, settings.currency)}</span>
    </div>
    <div id="sales-table"></div>
  `;

  const cols = [
    { label: 'Дата', sortKey: 'created_at', render: r => formatDate(r.created_at) },
    { label: t('customer'),
      sortFn: r => customers.find(c => c.id === r.customer_id)?.name || '',
      render: r => {
        const c = customers.find(c => c.id === r.customer_id);
        const name = escHtml(c?.name || (r.sale_type === 'gift' ? '— без получателя —' : '—'));
        return r.sale_type === 'gift' ? `<span>🎁 ${name}</span>` : name;
      }},
    { label: 'Позиции', render: r => {
      const items = parseSaleItems(r);
      if (!items.length) return '—';
      if (isNewStyle(r)) {
        const prodLines = items.filter(i => i.type === 'product');
        const packLines = items.filter(i => i.type === 'packaging');
        const liters = prodLines.reduce((s, i) => s + (parseFloat(i.qty_l)||0), 0);
        const parts = [];
        if (liters) parts.push(`${liters.toFixed(1)} л`);
        if (packLines.length) parts.push(`+${packLines.length} уп.`);
        return `<span class="text-muted">${prodLines.length} пар. · ${parts.join(' ')}</span>`;
      }
      const liters = items.reduce((s, i) => s + (parseFloat(i.qty)||0), 0);
      return `<span class="text-muted">${items.length} поз. · ${liters.toFixed(1)} л</span>`;
    }},
    { label: 'Сумма',
      sortFn: r => parseFloat(r.total_amount || 0),
      render: r => {
        if (r.sale_type === 'gift') return `<span class="text-muted">Подарок</span>`;
        return formatCurrency(r.total_amount, settings.currency);
      }},
    { label: 'Статус', render: r => {
      const cls = r.status === 'posted' ? 'badge-success' : 'badge-muted';
      return `<span class="${cls}">${r.status === 'posted' ? '✓ Проведена' : '○ Черновик'}</span>`;
    }},
    { label: t('actions'), render: r => `
      ${r.status !== 'posted' ? `<button class="btn btn-sm btn-primary btn-post-sale" data-id="${r.id}">Провести</button>` : ''}
      <button class="btn btn-sm btn-secondary btn-view-sale" data-id="${r.id}">Детали</button>
    `},
  ];

  renderTable(container.querySelector('#sales-table'), cols, filtered, {
    emptyMessage: 'Нет продаж',
    defaultSortCol: 0,
    defaultSortDir: -1,
  });

  container.querySelectorAll('.chip-filter[data-month]').forEach(btn => {
    btn.addEventListener('click', () => {
      _filterMonth = btn.dataset.month || null;
      _render(container);
    });
  });

  container.querySelector('#btn-new-sale')?.addEventListener('click', () => showSaleForm(container, 'sale'));
  container.querySelector('#btn-new-gift')?.addEventListener('click', () => showSaleForm(container, 'gift'));

  container.querySelectorAll('.btn-post-sale').forEach(btn => {
    btn.addEventListener('click', () => {
      const sale = sales.find(s => s.id === btn.dataset.id);
      if (sale) postSale(sale, container);
    });
  });

  container.querySelectorAll('.btn-view-sale').forEach(btn => {
    btn.addEventListener('click', () => {
      const sale = sales.find(s => s.id === btn.dataset.id);
      if (sale) showSaleDetail(sale, container);
    });
  });
}

// ─── New sale form ────────────────────────────────────────────────────────────
function showSaleForm(pageContainer, saleType = 'sale') {
  const isGift = saleType === 'gift';
  const custOpts = customers
    .filter(c => c.is_active !== 'FALSE')
    .map(c => ({ value: c.id, label: c.name }));

  // Batches with packaged volume, newest first
  const packBatches = batches
    .filter(b => b.is_active !== 'FALSE' && parseFloat(b.packaged_l) > 0)
    .sort((a, b) => new Date(b.brew_date || 0) - new Date(a.brew_date || 0));

  // Packaging components
  const packComps = components.filter(c => c.type === 'packaging' && c.is_active !== 'FALSE');

  const CONTAINER_SIZES = [
    { value: '0.44', label: '0.44 л' },
    { value: '1',    label: '1 л' },
    { value: '1.5',  label: '1.5 л' },
    { value: 'custom', label: 'Другой...' },
  ];

  // {batch_id, container_size, custom_size, qty_containers, price_per_l}
  let productLines = [];
  let packLines    = []; // {component_id, qty, unit_price}

  function lineQtyL(line) {
    const size = line.container_size === 'custom'
      ? (parseFloat(line.custom_size) || 0)
      : (parseFloat(line.container_size) || 0);
    return (parseFloat(line.qty_containers) || 0) * size;
  }

  function calcTotal() {
    if (isGift) return 0;
    const prod = productLines.reduce((s, l) => s + lineQtyL(l) * (parseFloat(l.price_per_l) || 0), 0);
    const pack = packLines.reduce((s, l) => s + (parseFloat(l.qty)||0) * (parseFloat(l.unit_price)||0), 0);
    return prod + pack;
  }

  function renderLines(overlay) {
    const prodEl = overlay.querySelector('#prod-lines');
    const packEl = overlay.querySelector('#pack-lines');
    const totalEl = overlay.querySelector('#sale-total');

    if (prodEl) {
      prodEl.innerHTML = productLines.length ? productLines.map((line, i) => {
        const qtyL = lineQtyL(line);
        const subtotal = isGift ? 0 : qtyL * (parseFloat(line.price_per_l) || 0);
        const isCustom = line.container_size === 'custom';
        return `
          <div class="sale-line" data-idx="${i}" style="flex-wrap:wrap;gap:6px">
            <select class="form-control prod-batch" data-idx="${i}" style="flex:1;min-width:160px">
              ${packBatches.map(b => `<option value="${b.id}" ${b.id === line.batch_id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('')}
            </select>
            <select class="form-control prod-csize" data-idx="${i}" style="width:100px">
              ${CONTAINER_SIZES.map(o => `<option value="${o.value}" ${o.value === line.container_size ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            ${isCustom ? `<input type="number" class="form-control prod-custom-size" data-idx="${i}" value="${line.custom_size||''}" placeholder="л" step="0.01" style="width:70px">` : ''}
            <input type="number" class="form-control prod-qty-cnt" data-idx="${i}" value="${line.qty_containers||''}" placeholder="шт." step="1" min="1" style="width:75px">
            <span class="text-muted" style="min-width:48px;font-size:12px;align-self:center">${qtyL > 0 ? `= ${qtyL.toFixed(2).replace(/\.?0+$/,'')} л` : '— л'}</span>
            ${!isGift ? `
              <input type="number" class="form-control prod-price" data-idx="${i}" value="${line.price_per_l||''}" placeholder="₽/л" step="1" style="width:80px">
              <span class="line-total text-muted" style="min-width:72px;text-align:right;font-size:12px">${subtotal > 0 ? formatCurrency(subtotal, settings.currency) : '—'}</span>
            ` : ''}
            <button type="button" class="btn-remove-ingredient prod-remove" data-idx="${i}">🗑</button>
          </div>
        `;
      }).join('') : '<p class="text-muted" style="padding:6px 0">Добавьте партию</p>';

      prodEl.querySelectorAll('.prod-batch').forEach(sel => {
        sel.addEventListener('change', () => {
          const idx = parseInt(sel.dataset.idx);
          productLines[idx].batch_id = sel.value;
          const b = batches.find(b => b.id === sel.value);
          if (b?.sale_price_per_l && !productLines[idx].price_per_l) {
            productLines[idx].price_per_l = b.sale_price_per_l;
          }
          renderLines(overlay);
        });
      });
      prodEl.querySelectorAll('.prod-csize').forEach(sel => {
        sel.addEventListener('change', () => {
          productLines[parseInt(sel.dataset.idx)].container_size = sel.value;
          renderLines(overlay);
        });
      });
      prodEl.querySelectorAll('.prod-custom-size').forEach(inp => {
        inp.addEventListener('input', () => { productLines[parseInt(inp.dataset.idx)].custom_size = inp.value; renderLines(overlay); });
      });
      prodEl.querySelectorAll('.prod-qty-cnt').forEach(inp => {
        inp.addEventListener('input', () => { productLines[parseInt(inp.dataset.idx)].qty_containers = inp.value; renderLines(overlay); });
      });
      prodEl.querySelectorAll('.prod-price').forEach(inp => {
        inp.addEventListener('input', () => { productLines[parseInt(inp.dataset.idx)].price_per_l = inp.value; renderLines(overlay); });
      });
      prodEl.querySelectorAll('.prod-remove').forEach(btn => {
        btn.addEventListener('click', () => { productLines.splice(parseInt(btn.dataset.idx), 1); renderLines(overlay); });
      });
    }

    if (packEl) {
      packEl.innerHTML = packLines.length ? packLines.map((line, i) => {
        const comp = components.find(c => c.id === line.component_id);
        const onHand = calcOnHand(inventory, line.component_id);
        return `
          <div class="sale-line" data-idx="${i}">
            <select class="form-control pack-comp" data-idx="${i}">
              ${packComps.map(c => {
                const stock = calcOnHand(inventory, c.id);
                return `<option value="${c.id}" ${c.id === line.component_id ? 'selected' : ''}>${escHtml(c.name)} (${stock.toFixed(0)} ${c.unit})</option>`;
              }).join('')}
            </select>
            <input type="number" class="form-control pack-qty" data-idx="${i}" value="${line.qty||''}" placeholder="Кол-во" step="1" style="width:90px">
            ${!isGift ? `
              <input type="number" class="form-control pack-price" data-idx="${i}" value="${line.unit_price||''}" placeholder="Цена" step="1" style="width:90px">
              <span class="line-total text-muted" style="min-width:80px;text-align:right">${formatCurrency((parseFloat(line.qty)||0)*(parseFloat(line.unit_price)||0), settings.currency)}</span>
            ` : '<span class="text-muted" style="min-width:80px;font-size:0.85em">бесплатно</span>'}
            <button type="button" class="btn-remove-ingredient pack-remove" data-idx="${i}">🗑</button>
          </div>
        `;
      }).join('') : '<p class="text-muted" style="padding:6px 0">Не добавлено</p>';

      packEl.querySelectorAll('.pack-comp').forEach(sel => {
        sel.addEventListener('change', () => {
          const idx = parseInt(sel.dataset.idx);
          packLines[idx].component_id = sel.value;
          // Auto-fill catalog price
          const { price } = getEffectivePrice(sel.value, inventory, components);
          if (price && !packLines[idx].unit_price) packLines[idx].unit_price = String(price);
          renderLines(overlay);
        });
      });
      packEl.querySelectorAll('.pack-qty').forEach(inp => {
        inp.addEventListener('input', () => { packLines[parseInt(inp.dataset.idx)].qty = inp.value; renderLines(overlay); });
      });
      packEl.querySelectorAll('.pack-price').forEach(inp => {
        inp.addEventListener('input', () => { packLines[parseInt(inp.dataset.idx)].unit_price = inp.value; renderLines(overlay); });
      });
      packEl.querySelectorAll('.pack-remove').forEach(btn => {
        btn.addEventListener('click', () => { packLines.splice(parseInt(btn.dataset.idx), 1); renderLines(overlay); });
      });
    }

    if (totalEl && !isGift) totalEl.textContent = formatCurrency(calcTotal(), settings.currency);
  }

  const noBatches = !packBatches.length;

  const html = `
    <form id="sale-form" class="form-grid">
      ${isGift ? `
        <div class="alert alert-info" style="margin-bottom:8px">
          🎁 Подарок — объём спишется из баланса партии, баланс клиента <strong>не изменится</strong>.
        </div>
      ` : ''}
      ${formField(
        isGift ? 'Получатель (не обязательно)' : 'Клиент',
        selectInput('customer_id', [{ value:'', label: isGift ? '— без получателя —' : '— выбрать —' }, ...custOpts], ''),
        '', !isGift
      )}
      ${noBatches ? `<div class="alert alert-warning">⚠ Нет партий с упакованным объёмом. Заполните вкладку «Упаковка» в партии.</div>` : ''}
      <div style="margin-top:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <strong style="font-size:12px">Партии (пиво / дистиллят)</strong>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-add-prod" ${noBatches ? 'disabled' : ''}>+ Добавить</button>
        </div>
        <div class="sale-lines-wrap" id="prod-lines"></div>
      </div>
      ${packComps.length ? `
        <div style="margin-top:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <strong style="font-size:12px">Упаковка (кеги, бутылки...)</strong>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-pack">+ Добавить</button>
          </div>
          <div class="sale-lines-wrap" id="pack-lines"></div>
        </div>
      ` : ''}
      ${!isGift ? `
        <div class="sale-total-row" style="margin-top:12px;text-align:right">
          <strong>Итого: <span id="sale-total">0 ₽</span></strong>
        </div>
      ` : ''}
      ${formField(t('notes'), textareaInput('notes', ''))}
    </form>
  `;

  const overlay = showModal(
    isGift ? '🎁 Оформить подарок' : t('new_sale'),
    html,
    [
      { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
      { label: 'Создать черновик', class: 'btn-primary', action: 'save', onClick: async (dlg) => {
        const data = collectForm(dlg.querySelector('#sale-form'));
        if (!isGift && !data.customer_id) { showToast('Выберите клиента', 'warning'); return; }
        if (!productLines.length) { showToast('Добавьте хотя бы одну партию', 'warning'); return; }
        const hasEmptyQty = productLines.some(l => !(lineQtyL(l) > 0));
        if (hasEmptyQty) { showToast('Укажите количество штук', 'warning'); return; }

        const total = calcTotal();
        const items = [
          ...productLines.map(l => {
            const b = batches.find(b => b.id === l.batch_id);
            const qtyL = lineQtyL(l);
            const containerSize = l.container_size === 'custom' ? parseFloat(l.custom_size) : parseFloat(l.container_size);
            return {
              type: 'product',
              batch_id: l.batch_id,
              name: b?.name || '?',
              container_size: containerSize || 0,
              qty_containers: parseFloat(l.qty_containers) || 0,
              qty_l: qtyL,
              price_per_l: isGift ? 0 : (parseFloat(l.price_per_l) || 0),
              subtotal: isGift ? 0 : qtyL * (parseFloat(l.price_per_l) || 0),
            };
          }),
          ...packLines.map(l => {
            const comp = components.find(c => c.id === l.component_id);
            return {
              type: 'packaging',
              component_id: l.component_id,
              name: comp?.name || '?',
              qty: parseFloat(l.qty) || 0,
              unit_price: isGift ? 0 : (parseFloat(l.unit_price) || 0),
              subtotal: isGift ? 0 : (parseFloat(l.qty)||0) * (parseFloat(l.unit_price)||0),
            };
          }),
        ];

        try {
          await appendRow('Sales', {
            id: genId(),
            customer_id: data.customer_id || '',
            items: JSON.stringify(items),
            items_snapshot: '',
            status: 'draft',
            total_amount: String(total),
            notes: data.notes || '',
            is_active: 'TRUE',
            created_at: now(),
            updated_at: now(),
            sale_type: saleType,
          });
          closeModal();
          showToast(isGift ? '🎁 Подарок создан (черновик)' : 'Продажа создана (черновик)');
          await renderSales(pageContainer);
        } catch (e) { showToast(e.message, 'error'); }
      }},
    ],
    { wide: true }
  );

  overlay.querySelector('#btn-add-prod')?.addEventListener('click', () => {
    const firstBatch = packBatches[0];
    productLines.push({
      batch_id: firstBatch?.id || '',
      container_size: '0.44',
      custom_size: '',
      qty_containers: '',
      price_per_l: firstBatch?.sale_price_per_l || '',
    });
    renderLines(overlay);
  });

  overlay.querySelector('#btn-add-pack')?.addEventListener('click', () => {
    const firstComp = packComps[0];
    const { price } = firstComp ? getEffectivePrice(firstComp.id, inventory, components) : { price: null };
    packLines.push({ component_id: firstComp?.id || '', qty: '', unit_price: price ? String(price) : '' });
    renderLines(overlay);
  });

  renderLines(overlay);
}

// ─── Post sale ────────────────────────────────────────────────────────────────
async function postSale(sale, pageContainer) {
  const isGift = sale.sale_type === 'gift';
  const newStyle = isNewStyle(sale);

  if (newStyle) {
    // New-style: MoneyLedger charge only (packaging deduction in Sprint 2.2)
    const confirmMsg = isGift
      ? 'Объём будет зачтён в балансе партий. Баланс клиента не изменится.'
      : 'Баланс клиента уменьшится на сумму продажи. Упаковка будет списана со склада.';

    showConfirm(isGift ? '🎁 Провести подарок?' : t('confirm_post'), confirmMsg, async () => {
      try {
        const ts = now();
        const items = parseSaleItems(sale);
        const packItems = items.filter(i => i.type === 'packaging');

        // Deduct packaging components from inventory
        if (packItems.length) {
          const invRows = packItems.map(item => ({
            id: genId(),
            component_id: item.component_id,
            qty_delta: String(-Math.abs(item.qty || 0)),
            movement_type: isGift ? 'gift_out' : 'packaging_consume',
            ref_type: 'sale', ref_id: sale.id,
            unit_cost: String(item.unit_price || 0),
            notes: `Продажа: ${customers.find(c => c.id === sale.customer_id)?.name || sale.id.slice(0,8)}`,
            created_at: ts,
          }));
          await appendRows('Inventory', invRows);
        }

        // Charge customer
        if (!isGift && sale.customer_id && parseFloat(sale.total_amount) > 0) {
          await appendRow('MoneyLedger', {
            id: genId(), customer_id: sale.customer_id,
            amount_signed: String(-parseFloat(sale.total_amount)),
            movement_type: 'sale_charge', ref_type: 'sale', ref_id: sale.id,
            notes: `Продажа #${sale.id.slice(0,8)}`, created_at: ts,
          });
        }

        await updateRow('Sales', sale.id, { ...sale, status: 'posted', posted_at: ts, updated_at: ts });
        showToast(isGift ? '🎁 Подарок проведён' : t('posted_ok'));
        await renderSales(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    });
    return;
  }

  // Legacy path — old sales with finished_beer/spirit components
  const customer = customers.find(c => c.id === sale.customer_id);
  const confirmMsg = isGift
    ? 'Продукция спишется со склада. Баланс клиента не изменится.'
    : 'Продукция будет списана со склада, баланс клиента уменьшен.';

  showConfirm(isGift ? '🎁 Провести подарок?' : t('confirm_post'), confirmMsg, async () => {
    try {
      const items = JSON.parse(sale.items_snapshot || '[]');
      const ts = now();

      for (const item of items) {
        const onHand = calcOnHand(inventory, item.component_id);
        if (onHand < parseFloat(item.qty||0)) {
          showToast(`Недостаточно на складе: ${item.name} (есть ${onHand.toFixed(2)}, нужно ${item.qty})`, 'warning');
          return;
        }
      }

      const recipientName = customer?.name || (isGift ? 'без получателя' : '?');
      const invRows = items.map(item => ({
        id: genId(), component_id: item.component_id,
        qty_delta: String(-Math.abs(parseFloat(item.qty)||0)),
        movement_type: isGift ? 'gift_out' : 'sale_out',
        ref_type: 'sale', ref_id: sale.id,
        unit_cost: item.unit_price,
        notes: isGift ? `Подарок: ${recipientName}` : `Продажа: ${recipientName}`,
        created_at: ts,
      }));
      await appendRows('Inventory', invRows);

      if (!isGift && sale.customer_id) {
        await appendRow('MoneyLedger', {
          id: genId(), customer_id: sale.customer_id,
          amount_signed: String(-parseFloat(sale.total_amount||0)),
          movement_type: 'sale_charge', ref_type: 'sale', ref_id: sale.id,
          notes: `Продажа #${sale.id.slice(0,8)}`, created_at: ts,
        });
      }

      await updateRow('Sales', sale.id, { ...sale, status: 'posted', posted_at: ts, updated_at: ts });
      showToast(isGift ? '🎁 Подарок проведён' : t('posted_ok'));
      await renderSales(pageContainer);
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ─── Sale detail ──────────────────────────────────────────────────────────────
function showSaleDetail(sale, pageContainer) {
  const items = parseSaleItems(sale);
  const customer = customers.find(c => c.id === sale.customer_id);
  const total = parseFloat(sale.total_amount || 0);
  const newStyle = isNewStyle(sale);

  let itemsHtml;
  if (newStyle) {
    const prodItems = items.filter(i => i.type === 'product');
    const packItems = items.filter(i => i.type === 'packaging');
    const rows = [
      ...prodItems.map(i => {
        const containerStr = i.qty_containers
          ? `${i.qty_containers} × ${i.container_size} л`
          : `${i.qty_l} л`;
        return `<tr>
          <td>${escHtml(i.name)}</td>
          <td>${containerStr} <span class="text-muted" style="font-size:0.85em">(${i.qty_l} л)</span></td>
          <td>${sale.sale_type === 'gift' ? '—' : formatCurrency(i.price_per_l, settings.currency) + '/л'}</td>
          <td>${sale.sale_type === 'gift' ? '—' : formatCurrency(i.subtotal, settings.currency)}</td>
        </tr>`;
      }),
      ...packItems.map(i => `<tr>
        <td><span class="text-muted" style="font-size:0.85em">уп.</span> ${escHtml(i.name)}</td>
        <td>${i.qty} шт.</td>
        <td>${sale.sale_type === 'gift' ? '—' : formatCurrency(i.unit_price, settings.currency)}</td>
        <td>${sale.sale_type === 'gift' ? '—' : formatCurrency(i.subtotal, settings.currency)}</td>
      </tr>`),
    ];
    itemsHtml = rows.join('');
  } else {
    itemsHtml = items.map(i => `<tr>
      <td>${escHtml(i.name||'?')}</td>
      <td>${escHtml(String(i.qty||'?'))}</td>
      <td>${formatCurrency(i.unit_price, settings.currency)}</td>
      <td>${formatCurrency(i.subtotal, settings.currency)}</td>
    </tr>`).join('');
  }

  const html = `
    <div class="sale-detail">
      <div class="sale-meta">
        ${sale.sale_type === 'gift' ? '<p><span style="color:var(--success)">🎁 Подарок</span> — баланс клиента не изменяется</p>' : ''}
        <p><strong>${sale.sale_type === 'gift' ? 'Получатель' : 'Клиент'}:</strong> ${escHtml(customer?.name||'—')}</p>
        <p><strong>Дата:</strong> ${formatDateTime(sale.created_at)}</p>
        <p><strong>Статус:</strong> ${sale.status === 'posted' ? '✓ Проведена' : '○ Черновик'}</p>
        ${sale.posted_at ? `<p><strong>Дата проводки:</strong> ${formatDateTime(sale.posted_at)}</p>` : ''}
      </div>
      <table class="data-table" style="margin:16px 0">
        <thead><tr><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
        <tbody>
          ${itemsHtml}
          ${sale.sale_type !== 'gift' ? `<tr class="cost-total"><td colspan="3"><strong>Итого</strong></td><td><strong>${formatCurrency(total, settings.currency)}</strong></td></tr>` : ''}
        </tbody>
      </table>
      ${sale.notes ? `<p><strong>Заметки:</strong> ${escHtml(sale.notes)}</p>` : ''}
    </div>
  `;

  showModal(`Продажа #${sale.id.slice(0,8)}`, html, [
    { label: t('close'), class: 'btn-secondary', action: 'close', onClick: closeModal },
    ...(sale.status === 'posted' && sale.sale_type !== 'gift' && isNewStyle(sale) ? [{
      label: '🖨 Инвойс', class: 'btn-secondary', action: 'invoice',
      onClick: () => showInvoice(sale),
    }] : []),
    ...(sale.status !== 'posted' ? [{
      label: t('post_sale'), class: 'btn-primary', action: 'post',
      onClick: () => { closeModal(); postSale(sale, pageContainer); }
    }] : []),
  ], { wide: true });
}

// ─── Invoice print ────────────────────────────────────────────────────────────
function showInvoice(sale) {
  const customer = customers.find(c => c.id === sale.customer_id);
  const items = parseSaleItems(sale);
  const prodItems = items.filter(i => i.type === 'product');
  const packItems = items.filter(i => i.type === 'packaging');
  const total = parseFloat(sale.total_amount || 0);
  const invoiceNum = sale.id.slice(0, 8).toUpperCase();

  const rows = [
    ...prodItems.map((i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escHtml(i.name)}</td>
        <td style="text-align:center">${i.qty_l} л</td>
        <td style="text-align:right">${formatCurrency(i.price_per_l, settings.currency)}/л</td>
        <td style="text-align:right">${formatCurrency(i.subtotal, settings.currency)}</td>
      </tr>`),
    ...packItems.map((i, idx) => `
      <tr>
        <td>${prodItems.length + idx + 1}</td>
        <td>${escHtml(i.name)}</td>
        <td style="text-align:center">${i.qty} шт.</td>
        <td style="text-align:right">${formatCurrency(i.unit_price, settings.currency)}</td>
        <td style="text-align:right">${formatCurrency(i.subtotal, settings.currency)}</td>
      </tr>`),
  ].join('');

  const invoiceHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Инвойс ${invoiceNum}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 32px 40px; }
    .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
    .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 28px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
    .invoice-title .inv-num { font-size: 13px; color: #666; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-block h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 6px; }
    .meta-block p { font-size: 13px; line-height: 1.6; }
    .meta-block strong { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { border-bottom: 2px solid #1a1a1a; }
    thead th { padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; text-align: left; }
    thead th:nth-child(n+3) { text-align: right; }
    tbody tr { border-bottom: 1px solid #ddd; }
    tbody td { padding: 9px 10px; }
    .total-row td { border-top: 2px solid #1a1a1a; padding: 10px; font-weight: 700; font-size: 15px; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    @media print {
      body { padding: 16px 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div>
      <div class="company-name">BOOD</div>
      <div style="font-size:11px;color:#888;margin-top:2px">Крафтовая пивоварня</div>
    </div>
    <div class="invoice-title">
      <h1>Инвойс</h1>
      <div class="inv-num"># ${invoiceNum}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-block">
      <h4>Клиент</h4>
      <p><strong>${escHtml(customer?.name || '—')}</strong></p>
      ${customer?.phone ? `<p>${escHtml(customer.phone)}</p>` : ''}
      ${customer?.email ? `<p>${escHtml(customer.email)}</p>` : ''}
    </div>
    <div class="meta-block" style="text-align:right">
      <h4>Дата</h4>
      <p>${formatDate(sale.created_at)}</p>
      ${sale.notes ? `<p style="margin-top:8px;color:#666;font-style:italic">${escHtml(sale.notes)}</p>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Наименование</th>
        <th style="width:90px;text-align:center">Кол-во</th>
        <th style="width:110px;text-align:right">Цена</th>
        <th style="width:120px;text-align:right">Сумма</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4" style="text-align:right">Итого:</td>
        <td style="text-align:right">${formatCurrency(total, settings.currency)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">BOOD CRM · Крафтовая пивоварня</div>
  <div class="no-print" style="text-align:center;margin-top:24px">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;border:1px solid #333;background:#1a1a1a;color:#fff;border-radius:6px">🖨 Печать</button>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=700');
  if (win) {
    win.document.write(invoiceHtml);
    win.document.close();
  } else {
    showToast('Разрешите всплывающие окна для печати инвойса', 'warning');
  }
}
