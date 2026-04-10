// Bood CRM — Inventory Page
import { getRows, appendRow, genId, now, getSettings } from '../sheets.js';
import { calcOnHand } from '../utils.js';
import { showModal, closeModal, showToast, showLoading, showError,
  renderTable, createTypeChip, createMovementChip, pageHeader,
  formField, numberInput, textInput, textareaInput, collectForm } from '../ui.js';
import t from '../i18n.js';
import { escHtml, formatCurrency, formatDate, formatDateTime } from '../utils.js';

let components = [];
let inventory = [];
let settings = {};
let activeTypeFilter = 'all';

const TYPE_TABS = [
  { id: 'all',           label: 'Все' },
  { id: 'malt',         label: 'Солод' },
  { id: 'hop',          label: 'Хмель' },
  { id: 'yeast',        label: 'Дрожжи' },
  { id: 'grain_distill',label: 'Зерно' },
  { id: 'sugar',        label: 'Сахар' },
  { id: 'salt',         label: 'Соли' },
  { id: 'additive',     label: 'Добавки' },
  { id: 'packaging',    label: 'Упаковка' },
  { id: 'other',        label: 'Другое' },
];

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

  // On-hand map
  const onHandMap = {};
  activeComponents.forEach(c => { onHandMap[c.id] = calcOnHand(inventory, c.id); });

  // Stock = only components with qty > 0, filtered by type
  const inStock = activeComponents.filter(c => {
    const qty = onHandMap[c.id] || 0;
    if (qty <= 0) return false;
    if (activeTypeFilter !== 'all' && c.type !== activeTypeFilter) return false;
    return true;
  }).sort((a, b) => {
    const qa = onHandMap[a.id];
    const qb = onHandMap[b.id];
    if (qa < 0 && qb >= 0) return -1;
    if (qb < 0 && qa >= 0) return 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  // Ledger (newest first)
  const ledger = [...inventory]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 200);

  const tabsHtml = TYPE_TABS.map(tab => `
    <button class="chip-filter${activeTypeFilter === tab.id ? ' active' : ''}" data-type="${tab.id}">
      ${tab.label}
    </button>
  `).join('');

  container.innerHTML = `
    ${pageHeader(t('inventory'), `<button class="btn btn-primary" id="btn-add-purchase">+ ${t('new_purchase')}</button>`)}

    <div class="section-card">
      <div class="section-card-header">
        <h3>Остатки на складе</h3>
        <div class="filter-chips" style="margin-top:8px">${tabsHtml}</div>
      </div>
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
    { label: t('on_hand'), render: r => {
      const qty = onHandMap[r.id] || 0;
      const cls = qty < 0 ? 'text-danger' : '';
      return `<strong class="${cls}">${qty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${escHtml(r.unit || '')}</strong>`;
    }},
    { label: 'Последняя закупка', render: r => {
      const last = inventory
        .filter(i => i.component_id === r.id && i.movement_type === 'purchase')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (!last) return '—';
      return `${formatDate(last.created_at)}${last.unit_cost ? ` · ${formatCurrency(last.unit_cost, settings.currency)}/${escHtml(r.unit || '')}` : ''}`;
    }},
  ];

  renderTable(container.querySelector('#stock-table'), stockCols, inStock, {
    emptyMessage: activeTypeFilter === 'all'
      ? 'На складе ничего нет. Добавьте закупку.'
      : `Нет товаров типа "${TYPE_TABS.find(t => t.id === activeTypeFilter)?.label}" на складе.`,
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
      return `<span class="${cls}">${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${escHtml(c?.unit || '')}</span>`;
    }},
    { label: 'Стоимость', render: r => {
      const cost = parseFloat(r.unit_cost) * Math.abs(parseFloat(r.qty_delta || 0));
      return cost ? formatCurrency(cost, settings.currency) : '—';
    }},
    { label: 'Заметки', render: r => `<span class="text-muted text-sm">${escHtml(r.notes || '')}</span>` },
  ];

  renderTable(container.querySelector('#ledger-table'), ledgerCols, ledger, {
    emptyMessage: 'Нет движений',
  });

  // Type filter chips
  container.querySelectorAll('.chip-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTypeFilter = btn.dataset.type;
      _render(container);
    });
  });

  container.querySelector('#btn-add-purchase')?.addEventListener('click', () => showPurchaseForm(container));
}

function showPurchaseForm(pageContainer) {
  const activeComponents = components.filter(c => c.is_active !== 'FALSE');

  // Group by type for the select
  const grouped = {};
  activeComponents.forEach(c => {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  });

  const optionsHtml = `<option value="">— выбрать компонент —</option>` +
    Object.entries(grouped).map(([type, comps]) =>
      `<optgroup label="${escHtml(t(type))}">
        ${comps.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
      </optgroup>`
    ).join('');

  const html = `
    <form id="purchase-form" class="form-grid">
      <div class="form-field">
        <label class="form-label">Компонент <span class="text-danger">*</span></label>
        <select name="component_id" class="form-control" id="purchase-component">${optionsHtml}</select>
      </div>
      <div class="form-row-2">
        <div class="form-field">
          <label class="form-label">Количество <span class="text-danger">*</span></label>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" name="qty" class="form-control" min="0.001" step="any" placeholder="0">
            <span id="qty-unit" style="min-width:32px;color:var(--text-muted);font-size:0.9em">—</span>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label" id="price-label">Цена за ед. (руб) <span class="text-danger">*</span></label>
          <input type="number" name="unit_cost" class="form-control" min="0" step="any" placeholder="0">
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Итого</label>
        <input type="text" class="form-control" id="total-display" readonly placeholder="0 ₽">
      </div>
      ${formField('Поставщик', textInput('supplier', ''))}
      ${formField('Дата', `<input type="date" name="purchase_date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">`)}
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

  // Update unit label and price label when component changes
  function updateUnitLabels(compId) {
    const comp = components.find(c => c.id === compId);
    const unit = comp?.unit || '—';
    const qtyUnit = overlay.querySelector('#qty-unit');
    const priceLabel = overlay.querySelector('#price-label');
    if (qtyUnit) qtyUnit.textContent = unit;
    if (priceLabel) priceLabel.innerHTML = `Цена за ${escHtml(unit)} (руб) <span class="text-danger">*</span>`;
  }

  overlay.querySelector('#purchase-component')?.addEventListener('change', e => {
    updateUnitLabels(e.target.value);
    updateTotal();
  });

  function updateTotal() {
    const qty = parseFloat(overlay.querySelector('[name=qty]')?.value) || 0;
    const cost = parseFloat(overlay.querySelector('[name=unit_cost]')?.value) || 0;
    const total = overlay.querySelector('#total-display');
    if (total) total.value = formatCurrency(qty * cost, settings.currency);
  }

  overlay.querySelector('[name=qty]')?.addEventListener('input', updateTotal);
  overlay.querySelector('[name=unit_cost]')?.addEventListener('input', updateTotal);
}
