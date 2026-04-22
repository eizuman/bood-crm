// Bood CRM — Batches Page (Beer & Distillation)
import { getRows, appendRow, appendRows, updateRow, softDelete, genId, now, getSettings } from '../sheets.js';
import { calcCOGS, calcABV, calcOnHand, getEffectivePrice, formatCurrency, escHtml, formatDate } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTabs, renderTable, createStatusChip, createBatchTypeChip, pageHeader,
  formField, numberInput, textInput, selectInput, textareaInput, collectForm, kpiCard } from '../ui.js';
import t from '../i18n.js';

let batches = [];
let components = [];
let inventory = [];
let sales = [];
let customers = [];
let settings = {};
let filterStatus = 'all';

export async function renderBatches(container) {
  showLoading(container);
  try {
    [batches, components, inventory, sales, customers, settings] = await Promise.all([
      getRows('Batches'),
      getRows('Components'),
      getRows('Inventory'),
      getRows('Sales'),
      getRows('Customers'),
      getSettings(),
    ]);
    _render(container);
  } catch (e) {
    showError(container, e);
  }
}

function _render(container) {
  const active = batches.filter(b => b.is_active !== 'FALSE');
  const statusOpts = ['all','planned','brewing','fermenting','distilling','aging','packaging','done','archived'];

  const filtered = active.filter(b => filterStatus === 'all' || b.status === filterStatus);
  const sorted = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = `
    ${pageHeader(t('batches'))}
    <div class="toolbar">
      <div class="filter-chips">
        ${statusOpts.map(s => `<button class="chip-filter${filterStatus===s?' active':''}" data-status="${s}">${s==='all'?t('all'):t(s)}</button>`).join('')}
      </div>
    </div>
    <div id="batches-table"></div>
  `;

  const cols = [
    { label: t('name'), render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: t('type'), render: r => createBatchTypeChip(r.type) },
    { label: t('status'), render: r => createStatusChip(r.status) },
    { label: t('brew_date'), render: r => formatDate(r.brew_date) },
    { label: 'ABV', render: r => r.abv ? `${r.abv}%` : (r.og && r.fg ? `${calcABV(r.og, r.fg)}%` : '—') },
    { label: 'Объём', render: r => r.packaged_l ? `${r.packaged_l} л` : r.to_fermenter_l ? `${r.to_fermenter_l} л` : '—' },
    { label: 'COGS', render: r => {
      if (r.cogs_snapshot) {
        try {
          const cogs = JSON.parse(r.cogs_snapshot);
          return formatCurrency(cogs.total, settings.currency);
        } catch { return '—'; }
      }
      return '—';
    }},
    { label: 'Posting', render: r => `
      <span title="Brew">${r.brew_posted==='TRUE'?'✓':' '}</span>
      <span title="Pack">${r.packaging_posted==='TRUE'?'✓':' '}</span>
    `},
  ];

  renderTable(container.querySelector('#batches-table'), cols, sorted, {
    onRowClick: (row) => showBatchDetail(row, container),
    emptyMessage: t('no_data'),
  });

  // Filter chips
  container.querySelectorAll('.chip-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.status;
      _render(container);
    });
  });
}

// ─── Batch Detail Modal ───────────────────────────────────────────────────────
function showBatchDetail(batch, pageContainer) {
  const tabs = batch.type === 'beer'
    ? [
        { id: 'overview', label: 'Обзор' },
        { id: 'plan', label: 'Рецепт' },
        { id: 'brewday', label: 'День варки' },
        { id: 'fermentation', label: 'Брожение' },
        { id: 'packaging', label: 'Упаковка' },
        { id: 'summary', label: 'Итог' },
      ]
    : [
        { id: 'overview', label: 'Обзор' },
        { id: 'plan', label: 'Рецепт' },
        { id: 'braga', label: 'Брага' },
        { id: 'distill', label: 'Перегон' },
        { id: 'aging', label: 'Выдержка' },
        { id: 'packaging', label: 'Розлив' },
        { id: 'summary', label: 'Итог' },
      ];

  let activeTab = 'overview';
  let editedBatch = { ...batch };

  const overlay = showModal(
    `Партия: ${batch.name}`,
    `<div id="batch-tabs-nav"></div><div id="batch-tab-content" class="batch-detail-content"></div>`,
    [
      { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
      { label: 'Сохранить', class: 'btn-primary', action: 'save', onClick: () => saveBatch() },
    ],
    { fullscreen: true }
  );

  const tabsNav = overlay.querySelector('#batch-tabs-nav');
  const tabContent = overlay.querySelector('#batch-tab-content');

  renderTabs(tabsNav, tabs, activeTab, (tab) => {
    activeTab = tab;
    renderBatchTab();
  });
  renderBatchTab();

  function renderBatchTab() {
    switch (activeTab) {
      case 'overview':    renderOverviewTab(tabContent, editedBatch, pageContainer); break;
      case 'plan':        renderPlanTab(tabContent, editedBatch); break;
      case 'brewday':     renderBrewDayTab(tabContent, editedBatch, pageContainer); break;
      case 'braga':       renderBragaTab(tabContent, editedBatch); break;
      case 'distill':     renderDistillTab(tabContent, editedBatch); break;
      case 'fermentation':renderFermentTab(tabContent, editedBatch); break;
      case 'aging':       renderAgingTab(tabContent, editedBatch); break;
      case 'packaging':   renderPackagingTab(tabContent, editedBatch, pageContainer); break;
      case 'summary':     renderSummaryTab(tabContent, editedBatch); break;
    }
    // Sync fields; auto-convert Brix → SG for og/fg inputs
    tabContent.querySelectorAll('[name]').forEach(el => {
      el.addEventListener('change', () => {
        let val = el.value;
        if ((el.name === 'og' || el.name === 'fg') && parseFloat(val) > 2) {
          val = normalizeGravity(val);
          el.value = val;
          el.title = `Введено как Brix, сохранено как SG: ${val}`;
        }
        editedBatch[el.name] = val;
      });
    });
  }

  async function saveBatch() {
    try {
      editedBatch.updated_at = now();
      await updateRow('Batches', batch.id, editedBatch);
      closeModal();
      showToast(t('saved'));
      await renderBatches(pageContainer);
    } catch (e) { showToast(e.message, 'error'); }
  }
}

function renderOverviewTab(container, batch, pageContainer) {
  const snapshot = batch.recipe_snapshot ? JSON.parse(batch.recipe_snapshot) : {};
  const recipe = snapshot.recipe || {};
  const balance = calcBatchBalance(batch);

  // Sales that include this batch
  const batchSales = sales
    .filter(s => s.status === 'posted' && s.items)
    .filter(s => {
      try { return JSON.parse(s.items).some(i => i.type === 'product' && i.batch_id === batch.id); }
      catch { return false; }
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = `
    <div class="form-grid">
      ${formField('Название партии', `<input type="text" name="name" class="form-control" value="${escHtml(batch.name)}">`)}
      <div class="form-row-3">
        ${formField('Тип', `<span class="form-static">${batch.type === 'beer' ? 'Пиво 🍺' : 'Дистиллят 🥃'}</span>`)}
        ${formField(t('status'), selectInput('status', [
          'planned','brewing','fermenting','distilling','aging','packaging','done','archived'
        ].map(s=>({value:s,label:t(s)})), batch.status))}
        ${formField('Дата варки', `<input type="date" name="brew_date" class="form-control" value="${batch.brew_date?.slice?.(0,10)||''}">`)}
      </div>
      ${recipe.name ? `<div class="info-block"><strong>Рецепт:</strong> ${escHtml(recipe.name)} — ${escHtml(recipe.style||'')} | ${recipe.batch_size_l||'?'} л | OG: ${recipe.og_target||'?'}</div>` : ''}
    </div>
    ${batch.packaged_l ? `
    <div class="section-card" style="margin-top:16px">
      <div class="section-card-header"><h4>Баланс литров</h4></div>
      <div class="section-card-body">
        <div class="liter-balance-grid">
          <div class="liter-kpi"><span class="liter-kpi-label">Упаковано</span><span class="liter-kpi-value">${balance.packaged} л</span></div>
          <div class="liter-kpi"><span class="liter-kpi-label">Продано</span><span class="liter-kpi-value" style="color:var(--success)">${balance.sold.toFixed(1)} л</span></div>
          <div class="liter-kpi"><span class="liter-kpi-label">Списано</span><span class="liter-kpi-value">${balance.writtenOff.toFixed(1)} л</span></div>
          <div class="liter-kpi liter-kpi-balance"><span class="liter-kpi-label">Остаток</span><span class="liter-kpi-value">${balance.balance.toFixed(1)} л</span></div>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-secondary btn-sm" id="btn-writeoff">✗ Списать остатки</button>
        </div>
      </div>
    </div>
    ${batchSales.length ? `
    <div class="section-card" style="margin-top:12px">
      <div class="section-card-header"><h4>Продажи</h4></div>
      <div class="section-card-body p-0">
        <table class="data-table">
          <thead><tr><th>Дата</th><th>Клиент</th><th>Литры</th><th>Сумма</th></tr></thead>
          <tbody>
            ${batchSales.map(s => {
              const items = JSON.parse(s.items);
              const liters = items.filter(i => i.type === 'product' && i.batch_id === batch.id)
                .reduce((sum, i) => sum + (parseFloat(i.qty_l)||0), 0);
              return `<tr class="batch-sale-row" data-id="${escHtml(s.id)}">
                <td>${formatDate(s.created_at)}</td>
                <td>${escHtml(customers.find(c => c.id === s.customer_id)?.name || (s.sale_type === 'gift' ? '🎁 Подарок' : '—'))}</td>
                <td>${liters.toFixed(1)} л</td>
                <td>${formatCurrency(s.total_amount, settings.currency)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}
    ` : ''}
  `;

  container.querySelector('#btn-writeoff')?.addEventListener('click', () => {
    showWriteOffDialog(batch, pageContainer);
  });
}

function renderPlanTab(container, batch) {
  const snapshot = batch.recipe_snapshot ? JSON.parse(batch.recipe_snapshot) : {};
  const recipe = snapshot.recipe || {};
  const ingList = (snapshot.ingredients || []);
  const stages = ['mash','boil','whirlpool','fermentation','dry_hop','packaging','wash','distillation','aging'];

  container.innerHTML = `
    <div class="plan-grid">
      ${stages.map(stage => {
        const items = ingList.filter(i => i.stage_key === stage);
        if (!items.length) return '';
        return `
          <div class="plan-section">
            <h4>${escHtml(stage)}</h4>
            <table class="data-table">
              <thead><tr><th>Компонент</th><th>Кол-во</th><th>Время/Этап</th></tr></thead>
              <tbody>
                ${items.map(ing => {
                  const comp = components.find(c => c.id === ing.component_id);
                  return `<tr>
                    <td>${escHtml(comp?.name || ing.component_id)}</td>
                    <td>${escHtml(ing.qty||'')} ${escHtml(comp?.unit||'')}</td>
                    <td>${escHtml(ing.time_meta||'')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).filter(Boolean).join('')}
      ${!ingList.length ? '<p class="text-muted">Нет данных рецепта</p>' : ''}
    </div>
  `;
}

function renderBrewDayTab(container, batch, pageContainer) {
  const brewPosted = batch.brew_posted === 'TRUE';
  const snapshot = batch.recipe_snapshot ? JSON.parse(batch.recipe_snapshot) : {};
  const ingredients = snapshot.ingredients || [];
  const isBeer = batch.type === 'beer';

  container.innerHTML = `
    <div class="form-grid">
      <div class="form-row-3">
        ${formField('OG измеренная', `<input type="number" name="og" class="form-control" value="${escHtml(batch.og||'')}" step="0.001" placeholder="1.050">`)}
        ${formField('В ферментёр (л)', `<input type="number" name="to_fermenter_l" class="form-control" value="${escHtml(batch.to_fermenter_l||'')}" step="0.1">`)}
        ${formField('Потреблено кВт·ч', `<input type="number" name="kwh_used" class="form-control" value="${escHtml(batch.kwh_used||'')}" step="0.1">`)}
      </div>
      ${formField('Часов труда (варка)', `<input type="number" name="labor_hours" class="form-control" value="${escHtml(batch.labor_hours||'')}" step="0.5">`)}
      ${formField('Заметки дня варки', `<textarea name="brew_notes" class="form-control" rows="4">${escHtml(batch.brew_notes||'')}</textarea>`)}
    </div>
    <div class="section-card" style="margin-top:16px">
      <div class="section-card-header">
        <h4>${isBeer ? 'Проводка варки' : 'Проводка браги'}</h4>
        <span class="${brewPosted ? 'badge-success' : 'badge-muted'}">${brewPosted ? '✓ Проведено' : '○ Не проведено'}</span>
      </div>
      <div class="section-card-body">
        <div class="posting-actions">
          <button class="btn btn-primary${brewPosted ? ' disabled' : ''}" id="btn-post-brew" ${brewPosted ? 'disabled' : ''}>
            ${isBeer ? t('post_brew') : 'Провести брагу'}
          </button>
          ${brewPosted ? `<button class="btn btn-secondary" id="btn-undo-brew">↩ ${t('undo')}</button>` : ''}
        </div>
        ${brewPosted ? `<p class="text-muted text-sm" style="margin-top:8px">Проведено: ${batch.brew_posted_at ? formatDate(batch.brew_posted_at) : '?'}</p>` : ''}
      </div>
    </div>
  `;

  container.querySelector('#btn-post-brew')?.addEventListener('click', () => {
    if (brewPosted) return;
    const brewIngredients = ingredients.filter(i =>
      ['mash','boil','whirlpool','fermentation','dry_hop','wash','distillation'].includes(i.stage_key)
    );
    showBrewPostDialog(batch, brewIngredients, isBeer, pageContainer);
  });

  container.querySelector('#btn-undo-brew')?.addEventListener('click', () => {
    showConfirm(t('confirm_undo'), '', async () => {
      try {
        const ts = now();
        const origMovements = inventory.filter(i => i.ref_id === batch.id && i.movement_type === (isBeer ? 'brew_consume' : 'distill_consume'));
        const reverseRows = origMovements.map(m => ({
          id: genId(), component_id: m.component_id,
          qty_delta: String(-parseFloat(m.qty_delta)),
          movement_type: 'adjustment', ref_type: 'undo_batch', ref_id: batch.id,
          unit_cost: m.unit_cost, notes: `Undo: ${batch.name}`, created_at: ts,
        }));
        if (reverseRows.length) await appendRows('Inventory', reverseRows);
        batch.brew_posted = 'FALSE';
        batch.brew_posted_at = '';
        await updateRow('Batches', batch.id, { ...batch });
        showToast('Проводка варки отменена');
        closeModal();
        await renderBatches(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function renderBragaTab(container, batch) {
  container.innerHTML = `
    <div class="form-grid">
      ${formField('Дата старта браги', `<input type="date" name="brew_date" class="form-control" value="${batch.brew_date?.slice?.(0,10)||''}">`)}
      ${formField('Нач. плотность браги / OG', `<input type="number" name="og" class="form-control" value="${escHtml(batch.og||'')}" step="0.001">`)}
      ${formField('Заметки по браге', `<textarea name="brew_notes" class="form-control" rows="5">${escHtml(batch.brew_notes||'')}</textarea>`)}
    </div>
  `;
}

function renderDistillTab(container, batch) {
  container.innerHTML = `
    <div class="form-grid">
      ${formField('Дата перегона', `<input type="date" name="package_date" class="form-control" value="${batch.package_date?.slice?.(0,10)||''}">`)}
      <div class="form-row-3">
        ${formField('Выход голов (л)', `<input type="number" name="ferment_notes" class="form-control" value="" step="0.01" placeholder="0.0">`, 'heads')}
        ${formField('Выход тела (л)', `<input type="number" name="to_fermenter_l" class="form-control" value="${escHtml(batch.to_fermenter_l||'')}" step="0.1" placeholder="0.0">`, 'hearts')}
        ${formField('Выход хвостов (л)', `<input type="number" name="ferment_days_tails" class="form-control" value="" step="0.01" placeholder="0.0">`, 'tails')}
      </div>
      <div class="form-row-2">
        ${formField('Нач. крепость %', `<input type="number" name="og" class="form-control" value="${escHtml(batch.og||'')}" step="0.1">`)}
        ${formField('Кон. крепость %', `<input type="number" name="fg" class="form-control" value="${escHtml(batch.fg||'')}" step="0.1">`)}
      </div>
      ${formField('Потреблено кВт·ч', `<input type="number" name="kwh_used" class="form-control" value="${escHtml(batch.kwh_used||'')}" step="0.1">`)}
      ${formField('Заметки перегона', `<textarea name="ferment_notes" class="form-control" rows="5">${escHtml(batch.ferment_notes||'')}</textarea>`)}
    </div>
  `;
}

function renderFermentTab(container, batch) {
  container.innerHTML = `
    <div class="form-grid">
      ${formField('FG измеренная', `<input type="number" name="fg" class="form-control" value="${escHtml(batch.fg||'')}" step="0.001" placeholder="1.010">`)}
      ${formField('ABV%', `<input type="number" name="abv" class="form-control" value="${escHtml(batch.abv || (batch.og&&batch.fg?calcABV(batch.og,batch.fg):'') ||'')}" step="0.1">`)}
      ${formField('Заметки брожения', `<textarea name="ferment_notes" class="form-control" rows="6">${escHtml(batch.ferment_notes||'')}</textarea>`)}
    </div>
  `;
}

function renderAgingTab(container, batch) {
  container.innerHTML = `
    <div class="form-grid">
      ${formField('Дата начала выдержки', `<input type="date" name="package_date" class="form-control" value="${batch.package_date?.slice?.(0,10)||''}">`)}
      ${formField('Заметки выдержки', `<textarea name="ferment_notes" class="form-control" rows="6">${escHtml(batch.ferment_notes||'')}</textarea>`)}
    </div>
  `;
}

function renderPackagingTab(container, batch, pageContainer) {
  const packPosted = batch.packaging_posted === 'TRUE';
  const snapshot = batch.recipe_snapshot ? JSON.parse(batch.recipe_snapshot) : {};
  const ingredients = snapshot.ingredients || [];
  const isBeer = batch.type === 'beer';
  const packIngList = ingredients.filter(i => i.stage_key === 'packaging');

  container.innerHTML = `
    <div class="form-grid">
      <div class="form-row-2">
        ${formField('Упаковано (л)', `<input type="number" name="packaged_l" class="form-control" value="${escHtml(batch.packaged_l||'')}" step="0.1">`)}
        ${formField('Дата упаковки', `<input type="date" name="package_date" class="form-control" value="${batch.package_date?.slice?.(0,10)||''}">`)}
      </div>
      <div class="form-row-2">
        ${formField('Часов труда (уп.)', `<input type="number" name="packaging_labor_hours" class="form-control" value="${escHtml(batch.packaging_labor_hours||'')}" step="0.5">`)}
        ${formField('Цена продажи (₽/л)', `<input type="number" name="sale_price_per_l" class="form-control" value="${escHtml(batch.sale_price_per_l||'')}" step="1" placeholder="Цена по умолчанию">`)}
      </div>
      ${formField('Заметки упаковки', `<textarea name="package_notes" class="form-control" rows="4">${escHtml(batch.package_notes||'')}</textarea>`)}
    </div>
    <div class="section-card" style="margin-top:16px">
      <div class="section-card-header">
        <h4>${isBeer ? 'Проводка упаковки' : 'Проводка выхода дистиллята'}</h4>
        <span class="${packPosted ? 'badge-success' : 'badge-muted'}">${packPosted ? '✓ Проведено' : '○ Не проведено'}</span>
      </div>
      <div class="section-card-body">
        ${packIngList.map(ing => {
          const comp = components.find(c => c.id === ing.component_id);
          return `<div class="posting-row"><span>${escHtml(comp?.name||'?')}</span><span>${escHtml(ing.qty||'?')} ${escHtml(comp?.unit||'')}</span></div>`;
        }).join('') || '<p class="text-muted">Нет упаковочных материалов в рецепте</p>'}
        <div class="posting-actions" style="margin-top:12px">
          <label class="checkbox-label" style="margin-bottom:10px">
            <input type="checkbox" id="chk-cogs-catalog">
            Себестоимость по каталогу (без списания со склада)
          </label>
          <button class="btn btn-primary${packPosted ? ' disabled' : ''}" id="btn-post-packaging" ${packPosted ? 'disabled' : ''}>
            ${isBeer ? t('post_packaging') : 'Провести выход дистиллята'}
          </button>
          ${packPosted ? `<button class="btn btn-secondary" id="btn-undo-packaging" style="margin-left:8px">↩ ${t('undo')}</button>` : ''}
        </div>
        ${packPosted ? `<p class="text-muted text-sm" style="margin-top:8px">Проведено: ${batch.packaging_posted_at ? formatDate(batch.packaging_posted_at) : '?'}</p>` : ''}
      </div>
    </div>
  `;

  container.querySelector('#btn-post-packaging')?.addEventListener('click', () => {
    if (packPosted) return;
    const cogsByCatalog = container.querySelector('#chk-cogs-catalog')?.checked;
    showConfirm(
      t('confirm_post'),
      cogsByCatalog
        ? 'COGS будет рассчитан по каталожным ценам, движения склада не создаются'
        : 'Упаковочные материалы будут списаны со склада',
      async () => {
        try {
          const ts = now();
          const consumeRows = [];

          if (!cogsByCatalog) {
            packIngList.forEach(ing => {
              const { price } = getEffectivePrice(ing.component_id, inventory, components);
              const comp = components.find(c => c.id === ing.component_id);
              consumeRows.push({
                id: genId(), component_id: ing.component_id,
                qty_delta: String(-Math.abs(parseFloat(ing.qty) || 0)),
                movement_type: 'packaging_consume',
                ref_type: 'batch', ref_id: batch.id,
                unit_cost: price !== null ? String(price) : (comp?.cost_per_unit || '0'),
                notes: batch.name, created_at: ts,
              });
            });
          }

          if (consumeRows.length) await appendRows('Inventory', consumeRows);

          const cogs = cogsByCatalog
            ? calcCogsByCatalog(batch, settings)
            : calcCOGS(batch, inventory, settings);

          batch.packaging_posted = 'TRUE';
          batch.packaging_posted_at = ts;
          batch.cogs_snapshot = JSON.stringify(cogs);
          batch.cogs_frozen_at = ts;
          batch.status = 'done';
          await updateRow('Batches', batch.id, { ...batch });

          showToast(t('posted_ok'));
          closeModal();
          await renderBatches(pageContainer);
        } catch (e) { showToast(e.message, 'error'); }
      }
    );
  });

  container.querySelector('#btn-undo-packaging')?.addEventListener('click', () => {
    showConfirm(t('confirm_undo'), '', async () => {
      try {
        const ts = now();
        const origMovements = inventory.filter(i => i.ref_id === batch.id && i.movement_type === 'packaging_consume');
        const reverseRows = origMovements.map(m => ({
          id: genId(), component_id: m.component_id,
          qty_delta: String(-parseFloat(m.qty_delta)),
          movement_type: 'adjustment', ref_type: 'undo_batch', ref_id: batch.id,
          unit_cost: m.unit_cost, notes: `Undo pack: ${batch.name}`, created_at: ts,
        }));
        if (reverseRows.length) await appendRows('Inventory', reverseRows);
        batch.packaging_posted = 'FALSE';
        batch.packaging_posted_at = '';
        await updateRow('Batches', batch.id, { ...batch });
        showToast('Проводка упаковки отменена');
        closeModal();
        await renderBatches(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function compDisplayName(c) {
  return c.brand ? `${c.name} (${c.brand})` : c.name;
}

// Auto-convert Brix → SG. Values > 2 are assumed Brix; 1.0–1.2 are SG.
function brixToSg(brix) {
  const b = parseFloat(brix);
  return +(1 + (b / (258.6 - (b / 258.2) * 227.1))).toFixed(4);
}
function normalizeGravity(val) {
  const v = parseFloat(val);
  if (!v) return val;
  return v > 2 ? String(brixToSg(v)) : val;
}

// Liter balance: packaged - sold - written_off
function calcBatchBalance(batch) {
  const writtenOff = inventory
    .filter(m => m.ref_id === batch.id && m.movement_type === 'batch_writeoff')
    .reduce((sum, m) => sum + Math.abs(parseFloat(m.qty_delta || 0)), 0);

  const sold = sales
    .filter(s => s.status === 'posted' && s.items)
    .reduce((sum, s) => {
      try {
        return sum + JSON.parse(s.items)
          .filter(i => i.type === 'product' && i.batch_id === batch.id)
          .reduce((ss, i) => ss + (parseFloat(i.qty_l) || 0), 0);
      } catch { return sum; }
    }, 0);

  const packaged = parseFloat(batch.packaged_l) || 0;
  return { packaged, sold, writtenOff, balance: packaged - sold - writtenOff };
}

// COGS calculated from recipe snapshot + catalog prices (no inventory movements required)
function calcCogsByCatalog(batch, settings) {
  const snapshot = batch.recipe_snapshot ? JSON.parse(batch.recipe_snapshot) : {};
  const ingredients = snapshot.ingredients || [];
  const brewStages = ['mash','boil','whirlpool','fermentation','dry_hop','wash','distillation'];

  const materials = ingredients
    .filter(i => brewStages.includes(i.stage_key))
    .reduce((sum, ing) => {
      const { price } = getEffectivePrice(ing.component_id, [], components);
      return sum + (parseFloat(ing.qty) || 0) * (price || 0);
    }, 0);

  const packaging = ingredients
    .filter(i => i.stage_key === 'packaging')
    .reduce((sum, ing) => {
      const { price } = getEffectivePrice(ing.component_id, [], components);
      return sum + (parseFloat(ing.qty) || 0) * (price || 0);
    }, 0);

  const energy = (parseFloat(batch.kwh_used) || 0) * parseFloat(settings.electricity_cost_kwh || 6.5);
  const labor = ((parseFloat(batch.labor_hours) || 0) + (parseFloat(batch.packaging_labor_hours) || 0)) * parseFloat(settings.labor_rate_hour || 300);
  return { materials, packaging, energy, labor, total: materials + packaging + energy + labor };
}

function showWriteOffDialog(batch, pageContainer) {
  showModal('Списать остатки', `
    <div class="form-grid">
      ${formField('Объём списания (л)', `<input type="number" id="writeoff-vol" class="form-control" step="0.1" min="0.1" placeholder="0.0">`)}
      ${formField('Причина', `<input type="text" id="writeoff-reason" class="form-control" placeholder="Потери, бой, дегустация...">`)}
    </div>
  `, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Списать', class: 'btn-danger', action: 'save', onClick: async (dlg) => {
      const vol = parseFloat(dlg.querySelector('#writeoff-vol').value);
      const reason = dlg.querySelector('#writeoff-reason').value.trim();
      if (!vol || vol <= 0) { showToast('Введите объём', 'error'); return; }
      try {
        await appendRow('Inventory', {
          id: genId(),
          component_id: batch.id,
          qty_delta: String(-vol),
          movement_type: 'batch_writeoff',
          ref_type: 'batch',
          ref_id: batch.id,
          unit_cost: '0',
          notes: reason || 'Списание остатков',
          created_at: now(),
        });
        showToast('Списание проведено');
        closeModal();
        await renderBatches(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}

function showBrewPostDialog(batch, brewIngredients, isBeer, pageContainer) {
  // Build a row per ingredient with component picker (same type)
  const rows = brewIngredients.map((ing, idx) => {
    const recipeComp = components.find(c => c.id === ing.component_id);
    if (!recipeComp) return null;

    // All active components of same type, with on-hand > 0 OR matching the recipe comp
    const candidates = components.filter(c =>
      c.is_active !== 'FALSE' && c.type === recipeComp.type
    ).map(c => {
      const onHand = calcOnHand(inventory, c.id);
      const { price } = getEffectivePrice(c.id, inventory, components);
      return { c, onHand, price };
    });

    const opts = candidates.map(({ c, onHand, price }) => {
      const name = compDisplayName(c);
      const stock = onHand > 0
        ? `${onHand.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${c.unit}`
        : 'нет на складе';
      const priceStr = price ? ` · ${price} ₽/${c.unit}` : '';
      const warn = onHand < (parseFloat(ing.qty) || 0) ? ' ⚠' : '';
      return `<option value="${c.id}" ${c.id === ing.component_id ? 'selected' : ''}>${escHtml(name)} — ${escHtml(stock)}${escHtml(priceStr)}${warn}</option>`;
    }).join('');

    return `
      <div class="brew-post-row" style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:0 0 auto;min-width:120px">
            <div class="text-muted text-sm">По рецепту</div>
            <strong>${escHtml(compDisplayName(recipeComp))}</strong>
            <div class="text-sm">${escHtml(ing.qty || '?')} ${escHtml(recipeComp.unit || '')}</div>
          </div>
          <div style="flex:1;min-width:220px">
            <div class="text-muted text-sm">Фактически использовано</div>
            <select class="form-control brew-actual-comp" data-idx="${idx}" data-qty="${escHtml(ing.qty || '0')}">
              ${opts}
            </select>
          </div>
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  if (!rows) {
    showToast('Нет ингредиентов для проводки', 'warning');
    return;
  }

  showModal(isBeer ? 'Провести варку' : 'Провести брагу', `
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:0.9em">
      Выберите какие именно компоненты были использованы.
      Со склада спишутся выбранные позиции по их фактической цене закупки.
    </p>
    <div id="brew-post-rows">${rows}</div>
  `, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Провести', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      try {
        const ts = now();
        const selects = overlay.querySelectorAll('.brew-actual-comp');
        const inventoryRows = [];

        selects.forEach((sel, idx) => {
          const chosenId = sel.value;
          const qty = parseFloat(sel.dataset.qty) || 0;
          if (!chosenId || qty <= 0) return;

          const chosenComp = components.find(c => c.id === chosenId);
          const { price } = getEffectivePrice(chosenId, inventory, components);

          inventoryRows.push({
            id: genId(),
            component_id: chosenId,
            qty_delta: String(-qty),
            movement_type: isBeer ? 'brew_consume' : 'distill_consume',
            ref_type: 'batch',
            ref_id: batch.id,
            unit_cost: price !== null ? String(price) : '0',
            notes: `${batch.name}${chosenComp?.brand ? ` (${chosenComp.brand})` : ''}`,
            created_at: ts,
          });
        });

        if (inventoryRows.length) await appendRows('Inventory', inventoryRows);

        batch.brew_posted = 'TRUE';
        batch.brew_posted_at = ts;
        await updateRow('Batches', batch.id, { ...batch });

        closeModal();
        showToast(t('posted_ok'));
        await renderBatches(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}

function renderSummaryTab(container, batch) {
  const cogs = batch.cogs_snapshot ? JSON.parse(batch.cogs_snapshot) : calcCOGS(batch, inventory, settings);
  const perL = batch.packaged_l && parseFloat(batch.packaged_l) > 0 ? cogs.total / parseFloat(batch.packaged_l) : 0;
  const perLAS = batch.fg && parseFloat(batch.fg) > 0 ? cogs.total / (parseFloat(batch.packaged_l||0) * parseFloat(batch.fg||0) / 100) : 0;

  container.innerHTML = `
    <div class="summary-print">
      <div class="print-header">
        <h2>BOOD — ${batch.type === 'beer' ? 'BREW LOG' : 'DISTILL LOG'}</h2>
        <h3>${escHtml(batch.name)}</h3>
        <p class="text-muted">${formatDate(batch.brew_date)}</p>
      </div>
      <div class="summary-stats">
        <div class="stat"><span class="stat-label">OG</span><span class="stat-value">${batch.og || '—'}</span></div>
        <div class="stat"><span class="stat-label">FG</span><span class="stat-value">${batch.fg || '—'}</span></div>
        <div class="stat"><span class="stat-label">ABV</span><span class="stat-value">${batch.abv || (batch.og&&batch.fg?calcABV(batch.og,batch.fg):'?')}%</span></div>
        <div class="stat"><span class="stat-label">В ферментёр</span><span class="stat-value">${batch.to_fermenter_l||'?'} л</span></div>
        <div class="stat"><span class="stat-label">Упаковано</span><span class="stat-value">${batch.packaged_l||'?'} л</span></div>
        <div class="stat"><span class="stat-label">кВт·ч</span><span class="stat-value">${batch.kwh_used||'?'}</span></div>
      </div>
      <div class="cogs-breakdown">
        <h4>Себестоимость (COGS)</h4>
        <table class="cost-table">
          <tr><td>Материалы</td><td>${formatCurrency(cogs.materials, settings.currency)}</td></tr>
          <tr><td>Упаковка</td><td>${formatCurrency(cogs.packaging, settings.currency)}</td></tr>
          <tr><td>Электроэнергия</td><td>${formatCurrency(cogs.energy, settings.currency)}</td></tr>
          <tr><td>Труд</td><td>${formatCurrency(cogs.labor, settings.currency)}</td></tr>
          <tr class="cost-total"><td><strong>Итого</strong></td><td><strong>${formatCurrency(cogs.total, settings.currency)}</strong></td></tr>
          <tr><td>На литр</td><td>${formatCurrency(perL, settings.currency)}</td></tr>
          ${batch.type === 'distillate' && perLAS ? `<tr><td>На литр АС</td><td>${formatCurrency(perLAS, settings.currency)}</td></tr>` : ''}
        </table>
      </div>
      ${batch.brew_notes ? `<div class="notes-section"><h4>Заметки варки</h4><p>${escHtml(batch.brew_notes)}</p></div>` : ''}
      ${batch.ferment_notes ? `<div class="notes-section"><h4>Заметки брожения</h4><p>${escHtml(batch.ferment_notes)}</p></div>` : ''}
      <div style="margin-top:24px">
        <button class="btn btn-secondary" onclick="window.print()">🖨 ${t('print_batch')}</button>
      </div>
    </div>
  `;
}
