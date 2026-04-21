// Bood CRM — Sales Page
import { getRows, appendRow, appendRows, updateRow, genId, now, getSettings } from '../sheets.js';
import { calcCustomerBalance, calcOnHand, formatCurrency, formatDate, formatDateTime, escHtml } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTable, pageHeader, formField, numberInput, selectInput, textareaInput, collectForm,
  createMovementChip } from '../ui.js';
import t from '../i18n.js';

let sales = [];
let customers = [];
let components = [];
let inventory = [];
let moneyLedger = [];
let settings = {};
let _filterMonth = null;

function _monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export async function renderSales(container) {
  showLoading(container);
  try {
    [sales, customers, components, inventory, moneyLedger, settings] = await Promise.all([
      getRows('Sales'),
      getRows('Customers'),
      getRows('Components'),
      getRows('Inventory'),
      getRows('MoneyLedger'),
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
  const totalLiters = filtered.reduce((s, r) => {
    try { return s + JSON.parse(r.items_snapshot || '[]').reduce((ss, i) => ss + (parseFloat(i.qty) || 0), 0); }
    catch { return s; }
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
      try {
        const items = JSON.parse(r.items_snapshot || '[]');
        const liters = items.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        return `<span class="text-muted">${items.length} поз. · ${liters.toFixed(1)} л</span>`;
      } catch { return '—'; }
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

function showSaleForm(pageContainer, saleType = 'sale') {
  const isGift = saleType === 'gift';
  const custOpts = customers.filter(c => c.is_active !== 'FALSE').map(c => ({ value: c.id, label: c.name }));
  const productComps = components.filter(c => ['finished_beer','finished_spirit'].includes(c.type) && c.is_active !== 'FALSE');

  let lineItems = [];

  function renderLines() {
    const el = document.getElementById('sale-lines');
    if (!el) return;
    el.innerHTML = lineItems.map((item, i) => `
      <div class="sale-line" data-idx="${i}">
        <select class="form-control line-comp" data-idx="${i}">
          ${productComps.map(c => `<option value="${c.id}" ${c.id===item.component_id?'selected':''}>${escHtml(c.name)} (${calcOnHand(inventory,c.id).toFixed(2)} ${c.unit})</option>`).join('')}
        </select>
        <input type="number" class="form-control line-qty" data-idx="${i}" value="${item.qty||''}" placeholder="Кол-во (л/шт)" step="0.01" style="width:110px">
        ${!isGift ? `
          <input type="number" class="form-control line-price" data-idx="${i}" value="${item.unit_price||''}" placeholder="Цена/ед" step="0.01" style="width:100px">
          <span class="line-total text-muted" style="min-width:80px">${formatCurrency((parseFloat(item.qty)||0)*(parseFloat(item.unit_price)||0), settings.currency)}</span>
        ` : '<span class="text-muted" style="min-width:80px;font-size:0.85em">бесплатно</span>'}
        <button type="button" class="btn btn-sm btn-danger line-remove" data-idx="${i}">✕</button>
      </div>
    `).join('') || '<p class="text-muted">Добавьте позиции</p>';

    if (!isGift) {
      const total = lineItems.reduce((s,l) => s + (parseFloat(l.qty)||0)*(parseFloat(l.unit_price)||0), 0);
      const totalEl = document.getElementById('sale-total');
      if (totalEl) totalEl.textContent = formatCurrency(total, settings.currency);
    }

    el.querySelectorAll('.line-comp').forEach(sel => {
      sel.addEventListener('change', () => { lineItems[parseInt(sel.dataset.idx)].component_id = sel.value; renderLines(); });
    });
    el.querySelectorAll('.line-qty').forEach(inp => {
      inp.addEventListener('input', () => { lineItems[parseInt(inp.dataset.idx)].qty = inp.value; renderLines(); });
    });
    el.querySelectorAll('.line-price').forEach(inp => {
      inp.addEventListener('input', () => { lineItems[parseInt(inp.dataset.idx)].unit_price = inp.value; renderLines(); });
    });
    el.querySelectorAll('.line-remove').forEach(btn => {
      btn.addEventListener('click', () => { lineItems.splice(parseInt(btn.dataset.idx), 1); renderLines(); });
    });
  }

  const html = `
    <form id="sale-form" class="form-grid">
      ${isGift ? `
        <div class="alert alert-info" style="margin-bottom:8px">
          🎁 Подарок — продукция спишется со склада, баланс клиента <strong>не изменится</strong>. Получатель необязателен.
        </div>
      ` : ''}
      ${formField(
        isGift ? 'Получатель (не обязательно)' : 'Клиент',
        selectInput('customer_id', [{ value:'', label: isGift ? '— без получателя —' : '— выбрать —' }, ...custOpts], ''),
        '', !isGift
      )}
      <h4 style="margin:8px 0 4px">Позиции</h4>
      <div id="sale-lines"></div>
      <button type="button" class="btn btn-secondary" id="btn-add-line" style="margin-top:8px">+ Добавить позицию</button>
      ${!isGift ? `
        <div class="sale-total-row" style="margin-top:12px">
          <strong>Итого: <span id="sale-total">0 ₽</span></strong>
        </div>
      ` : ''}
      ${formField(t('notes'), textareaInput('notes', ''))}
    </form>
  `;

  const overlay = showModal(isGift ? '🎁 Оформить подарок' : t('new_sale'), html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Создать черновик', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const form = overlay.querySelector('#sale-form');
      const data = collectForm(form);
      if (!isGift && !data.customer_id) { showToast('Выберите клиента', 'warning'); return; }
      if (!lineItems.length) { showToast('Добавьте позиции', 'warning'); return; }
      const total = isGift ? 0 : lineItems.reduce((s,l) => s + (parseFloat(l.qty)||0)*(parseFloat(l.unit_price)||0), 0);
      try {
        const itemsSnapshot = JSON.stringify(lineItems.map(l => ({
          component_id: l.component_id,
          name: components.find(c=>c.id===l.component_id)?.name || '?',
          qty: l.qty,
          unit_price: isGift ? '0' : (l.unit_price || '0'),
          refunded_qty: '0',
        })));
        await appendRow('Sales', {
          id: genId(),
          customer_id: data.customer_id || '',
          items_snapshot: itemsSnapshot,
          status: 'draft',
          total_amount: String(total),
          notes: data.notes,
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
  ], { wide: true });

  if (!productComps.length) {
    document.getElementById('sale-lines').innerHTML = '<p class="text-warning">⚠ Нет готового пива/дистиллята на складе. Сначала проведите упаковку партий.</p>';
    return;
  }

  overlay.querySelector('#btn-add-line')?.addEventListener('click', () => {
    lineItems.push({ component_id: productComps[0].id, qty: '', unit_price: '', refunded_qty: '0' });
    renderLines();
  });

  renderLines();
}

async function postSale(sale, pageContainer) {
  const isGift = sale.sale_type === 'gift';
  const customer = customers.find(c => c.id === sale.customer_id);
  const confirmMsg = isGift
    ? 'Продукция спишется со склада. Баланс клиента не изменится.'
    : 'Продукция будет списана со склада, баланс клиента уменьшен.';

  showConfirm(isGift ? '🎁 Провести подарок?' : t('confirm_post'), confirmMsg, async () => {
    try {
      const items = JSON.parse(sale.items_snapshot || '[]');
      const ts = now();

      // Check stock
      for (const item of items) {
        const onHand = calcOnHand(inventory, item.component_id);
        if (onHand < parseFloat(item.qty||0)) {
          showToast(`Недостаточно на складе: ${item.name} (есть ${onHand.toFixed(2)}, нужно ${item.qty})`, 'warning');
          return;
        }
      }

      // Write-off inventory
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

      // Charge customer (only for regular sales, not gifts)
      if (!isGift && sale.customer_id) {
        await appendRow('MoneyLedger', {
          id: genId(), customer_id: sale.customer_id,
          amount_signed: String(-parseFloat(sale.total_amount||0)),
          movement_type: 'sale_charge', ref_type: 'sale', ref_id: sale.id,
          notes: `Продажа #${sale.id.slice(0,8)}`, created_at: ts,
        });
      }

      // Update sale
      await updateRow('Sales', sale.id, { ...sale, status: 'posted', posted_at: ts, updated_at: ts });

      showToast(isGift ? '🎁 Подарок проведён' : t('posted_ok'));
      await renderSales(pageContainer);
    } catch (e) { showToast(e.message, 'error'); }
  });
}

function showSaleDetail(sale, pageContainer) {
  const items = JSON.parse(sale.items_snapshot || '[]');
  const customer = customers.find(c => c.id === sale.customer_id);
  const total = parseFloat(sale.total_amount || 0);

  const html = `
    <div class="sale-detail">
      <div class="sale-meta">
        ${sale.sale_type === 'gift' ? '<p><span style="color:var(--success)">🎁 Подарок</span> — баланс клиента не изменяется</p>' : ''}
        <p><strong>${sale.sale_type === 'gift' ? 'Получатель' : 'Клиент'}:</strong> ${escHtml(customer?.name||'—')}</p>
        <p><strong>Дата:</strong> ${formatDateTime(sale.created_at)}</p>
        <p><strong>Статус:</strong> ${sale.status === 'posted' ? '✓ Проведена' : '○ Черновик'}</p>
        ${sale.posted_at ? `<p><strong>Дата проводки:</strong> ${formatDateTime(sale.posted_at)}</p>` : ''}
      </div>
      <table class="data-table" style="margin: 16px 0">
        <thead><tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
        <tbody>
          ${items.map(item => `<tr>
            <td>${escHtml(item.name||'?')}</td>
            <td>${escHtml(item.qty||'?')}</td>
            <td>${formatCurrency(item.unit_price, settings.currency)}</td>
            <td>${formatCurrency((parseFloat(item.qty)||0)*(parseFloat(item.unit_price)||0), settings.currency)}</td>
          </tr>`).join('')}
          <tr class="cost-total"><td colspan="3"><strong>Итого</strong></td><td><strong>${formatCurrency(total, settings.currency)}</strong></td></tr>
        </tbody>
      </table>
      ${sale.notes ? `<p><strong>Заметки:</strong> ${escHtml(sale.notes)}</p>` : ''}
    </div>
  `;

  showModal(`Продажа #${sale.id.slice(0,8)}`, html, [
    { label: t('close'), class: 'btn-secondary', action: 'close', onClick: closeModal },
    ...(sale.status !== 'posted' ? [{
      label: t('post_sale'), class: 'btn-primary', action: 'post',
      onClick: () => { closeModal(); postSale(sale, pageContainer); }
    }] : []),
  ], { wide: true });
}
