// Bood CRM — Recipes Page (Beer & Spirit)
import { getRows, appendRow, appendRows, updateRow, softDelete, genId, now } from '../sheets.js';
import { getSettings } from '../sheets.js';
import { calcABV, calcCOGS, calcOnHand, formatCurrency, escHtml, generateBeerSteps, generateSpiritSteps, getEffectivePrice } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTabs, pageHeader, formField, textInput, numberInput, selectInput, textareaInput, collectForm, sectionCard } from '../ui.js';
import t from '../i18n.js';

let components = [];
let recipes = [];
let ingredients = [];
let mashRests = [];
let inventory = [];
let settings = {};
let recipeType = 'beer';

export async function renderRecipes(container, type = 'beer') {
  recipeType = type;
  showLoading(container);
  try {
    [components, recipes, ingredients, mashRests, inventory, settings] = await Promise.all([
      getRows('Components'),
      getRows('Recipes'),
      getRows('RecipeIngredients'),
      getRows('RecipeMashRests'),
      getRows('Inventory'),
      getSettings(),
    ]);
    _renderList(container);
  } catch (e) {
    showError(container, e);
  }
}

function _renderList(container) {
  const filtered = recipes.filter(r => r.is_active !== 'FALSE' && r.type === recipeType);
  const title = recipeType === 'beer' ? t('recipes_beer') : t('recipes_spirit');

  container.innerHTML = `
    ${pageHeader(title, `<button class="btn btn-primary" id="btn-new-recipe">+ ${t('new_recipe')}</button>`)}
    <div class="recipe-cards" id="recipe-cards">
      ${filtered.length === 0 ? `<div class="empty-state"><p>${t('no_data')}</p></div>` :
        filtered.map(r => recipeCard(r)).join('')}
    </div>
  `;

  container.querySelector('#btn-new-recipe')?.addEventListener('click', () => {
    showRecipeEditor(null, container);
  });

  container.querySelectorAll('.recipe-card').forEach(card => {
    card.querySelector('.btn-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const recipe = recipes.find(r => r.id === card.dataset.id);
      if (recipe) showRecipeEditor(recipe, container);
    });
    card.querySelector('.btn-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm(t('confirm_delete'), '', async () => {
        try {
          await softDelete('Recipes', card.dataset.id);
          showToast(t('deleted'));
          await renderRecipes(container, recipeType);
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
    card.querySelector('.btn-brew')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const recipe = recipes.find(r => r.id === card.dataset.id);
      if (recipe) await createBatchFromRecipe(recipe);
    });
  });
}

function recipeCard(r) {
  const ibu = r.ibu_estimated || '?';
  const ebc = r.ebc_estimated || '?';
  const abv = r.abv_estimated || (r.og_target && r.fg_target ? calcABV(r.og_target, r.fg_target) : '?');
  const cost = r.estimated_cost ? formatCurrency(r.estimated_cost, settings.currency) : '?';

  return `
    <div class="recipe-card" data-id="${r.id}">
      <div class="recipe-card-header">
        <div>
          <h3 class="recipe-name">${escHtml(r.name)}</h3>
          <span class="recipe-style text-muted">${escHtml(r.style || '')}</span>
        </div>
        <div class="recipe-actions">
          <button class="btn btn-sm btn-primary btn-brew">+ Варка</button>
          <button class="btn btn-sm btn-secondary btn-edit">✎</button>
          <button class="btn btn-sm btn-danger btn-delete">✕</button>
        </div>
      </div>
      <div class="recipe-stats">
        <div class="stat"><span class="stat-label">Объём</span><span class="stat-value">${r.batch_size_l || '?'} л</span></div>
        <div class="stat"><span class="stat-label">OG</span><span class="stat-value">${r.og_target || '?'}</span></div>
        <div class="stat"><span class="stat-label">FG</span><span class="stat-value">${r.fg_target || '?'}</span></div>
        <div class="stat"><span class="stat-label">ABV</span><span class="stat-value">${abv}%</span></div>
        <div class="stat"><span class="stat-label">IBU</span><span class="stat-value">${ibu}</span></div>
        <div class="stat"><span class="stat-label">EBC</span><span class="stat-value">${ebc}</span></div>
        <div class="stat"><span class="stat-label">Себест.</span><span class="stat-value">${cost}</span></div>
      </div>
      ${r.description ? `<p class="recipe-desc text-muted">${escHtml(r.description)}</p>` : ''}
    </div>
  `;
}

// ─── Recipe Editor ────────────────────────────────────────────────────────────
function showRecipeEditor(recipe, pageContainer) {
  const isNew = !recipe;
  let activeTab = 'overview';
  let recipeData = recipe ? { ...recipe } : { type: recipeType, is_active: 'TRUE' };
  let recipeIngredients = recipe ? ingredients.filter(i => i.recipe_id === recipe.id) : [];
  let recipeMashRests = recipe ? mashRests.filter(r => r.recipe_id === recipe.id) : [];
  let isDirty = false;

  const tabs = recipeType === 'beer'
    ? [
        { id: 'overview', label: 'Обзор' },
        { id: 'water', label: 'Вода & Затор' },
        { id: 'boil', label: 'Кипячение & Хмель' },
        { id: 'fermentation', label: 'Брожение' },
        { id: 'packaging', label: 'Упаковка' },
        { id: 'costs', label: 'Шаги & Затраты' },
      ]
    : [
        { id: 'overview', label: 'Обзор' },
        { id: 'braga', label: 'Брага' },
        { id: 'distillation', label: 'Дистилляция' },
        { id: 'aging', label: 'Выдержка' },
        { id: 'costs', label: 'Шаги & Затраты' },
      ];

  const overlay = showModal(
    isNew ? t('new_recipe') : `Рецепт: ${recipe.name}`,
    `<div id="recipe-tabs-nav"></div><div id="recipe-tab-content" class="recipe-editor-content"></div>`,
    [
      { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
      { label: t('save'), class: 'btn-primary', action: 'save', onClick: () => saveRecipe() },
    ],
    { fullscreen: true }
  );

  const tabsNav = overlay.querySelector('#recipe-tabs-nav');
  const tabContent = overlay.querySelector('#recipe-tab-content');

  renderTabs(tabsNav, tabs, activeTab, (tab) => {
    activeTab = tab;
    renderTabContent();
  });
  renderTabContent();

  function renderTabContent() {
    if (recipeType === 'beer') renderBeerTab(tabContent, activeTab, recipeData, recipeIngredients, recipeMashRests);
    else renderSpiritTab(tabContent, activeTab, recipeData, recipeIngredients, recipeMashRests);
    attachTabEvents();
  }

  function attachTabEvents() {
    // Sync form fields back to recipeData on change
    tabContent.querySelectorAll('[name]').forEach(el => {
      el.addEventListener('change', () => {
        recipeData[el.name] = el.value;
        isDirty = true;
        // Auto-calc ABV
        if (['og_target','fg_target'].includes(el.name)) {
          const abv = calcABV(recipeData.og_target, recipeData.fg_target);
          const abvEl = tabContent.querySelector('[name=abv_estimated]');
          if (abvEl) { abvEl.value = abv; recipeData.abv_estimated = abv; }
        }
      });
    });

    // Ingredient add buttons
    tabContent.querySelector('.btn-add-grain')?.addEventListener('click', () => {
      addIngredient('mash', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-boil-hop')?.addEventListener('click', () => {
      addIngredient('boil', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-whirlpool')?.addEventListener('click', () => {
      addIngredient('whirlpool', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-yeast')?.addEventListener('click', () => {
      addIngredient('fermentation', recipeIngredients, renderTabContent, 'yeast');
    });
    tabContent.querySelector('.btn-add-dry-hop')?.addEventListener('click', () => {
      addIngredient('dry_hop', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-additive')?.addEventListener('click', () => {
      addIngredient('fermentation', recipeIngredients, renderTabContent, 'additive');
    });
    tabContent.querySelector('.btn-add-packaging')?.addEventListener('click', () => {
      addIngredient('packaging', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-mash-rest')?.addEventListener('click', () => {
      addMashRest(recipeMashRests, renderTabContent);
    });
    tabContent.querySelector('.btn-add-wash-ingredient')?.addEventListener('click', () => {
      addIngredient('wash', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-still-ingredient')?.addEventListener('click', () => {
      addIngredient('distillation', recipeIngredients, renderTabContent);
    });
    tabContent.querySelector('.btn-add-aging-ingredient')?.addEventListener('click', () => {
      addIngredient('aging', recipeIngredients, renderTabContent);
    });

    // Remove ingredient buttons
    tabContent.querySelectorAll('.btn-remove-ingredient').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const stageKey = btn.dataset.stage;
        // Find and remove
        const stageIngredients = recipeIngredients.filter(i => i.stage_key === stageKey);
        const toRemove = stageIngredients[idx];
        if (toRemove) recipeIngredients = recipeIngredients.filter(i => i !== toRemove);
        renderTabContent();
      });
    });

    // Remove mash rest
    tabContent.querySelectorAll('.btn-remove-rest').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        recipeMashRests.splice(idx, 1);
        renderTabContent();
      });
    });

    // Update component selection + unit label
    tabContent.querySelectorAll('.ingredient-comp').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.idx);
        const stage = sel.dataset.stage;
        const comp = components.find(c => c.id === sel.value);
        const unitLabel = sel.closest('.ingredient-row')?.querySelector('.ingredient-unit');
        if (unitLabel) unitLabel.textContent = comp?.unit || '';
        const stageIngredients = recipeIngredients.filter(i => i.stage_key === stage);
        if (stageIngredients[idx]) stageIngredients[idx].component_id = sel.value;
        isDirty = true;
      });
    });

    // Update ingredient qty/meta inline
    tabContent.querySelectorAll('.ingredient-qty').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const stage = input.dataset.stage;
        const stageIngredients = recipeIngredients.filter(i => i.stage_key === stage);
        if (stageIngredients[idx]) stageIngredients[idx].qty = input.value;
      });
    });
    tabContent.querySelectorAll('.ingredient-time').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const stage = input.dataset.stage;
        const stageIngredients = recipeIngredients.filter(i => i.stage_key === stage);
        if (stageIngredients[idx]) stageIngredients[idx].time_meta = input.value;
      });
    });
    tabContent.querySelectorAll('.mash-rest-field').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        if (recipeMashRests[idx]) recipeMashRests[idx][field] = input.value;
      });
    });
  }

  async function saveRecipe() {
    // Collect all open form fields
    const form = overlay.querySelector('[name]');
    overlay.querySelectorAll('[name]').forEach(el => { recipeData[el.name] = el.value; });

    if (!recipeData.name?.trim()) { showToast('Введите название рецепта', 'warning'); return; }
    try {
      const ts = now();
      const recipeId = isNew ? genId() : recipe.id;
      recipeData.id = recipeId;
      recipeData.type = recipeType;
      if (isNew) { recipeData.created_at = ts; }
      recipeData.updated_at = ts;

      if (isNew) {
        await appendRow('Recipes', recipeData);
      } else {
        await updateRow('Recipes', recipeId, recipeData);
        // Remove old ingredients & mash rests
        const oldIngredients = ingredients.filter(i => i.recipe_id === recipeId);
        const oldRests = mashRests.filter(r => r.recipe_id === recipeId);
        // We'll just append new ones (soft approach: can't delete easily, so overwrite with new batch)
        // For simplicity we'll mark old ones inactive by adding updated set
        // Actually, we re-append all. This is a known limitation of Sheets — no real delete.
        // Better approach: we re-use IDs if they exist
      }

      // Save ingredients
      if (recipeIngredients.length > 0) {
        const newIngredients = recipeIngredients.map((ing, i) => ({
          ...ing,
          id: ing.id || genId(),
          recipe_id: recipeId,
          sort_order: String(i),
          created_at: ing.created_at || ts,
        }));
        if (isNew) {
          await appendRows('RecipeIngredients', newIngredients);
        } else {
          // Update existing or append new
          for (const ing of newIngredients) {
            const existing = ingredients.find(i => i.id === ing.id);
            if (existing) await updateRow('RecipeIngredients', ing.id, ing).catch(() => {});
            else await appendRow('RecipeIngredients', ing);
          }
        }
      }

      // Save mash rests
      if (recipeMashRests.length > 0) {
        const newRests = recipeMashRests.map((rest, i) => ({
          ...rest,
          id: rest.id || genId(),
          recipe_id: recipeId,
          sort_order: String(i),
          created_at: rest.created_at || ts,
        }));
        if (isNew) {
          await appendRows('RecipeMashRests', newRests);
        } else {
          for (const rest of newRests) {
            const existing = mashRests.find(r => r.id === rest.id);
            if (existing) await updateRow('RecipeMashRests', rest.id, rest).catch(() => {});
            else await appendRow('RecipeMashRests', rest);
          }
        }
      }

      closeModal();
      showToast(t('saved'));
      await renderRecipes(pageContainer, recipeType);
    } catch (e) { showToast(e.message, 'error'); }
  }
}

// ─── Beer tab renderers ───────────────────────────────────────────────────────
function renderBeerTab(container, tab, data, ingredients, mashRests) {
  if (tab === 'overview') {
    container.innerHTML = `
      <div class="form-grid">
        ${formField('Название', `<input type="text" name="name" class="form-control" value="${escHtml(data.name||'')}">`, '', true)}
        ${formField('Стиль', `<input type="text" name="style" class="form-control" value="${escHtml(data.style||'')}" placeholder="IPA, Stout, Lager...">`)}
        ${formField('Описание', `<textarea name="description" class="form-control" rows="3">${escHtml(data.description||'')}</textarea>`)}
        <div class="form-row-3">
          ${formField('Объём варки (л)', `<input type="number" name="batch_size_l" class="form-control" value="${escHtml(data.batch_size_l||'')}" step="0.1">`)}
          ${formField('Объём в ферментёр (л)', `<input type="number" name="fermenter_l" class="form-control" value="${escHtml(data.fermenter_l||'')}" step="0.1">`)}
          ${formField('Объём в упаковку (л)', `<input type="number" name="packaged_l" class="form-control" value="${escHtml(data.packaged_l||'')}" step="0.1">`)}
        </div>
        <div class="form-row-4">
          ${formField('OG', `<input type="number" name="og_target" class="form-control" value="${escHtml(data.og_target||'')}" step="0.001" placeholder="1.050">`)}
          ${formField('FG', `<input type="number" name="fg_target" class="form-control" value="${escHtml(data.fg_target||'')}" step="0.001" placeholder="1.010">`)}
          ${formField('ABV %', `<input type="number" name="abv_estimated" class="form-control" value="${escHtml(data.abv_estimated||calcABV(data.og_target, data.fg_target)||'')}" step="0.1">`)}
          ${formField('IBU', `<input type="number" name="ibu_estimated" class="form-control" value="${escHtml(data.ibu_estimated||'')}" step="1">`)}
        </div>
      </div>
    `;
  } else if (tab === 'water') {
    container.innerHTML = `
      <div class="form-grid">
        <div class="form-row-3">
          ${formField('Гидромодуль', `<input type="number" name="hydromodule" class="form-control" value="${escHtml(data.hydromodule||'3')}" step="0.1">`)}
          ${formField('Вода затор (л)', `<input type="number" name="water_mash_l" class="form-control" value="${escHtml(data.water_mash_l||'')}" step="0.1">`)}
          ${formField('Вода промывка (л)', `<input type="number" name="water_sparge_l" class="form-control" value="${escHtml(data.water_sparge_l||'')}" step="0.1">`)}
        </div>
        <h4 style="margin: 16px 0 8px">Паузы затирания</h4>
        <div id="mash-rests-list">${renderMashRests(mashRests)}</div>
        <button type="button" class="btn btn-secondary btn-add-mash-rest">+ Добавить паузу</button>
      </div>
    `;
  } else if (tab === 'boil') {
    const grains = ingredients.filter(i => i.stage_key === 'mash');
    const boilHops = ingredients.filter(i => i.stage_key === 'boil');
    const whirlpool = ingredients.filter(i => i.stage_key === 'whirlpool');
    container.innerHTML = `
      <div class="form-grid">
        ${formField('Время кипячения (мин)', `<input type="number" name="boil_time_min" class="form-control" value="${escHtml(data.boil_time_min||'60')}" step="5">`)}
        <h4>Засыпь (Grain Bill)</h4>
        ${renderIngredientList(grains, 'mash', ['malt','grain_distill','sugar','other'])}
        <button type="button" class="btn btn-secondary btn-add-grain">+ Добавить солод</button>
        <h4>Хмель (кипячение)</h4>
        ${renderIngredientList(boilHops, 'boil', ['hop'])}
        <button type="button" class="btn btn-secondary btn-add-boil-hop">+ Добавить хмель</button>
        <h4>Вирпул</h4>
        ${renderIngredientList(whirlpool, 'whirlpool', ['hop','additive'])}
        <button type="button" class="btn btn-secondary btn-add-whirlpool">+ Добавить в вирпул</button>
      </div>
    `;
  } else if (tab === 'fermentation') {
    const fermentItems = ingredients.filter(i => i.stage_key === 'fermentation');
    const dryHops = ingredients.filter(i => i.stage_key === 'dry_hop');
    container.innerHTML = `
      <div class="form-grid">
        <div class="form-row-2">
          ${formField('Температура (°C)', `<input type="number" name="ferment_temp_c" class="form-control" value="${escHtml(data.ferment_temp_c||'18')}" step="0.5">`)}
          ${formField('Дней брожения', `<input type="number" name="ferment_days" class="form-control" value="${escHtml(data.ferment_days||'14')}" step="1">`)}
        </div>
        <h4>Дрожжи и добавки</h4>
        ${renderIngredientList(fermentItems, 'fermentation', ['yeast','additive','salt'])}
        <button type="button" class="btn btn-secondary btn-add-yeast">+ Дрожжи/Добавка</button>
        <h4>Сухое охмеление</h4>
        ${renderIngredientList(dryHops, 'dry_hop', ['hop'])}
        <button type="button" class="btn btn-secondary btn-add-dry-hop">+ Добавить сухой хмель</button>
      </div>
    `;
  } else if (tab === 'packaging') {
    const packItems = ingredients.filter(i => i.stage_key === 'packaging');
    container.innerHTML = `
      <div class="form-grid">
        <h4>Упаковочные материалы</h4>
        ${renderIngredientList(packItems, 'packaging', ['packaging','additive','other'])}
        <button type="button" class="btn btn-secondary btn-add-packaging">+ Добавить материал</button>
      </div>
    `;
  } else if (tab === 'costs') {
    renderCostsTab(container, data, ingredients, mashRests, 'beer');
  }
}

function renderSpiritTab(container, tab, data, ingredients, mashRests) {
  if (tab === 'overview') {
    container.innerHTML = `
      <div class="form-grid">
        ${formField('Название', `<input type="text" name="name" class="form-control" value="${escHtml(data.name||'')}">`, '', true)}
        ${formField('Тип', selectInput('style', [
          'Виски','Кальвадос','Самогон','Ректификат','Джин','Другое'
        ].map(v=>({value:v,label:v})), data.style||''))}
        ${formField('Описание', `<textarea name="description" class="form-control" rows="3">${escHtml(data.description||'')}</textarea>`)}
        <div class="form-row-3">
          ${formField('Объём браги (л)', `<input type="number" name="batch_size_l" class="form-control" value="${escHtml(data.batch_size_l||'')}" step="1">`)}
          ${formField('Крепость браги %', `<input type="number" name="og_target" class="form-control" value="${escHtml(data.og_target||'')}" step="0.1">`)}
          ${formField('Объём выхода (л)', `<input type="number" name="packaged_l" class="form-control" value="${escHtml(data.packaged_l||'')}" step="0.1">`)}
        </div>
        <div class="form-row-2">
          ${formField('Крепость продукта %', `<input type="number" name="fg_target" class="form-control" value="${escHtml(data.fg_target||'')}" step="0.5">`)}
          ${formField('ABV %', `<input type="number" name="abv_estimated" class="form-control" value="${escHtml(data.abv_estimated||'')}">`, 'Ожидаемая крепость')}
        </div>
      </div>
    `;
  } else if (tab === 'braga') {
    const washItems = ingredients.filter(i => i.stage_key === 'wash' || i.stage_key === 'mash');
    container.innerHTML = `
      <div class="form-grid">
        <h4>Ингредиенты браги</h4>
        ${renderIngredientList(washItems, 'wash', ['grain_distill','sugar','fruit','additive','yeast','salt','other'])}
        <button type="button" class="btn btn-secondary btn-add-wash-ingredient">+ Добавить ингредиент</button>
        <div class="form-row-2">
          ${formField('Температура брожения (°C)', `<input type="number" name="ferment_temp_c" class="form-control" value="${escHtml(data.ferment_temp_c||'28')}" step="0.5">`)}
          ${formField('Дней брожения', `<input type="number" name="ferment_days" class="form-control" value="${escHtml(data.ferment_days||'7')}" step="1">`)}
        </div>
      </div>
    `;
  } else if (tab === 'distillation') {
    const stillItems = ingredients.filter(i => i.stage_key === 'distillation');
    container.innerHTML = `
      <div class="form-grid">
        ${formField('Тип дистилляции', selectInput('hydromodule', [
          {value:'simple',label:'Простая'},{value:'double',label:'Двойная'},
          {value:'triple',label:'Тройная'},{value:'rectification',label:'Ректификация'},
        ], data.hydromodule||'double'))}
        ${formField('Объём куба (л)', `<input type="number" name="water_total_l" class="form-control" value="${escHtml(data.water_total_l||'')}">`) }
        ${formField('Объём куба (л)', `<input type="number" name="water_mash_l" class="form-control" value="${escHtml(data.water_mash_l||'')}">`, 'Размер куба')}
        <h4>Ароматизаторы / Ботаникалы</h4>
        ${renderIngredientList(stillItems, 'distillation', ['additive','fruit','other'])}
        <button type="button" class="btn btn-secondary btn-add-still-ingredient">+ Добавить ботаникал</button>
        <div class="form-row-2">
          ${formField('Отбор голов (% от АС)', `<input type="number" name="water_sparge_l" class="form-control" value="${escHtml(data.water_sparge_l||'5')}" step="0.5">`)}
          ${formField('Время кипячения (мин)→Скорость (л/ч)', `<input type="number" name="boil_time_min" class="form-control" value="${escHtml(data.boil_time_min||'')}">`) }
        </div>
      </div>
    `;
  } else if (tab === 'aging') {
    const agingItems = ingredients.filter(i => i.stage_key === 'aging');
    container.innerHTML = `
      <div class="form-grid">
        <div class="form-row-2">
          ${formField('Время выдержки (мес)', `<input type="number" name="ferment_days" class="form-control" value="${escHtml(data.ferment_days||'0')}">`)}
          ${formField('Тип ёмкости', selectInput('style2', [{value:'oak',label:'Дуб'},{value:'steel',label:'Нержавейка'},{value:'glass',label:'Стекло'}], ''))}
        </div>
        <h4>Добавки для выдержки</h4>
        ${renderIngredientList(agingItems, 'aging', ['additive','other'])}
        <button type="button" class="btn btn-secondary btn-add-aging-ingredient">+ Добавить</button>
      </div>
    `;
  } else if (tab === 'costs') {
    renderCostsTab(container, data, ingredients, mashRests, 'spirit');
  }
}

function renderMashRests(rests) {
  if (!rests.length) return '<p class="text-muted">Нет пауз</p>';
  return rests.map((r, i) => `
    <div class="mash-rest-row">
      <input type="text" class="form-control mash-rest-field" data-idx="${i}" data-field="name" value="${escHtml(r.name||'Осахаривание')}" placeholder="Название">
      <input type="number" class="form-control mash-rest-field" data-idx="${i}" data-field="temp_c" value="${escHtml(r.temp_c||'65')}" placeholder="°C" style="width:80px">
      <input type="number" class="form-control mash-rest-field" data-idx="${i}" data-field="duration_min" value="${escHtml(r.duration_min||'60')}" placeholder="мин" style="width:80px">
      <select class="form-control mash-rest-field" data-idx="${i}" data-field="rest_type" style="width:120px">
        <option value="rest" ${r.rest_type==='rest'?'selected':''}>rest</option>
        <option value="step" ${r.rest_type==='step'?'selected':''}>step</option>
        <option value="decoction" ${r.rest_type==='decoction'?'selected':''}>decoction</option>
      </select>
      <button type="button" class="btn btn-sm btn-danger btn-remove-rest" data-idx="${i}">✕</button>
    </div>
  `).join('');
}

function renderIngredientList(items, stageKey, allowedTypes = []) {
  if (!items.length) return '<p class="text-muted">Нет ингредиентов</p>';
  const filteredComponents = allowedTypes.length
    ? components.filter(c => allowedTypes.includes(c.type) && c.is_active !== 'FALSE')
    : components.filter(c => c.is_active !== 'FALSE');

  return items.map((ing, i) => {
    const comp = components.find(c => c.id === ing.component_id);
    const unit = comp?.unit || '';
    return `
      <div class="ingredient-row">
        <select class="form-control ingredient-comp" data-idx="${i}" data-stage="${stageKey}" style="flex:2">
          ${filteredComponents.map(c => `<option value="${c.id}" ${c.id===ing.component_id?'selected':''}>${escHtml(c.name)}</option>`).join('')}
        </select>
        <input type="number" class="form-control ingredient-qty" data-idx="${i}" data-stage="${stageKey}"
          value="${escHtml(ing.qty||'')}" placeholder="Кол-во" step="any" style="width:90px">
        <span class="ingredient-unit text-muted" style="min-width:28px;font-size:0.85em">${escHtml(unit)}</span>
        ${stageKey === 'boil' || stageKey === 'dry_hop' ? `<input type="number" class="form-control ingredient-time" data-idx="${i}" data-stage="${stageKey}" value="${escHtml(ing.time_meta||'')}" placeholder="${stageKey==='boil'?'мин':'день'}" style="width:80px">` : ''}
        <button type="button" class="btn btn-sm btn-danger btn-remove-ingredient" data-idx="${i}" data-stage="${stageKey}">✕</button>
      </div>
    `;
  }).join('');
}

function renderCostsTab(container, data, ingredients, mashRests, type) {
  const SOURCE_LABEL = { purchase: 'факт. цена', reference: 'справ. цена', none: '⚠ нет цены' };
  const SOURCE_CLASS = { purchase: 'text-success', reference: 'text-muted', none: 'text-danger' };

  // Per-ingredient cost using effective prices
  let ingCosts = 0;
  const missingPrice = [];
  const ingDetails = ingredients.map(ing => {
    const comp = components.find(c => c.id === ing.component_id);
    if (!comp) return null;
    const qty = parseFloat(ing.qty) || 0;
    const { price, source } = getEffectivePrice(ing.component_id, inventory, components);
    const cost = price !== null ? qty * price : null;
    if (cost !== null) ingCosts += cost;
    else missingPrice.push(comp.name);
    return { comp, qty, price, source, cost };
  }).filter(Boolean);

  const onHand = {};
  components.forEach(c => { onHand[c.id] = calcOnHand(inventory, c.id); });

  const deficit = ingredients.filter(ing => {
    const need = parseFloat(ing.qty) || 0;
    const have = onHand[ing.component_id] || 0;
    return need > have;
  });

  const steps = type === 'beer' ? generateBeerSteps(data, ingredients, mashRests) : generateSpiritSteps(data, ingredients);

  const energy = (parseFloat(data.boil_time_min||60) / 60 * 2) * parseFloat(settings.electricity_cost_kwh || 6.5);
  const labor = (parseFloat(data.ferment_days||0) > 0 ? 4 : 0) * parseFloat(settings.labor_rate_hour || 300);
  const water = (parseFloat(data.water_total_l||0) || (parseFloat(data.water_mash_l||0) + parseFloat(data.water_sparge_l||0))) * parseFloat(settings.water_cost_l || 0.05);
  const total = ingCosts + energy + labor + water;
  const perL = data.batch_size_l ? (total / parseFloat(data.batch_size_l)).toFixed(2) : 0;

  container.innerHTML = `
    <div class="costs-grid">

      <div class="section-card">
        <div class="section-card-header"><h4>Стоимость ингредиентов</h4></div>
        <div class="section-card-body p-0">
          <table class="data-table">
            <thead><tr><th>Компонент</th><th>Кол-во</th><th>Цена/ед</th><th>Источник</th><th>Стоимость</th></tr></thead>
            <tbody>
              ${ingDetails.map(({ comp, qty, price, source, cost }) => `
                <tr>
                  <td>${escHtml(comp.name)}</td>
                  <td>${qty} ${escHtml(comp.unit || '')}</td>
                  <td>${price !== null ? formatCurrency(price, settings.currency) : '—'}</td>
                  <td><span class="${SOURCE_CLASS[source]}" style="font-size:0.8em">${SOURCE_LABEL[source]}</span></td>
                  <td>${cost !== null ? formatCurrency(cost, settings.currency) : '<span class="text-danger">?</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${missingPrice.length ? `
        <div class="alert alert-warning">⚠ Нет цены для: <strong>${missingPrice.map(n => escHtml(n)).join(', ')}</strong>. Добавьте закупку на склад или справочную цену в компонент.</div>
      ` : ''}

      ${deficit.length ? `
        <div class="section-card">
          <div class="section-card-header"><h4>Список закупок (дефицит)</h4></div>
          <div class="section-card-body p-0">
            <table class="data-table">
              <thead><tr><th>Компонент</th><th>Нужно</th><th>Есть</th><th>Дефицит</th></tr></thead>
              <tbody>
                ${deficit.map(ing => {
                  const comp = components.find(c => c.id === ing.component_id);
                  const need = parseFloat(ing.qty) || 0;
                  const have = onHand[ing.component_id] || 0;
                  return `<tr>
                    <td>${escHtml(comp?.name || '?')}</td>
                    <td>${need} ${escHtml(comp?.unit || '')}</td>
                    <td class="${have < 0 ? 'text-danger' : ''}">${have} ${escHtml(comp?.unit || '')}</td>
                    <td class="text-danger">${(need - have).toFixed(2)} ${escHtml(comp?.unit || '')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `<div class="alert alert-success">✓ Все ингредиенты в наличии на складе</div>`}

      <div class="section-card">
        <div class="section-card-header"><h4>Автоматические шаги</h4></div>
        <div class="section-card-body">
          <ol class="recipe-steps">${steps.map(s => `<li>${escHtml(s)}</li>`).join('')}</ol>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-header"><h4>Ручные заметки</h4></div>
        <div class="section-card-body">
          <textarea name="manual_notes" class="form-control" rows="6">${escHtml(data.manual_notes||'')}</textarea>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-header"><h4>Предварительная стоимость</h4></div>
        <div class="section-card-body">
          <table class="cost-table">
            <tr><td>Ингредиенты ${missingPrice.length ? '<span class="text-danger" style="font-size:0.8em">(часть без цены)</span>' : ''}</td><td>${formatCurrency(ingCosts, settings.currency)}</td></tr>
            <tr><td>Электроэнергия (расч.)</td><td>${formatCurrency(energy, settings.currency)}</td></tr>
            <tr><td>Вода</td><td>${formatCurrency(water, settings.currency)}</td></tr>
            <tr><td>Труд (расч.)</td><td>${formatCurrency(labor, settings.currency)}</td></tr>
            <tr class="cost-total"><td><strong>Итого</strong></td><td><strong>${formatCurrency(total, settings.currency)}</strong></td></tr>
            ${perL ? `<tr><td>На литр</td><td>${formatCurrency(perL, settings.currency)}</td></tr>` : ''}
          </table>
          <div style="margin-top:16px">
            <button type="button" class="btn btn-secondary" onclick="window.print()">🖨 ${t('print_recipe')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function addIngredient(stageKey, ingredientsArr, refresh) {
  const filtered = components.filter(c => c.is_active !== 'FALSE');
  if (!filtered.length) { showToast('Нет компонентов. Добавьте компоненты сначала.', 'warning'); return; }
  ingredientsArr.push({
    id: genId(),
    component_id: filtered[0].id,
    qty: '',
    stage_key: stageKey,
    time_meta: '',
    sort_order: String(ingredientsArr.length),
    created_at: now(),
  });
  refresh();
}

function addMashRest(restsArr, refresh) {
  restsArr.push({
    id: genId(),
    name: 'Осахаривание',
    temp_c: '65',
    duration_min: '60',
    rest_type: 'rest',
    sort_order: String(restsArr.length),
    created_at: now(),
  });
  refresh();
}

async function createBatchFromRecipe(recipe) {
  const recipeIngs = ingredients.filter(i => i.recipe_id === recipe.id);
  const recipeMRests = mashRests.filter(r => r.recipe_id === recipe.id);
  const snapshot = JSON.stringify({ recipe, ingredients: recipeIngs, mashRests: recipeMRests });
  const ts = now();
  const batchId = genId();
  const batchName = `${recipe.name} — ${new Date().toLocaleDateString('ru-RU')}`;

  try {
    await appendRow('Batches', {
      id: batchId,
      recipe_id: recipe.id,
      recipe_snapshot: snapshot,
      name: batchName,
      type: recipe.type,
      status: 'planned',
      brew_date: ts.slice(0,10),
      is_active: 'TRUE',
      brew_posted: 'FALSE',
      packaging_posted: 'FALSE',
      created_at: ts,
      updated_at: ts,
    });
    showToast(`Партия "${batchName}" создана`);
    window.location.hash = '/batches';
  } catch (e) {
    showToast(e.message, 'error');
  }
}
