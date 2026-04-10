// Bood CRM — Inventory Page
import { getRows, appendRow, appendRows, genId, now, getSettings } from '../sheets.js';
import { calcOnHand } from '../utils.js';
import { showModal, closeModal, showToast, showLoading, showError,
  renderTable, createTypeChip, createMovementChip, pageHeader,
  formField, numberInput, textInput, selectInput, textareaInput, collectForm,
  showEmpty } from '../ui.js';
import t from '../i18n.js';
import { escHtml, formatCurrency, formatDate, formatDateTime } from '../utils.js';

let components = [];
let inventory = [];
let settings = {};

export async function renderInventory(container) {
  showLoading(container);
  try {
    [components, inventory, settings] = await Promise.all([
      getRows('Components'),
      getRows('Inventory'),
      getSettings(),
    ]);
    _render(container);
  } catch (e) {
    showError(container, e);
  }
}

function _render(container) {
  const activeComponents = components.filter(c => c.is_active !== 'FALSE');

  // Calculate on-hand for each component
  const onHandMap = {};
  activeComponents.forEach(c => { onHandMap[c.id] = calcOnHand(inventory, c.id); });

  // Sort: negative first, then zero, then positive
  const sorted = [...activeComponents].sort((a, b) => {
    const qa = onHandMap[a.id];
    const qb = onHandMap[b.id];
    if (qa < 0 && qb >= 0) return -1;
    if (qb < 0 && qa >= 0) return 1;
    return a.name.localeCompare(b.name);
  });

  // Inventory movements ledger (newest first)
  const ledger = [...inventory].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);

  container.innerHTML = `
    ${pageHeader(t('inventory'), `<button class="btn btn-primary" id="btn-add-purchase">+ ${t('new_purchase')}</button>`)}

    <div class="section-card">
      <div class="section-card-header"><h3>Остатки на складе</h3></div>
      <div class="section-card-body p-0" id="stock-table"></div>
    </div>

    <div class="section-card mt-4">
      <div class="section-card-header"><h3>Движения (последние 200)</h3></div>
      <div class="section-card-body p-0" id="ledger-table"></div>
    </div>
  `;

  // Stock table
  const stockCols = [
    { label: t('name'), render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: t('type'), render: r => createTypeChip(r.type) },
    { label: t('unit'), key: 'unit' },
    { label: t('on_hand'), render: r => {
      const qty = onHandMap[r.id] || 0;
      const cls = qty < 0 ? 'text-danger' : qty === 0 ? 'text-muted' : '';
      return `<strong class="${cls}">${qty.toLocaleString('ru-RU', {maximumFractionDigits:3})}</strong>`;
    }},
    { label: 'Последнее движение', render: r => {
      const last = [...inventory].filter(i => i.component_id === r.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      return last ? formatDate(last.created_at) : '—';
    }},
  ];

  renderTable(container.querySelector('#stock-table'), stockCols, sorted, {
    emptyMessage: 'Нет компонентов. Добавьте компоненты сначала.',
  });

  // Ledger table
  const ledgerCols = [
    { label: 'Дата', render: r => formatDateTime(r.created_at) },
    { label: 'Компонент', render: r => {
      const c = components.find(c => c.id === r.component_id);
      return escHtml(c?.name || r.component_id);
    }},
    { label: 'Тип', render: r => createMovementChip(r.movement_type) },
    { label: 'Δ Кол-во', render: r => {
      const n = parseFloat(r.qty_delta) || 0;
      const cls = n > 0 ? 'text-success' : n < 0 ? 'text-danger' : '';
      const c = components.find(c => c.id === r.component_id);
      return `<span class="${cls}">${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU', {maximumFractionDigits:3})} ${c?.unit || ''}</span>`;
    }},
    { label: 'Стоимость', render: r => {
      const cost = parseFloat(r.unit_cost) * Math.abs(parseFloat(r.qty_delta || 0));
      return cost ? formatCurrency(cost, settings.currency) : '—';
    }},
    { label: 'Ссылка', render: r => r.ref_type ? `<span class="text-muted text-sm">${escHtml(r.ref_type)}: ${escHtml(r.ref_id?.slice(0,8) || '')}</span>` : '—' },
    { label: 'Заметки', render: r => `<span class="text-muted text-sm">${escHtml(r.notes || '')}</span>` },
  ];

  renderTable(container.querySelector('#ledger-table'), ledgerCols, ledger, {
    emptyMessage: 'Нет движений',
  });

  container.querySelector('#btn-add-purchase')?.addEventListener('click', () => showPurchaseForm(container));
}

function showPurchaseForm(pageContainer) {
  const activeComponents = components.filter(c => c.is_active !== 'FALSE');
  const compOpts = activeComponents.map(c => ({ value: c.id, label: `${c.name} (${t(c.type)})` }));

  const html = `
    <form id="purchase-form" class="form-grid">
      ${formField('Компонент', selectInput('component_id', [{ value: '', label: '— выбрать —' }, ...compOpts], ''), '', true)}
      ${formField('Количество', numberInput('qty', '', 'min="0.001"'), '', true)}
      ${formField('Цена за единицу (руб)', numberInput('unit_cost', ''), '', true)}
      <div class="form-field">
        <label class="form-label">Итого</label>
        <input type="text" class="form-control" id="total-display" readonly placeholder="0 ₽">
      </div>
      ${formField('Поставщик', textInput('supplier', ''))}
      ${formField('Дата', `<input type="date" name="purchase_date" class="form-control" value="${new Date().toISOString().slice(0,10)}">`)}
      ${formField(t('notes'), textareaInput('notes', ''))}
    </form>
  `;

  const overlay = showModal(t('new_purchase'), html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Закупить', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const form = overlay.querySelector('#purchase-form');
      const data = collectForm(form);
      if (!data.component_id) { showToast('Выберите компонент', 'warning'); return; }
      if (!data.qty || parseFloat(data.qty) <= 0) { showToast('Укажите количество', 'warning'); return; }
      if (!data.unit_cost) { showToast('Укажите цену', 'warning'); return; }

      try {
        const comp = components.find(c => c.id === data.component_id);
        const ts = now();
        const inventoryId = genId();
        const moneyId = genId();
        const totalCost = parseFloat(data.qty) * parseFloat(data.unit_cost);
        const notes = [data.supplier, data.notes].filter(Boolean).join(' | ');

        await appendRow('Inventory', {
          id: inventoryId,
          component_id: data.component_id,
          qty_delta: data.qty,
          movement_type: 'purchase',
          ref_type: 'purchase',
          ref_id: inventoryId,
          unit_cost: data.unit_cost,
          notes,
          created_at: data.purchase_date ? new Date(data.purchase_date).toISOString() : ts,
        });

        await appendRow('MoneyLedger', {
          id: moneyId,
          customer_id: '',
          amount_signed: String(-totalCost),
          movement_type: 'purchase_expense',
          ref_type: 'inventory',
          ref_id: inventoryId,
          notes: `Закупка: ${comp?.name || ''} ${data.qty} ${comp?.unit || ''} × ${data.unit_cost} руб`,
          created_at: ts,
        });

        closeModal();
        showToast(`Закупка ${comp?.name}: ${data.qty} ${comp?.unit || ''}`);
        await renderInventory(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);

  // Auto-calculate total
  function updateTotal() {
    const form = document.getElementById('purchase-form');
    if (!form) return;
    const qty = parseFloat(form.querySelector('[name=qty]')?.value) || 0;
    const cost = parseFloat(form.querySelector('[name=unit_cost]')?.value) || 0;
    const total = document.getElementById('total-display');
    if (total) total.value = formatCurrency(qty * cost, settings.currency);
  }
  overlay.querySelector('[name=qty]')?.addEventListener('input', updateTotal);
  overlay.querySelector('[name=unit_cost]')?.addEventListener('input', updateTotal);
}
