// Bood CRM — Distillation page (alias to batches filtered by type=distillate)
// Re-exports renderBatches with distillation filter pre-applied
import { getRows, appendRow, updateRow, genId, now, getSettings } from '../sheets.js';
import { formatCurrency, formatDate, calcCOGS, escHtml } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTable, createStatusChip, pageHeader, formField, numberInput, textInput, selectInput, textareaInput, collectForm } from '../ui.js';
import t from '../i18n.js';

let batches = [];
let components = [];
let inventory = [];
let settings = {};

export async function renderDistillation(container) {
  showLoading(container);
  try {
    [batches, components, inventory, settings] = await Promise.all([
      getRows('Batches'),
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
  const distBatches = batches
    .filter(b => b.type === 'distillate' && b.is_active !== 'FALSE')
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = `
    ${pageHeader('Дистилляция 🥃', `<button class="btn btn-primary" id="btn-new-distill">+ Новая партия дистиллята</button>`)}
    <div id="distill-table"></div>
  `;

  const cols = [
    { label: t('name'), render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: t('status'), render: r => createStatusChip(r.status) },
    { label: 'Дата', render: r => formatDate(r.brew_date) },
    { label: 'Крепость нач. %', render: r => r.og || '—' },
    { label: 'Крепость кон. %', render: r => r.fg || '—' },
    { label: 'Выход (л)', render: r => r.packaged_l || r.to_fermenter_l || '—' },
    { label: 'кВт·ч', render: r => r.kwh_used || '—' },
    { label: 'COGS', render: r => {
      if (r.cogs_snapshot) {
        try { return formatCurrency(JSON.parse(r.cogs_snapshot).total, settings.currency); } catch {}
      }
      return '—';
    }},
    { label: 'Проводка', render: r => `
      <span title="Брага">${r.brew_posted==='TRUE'?'✓':'-'}</span>
      <span title="Розлив">${r.packaging_posted==='TRUE'?'✓':'-'}</span>
    `},
  ];

  renderTable(container.querySelector('#distill-table'), cols, distBatches, {
    onRowClick: (row) => showDistillDetail(row, container),
    emptyMessage: 'Нет партий дистиллята. Создайте рецепт дистиллята и запустите варку.',
  });

  container.querySelector('#btn-new-distill')?.addEventListener('click', () => showNewDistillForm(container));
}

function showNewDistillForm(pageContainer) {
  const html = `
    <form id="distill-form" class="form-grid">
      ${formField('Название партии', textInput('name', `Дистиллят — ${new Date().toLocaleDateString('ru-RU')}`), '', true)}
      ${formField('Стиль / Тип', selectInput('style', [
        'Самогон','Виски','Кальвадос','Ректификат','Джин','Фруктовый','Другое'
      ].map(v=>({value:v,label:v})), 'Самогон'))}
      <div class="form-row-3">
        ${formField('Объём браги (л)', numberInput('batch_size_l', '', 'step="1" min="1"'))}
        ${formField('Крепость браги %', numberInput('og', '', 'step="0.1" min="0"'))}
        ${formField('Дата старта', `<input type="date" name="brew_date" class="form-control" value="${new Date().toISOString().slice(0,10)}">`)}
      </div>
      ${formField('Заметки', textareaInput('brew_notes', ''))}
    </form>
  `;

  showModal('Новая партия дистиллята', html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Создать', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const data = collectForm(overlay.querySelector('#distill-form'));
      if (!data.name.trim()) { showToast('Введите название', 'warning'); return; }
      try {
        const ts = now();
        await appendRow('Batches', {
          id: genId(), name: data.name, type: 'distillate',
          status: 'planned', brew_date: data.brew_date || ts.slice(0,10),
          og: data.og, recipe_snapshot: JSON.stringify({ recipe: { name: data.name, style: data.style, batch_size_l: data.batch_size_l, type: 'distillate' }, ingredients: [], mashRests: [] }),
          brew_notes: data.brew_notes, brew_posted: 'FALSE', packaging_posted: 'FALSE',
          is_active: 'TRUE', created_at: ts, updated_at: ts,
        });
        closeModal(); showToast('Партия создана');
        await renderDistillation(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}

function showDistillDetail(batch, pageContainer) {
  const tabs = [
    { id: 'overview', label: 'Обзор' },
    { id: 'braga', label: 'Брага' },
    { id: 'distill', label: 'Перегон' },
    { id: 'aging', label: 'Выдержка' },
    { id: 'summary', label: 'Итог & COGS' },
  ];

  let activeTab = 'overview';
  let editedBatch = { ...batch };

  const overlay = showModal(`Дистиллят: ${batch.name}`,
    `<div id="dt-tabs-nav"></div><div id="dt-tab-content" class="batch-detail-content"></div>`,
    [
      { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
      { label: t('save'), class: 'btn-primary', action: 'save', onClick: () => save() },
    ], { fullscreen: true }
  );

  const tabsNav = overlay.querySelector('#dt-tabs-nav');
  const tabContent = overlay.querySelector('#dt-tab-content');

  // Manual tab rendering since we can't use top-level await here
  function renderTabNav() {
    tabsNav.innerHTML = `<div class="tabs-nav">
      ${tabs.map(tab => `<button class="tab-btn${tab.id===activeTab?' active':''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
    </div>`;
    tabsNav.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        tabsNav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderContent();
      });
    });
  }

  function renderContent() {
    switch (activeTab) {
      case 'overview':
        tabContent.innerHTML = `<div class="form-grid">
          ${formField('Название', `<input type="text" name="name" class="form-control" value="${escHtml(editedBatch.name)}">`)}
          ${formField('Статус', selectInput('status', ['planned','distilling','aging','packaging','done','archived'].map(s=>({value:s,label:t(s)})), editedBatch.status))}
          ${formField('Дата старта', `<input type="date" name="brew_date" class="form-control" value="${editedBatch.brew_date?.slice?.(0,10)||''}">`)}
        </div>`;
        break;
      case 'braga':
        tabContent.innerHTML = `<div class="form-grid">
          ${formField('Объём браги (л)', `<input type="number" name="batch_size_l" class="form-control" value="${escHtml(editedBatch.batch_size_l||'')}" step="1">`)}
          ${formField('Крепость браги % / OG', `<input type="number" name="og" class="form-control" value="${escHtml(editedBatch.og||'')}" step="0.1">`)}
          ${formField('Часов труда', `<input type="number" name="labor_hours" class="form-control" value="${escHtml(editedBatch.labor_hours||'')}" step="0.5">`)}
          ${formField('Заметки по браге', `<textarea name="brew_notes" class="form-control" rows="5">${escHtml(editedBatch.brew_notes||'')}</textarea>`)}
        </div>`;
        break;
      case 'distill':
        tabContent.innerHTML = `<div class="form-grid">
          ${formField('Дата перегона', `<input type="date" name="package_date" class="form-control" value="${editedBatch.package_date?.slice?.(0,10)||''}">`)}
          <div class="form-row-3">
            ${formField('Объём выхода тела (л)', `<input type="number" name="to_fermenter_l" class="form-control" value="${escHtml(editedBatch.to_fermenter_l||'')}" step="0.01">`)}
            ${formField('Кон. крепость %', `<input type="number" name="fg" class="form-control" value="${escHtml(editedBatch.fg||'')}" step="0.1">`)}
            ${formField('Потреблено кВт·ч', `<input type="number" name="kwh_used" class="form-control" value="${escHtml(editedBatch.kwh_used||'')}" step="0.1">`)}
          </div>
          ${formField('Объём в розлив (л)', `<input type="number" name="packaged_l" class="form-control" value="${escHtml(editedBatch.packaged_l||'')}" step="0.1">`)}
          ${formField('Заметки перегона', `<textarea name="ferment_notes" class="form-control" rows="5">${escHtml(editedBatch.ferment_notes||'')}</textarea>`)}
          <div class="posting-actions">
            <button class="btn btn-primary ${editedBatch.brew_posted==='TRUE'?'disabled':''}" id="btn-post-distill-brew" ${editedBatch.brew_posted==='TRUE'?'disabled':''}>
              ${editedBatch.brew_posted==='TRUE'?'✓ Брага проведена':'Провести брагу'}
            </button>
            <button class="btn btn-secondary ${editedBatch.packaging_posted==='TRUE'||editedBatch.brew_posted!=='TRUE'?'disabled':''}" id="btn-post-distill-pack" ${editedBatch.packaging_posted==='TRUE'||editedBatch.brew_posted!=='TRUE'?'disabled':''}>
              ${editedBatch.packaging_posted==='TRUE'?'✓ Дистиллят оприходован':'Оприходовать дистиллят'}
            </button>
          </div>
        </div>`;

        tabContent.querySelector('#btn-post-distill-brew')?.addEventListener('click', async () => {
          if (editedBatch.brew_posted === 'TRUE') return;
          const ts = now();
          editedBatch.brew_posted = 'TRUE';
          editedBatch.brew_posted_at = ts;
          await save();
          renderContent();
        });

        tabContent.querySelector('#btn-post-distill-pack')?.addEventListener('click', async () => {
          if (editedBatch.packaging_posted === 'TRUE') return;
          const ts = now();
          const cogs = calcCOGS(editedBatch, inventory, settings);
          editedBatch.packaging_posted = 'TRUE';
          editedBatch.packaging_posted_at = ts;
          editedBatch.cogs_snapshot = JSON.stringify(cogs);
          editedBatch.cogs_frozen_at = ts;
          editedBatch.status = 'done';
          await save();
          renderContent();
        });
        break;
      case 'aging':
        tabContent.innerHTML = `<div class="form-grid">
          ${formField('Месяцев выдержки', `<input type="number" name="ferment_days" class="form-control" value="${escHtml(editedBatch.ferment_days||'0')}" step="1">`)}
          ${formField('Заметки выдержки', `<textarea name="ferment_notes" class="form-control" rows="6">${escHtml(editedBatch.ferment_notes||'')}</textarea>`)}
        </div>`;
        break;
      case 'summary':
        const cogs = editedBatch.cogs_snapshot ? JSON.parse(editedBatch.cogs_snapshot) : calcCOGS(editedBatch, inventory, settings);
        const packL = parseFloat(editedBatch.packaged_l || editedBatch.to_fermenter_l || 0);
        const perL = packL > 0 ? cogs.total / packL : 0;
        const abv = parseFloat(editedBatch.fg || 0);
        const perLAS = abv > 0 && packL > 0 ? cogs.total / (packL * abv / 100) : 0;
        tabContent.innerHTML = `
          <div class="cogs-breakdown">
            <h4>Себестоимость (COGS)</h4>
            <table class="cost-table">
              <tr><td>Ингредиенты браги</td><td>${formatCurrency(cogs.materials, settings.currency)}</td></tr>
              <tr><td>Электроэнергия</td><td>${formatCurrency(cogs.energy, settings.currency)}</td></tr>
              <tr><td>Труд</td><td>${formatCurrency(cogs.labor, settings.currency)}</td></tr>
              <tr class="cost-total"><td><strong>Итого</strong></td><td><strong>${formatCurrency(cogs.total, settings.currency)}</strong></td></tr>
              <tr><td>На литр</td><td>${formatCurrency(perL, settings.currency)}</td></tr>
              ${perLAS ? `<tr><td>На литр АС (${abv}%)</td><td><strong>${formatCurrency(perLAS, settings.currency)}</strong></td></tr>` : ''}
            </table>
          </div>
        `;
        break;
    }

    // Sync all fields
    tabContent.querySelectorAll('[name]').forEach(el => {
      el.addEventListener('change', () => { editedBatch[el.name] = el.value; });
    });
  }

  async function save() {
    try {
      editedBatch.updated_at = now();
      await updateRow('Batches', batch.id, editedBatch);
      showToast(t('saved'));
    } catch (e) { showToast(e.message, 'error'); }
  }

  renderTabNav();
  renderContent();
}
