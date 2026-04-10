// Bood CRM — Equipment Page
import { getRows, appendRow, updateRow, genId, now, getSettings } from '../sheets.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTable, pageHeader, formField, textInput, numberInput, selectInput, textareaInput, collectForm } from '../ui.js';
import { formatCurrency, formatDate, escHtml } from '../utils.js';
import t from '../i18n.js';

let equipment = [];
let moneyLedger = [];
let settings = {};

const CATEGORIES = [
  { value: 'still',       label: 'Перегонное оборудование' },
  { value: 'fermenter',   label: 'Ферментация' },
  { value: 'brewing',     label: 'Пивоварение' },
  { value: 'chiller',     label: 'Охлаждение' },
  { value: 'heating',     label: 'Нагрев' },
  { value: 'measuring',   label: 'Измерительные приборы' },
  { value: 'bottling',    label: 'Розлив и упаковка' },
  { value: 'filtration',  label: 'Фильтрация' },
  { value: 'storage',     label: 'Хранение' },
  { value: 'other',       label: 'Прочее' },
];

const STATUS_LABEL = { active: 'В использовании', sold: 'Продано', broken: 'Списано' };
const STATUS_COLOR = { active: 'var(--success)', sold: 'var(--accent)', broken: 'var(--text-muted)' };

export async function renderEquipment(container) {
  showLoading(container);
  try {
    [equipment, moneyLedger, settings] = await Promise.all([
      getRows('Equipment'),
      getRows('MoneyLedger'),
      getSettings(),
    ]);
    _render(container);
  } catch (e) {
    showError(container, e);
  }
}

function _render(container) {
  const active = equipment.filter(e => e.is_active !== 'FALSE');
  const inUse = active.filter(e => e.status === 'active');
  const retired = active.filter(e => e.status !== 'active');

  const totalValue = inUse.reduce((s, e) => s + (parseFloat(e.purchase_price) || 0), 0);
  const totalSpent = active.reduce((s, e) => s + (parseFloat(e.purchase_price) || 0), 0);
  const totalRecovered = active.reduce((s, e) => s + (parseFloat(e.sale_price) || 0), 0);

  container.innerHTML = `
    ${pageHeader('Оборудование', `<button class="btn btn-primary" id="btn-add-equipment">+ Добавить</button>`)}

    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="kpi-card">
        <div class="kpi-label">Единиц в работе</div>
        <div class="kpi-value">${inUse.length}</div>
        <div class="kpi-sub">из ${active.length} всего</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Балансовая стоимость</div>
        <div class="kpi-value">${formatCurrency(totalValue, settings.currency)}</div>
        <div class="kpi-sub">по цене покупки</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Итого вложено / возвращено</div>
        <div class="kpi-value">${formatCurrency(totalSpent, settings.currency)}</div>
        <div class="kpi-sub">возвращено: ${formatCurrency(totalRecovered, settings.currency)}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header"><h3>В использовании</h3></div>
      <div class="section-card-body p-0" id="active-table"></div>
    </div>

    ${retired.length ? `
      <div class="section-card mt-4">
        <div class="section-card-header"><h3>Продано / Списано</h3></div>
        <div class="section-card-body p-0" id="retired-table"></div>
      </div>
    ` : ''}
  `;

  const cols = [
    { label: 'Название', render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: 'Категория', render: r => {
      const cat = CATEGORIES.find(c => c.value === r.category);
      return `<span class="text-muted">${escHtml(cat?.label || r.category || '—')}</span>`;
    }},
    { label: 'Куплено', render: r => formatDate(r.purchase_date) },
    { label: 'Стоимость', render: r => formatCurrency(r.purchase_price, settings.currency) },
    { label: 'Заметки', render: r => `<span class="text-muted text-sm">${escHtml(r.notes || '')}</span>` },
    { label: '', render: r => `
      <button class="btn btn-sm btn-secondary btn-sell" data-id="${r.id}">Продать / Списать</button>
    `},
  ];

  const retiredCols = [
    { label: 'Название', render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: 'Категория', render: r => {
      const cat = CATEGORIES.find(c => c.value === r.category);
      return `<span class="text-muted">${escHtml(cat?.label || r.category || '—')}</span>`;
    }},
    { label: 'Статус', render: r => `<span style="color:${STATUS_COLOR[r.status]}">${STATUS_LABEL[r.status] || r.status}</span>` },
    { label: 'Куплено', render: r => formatDate(r.purchase_date) },
    { label: 'Покупка', render: r => formatCurrency(r.purchase_price, settings.currency) },
    { label: 'Продажа', render: r => r.sale_price ? formatCurrency(r.sale_price, settings.currency) : '—' },
    { label: 'Дата выбытия', render: r => formatDate(r.sale_date) },
  ];

  renderTable(container.querySelector('#active-table'), cols, inUse, {
    emptyMessage: 'Нет оборудования. Нажмите "+ Добавить".',
  });

  if (retired.length) {
    renderTable(container.querySelector('#retired-table'), retiredCols, retired, {
      emptyMessage: '',
    });
  }

  container.querySelector('#btn-add-equipment')?.addEventListener('click', () => showAddForm(container));

  container.querySelectorAll('.btn-sell').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = equipment.find(e => e.id === btn.dataset.id);
      if (item) showSellForm(item, container);
    });
  });
}

function showAddForm(pageContainer) {
  const catOpts = CATEGORIES.map(c => ({ value: c.value, label: c.label }));

  const html = `
    <form id="equipment-form" class="form-grid">
      ${formField('Название', textInput('name', ''), '', true)}
      ${formField('Категория', selectInput('category', catOpts, 'other'))}
      <div class="form-row-2">
        ${formField('Стоимость покупки (руб)', numberInput('purchase_price', ''), '', true)}
        ${formField('Дата покупки', `<input type="date" name="purchase_date" class="form-control" value="${new Date().toISOString().slice(0,10)}">`)}
      </div>
      ${formField('Заметки', textareaInput('notes', ''))}
    </form>
  `;

  showModal('Добавить оборудование', html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Добавить', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const data = collectForm(overlay.querySelector('#equipment-form'));
      if (!data.name?.trim()) { showToast('Введите название', 'warning'); return; }
      if (!data.purchase_price || parseFloat(data.purchase_price) < 0) { showToast('Укажите стоимость', 'warning'); return; }

      try {
        const ts = now();
        const id = genId();
        await appendRow('Equipment', {
          id, name: data.name, category: data.category,
          purchase_price: data.purchase_price,
          purchase_date: data.purchase_date || ts.slice(0,10),
          status: 'active',
          sale_price: '', sale_date: '',
          notes: data.notes || '',
          is_active: 'TRUE', created_at: ts, updated_at: ts,
        });
        // Record expense in MoneyLedger
        if (parseFloat(data.purchase_price) > 0) {
          await appendRow('MoneyLedger', {
            id: genId(),
            customer_id: '',
            amount_signed: String(-parseFloat(data.purchase_price)),
            movement_type: 'equipment_purchase',
            ref_type: 'equipment',
            ref_id: id,
            notes: `Покупка оборудования: ${data.name}`,
            created_at: ts,
          });
        }
        closeModal();
        showToast(`${data.name} добавлено`);
        await renderEquipment(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}

function showSellForm(item, pageContainer) {
  const html = `
    <form id="sell-form" class="form-grid">
      <p style="margin-bottom:8px">Оборудование: <strong>${escHtml(item.name)}</strong></p>
      <p style="margin-bottom:16px;color:var(--text-muted);font-size:0.9em">Куплено за ${formatCurrency(item.purchase_price, settings.currency)}</p>
      ${formField('Статус выбытия', selectInput('status', [
        { value: 'sold', label: 'Продано' },
        { value: 'broken', label: 'Списано (сломалось / утилизировано)' },
      ], 'sold'))}
      ${formField('Сумма продажи (руб)', numberInput('sale_price', '0'), 'Укажите 0 если списание или продажа по нулю')}
      ${formField('Дата выбытия', `<input type="date" name="sale_date" class="form-control" value="${new Date().toISOString().slice(0,10)}">`)}
      ${formField('Заметки', textareaInput('notes', item.notes || ''))}
    </form>
  `;

  showModal('Продать / Списать оборудование', html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Подтвердить', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const data = collectForm(overlay.querySelector('#sell-form'));
      const salePrice = parseFloat(data.sale_price) || 0;

      try {
        const ts = now();
        await updateRow('Equipment', item.id, {
          ...item,
          status: data.status,
          sale_price: String(salePrice),
          sale_date: data.sale_date || ts.slice(0,10),
          notes: data.notes,
          updated_at: ts,
        });
        // Record income in MoneyLedger (even if 0 — skip if 0 to avoid noise)
        if (salePrice > 0) {
          await appendRow('MoneyLedger', {
            id: genId(),
            customer_id: '',
            amount_signed: String(salePrice),
            movement_type: 'equipment_sale',
            ref_type: 'equipment',
            ref_id: item.id,
            notes: `${data.status === 'sold' ? 'Продажа' : 'Списание'} оборудования: ${item.name}`,
            created_at: ts,
          });
        }
        closeModal();
        showToast(data.status === 'sold' ? `${item.name} продано` : `${item.name} списано`);
        await renderEquipment(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}
