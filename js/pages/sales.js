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
  const sorted = [...active].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = `
    ${pageHeader(t('sales'), `<button class="btn btn-primary" id="btn-new-sale">+ ${t('new_sale')}</button>`)}
    <div id="sales-table"></div>
  `;

  const cols = [
    { label: 'Дата', render: r => formatDate(r.created_at) },
    { label: t('customer'), render: r => {
      const c = customers.find(c => c.id === r.customer_id);
      return escHtml(c?.name || '—');
    }},
    { label: 'Позиции', render: r => {
      try {
        const items = JSON.parse(r.items_snapshot || '[]');
        return `<span class="text-muted">${items.length} поз.</span>`;
      } catch { return '—'; }
    }},
    { label: 'Сумма', render: r => formatCurrency(r.total_amount, settings.currency) },
    { label: 'Статус', render: r => {
      const cls = r.status === 'posted' ? 'badge-success' : 'badge-muted';
      return `<span class="${cls}">${r.status === 'posted' ? '✓ Проведена' : '○ Черновик'}</span>`;
    }},
    { label: t('actions'), render: r => `
      ${r.status !== 'posted' ? `<button class="btn btn-sm btn-primary btn-post-sale" data-id="${r.id}">Провести</button>` : ''}
      <button class="btn btn-sm btn-secondary btn-view-sale" data-id="${r.id}">Детали</button>
    `},
  ];

  renderTable(container.querySelector('#sales-table'), cols, sorted, {
    emptyMessage: 'Нет продаж',
  });

  container.querySelector('#btn-new-sale')?.addEventListener('click', () => showSaleForm(container));

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

function showSaleForm(pageContainer) {
  const custOpts = customers.filter(c => c.is_active !== 'FALSE').map(c => ({ value: c.id, label: c.name }));
  const productComps = components.filter(c => ['finished_beer','finished_spirit'].includes(c.type) && c.is_active !== 'FALSE');

  let lineItems = [];

  function renderLines() {
    const el = document.getElementById('sale-lines');
    if (!el) return;
    el.innerHTML = lineItems.map((item, i) => {
      const comp = components.find(c => c.id === item.component_id);
      const onHand = calcOnHand(inventory, item.component_id);
      return `
        <div class="sale-line" data-idx="${i}">
          <select class="form-control line-comp" data-idx="${i}">
            ${productComps.map(c => `<option value="${c.id}" ${c.id===item.component_id?'selected':''}>${escHtml(c.name)} (${calcOnHand(inventory,c.id).toFixed(2)} ${c.unit})</option>`).join('')}
          </select>
          <input type="number" class="form-control line-qty" data-idx="${i}" value="${item.qty||''}" placeholder="Кол-во" step="0.01" style="width:90px">
          <input type="number" class="form-control line-price" data-idx="${i}" value="${item.unit_price||''}" placeholder="Цена/ед" step="0.01" style="width:100px">
          <span class="line-total text-muted" style="min-width:80px">${formatCurrency((parseFloat(item.qty)||0) * (parseFloat(item.unit_price)||0), settings.currency)}</span>
          <button type="button" class="btn btn-sm btn-danger line-remove" data-idx="${i}">✕</button>
        </div>
      `;
    }).join('') || '<p class="text-muted">Добавьте позиции</p>';

    // Update total
    const total = lineItems.reduce((s, l) => s + (parseFloat(l.qty)||0) * (parseFloat(l.unit_price)||0), 0);
    const totalEl = document.getElementById('sale-total');
    if (totalEl) totalEl.textContent = formatCurrency(total, settings.currency);

    // Attach line events
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
      ${formField('Клиент', selectInput('customer_id', [{ value:'', label:'— выбрать —' }, ...custOpts], ''), '', true)}
      <h4>Позиции</h4>
      <div id="sale-lines"></div>
      <button type="button" class="btn btn-secondary" id="btn-add-line">+ Добавить позицию</button>
      <div class="sale-total-row">
        <strong>Итого: <span id="sale-total">0 ₽</span></strong>
      </div>
      ${formField(t('notes'), textareaInput('notes', ''))}
    </form>
  `;

  const overlay = showModal(t('new_sale'), html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Создать черновик', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const form = overlay.querySelector('#sale-form');
      const data = collectForm(form);
      if (!data.customer_id) { showToast('Выберите клиента', 'warning'); return; }
      if (!lineItems.length) { showToast('Добавьте позиции', 'warning'); return; }
      const total = lineItems.reduce((s,l) => s + (parseFloat(l.qty)||0)*(parseFloat(l.unit_price)||0), 0);
      try {
        const itemsSnapshot = JSON.stringify(lineItems.map(l => ({
          component_id: l.component_id,
          name: components.find(c=>c.id===l.component_id)?.name || '?',
          qty: l.qty,
          unit_price: l.unit_price,
          refunded_qty: '0',
        })));
        await appendRow('Sales', {
          id: genId(), customer_id: data.customer_id,
          items_snapshot: itemsSnapshot,
          status: 'draft', total_amount: String(total),
          notes: data.notes, is_active: 'TRUE',
          created_at: now(), updated_at: now(),
        });
        closeModal(); showToast('Продажа создана (черновик)');
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
  showConfirm(t('confirm_post'), 'Продукция будет списана со склада, баланс клиента уменьшен', async () => {
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
      const invRows = items.map(item => ({
        id: genId(), component_id: item.component_id,
        qty_delta: String(-Math.abs(parseFloat(item.qty)||0)),
        movement_type: 'sale_out', ref_type: 'sale', ref_id: sale.id,
        unit_cost: item.unit_price,
        notes: `Продажа: ${customers.find(c=>c.id===sale.customer_id)?.name||'?'}`,
        created_at: ts,
      }));
      await appendRows('Inventory', invRows);

      // Charge customer
      await appendRow('MoneyLedger', {
        id: genId(), customer_id: sale.customer_id,
        amount_signed: String(-parseFloat(sale.total_amount||0)),
        movement_type: 'sale_charge', ref_type: 'sale', ref_id: sale.id,
        notes: `Продажа #${sale.id.slice(0,8)}`, created_at: ts,
      });

      // Update sale
      await updateRow('Sales', sale.id, { ...sale, status: 'posted', posted_at: ts, updated_at: ts });

      showToast(t('posted_ok'));
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
        <p><strong>Клиент:</strong> ${escHtml(customer?.name||'—')}</p>
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
