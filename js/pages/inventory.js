// Bood CRM — Inventory Page
import { getRows, appendRow, updateRow, deleteRow, genId, now, getSettings } from '../sheets.js';
import { calcOnHand } from '../utils.js';
import { showModal, closeModal, showToast, showConfirm, showLoading, showError,
  renderTable, createTypeChip, createMovementChip, pageHeader,
  formField, numberInput, textInput, selectInput, textareaInput, collectForm } from '../ui.js';
import t from '../i18n.js';
import { escHtml, formatCurrency, formatDate, formatDateTime } from '../utils.js';

let components = [];
let inventory = [];
let moneyLedger = [];
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
    [components, inventory, moneyLedger, settings] = await Promise.all([
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
    { label: t('name'), sortFn: r => r.name, render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: t('type'), sortFn: r => t(r.type), render: r => createTypeChip(r.type) },
    { label: t('on_hand'), sortFn: r => onHandMap[r.id] || 0, render: r => {
      const qty = onHandMap[r.id] || 0;
      const cls = qty < 0 ? 'text-danger' : '';
      return `<strong class="${cls}">${qty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${escHtml(r.unit || '')}</strong>`;
    }},
    { label: 'Последняя закупка', render: r => {
      const last = inventory
        .filter(i => i.component_id === r.id && i.movement_type === 'purchase')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (!last) return '—';
      const brand = last.brand ? `<span class="text-muted"> · ${escHtml(last.brand)}</span>` : '';
      const price = last.unit_cost ? ` · ${formatCurrency(last.unit_cost, settings.currency)}/${escHtml(r.unit || '')}` : '';
      return `${formatDate(last.created_at)}${price}${brand}`;
    }},
  ];

  renderTable(container.querySelector('#stock-table'), stockCols, inStock, {
    emptyMessage: activeTypeFilter === 'all'
      ? 'На складе ничего нет. Добавьте закупку.'
      : `Нет товаров типа "${TYPE_TABS.find(t => t.id === activeTypeFilter)?.label}" на складе.`,
    defaultSortCol: 0,
  });

  // Ledger table
  const ledgerCols = [
    { label: 'Дата', render: r => formatDateTime(r.created_at) },
    { label: 'Компонент', render: r => {
      const c = components.find(c => c.id === r.component_id);
      return `${escHtml(c?.name || r.component_id)}${r.brand ? `<br><span class="text-muted text-sm">${escHtml(r.brand)}</span>` : ''}`;
    }},
    { label: 'Тип', render: r => createMovementChip(r.movement_type) },
    { label: 'Δ Кол-во', render: r => {
      const n = parseFloat(r.qty_delta) || 0;
      const cls = n > 0 ? 'text-success' : n < 0 ? 'text-danger' : '';
      const c = components.find(c => c.id === r.component_id);
      return `<span class="${cls}">${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${escHtml(c?.unit || '')}</span>`;
    }},
    { label: 'Сумма', render: r => {
      const cost = parseFloat(r.unit_cost) * Math.abs(parseFloat(r.qty_delta || 0));
      return cost ? formatCurrency(cost, settings.currency) : '—';
    }},
    { label: 'Заметки', render: r => `<span class="text-muted text-sm">${escHtml(r.notes || '')}</span>` },
    { label: '', render: r => r.movement_type === 'purchase' ? `
      <button class="btn btn-sm btn-secondary btn-edit-purchase" data-id="${r.id}">✎</button>
      <button class="btn btn-sm btn-danger btn-delete-purchase" data-id="${r.id}">✕</button>
    ` : '' },
  ];

  renderTable(container.querySelector('#ledger-table'), ledgerCols, ledger, {
    emptyMessage: 'Нет движений',
  });

  container.querySelectorAll('.btn-edit-purchase').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = inventory.find(i => i.id === btn.dataset.id);
      if (entry) showEditPurchaseForm(entry, container);
    });
  });

  container.querySelectorAll('.btn-delete-purchase').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = inventory.find(i => i.id === btn.dataset.id);
      const comp = components.find(c => c.id === entry?.component_id);
      showConfirm(
        'Удалить закупку?',
        `${comp?.name || ''}${entry?.brand ? ` (${entry.brand})` : ''} — запись в складе и в балансе будет удалена.`,
        async () => {
          try {
            await deleteRow('Inventory', entry.id);
            const ledgerEntry = moneyLedger.find(r => r.ref_type === 'inventory' && r.ref_id === entry.id);
            if (ledgerEntry) await deleteRow('MoneyLedger', ledgerEntry.id);
            showToast('Закупка удалена');
            await renderInventory(container);
          } catch (e) { showToast(e.message, 'error'); }
        }
      );
    });
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

  const COMP_TYPES = [
    'malt','hop','yeast','additive','salt','packaging','equipment',
    'grain_distill','sugar','fruit','finished_beer','finished_spirit','other',
  ];
  const typeOpts = COMP_TYPES.map(v => ({ value: v, label: t(v) }));
  const unitOpts = ['кг','г','л','мл','шт','пач','уп','м','другое'].map(v => ({ value: v, label: v }));

  // Group by type for the select
  const grouped = {};
  activeComponents.forEach(c => {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  });

  const optionsHtml =
    `<option value="">— выбрать компонент —</option>` +
    `<option value="__new__">✚ Создать новый компонент</option>` +
    Object.entries(grouped).map(([type, comps]) =>
      `<optgroup label="${escHtml(t(type))}">
        ${comps.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
      </optgroup>`
    ).join('');

  // Editable new-component fields (prefixed nc_)
  function newCompDynamic(type) {
    if (['malt','grain_distill'].includes(type)) return `
      <div class="form-row-2">
        <div class="form-field"><label class="form-label">EBC</label>${numberInput('nc_ebc', '')}</div>
        <div class="form-field"><label class="form-label">Экстрактивность %</label>${numberInput('nc_attenuation', '')}</div>
      </div>`;
    if (type === 'hop') return `
      <div class="form-field"><label class="form-label">${t('alpha_acid')}</label>${numberInput('nc_alpha_acid', '')}</div>`;
    if (type === 'yeast') return `
      <div class="form-field"><label class="form-label">${t('attenuation')}</label>${numberInput('nc_attenuation', '')}</div>`;
    return '';
  }

  // Read-only existing-component characteristic fields (no name → not collected)
  function existingCompFields(comp) {
    const type = comp.type;
    if (['malt','grain_distill'].includes(type)) return `
      <div class="form-row-2">
        <div class="form-field"><label class="form-label" style="color:var(--text-muted)">EBC</label>
          <input type="number" class="form-control" value="${escHtml(String(comp.ebc||''))}" disabled></div>
        <div class="form-field"><label class="form-label" style="color:var(--text-muted)">Экстрактивность %</label>
          <input type="number" class="form-control" value="${escHtml(String(comp.attenuation||''))}" disabled></div>
      </div>`;
    if (type === 'hop') return `
      <div class="form-field"><label class="form-label" style="color:var(--text-muted)">${t('alpha_acid')}</label>
        <input type="number" class="form-control" value="${escHtml(String(comp.alpha_acid||''))}" disabled></div>`;
    if (type === 'yeast') return `
      <div class="form-field"><label class="form-label" style="color:var(--text-muted)">${t('attenuation')}</label>
        <input type="number" class="form-control" value="${escHtml(String(comp.attenuation||''))}" disabled></div>`;
    return '';
  }

  function renderDetails(compId) {
    if (!compId) return '';
    if (compId === '__new__') return `
      <div id="new-comp-panel" style="border-left:3px solid var(--accent-amber);padding-left:12px;margin-bottom:4px">
        ${formField('Название', textInput('nc_name', ''), '', true)}
        ${formField('Производитель / Бренд', textInput('nc_brand', ''))}
        <div class="form-row-2">
          <div class="form-field"><label class="form-label">Тип <span class="text-danger">*</span></label>${selectInput('nc_type', typeOpts, 'malt')}</div>
          <div class="form-field"><label class="form-label">Единица <span class="text-danger">*</span></label>${selectInput('nc_unit', unitOpts, 'кг')}</div>
        </div>
        ${formField('Ориент. цена за ед.', numberInput('nc_cost_per_unit', ''))}
        <div id="nc-dynamic-fields">${newCompDynamic('malt')}</div>
      </div>`;
    const comp = components.find(c => c.id === compId);
    if (!comp) return '';
    const fields = existingCompFields(comp);
    return fields ? `<div style="margin-bottom:4px">${fields}</div>` : '';
  }

  const html = `
    <form id="purchase-form" class="form-grid">
      <div class="form-field">
        <label class="form-label">Компонент <span class="text-danger">*</span></label>
        <select name="component_id" class="form-control" id="purchase-component">${optionsHtml}</select>
      </div>
      <div id="comp-details"></div>
      <div class="form-row-2">
        <div class="form-field">
          <label class="form-label">Количество <span class="text-danger">*</span> <span id="qty-unit" style="color:var(--text-muted);font-weight:400"></span></label>
          <input type="number" name="qty" class="form-control" min="0.001" step="any" placeholder="напр. 5000">
        </div>
        <div class="form-field">
          <label class="form-label">Сумма за покупку (руб) <span class="text-danger">*</span></label>
          <input type="number" name="total_paid" class="form-control" min="0" step="any" placeholder="напр. 350">
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Цена за единицу</label>
        <input type="text" class="form-control" id="unit-cost-display" readonly placeholder="рассчитается автоматически" style="color:var(--text-muted)">
        <input type="hidden" name="unit_cost" id="unit-cost-hidden">
      </div>
      ${formField('Производитель / Бренд', textInput('brand', ''), 'Например: Курский, Castle Malting, Hopsteiner')}
      ${formField('Поставщик', textInput('supplier', ''), 'Магазин или сайт')}
      ${formField('Дата', `<input type="date" name="purchase_date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">`)}
      ${formField(t('notes'), textareaInput('notes', ''))}
    </form>
  `;

  const overlay = showModal(t('new_purchase'), html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Закупить', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const form = overlay.querySelector('#purchase-form');
      const data = collectForm(form);
      const isNew = data.component_id === '__new__';

      if (!data.component_id) { showToast('Выберите компонент', 'warning'); return; }
      if (isNew && !data.nc_name?.trim()) { showToast('Введите название компонента', 'warning'); return; }
      if (!data.qty || parseFloat(data.qty) <= 0) { showToast('Укажите количество', 'warning'); return; }
      if (!data.total_paid || parseFloat(data.total_paid) < 0) { showToast('Укажите сумму за покупку', 'warning'); return; }

      const qty = parseFloat(data.qty);
      const totalPaid = parseFloat(data.total_paid);
      const unitCost = qty > 0 ? totalPaid / qty : 0;

      try {
        let componentId = data.component_id;
        let comp = components.find(c => c.id === componentId);

        if (isNew) {
          const ts = now();
          componentId = genId();
          const newComp = {
            id: componentId,
            name: data.nc_name.trim(),
            brand: data.nc_brand || '',
            type: data.nc_type || 'other',
            unit: data.nc_unit || 'кг',
            cost_per_unit: data.nc_cost_per_unit || '',
            ebc: data.nc_ebc || '',
            alpha_acid: data.nc_alpha_acid || '',
            attenuation: data.nc_attenuation || '',
            spirit_type: '',
            notes: '',
            is_active: 'TRUE',
            created_at: ts,
            updated_at: ts,
          };
          await appendRow('Components', newComp);
          components.push(newComp);
          comp = newComp;
        }

        const ts = now();
        const inventoryId = genId();
        const moneyId = genId();
        const notes = [data.supplier, data.notes].filter(Boolean).join(' | ');

        await appendRow('Inventory', {
          id: inventoryId,
          component_id: componentId,
          qty_delta: String(qty),
          movement_type: 'purchase',
          ref_type: 'purchase',
          ref_id: inventoryId,
          unit_cost: String(unitCost),
          notes,
          created_at: data.purchase_date ? new Date(data.purchase_date).toISOString() : ts,
          brand: data.brand || '',
        });

        await appendRow('MoneyLedger', {
          id: moneyId,
          customer_id: '',
          amount_signed: String(-totalPaid),
          movement_type: 'purchase_expense',
          ref_type: 'inventory',
          ref_id: inventoryId,
          notes: `Закупка: ${comp?.name || ''}${data.brand ? ` (${data.brand})` : ''} ${qty} ${comp?.unit || ''} — ${totalPaid} руб`,
          created_at: ts,
        });

        closeModal();
        showToast(`Закупка ${comp?.name}: ${qty} ${comp?.unit || ''}`);
        await renderInventory(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);

  function getUnit() {
    const compId = overlay.querySelector('#purchase-component')?.value;
    if (compId === '__new__') return overlay.querySelector('[name=nc_unit]')?.value || '';
    return components.find(c => c.id === compId)?.unit || '';
  }

  function recalc() {
    const unit = getUnit();
    const qty = parseFloat(overlay.querySelector('[name=qty]')?.value) || 0;
    const total = parseFloat(overlay.querySelector('[name=total_paid]')?.value) || 0;

    const qtyUnitEl = overlay.querySelector('#qty-unit');
    if (qtyUnitEl) qtyUnitEl.textContent = unit ? `(${unit})` : '';

    const display = overlay.querySelector('#unit-cost-display');
    const hidden = overlay.querySelector('#unit-cost-hidden');
    if (qty > 0 && total > 0) {
      const unitCost = total / qty;
      const formatted = `${unitCost.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₽ / ${unit || 'ед'}`;
      if (display) display.value = formatted;
      if (hidden) hidden.value = String(unitCost);
    } else {
      if (display) display.value = '';
      if (hidden) hidden.value = '';
    }
  }

  function updateDetails(compId) {
    const el = overlay.querySelector('#comp-details');
    if (!el) return;
    el.innerHTML = renderDetails(compId);
    if (compId === '__new__') {
      el.querySelector('[name=nc_type]')?.addEventListener('change', (e) => {
        const df = el.querySelector('#nc-dynamic-fields');
        if (df) df.innerHTML = newCompDynamic(e.target.value);
      });
      el.querySelector('[name=nc_unit]')?.addEventListener('change', recalc);
    }
    recalc();
  }

  overlay.querySelector('#purchase-component')?.addEventListener('change', (e) => updateDetails(e.target.value));
  overlay.querySelector('[name=qty]')?.addEventListener('input', recalc);
  overlay.querySelector('[name=total_paid]')?.addEventListener('input', recalc);
}

function showEditPurchaseForm(entry, pageContainer) {
  const comp = components.find(c => c.id === entry.component_id);
  const unit = comp?.unit || '';
  const currentQty = parseFloat(entry.qty_delta) || 0;
  const currentUnitCost = parseFloat(entry.unit_cost) || 0;
  const currentTotal = currentQty * currentUnitCost;
  const purchaseDate = entry.created_at ? entry.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);

  // Parse supplier from notes (format: "supplier | notes")
  const notesParts = (entry.notes || '').split(' | ');
  const supplier = notesParts.length > 1 ? notesParts[0] : '';
  const notes = notesParts.length > 1 ? notesParts.slice(1).join(' | ') : entry.notes || '';

  const html = `
    <form id="edit-purchase-form" class="form-grid">
      <div class="form-field">
        <label class="form-label">Компонент</label>
        <input type="text" class="form-control" value="${escHtml(comp?.name || entry.component_id)}" readonly style="color:var(--text-muted)">
      </div>
      <div class="form-row-2">
        <div class="form-field">
          <label class="form-label">Количество ${unit ? `(${unit})` : ''} <span class="text-danger">*</span></label>
          <input type="number" name="qty" class="form-control" min="0.001" step="any" value="${currentQty}">
        </div>
        <div class="form-field">
          <label class="form-label">Сумма за покупку (руб) <span class="text-danger">*</span></label>
          <input type="number" name="total_paid" class="form-control" min="0" step="any" value="${currentTotal.toFixed(2)}">
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Цена за единицу</label>
        <input type="text" class="form-control" id="edit-unit-cost-display" readonly style="color:var(--text-muted)"
          value="${currentUnitCost ? `${currentUnitCost.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₽ / ${unit || 'ед'}` : ''}">
      </div>
      ${formField('Производитель / Бренд', textInput('brand', entry.brand || ''))}
      ${formField('Поставщик', textInput('supplier', supplier))}
      ${formField('Дата', `<input type="date" name="purchase_date" class="form-control" value="${purchaseDate}">`)}
      ${formField(t('notes'), textareaInput('notes', notes))}
    </form>
  `;

  const overlay = showModal('Редактировать закупку', html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: t('save'), class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const form = overlay.querySelector('#edit-purchase-form');
      const data = collectForm(form);
      const qty = parseFloat(data.qty);
      const totalPaid = parseFloat(data.total_paid);
      if (!qty || qty <= 0) { showToast('Укажите количество', 'warning'); return; }
      if (isNaN(totalPaid) || totalPaid < 0) { showToast('Укажите сумму', 'warning'); return; }

      const unitCost = qty > 0 ? totalPaid / qty : 0;
      const notesSaved = [data.supplier, data.notes].filter(Boolean).join(' | ');

      try {
        // Update inventory row
        await updateRow('Inventory', entry.id, {
          ...entry,
          qty_delta: String(qty),
          unit_cost: String(unitCost),
          brand: data.brand || '',
          notes: notesSaved,
          created_at: data.purchase_date ? new Date(data.purchase_date).toISOString() : entry.created_at,
        });

        // Update corresponding MoneyLedger entry
        const ledgerEntry = moneyLedger.find(r => r.ref_type === 'inventory' && r.ref_id === entry.id);
        if (ledgerEntry) {
          await updateRow('MoneyLedger', ledgerEntry.id, {
            ...ledgerEntry,
            amount_signed: String(-totalPaid),
            notes: `Закупка: ${comp?.name || ''}${data.brand ? ` (${data.brand})` : ''} ${qty} ${unit} — ${totalPaid} руб`,
          });
        }

        closeModal();
        showToast('Закупка обновлена');
        await renderInventory(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);

  // Recalc unit cost on qty/total change
  function recalcEdit() {
    const qty = parseFloat(overlay.querySelector('[name=qty]')?.value) || 0;
    const total = parseFloat(overlay.querySelector('[name=total_paid]')?.value) || 0;
    const display = overlay.querySelector('#edit-unit-cost-display');
    if (display) {
      display.value = qty > 0 && total > 0
        ? `${(total / qty).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₽ / ${unit || 'ед'}`
        : '';
    }
  }

  overlay.querySelector('[name=qty]')?.addEventListener('input', recalcEdit);
  overlay.querySelector('[name=total_paid]')?.addEventListener('input', recalcEdit);
}
