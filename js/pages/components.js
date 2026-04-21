// Bood CRM — Components Page
import { getRows, appendRow, updateRow, softDelete, genId, now } from '../sheets.js';
import { calcOnHand } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTabs, renderTable, createTypeChip, pageHeader, formField, textInput,
  numberInput, selectInput, textareaInput, collectForm, initSearchableSelects } from '../ui.js';
import t from '../i18n.js';
import { escHtml } from '../utils.js';

const COMPONENT_TYPES = [
  'malt','hop','yeast','additive','salt','packaging','equipment',
  'grain_distill','sugar','fruit','finished_beer','finished_spirit','other'
];

const TABS = [
  { id: 'all', label: 'Все' },
  { id: 'malt', label: 'Солод' },
  { id: 'hop', label: 'Хмель' },
  { id: 'yeast', label: 'Дрожжи' },
  { id: 'grain_distill', label: 'Зерно&Сахар' },
  { id: 'additive', label: 'Добавки' },
  { id: 'packaging', label: 'Упаковка' },
  { id: 'finished_beer', label: 'Готовое пиво' },
  { id: 'finished_spirit', label: 'Готовый дистиллят' },
  { id: 'equipment', label: 'Оборудование' },
];

let activeTab = 'all';
let searchQuery = '';
let allComponents = [];
let inventoryCache = [];

export async function renderComponents(container) {
  showLoading(container);
  try {
    [allComponents, inventoryCache] = await Promise.all([
      getRows('Components'),
      getRows('Inventory'),
    ]);
    _render(container);
  } catch (e) {
    showError(container, e);
  }
}

function _render(container) {
  const active = allComponents.filter(c => c.is_active !== 'FALSE');
  const filtered = active.filter(c => {
    const matchType = activeTab === 'all' || c.type === activeTab;
    const matchSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchType && matchSearch;
  });

  container.innerHTML = `
    ${pageHeader(t('components'), `<button class="btn btn-primary" id="btn-add-component">+ ${t('add')}</button>`)}
    <div class="toolbar">
      <input type="text" class="search-input" placeholder="${t('search')}..." value="${escHtml(searchQuery)}">
    </div>
    <div id="tabs-container"></div>
    <div id="table-container"></div>
  `;

  renderTabs(container.querySelector('#tabs-container'), TABS, activeTab, (tab) => {
    activeTab = tab;
    _render(container);
  });

  const columns = [
    { label: t('name'), key: 'name', sortFn: r => r.name, render: r => `
      <strong>${escHtml(r.name)}</strong>
      ${r.brand ? `<br><span class="text-muted text-sm">${escHtml(r.brand)}</span>` : ''}
    `},
    { label: t('type'), key: 'type', sortFn: r => t(r.type), render: r => createTypeChip(r.type) },
    { label: t('unit'), key: 'unit', sortKey: 'unit' },
    { label: t('cost_per_unit'), key: 'cost_per_unit', sortFn: r => parseFloat(r.cost_per_unit) || 0, render: r => r.cost_per_unit ? `${parseFloat(r.cost_per_unit).toLocaleString('ru-RU')} ₽` : '—' },
    { label: t('on_hand'), sortFn: r => calcOnHand(inventoryCache, r.id), render: r => {
      const qty = calcOnHand(inventoryCache, r.id);
      return `<span class="${qty < 0 ? 'text-danger' : qty === 0 ? 'text-muted' : 'text-success'}">${qty.toLocaleString('ru-RU', {maximumFractionDigits:2})} ${r.unit}</span>`;
    }},
    { label: 'Хар-ки', render: r => renderAttrs(r) },
    { label: t('actions'), render: r => `
      <button class="btn btn-sm btn-secondary btn-edit" data-id="${r.id}">✎</button>
      <button class="btn btn-sm btn-danger btn-delete" data-id="${r.id}">✕</button>
    `},
  ];

  renderTable(container.querySelector('#table-container'), columns, filtered, {
    emptyMessage: t('no_data'),
    defaultSortCol: 0,
  });

  // Events
  container.querySelector('.search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    _render(container);
  });

  container.querySelector('#btn-add-component')?.addEventListener('click', () => showComponentForm(null, container));

  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const comp = allComponents.find(c => c.id === btn.dataset.id);
      if (comp) showComponentForm(comp, container);
    });
  });

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm(t('confirm_delete'), '', async () => {
        try {
          await softDelete('Components', btn.dataset.id);
          showToast(t('deleted'));
          await renderComponents(container);
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
  });
}

function renderAttrs(c) {
  const attrs = [];
  if (c.ebc) attrs.push(`EBC: ${c.ebc}`);
  if (c.alpha_acid) attrs.push(`AA: ${c.alpha_acid}%`);
  if (c.attenuation) attrs.push(`Att: ${c.attenuation}%`);
  return attrs.length ? `<span class="text-muted text-sm">${escHtml(attrs.join(' · '))}</span>` : '—';
}

function showComponentForm(comp, pageContainer) {
  const isNew = !comp;
  const type = comp?.type || 'malt';

  const typeOpts = COMPONENT_TYPES.map(v => ({ value: v, label: t(v) }));
  const unitOpts = ['кг','г','л','мл','шт','пач','уп','м','другое'].map(v => ({ value: v, label: v }));
  const spiritTypeOpts = [
    { value: '', label: '—' },
    { value: 'wash', label: 'Брага/Wash' },
    { value: 'grain', label: 'Зерновой' },
    { value: 'fruit', label: 'Фруктовый' },
    { value: 'sugar', label: 'Сахарный' },
  ];

  const html = `
    <form id="component-form" class="form-grid">
      ${formField(t('name'), textInput('name', comp?.name || ''), '', true)}
      ${formField('Производитель / Бренд', textInput('brand', comp?.brand || ''), 'Например: Курский, Castle Malting, Cargill, Hopsteiner')}
      ${formField(t('type'), selectInput('type', typeOpts, comp?.type || 'malt'), '', true)}
      ${formField(t('unit'), selectInput('unit', unitOpts, comp?.unit || 'кг'), '', true)}
      ${formField(t('cost_per_unit'), numberInput('cost_per_unit', comp?.cost_per_unit || ''))}
      <div id="dynamic-fields">${renderDynamicFields(type, comp)}</div>
      ${formField(t('notes'), textareaInput('notes', comp?.notes || ''))}
    </form>
  `;

  showModal(isNew ? t('new_component') : t('edit_component'), html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: t('save'), class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const form = overlay.querySelector('#component-form');
      const data = collectForm(form);
      if (!data.name.trim()) { showToast('Введите название', 'warning'); return; }
      try {
        const ts = now();
        if (isNew) {
          await appendRow('Components', { ...data, id: genId(), is_active: 'TRUE', created_at: ts, updated_at: ts });
        } else {
          await updateRow('Components', comp.id, { ...comp, ...data, updated_at: ts });
        }
        closeModal();
        showToast(t('saved'));
        await renderComponents(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);

  // Dynamic fields on type change
  document.getElementById('component-form')?.querySelector('[name=type]')?.addEventListener('change', (e) => {
    const df = document.getElementById('dynamic-fields');
    if (df) df.innerHTML = renderDynamicFields(e.target.value, null);
  });
}

function renderDynamicFields(type, comp) {
  const fields = [];
  if (['malt','grain_distill'].includes(type)) {
    fields.push(formField('EBC', numberInput('ebc', comp?.ebc || '')));
    fields.push(formField('Экстрактивность %', numberInput('attenuation', comp?.attenuation || '')));
  }
  if (type === 'hop') {
    fields.push(formField(t('alpha_acid'), numberInput('alpha_acid', comp?.alpha_acid || '')));
  }
  if (type === 'yeast') {
    fields.push(formField(t('attenuation'), numberInput('attenuation', comp?.attenuation || '')));
  }
  if (['finished_beer','finished_spirit'].includes(type)) {
    const spiritOpts = [
      { value: '', label: '—' },
      { value: 'wash', label: 'Брага' },
      { value: 'grain', label: 'Зерновой' },
      { value: 'fruit', label: 'Фруктовый' },
      { value: 'sugar', label: 'Сахарный' },
    ];
    fields.push(formField(t('spirit_type'), selectInput('spirit_type', spiritOpts, comp?.spirit_type || '')));
  }
  return fields.join('');
}
