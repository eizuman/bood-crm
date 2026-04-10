// Bood CRM — Recipes Page (Beer & Spirit)
import { getRows, appendRow, appendRows, updateRow, softDelete, genId, now } from '../sheets.js';
import { getSettings } from '../sheets.js';
import { BJCP_STYLES, getBjcpGroups, sgToBrix, brixToSg, MASH_PRESETS } from '../bjcp.js';
import { BREWING_SALTS, WATER_PROFILES, getStyleWaterProfile, calcWaterProfile } from '../water.js';
import { calcABV, calcCOGS, calcOnHand, formatCurrency, escHtml, generateBeerSteps, generateSpiritSteps, getEffectivePrice } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTabs, pageHeader, formField, textInput, numberInput, selectInput, textareaInput, collectForm } from '../ui.js';
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
        <div style="display:flex;gap:12px;align-items:center">
          ${r.label_image ? `<img src="${r.label_image}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0">` : ''}
          <div>
            <h3 class="recipe-name">${escHtml(r.name)}</h3>
            <span class="recipe-style text-muted">${escHtml(r.style || '')}</span>
          </div>
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

  const spiritTabs = [
    { id: 'overview', label: 'Обзор' },
    { id: 'braga', label: 'Брага' },
    { id: 'distillation', label: 'Дистилляция' },
    { id: 'aging', label: 'Выдержка' },
  ];

  let currentView = 'editor'; // 'editor' | 'costs'

  const overlay = showModal(
    isNew ? t('new_recipe') : `Рецепт: ${recipe.name}`,
    `<div class="recipe-view-nav" id="recipe-view-nav">
      <button class="btn btn-sm btn-primary" id="view-editor">Рецепт</button>
      <button class="btn btn-sm btn-secondary" id="view-costs">Затраты & Шаги</button>
    </div>
    <div id="recipe-content" class="recipe-editor-content"></div>`,
    [
      { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
      { label: t('save'), class: 'btn-primary', action: 'save', onClick: () => saveRecipe() },
    ],
    { fullscreen: true }
  );

  // tabContent alias — spirit and shared handlers reference this
  const tabContent = overlay.querySelector('#recipe-content');

  overlay.querySelector('#view-editor')?.addEventListener('click', () => {
    currentView = 'editor';
    overlay.querySelector('#view-editor').className = 'btn btn-sm btn-primary';
    overlay.querySelector('#view-costs').className = 'btn btn-sm btn-secondary';
    renderView();
  });
  overlay.querySelector('#view-costs')?.addEventListener('click', () => {
    overlay.querySelectorAll('[name]').forEach(el => { recipeData[el.name] = el.value; });
    currentView = 'costs';
    overlay.querySelector('#view-editor').className = 'btn btn-sm btn-secondary';
    overlay.querySelector('#view-costs').className = 'btn btn-sm btn-primary';
    renderView();
  });

  renderView();

  function renderView() {
    if (recipeType === 'beer') {
      if (currentView === 'editor') {
        renderBeerGrid(tabContent, recipeData, recipeIngredients, recipeMashRests);
      } else {
        renderCostsTab(tabContent, recipeData, recipeIngredients, recipeMashRests, 'beer');
      }
    } else {
      // Spirit: tab nav lives inside content area
      tabContent.innerHTML = `<div id="spirit-tab-nav"></div><div id="spirit-tab-body"></div>`;
      renderTabs(tabContent.querySelector('#spirit-tab-nav'), spiritTabs, activeTab, (tab) => {
        activeTab = tab;
        renderSpiritTab(tabContent.querySelector('#spirit-tab-body'), activeTab, recipeData, recipeIngredients, recipeMashRests);
        attachTabEvents();
      });
      renderSpiritTab(tabContent.querySelector('#spirit-tab-body'), activeTab, recipeData, recipeIngredients, recipeMashRests);
    }
    attachTabEvents();
  }

  function attachTabEvents() {
    // Sync form fields back to recipeData on change
    tabContent.querySelectorAll('[name]').forEach(el => {
      el.addEventListener('change', () => {
        // OG/FG: convert Brix → SG when in Brix mode
        if (el.name === 'og_target' && el.dataset.unit === 'brix' && el.value) {
          recipeData.og_target = String(brixToSg(parseFloat(el.value)));
        } else if (el.name === 'fg_target' && el.dataset.unit === 'brix' && el.value) {
          recipeData.fg_target = String(brixToSg(parseFloat(el.value)));
        } else {
          recipeData[el.name] = el.value;
        }
        isDirty = true;
        // Auto-calc ABV (always from stored SG values)
        if (['og_target','fg_target'].includes(el.name)) {
          const abv = calcABV(recipeData.og_target, recipeData.fg_target);
          const abvEl = tabContent.querySelector('[name=abv_estimated]');
          if (abvEl) { abvEl.value = abv; recipeData.abv_estimated = abv; }
        }
      });
    });

    // Ingredient add buttons
    tabContent.querySelector('.btn-add-grain')?.addEventListener('click', () => {
      addIngredient('mash', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-boil-hop')?.addEventListener('click', () => {
      addIngredient('boil', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-whirlpool')?.addEventListener('click', () => {
      addIngredient('whirlpool', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-yeast')?.addEventListener('click', () => {
      addIngredient('fermentation', recipeIngredients, renderView, 'yeast');
    });
    tabContent.querySelector('.btn-add-dry-hop')?.addEventListener('click', () => {
      addIngredient('dry_hop', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-additive')?.addEventListener('click', () => {
      addIngredient('fermentation', recipeIngredients, renderView, 'additive');
    });
    tabContent.querySelector('.btn-add-packaging')?.addEventListener('click', () => {
      addIngredient('packaging', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-mash-rest')?.addEventListener('click', () => {
      addMashRest(recipeMashRests, renderView);
    });
    tabContent.querySelector('.btn-add-wash-ingredient')?.addEventListener('click', () => {
      addIngredient('wash', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-still-ingredient')?.addEventListener('click', () => {
      addIngredient('distillation', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-aging-ingredient')?.addEventListener('click', () => {
      addIngredient('aging', recipeIngredients, renderView);
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
        renderView();
      });
    });

    // Remove mash rest
    tabContent.querySelectorAll('.btn-remove-rest').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        recipeMashRests.splice(idx, 1);
        renderView();
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

    // ── Volume auto-calculation (anchor = fermenter_l) ───────────────────────
    function recalcVolumes() {
      const fl  = parseFloat(tabContent.querySelector('#vol-fermenter')?.value) || 0;
      const bl  = parseFloat(tabContent.querySelector('#vol-brew-loss')?.value || settings.brew_loss_pct || 10);
      const fml = parseFloat(tabContent.querySelector('#vol-ferm-loss')?.value || settings.fermenter_loss_pct || 5);
      if (!fl) return;
      const batch    = bl < 100 ? (fl / (1 - bl / 100)).toFixed(1) : '';
      const packaged = (fl * (1 - fml / 100)).toFixed(1);
      const batchEl   = tabContent.querySelector('#vol-batch');
      const packedEl  = tabContent.querySelector('#vol-packaged');
      if (batchEl)  { batchEl.value  = batch;    recipeData.batch_size_l = batch; }
      if (packedEl) { packedEl.value = packaged;  recipeData.packaged_l   = packaged; }
    }
    ['#vol-fermenter','#vol-brew-loss','#vol-ferm-loss'].forEach(sel => {
      tabContent.querySelector(sel)?.addEventListener('input', recalcVolumes);
    });

    // ── BJCP style selector → auto-fill target ranges ──────────────────────────
    tabContent.querySelector('#bjcp-style-select')?.addEventListener('change', (e) => {
      const styleName = e.target.value;
      recipeData.style = styleName;
      isDirty = true;
      if (styleName) {
        const bjcpStyle = BJCP_STYLES.find(s => s.name === styleName);
        if (bjcpStyle) {
          if (bjcpStyle.og) {
            const mid = (((bjcpStyle.og[0] + bjcpStyle.og[1]) / 2) * 10000 | 0) / 10000;
            recipeData.og_target = String(mid);
          }
          if (bjcpStyle.fg) {
            const mid = (((bjcpStyle.fg[0] + bjcpStyle.fg[1]) / 2) * 10000 | 0) / 10000;
            recipeData.fg_target = String(mid);
          }
          if (bjcpStyle.ibu) {
            recipeData.ibu_estimated = String(Math.round((bjcpStyle.ibu[0] + bjcpStyle.ibu[1]) / 2));
          }
          if (bjcpStyle.ebc) {
            recipeData.ebc_estimated = String(Math.round((bjcpStyle.ebc[0] + bjcpStyle.ebc[1]) / 2));
          }
          const abv = calcABV(recipeData.og_target, recipeData.fg_target);
          recipeData.abv_estimated = abv;
        }
      }
      renderView();
    });

    // ── OG / FG unit toggles ──────────────────────────────────────────────────
    tabContent.querySelector('.btn-og-sg')?.addEventListener('click', () => {
      if ((recipeData._og_unit || 'sg') === 'brix') {
        const v = tabContent.querySelector('[name=og_target]')?.value;
        if (v) recipeData.og_target = String(brixToSg(parseFloat(v)));
      }
      recipeData._og_unit = 'sg';
      renderView();
    });
    tabContent.querySelector('.btn-og-brix')?.addEventListener('click', () => {
      recipeData._og_unit = 'brix';
      renderView();
    });
    tabContent.querySelector('.btn-fg-sg')?.addEventListener('click', () => {
      if ((recipeData._fg_unit || 'sg') === 'brix') {
        const v = tabContent.querySelector('[name=fg_target]')?.value;
        if (v) recipeData.fg_target = String(brixToSg(parseFloat(v)));
      }
      recipeData._fg_unit = 'sg';
      renderView();
    });
    tabContent.querySelector('.btn-fg-brix')?.addEventListener('click', () => {
      recipeData._fg_unit = 'brix';
      renderView();
    });

    // ── Label image upload ────────────────────────────────────────────────────
    tabContent.querySelector('.btn-upload-label')?.addEventListener('click', () => {
      tabContent.querySelector('#label-upload')?.click();
    });
    tabContent.querySelector('#label-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const b64 = await resizeImageToBase64(file, 300, 300);
        recipeData.label_image = b64;
        renderView();
      } catch { showToast('Ошибка загрузки изображения', 'error'); }
    });
    tabContent.querySelector('.btn-clear-label')?.addEventListener('click', () => {
      recipeData.label_image = '';
      renderView();
    });

    // ── Mash preset buttons ───────────────────────────────────────────────────
    tabContent.querySelectorAll('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset;
        if (recipeMashRests.length > 0) {
          showConfirm('Заменить текущие паузы шаблоном?', '', () => {
            loadMashPreset(key, recipeMashRests);
            renderView();
          });
        } else {
          loadMashPreset(key, recipeMashRests);
          renderView();
        }
      });
    });

    // ── Water chemistry ───────────────────────────────────────────────────────
    function getWaterAdditions() {
      try { return JSON.parse(recipeData.water_additions || '[]'); } catch { return []; }
    }
    function saveWaterAdditions(arr) {
      recipeData.water_additions = JSON.stringify(arr);
      isDirty = true;
    }

    // Profile selector → pre-fill salt amounts scaled to mash volume
    tabContent.querySelector('#water-profile-select')?.addEventListener('change', (e) => {
      const key = e.target.value;
      recipeData.water_profile = key;
      isDirty = true;
      if (key && WATER_PROFILES[key]) {
        const profile = WATER_PROFILES[key];
        if (profile.ph_target) {
          recipeData.ph_target = profile.ph_target;
          const phEl = tabContent.querySelector('[name=ph_target]');
          if (phEl) phEl.value = profile.ph_target;
        }
        // Build salt additions scaled to mash volume (additions_per_10l × vol/10)
        const vol = parseFloat(tabContent.querySelector('[name=water_mash_l]')?.value || recipeData.water_mash_l || 10);
        const scale = vol / 10;
        const additions = Object.entries(profile.additions_per_10l || {})
          .filter(([, v]) => v > 0)
          .map(([saltId, per10l]) => ({
            salt: saltId,
            amount: Math.round(per10l * scale * 10) / 10,
          }));
        saveWaterAdditions(additions);
      }
      renderView();
    });

    // Add salt row
    tabContent.querySelector('.btn-add-salt')?.addEventListener('click', () => {
      const additions = getWaterAdditions();
      additions.push({ salt: BREWING_SALTS[0].id, amount: 1 });
      saveWaterAdditions(additions);
      renderView();
    });

    // Remove salt row
    tabContent.querySelectorAll('.btn-remove-salt').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const additions = getWaterAdditions();
        additions.splice(idx, 1);
        saveWaterAdditions(additions);
        renderView();
      });
    });

    // Salt type change
    tabContent.querySelectorAll('.water-salt-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.idx);
        const additions = getWaterAdditions();
        if (additions[idx]) { additions[idx].salt = sel.value; saveWaterAdditions(additions); }
      });
    });

    // Salt amount change — also update ion display live
    tabContent.querySelectorAll('.water-salt-amount').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.idx);
        const additions = getWaterAdditions();
        if (additions[idx]) {
          additions[idx].amount = parseFloat(input.value) || 0;
          saveWaterAdditions(additions);
          // Refresh ion display only (no full re-render)
          const vol = parseFloat(tabContent.querySelector('[name=water_mash_l]')?.value || recipeData.water_mash_l || 10);
          const ions = calcWaterProfile(additions, vol);
          const labels = ['ca','mg','na','so4','cl','hco3'];
          tabContent.querySelectorAll('.water-ion .ion-val').forEach((el, i) => {
            const v = ions[labels[i]] || 0;
            el.textContent = v > 0 ? Math.round(v) : '0';
          });
        }
      });
    });
  }

  async function saveRecipe() {
    // Collect all open form fields (with Brix→SG conversion for OG/FG)
    // water_additions is managed separately via recipeData directly — don't overwrite
    overlay.querySelectorAll('[name]').forEach(el => {
      if (el.name === 'water_additions') return; // managed via recipeData
      if (el.name === 'og_target' && el.dataset.unit === 'brix' && el.value) {
        recipeData.og_target = String(brixToSg(parseFloat(el.value)));
      } else if (el.name === 'fg_target' && el.dataset.unit === 'brix' && el.value) {
        recipeData.fg_target = String(brixToSg(parseFloat(el.value)));
      } else {
        recipeData[el.name] = el.value;
      }
    });

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

// ─── Beer Grid Layout (desktop: 3 columns) ───────────────────────────────────
function renderBeerGrid(container, data, ingredients, mashRests) {
  const ogUnit = data._og_unit || 'sg';
  const fgUnit = data._fg_unit || 'sg';
  const ogSgVal = data.og_target || '';
  const fgSgVal = data.fg_target || '';
  const ogDisplayVal = ogUnit === 'sg' ? ogSgVal : (ogSgVal ? String(sgToBrix(parseFloat(ogSgVal))) : '');
  const fgDisplayVal = fgUnit === 'sg' ? fgSgVal : (fgSgVal ? String(sgToBrix(parseFloat(fgSgVal))) : '');
  const ogAlt = ogUnit === 'sg' && ogSgVal ? `≈ ${sgToBrix(parseFloat(ogSgVal))} °Bx` : ogUnit === 'brix' && ogSgVal ? `≈ SG ${parseFloat(ogSgVal).toFixed(3)}` : '';
  const fgAlt = fgUnit === 'sg' && fgSgVal ? `≈ ${sgToBrix(parseFloat(fgSgVal))} °Bx` : fgUnit === 'brix' && fgSgVal ? `≈ SG ${parseFloat(fgSgVal).toFixed(3)}` : '';
  const selectedStyle = data.style ? BJCP_STYLES.find(s => s.name === data.style) : null;
  const bjcpOptions = Object.entries(getBjcpGroups()).map(([cat, styles]) => `
    <optgroup label="${escHtml(cat)}">
      ${styles.map(s => `<option value="${escHtml(s.name)}" data-code="${s.code}" ${data.style === s.name ? 'selected' : ''}>${s.code} — ${escHtml(s.name)}</option>`).join('')}
    </optgroup>
  `).join('');
  const togBtn = (cls, label, active) =>
    `<button type="button" class="btn ${cls}" style="padding:1px 8px;font-size:0.78em;border-radius:${cls.includes('sg')?'4px 0 0 4px':'0 4px 4px 0'};background:${active?'var(--accent)':'var(--bg-secondary)'};color:${active?'#fff':'var(--text-muted)'};border:1px solid var(--border);${cls.includes('brix')?'border-left:none;':''}cursor:pointer">${label}</button>`;

  // Water chemistry
  let waterAdditions = [];
  try { waterAdditions = JSON.parse(data.water_additions || '[]'); } catch {}
  const waterVol = parseFloat(data.water_mash_l) || 10;
  const waterIons = calcWaterProfile(waterAdditions, waterVol);
  const recommendedProfile = getStyleWaterProfile(data.style);
  const currentProfile = data.water_profile || '';

  function ionPpm(v) { return v > 0 ? Math.round(v) : '0'; }

  const grains = ingredients.filter(i => i.stage_key === 'mash');
  const boilHops = ingredients.filter(i => i.stage_key === 'boil');
  const whirlpool = ingredients.filter(i => i.stage_key === 'whirlpool');
  const fermentItems = ingredients.filter(i => i.stage_key === 'fermentation');
  const dryHops = ingredients.filter(i => i.stage_key === 'dry_hop');
  const packItems = ingredients.filter(i => i.stage_key === 'packaging');

  container.innerHTML = `<div class="recipe-editor-grid">

  <!-- ── Column 1: Overview + Water ─────────────────────────────────────── -->
  <div class="recipe-editor-col">

    <div class="section-card">
      <div class="section-card-header"><h4>📋 Обзор</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          ${formField('Название', `<input type="text" name="name" class="form-control" value="${escHtml(data.name||'')}">`, '', true)}
          <div class="form-group">
            <label class="form-label">Стиль BJCP</label>
            <select name="style" class="form-control" id="bjcp-style-select">
              <option value="">— не выбран —</option>
              ${bjcpOptions}
            </select>
          </div>
          ${selectedStyle ? `
            <div style="display:flex;gap:10px;flex-wrap:wrap;padding:6px 10px;background:var(--bg-secondary);border-radius:6px;font-size:0.82em;border-left:3px solid var(--accent)">
              <span class="text-muted">${escHtml(selectedStyle.code)}:</span>
              ${selectedStyle.og  ? `<span>OG <b>${selectedStyle.og[0]}–${selectedStyle.og[1]}</b></span>` : ''}
              ${selectedStyle.fg  ? `<span>FG <b>${selectedStyle.fg[0]}–${selectedStyle.fg[1]}</b></span>` : ''}
              ${selectedStyle.ibu ? `<span>IBU <b>${selectedStyle.ibu[0]}–${selectedStyle.ibu[1]}</b></span>` : ''}
              ${selectedStyle.ebc ? `<span>EBC <b>${selectedStyle.ebc[0]}–${selectedStyle.ebc[1]}</b></span>` : ''}
              ${selectedStyle.abv ? `<span>ABV <b>${selectedStyle.abv[0]}–${selectedStyle.abv[1]}%</b></span>` : ''}
            </div>
          ` : ''}
          <div class="form-row-3">
            <div class="form-group">
              <label class="form-label">В ферментёр (л) <span style="color:var(--accent);font-size:0.78em">●</span></label>
              <input type="number" name="fermenter_l" class="form-control" id="vol-fermenter" value="${escHtml(data.fermenter_l||'')}" step="0.1" placeholder="20">
            </div>
            <div class="form-group">
              <label class="form-label">Потери варки %</label>
              <input type="number" name="brew_loss_pct" class="form-control" id="vol-brew-loss" value="${escHtml(data.brew_loss_pct||'')}" step="0.5" placeholder="${escHtml(settings.brew_loss_pct||'10')}">
            </div>
            <div class="form-group">
              <label class="form-label">Потери ферм. %</label>
              <input type="number" name="fermenter_loss_pct" class="form-control" id="vol-ferm-loss" value="${escHtml(data.fermenter_loss_pct||'')}" step="0.5" placeholder="${escHtml(settings.fermenter_loss_pct||'5')}">
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label" style="color:var(--text-muted)">Объём варки (л) <span style="font-size:0.78em">авто</span></label>
              <input type="number" name="batch_size_l" class="form-control" id="vol-batch" value="${escHtml(data.batch_size_l||'')}" step="0.1" style="background:var(--bg-secondary)">
            </div>
            <div class="form-group">
              <label class="form-label" style="color:var(--text-muted)">Упаковка (л) <span style="font-size:0.78em">авто</span></label>
              <input type="number" name="packaged_l" class="form-control" id="vol-packaged" value="${escHtml(data.packaged_l||'')}" step="0.1" style="background:var(--bg-secondary)">
            </div>
          </div>
          <div class="form-row-4">
            <div class="form-group">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <label class="form-label" style="margin:0">OG</label>
                <div>${togBtn('btn-og-sg','SG',ogUnit==='sg')}${togBtn('btn-og-brix','°Bx',ogUnit==='brix')}</div>
              </div>
              <input type="number" name="og_target" class="form-control" value="${escHtml(String(ogDisplayVal))}" step="${ogUnit==='sg'?'0.001':'0.1'}" placeholder="${ogUnit==='sg'?'1.050':'12.4'}" data-unit="${ogUnit}">
              ${ogAlt ? `<div style="font-size:0.75em;color:var(--text-muted);margin-top:2px">${ogAlt}</div>` : ''}
            </div>
            <div class="form-group">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <label class="form-label" style="margin:0">FG</label>
                <div>${togBtn('btn-fg-sg','SG',fgUnit==='sg')}${togBtn('btn-fg-brix','°Bx',fgUnit==='brix')}</div>
              </div>
              <input type="number" name="fg_target" class="form-control" value="${escHtml(String(fgDisplayVal))}" step="${fgUnit==='sg'?'0.001':'0.1'}" placeholder="${fgUnit==='sg'?'1.010':'2.6'}" data-unit="${fgUnit}">
              ${fgAlt ? `<div style="font-size:0.75em;color:var(--text-muted);margin-top:2px">${fgAlt}</div>` : ''}
            </div>
            ${formField('ABV %', `<input type="number" name="abv_estimated" class="form-control" value="${escHtml(data.abv_estimated||calcABV(data.og_target, data.fg_target)||'')}" step="0.1">`)}
            ${formField('IBU', `<input type="number" name="ibu_estimated" class="form-control" value="${escHtml(data.ibu_estimated||'')}" step="1">`)}
          </div>
          ${formField('Описание', `<textarea name="description" class="form-control" rows="2">${escHtml(data.description||'')}</textarea>`)}
          <div class="form-group">
            <label class="form-label">Этикетка</label>
            <div style="display:flex;gap:10px;align-items:center">
              ${data.label_image
                ? `<img src="${data.label_image}" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
                : `<div style="width:52px;height:52px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1.2em">📷</div>`}
              <div style="display:flex;gap:6px">
                <input type="file" id="label-upload" accept="image/jpeg,image/png,image/webp" style="display:none">
                <input type="hidden" name="label_image" value="${escHtml(data.label_image||'')}">
                <button type="button" class="btn btn-secondary btn-upload-label" style="font-size:12px">Загрузить</button>
                ${data.label_image ? `<button type="button" class="btn btn-danger btn-clear-label" style="font-size:12px">✕</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Water Chemistry -->
    <div class="section-card">
      <div class="section-card-header"><h4>💧 Химия воды</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Профиль воды
                ${recommendedProfile && recommendedProfile !== currentProfile ? `<span class="text-muted" style="font-size:0.78em;margin-left:4px">рекоменд: ${WATER_PROFILES[recommendedProfile]?.name}</span>` : ''}
              </label>
              <select name="water_profile" class="form-control" id="water-profile-select">
                <option value="">— не выбран —</option>
                ${Object.entries(WATER_PROFILES).map(([k,p]) =>
                  `<option value="${k}" ${currentProfile===k?'selected':''}>${escHtml(p.name)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">pH затора (цель)</label>
              <input type="number" name="ph_target" class="form-control" value="${escHtml(data.ph_target||'')}" step="0.05" placeholder="5.4" min="4.5" max="6.5">
            </div>
          </div>

          <div style="margin-top:4px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <label class="form-label" style="margin:0">Добавки солей (в затор)</label>
              <button type="button" class="btn btn-sm btn-secondary btn-add-salt">+ Соль</button>
            </div>
            <div id="water-salts-list">
              ${waterAdditions.length === 0 ? '<p class="text-muted" style="font-size:13px">Нет добавок</p>' :
                waterAdditions.map((add, i) => {
                  const salt = BREWING_SALTS.find(s => s.id === add.salt);
                  return `<div class="water-salt-row">
                    <select class="form-control water-salt-select" data-idx="${i}">
                      ${BREWING_SALTS.map(s => `<option value="${s.id}" ${s.id===add.salt?'selected':''}>${s.formula} — ${escHtml(s.name)}</option>`).join('')}
                    </select>
                    <input type="number" class="form-control water-salt-amount" data-idx="${i}" value="${escHtml(String(add.amount||''))}" step="0.1" placeholder="г" min="0">
                    <span class="text-muted" style="font-size:11px;white-space:nowrap">г</span>
                    <button type="button" class="btn btn-sm btn-danger btn-remove-salt" data-idx="${i}">✕</button>
                  </div>`;
                }).join('')}
            </div>
          </div>

          <div class="water-ions">
            <div class="water-ion"><span class="ion-label">Ca²⁺</span><span class="ion-val">${ionPpm(waterIons.ca)}</span></div>
            <div class="water-ion"><span class="ion-label">Mg²⁺</span><span class="ion-val">${ionPpm(waterIons.mg)}</span></div>
            <div class="water-ion"><span class="ion-label">Na⁺</span><span class="ion-val">${ionPpm(waterIons.na)}</span></div>
            <div class="water-ion"><span class="ion-label">SO₄²⁻</span><span class="ion-val">${ionPpm(waterIons.so4)}</span></div>
            <div class="water-ion"><span class="ion-label">Cl⁻</span><span class="ion-val">${ionPpm(waterIons.cl)}</span></div>
            <div class="water-ion"><span class="ion-label">HCO₃⁻</span><span class="ion-val">${ionPpm(waterIons.hco3)}</span></div>
          </div>
          <div class="text-muted" style="font-size:0.75em;text-align:center">ppm · на основе ${waterVol} л затора</div>
        </div>
      </div>
    </div>

  </div><!-- /col 1 -->

  <!-- ── Column 2: Grain Bill + Mash ────────────────────────────────────── -->
  <div class="recipe-editor-col">

    <div class="section-card">
      <div class="section-card-header"><h4>🌾 Засыпь</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          ${formField('Время кипячения (мин)', `<input type="number" name="boil_time_min" class="form-control" value="${escHtml(data.boil_time_min||'60')}" step="5">`)}
          ${renderIngredientList(grains, 'mash', ['malt','grain_distill','sugar','other'])}
          <button type="button" class="btn btn-secondary btn-add-grain">+ Добавить солод</button>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header"><h4>🌡 Затирание</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          <div class="form-row-3">
            ${formField('Гидромодуль', `<input type="number" name="hydromodule" class="form-control" value="${escHtml(data.hydromodule||'3')}" step="0.1">`)}
            ${formField('Вода затор (л)', `<input type="number" name="water_mash_l" class="form-control" value="${escHtml(data.water_mash_l||'')}" step="0.1">`)}
            ${formField('Вода промывка (л)', `<input type="number" name="water_sparge_l" class="form-control" value="${escHtml(data.water_sparge_l||'')}" step="0.1">`)}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
            <span class="text-muted text-sm">Шаблон:</span>
            ${Object.entries(MASH_PRESETS).map(([k,p]) =>
              `<button type="button" class="btn btn-sm btn-secondary btn-preset" data-preset="${k}" style="font-size:11px">${escHtml(p.label)}</button>`
            ).join('')}
          </div>
          <div id="mash-rests-list">${renderMashRests(mashRests)}</div>
          <button type="button" class="btn btn-secondary btn-add-mash-rest">+ Добавить паузу</button>
        </div>
      </div>
    </div>

  </div><!-- /col 2 -->

  <!-- ── Column 3: Boil + Fermentation + Packaging ──────────────────────── -->
  <div class="recipe-editor-col">

    <div class="section-card">
      <div class="section-card-header"><h4>🔥 Кипячение & Хмель</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Хмель (кипячение)</div>
          ${renderIngredientList(boilHops, 'boil', ['hop'])}
          <button type="button" class="btn btn-secondary btn-add-boil-hop">+ Добавить хмель</button>
          <div style="font-size:12px;color:var(--text-muted);margin:8px 0 4px">Вирпул</div>
          ${renderIngredientList(whirlpool, 'whirlpool', ['hop','additive'])}
          <button type="button" class="btn btn-secondary btn-add-whirlpool">+ Добавить в вирпул</button>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header"><h4>🧬 Брожение</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          <div class="form-row-2">
            ${formField('Температура (°C)', `<input type="number" name="ferment_temp_c" class="form-control" value="${escHtml(data.ferment_temp_c||'18')}" step="0.5">`)}
            ${formField('Дней брожения', `<input type="number" name="ferment_days" class="form-control" value="${escHtml(data.ferment_days||'14')}" step="1">`)}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Дрожжи и добавки</div>
          ${renderIngredientList(fermentItems, 'fermentation', ['yeast','additive','salt'])}
          <button type="button" class="btn btn-secondary btn-add-yeast">+ Дрожжи/Добавка</button>
          <div style="font-size:12px;color:var(--text-muted);margin:8px 0 4px">Сухое охмеление</div>
          ${renderIngredientList(dryHops, 'dry_hop', ['hop'])}
          <button type="button" class="btn btn-secondary btn-add-dry-hop">+ Сухой хмель</button>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header"><h4>📦 Упаковка</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          ${formField('Заметки', `<textarea name="manual_notes" class="form-control" rows="2">${escHtml(data.manual_notes||'')}</textarea>`)}
          ${renderIngredientList(packItems, 'packaging', ['packaging','additive','other'])}
          <button type="button" class="btn btn-secondary btn-add-packaging">+ Добавить материал</button>
        </div>
      </div>
    </div>

  </div><!-- /col 3 -->

  </div>`; // end .recipe-editor-grid
}

// ─── (legacy stub kept for spirit tab) ───────────────────────────────────────
function renderBeerTab(container, tab, data, ingredients, mashRests) {
  if (tab === 'overview') {
    const ogUnit = data._og_unit || 'sg';
    const fgUnit = data._fg_unit || 'sg';
    const ogSgVal = data.og_target || '';
    const fgSgVal = data.fg_target || '';
    const ogDisplayVal = ogUnit === 'sg' ? ogSgVal : (ogSgVal ? String(sgToBrix(parseFloat(ogSgVal))) : '');
    const fgDisplayVal = fgUnit === 'sg' ? fgSgVal : (fgSgVal ? String(sgToBrix(parseFloat(fgSgVal))) : '');
    const ogAlt = ogUnit === 'sg' && ogSgVal ? `≈ ${sgToBrix(parseFloat(ogSgVal))} °Bx` : ogUnit === 'brix' && ogSgVal ? `≈ SG ${parseFloat(ogSgVal).toFixed(3)}` : '';
    const fgAlt = fgUnit === 'sg' && fgSgVal ? `≈ ${sgToBrix(parseFloat(fgSgVal))} °Bx` : fgUnit === 'brix' && fgSgVal ? `≈ SG ${parseFloat(fgSgVal).toFixed(3)}` : '';
    const selectedStyle = data.style ? BJCP_STYLES.find(s => s.name === data.style) : null;
    const bjcpOptions = Object.entries(getBjcpGroups()).map(([cat, styles]) => `
      <optgroup label="${escHtml(cat)}">
        ${styles.map(s => `<option value="${escHtml(s.name)}" data-code="${s.code}" ${data.style === s.name ? 'selected' : ''}>${s.code} — ${escHtml(s.name)}</option>`).join('')}
      </optgroup>
    `).join('');
    const togBtn = (cls, label, active) =>
      `<button type="button" class="btn ${cls}" style="padding:1px 8px;font-size:0.78em;border-radius:${cls.includes('sg')?'4px 0 0 4px':'0 4px 4px 0'};background:${active?'var(--accent)':'var(--bg-secondary)'};color:${active?'#fff':'var(--text-muted)'};border:1px solid var(--border);${cls.includes('brix')?'border-left:none;':''}cursor:pointer">${label}</button>`;

    container.innerHTML = `
      <div class="form-grid">
        ${formField('Название', `<input type="text" name="name" class="form-control" value="${escHtml(data.name||'')}">`, '', true)}

        <div class="form-row-2" style="align-items:start">
          <div class="form-group">
            <label class="form-label">Стиль BJCP</label>
            <select name="style" class="form-control" id="bjcp-style-select">
              <option value="">— не выбран —</option>
              ${bjcpOptions}
            </select>
          </div>
          ${formField('Описание', `<textarea name="description" class="form-control" rows="3">${escHtml(data.description||'')}</textarea>`)}
        </div>

        ${selectedStyle ? `
          <div style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85em;border-left:3px solid var(--accent)">
            <span class="text-muted" style="line-height:1.8">BJCP ${escHtml(selectedStyle.code)}:</span>
            ${selectedStyle.og  ? `<span>OG <strong>${selectedStyle.og[0]}–${selectedStyle.og[1]}</strong></span>` : ''}
            ${selectedStyle.fg  ? `<span>FG <strong>${selectedStyle.fg[0]}–${selectedStyle.fg[1]}</strong></span>` : ''}
            ${selectedStyle.ibu ? `<span>IBU <strong>${selectedStyle.ibu[0]}–${selectedStyle.ibu[1]}</strong></span>` : ''}
            ${selectedStyle.ebc ? `<span>EBC <strong>${selectedStyle.ebc[0]}–${selectedStyle.ebc[1]}</strong></span>` : ''}
            ${selectedStyle.abv ? `<span>ABV <strong>${selectedStyle.abv[0]}–${selectedStyle.abv[1]}%</strong></span>` : ''}
          </div>
        ` : ''}

        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">Объём в ферментёр (л) <span style="color:var(--accent);font-size:0.8em">● якорь</span></label>
            <input type="number" name="fermenter_l" class="form-control" id="vol-fermenter"
              value="${escHtml(data.fermenter_l||'')}" step="0.1" placeholder="20">
          </div>
          <div class="form-group">
            <label class="form-label">Потери при варке %</label>
            <input type="number" name="brew_loss_pct" class="form-control" id="vol-brew-loss"
              value="${escHtml(data.brew_loss_pct||'')}" step="0.5"
              placeholder="${escHtml(settings.brew_loss_pct||'10')}">
          </div>
          <div class="form-group">
            <label class="form-label">Потери в ферментёре %</label>
            <input type="number" name="fermenter_loss_pct" class="form-control" id="vol-ferm-loss"
              value="${escHtml(data.fermenter_loss_pct||'')}" step="0.5"
              placeholder="${escHtml(settings.fermenter_loss_pct||'5')}">
          </div>
        </div>
        <div class="form-row-2" style="margin-top:4px">
          <div class="form-group">
            <label class="form-label" style="color:var(--text-muted)">Объём варки (л) <span style="font-size:0.78em">авто</span></label>
            <input type="number" name="batch_size_l" class="form-control" id="vol-batch"
              value="${escHtml(data.batch_size_l||'')}" step="0.1" placeholder="—"
              style="background:var(--bg-secondary)">
          </div>
          <div class="form-group">
            <label class="form-label" style="color:var(--text-muted)">Объём в упаковку (л) <span style="font-size:0.78em">авто</span></label>
            <input type="number" name="packaged_l" class="form-control" id="vol-packaged"
              value="${escHtml(data.packaged_l||'')}" step="0.1" placeholder="—"
              style="background:var(--bg-secondary)">
          </div>
        </div>

        <div class="form-row-4">
          <div class="form-group">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <label class="form-label" style="margin:0">OG</label>
              <div>${togBtn('btn-og-sg','SG',ogUnit==='sg')}${togBtn('btn-og-brix','°Bx',ogUnit==='brix')}</div>
            </div>
            <input type="number" name="og_target" class="form-control" value="${escHtml(String(ogDisplayVal))}" step="${ogUnit==='sg'?'0.001':'0.1'}" placeholder="${ogUnit==='sg'?'1.050':'12.4'}" data-unit="${ogUnit}">
            ${ogAlt ? `<div style="font-size:0.78em;color:var(--text-muted);margin-top:2px">${ogAlt}</div>` : ''}
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <label class="form-label" style="margin:0">FG</label>
              <div>${togBtn('btn-fg-sg','SG',fgUnit==='sg')}${togBtn('btn-fg-brix','°Bx',fgUnit==='brix')}</div>
            </div>
            <input type="number" name="fg_target" class="form-control" value="${escHtml(String(fgDisplayVal))}" step="${fgUnit==='sg'?'0.001':'0.1'}" placeholder="${fgUnit==='sg'?'1.010':'2.6'}" data-unit="${fgUnit}">
            ${fgAlt ? `<div style="font-size:0.78em;color:var(--text-muted);margin-top:2px">${fgAlt}</div>` : ''}
          </div>
          ${formField('ABV %', `<input type="number" name="abv_estimated" class="form-control" value="${escHtml(data.abv_estimated||calcABV(data.og_target, data.fg_target)||'')}" step="0.1">`)}
          ${formField('IBU', `<input type="number" name="ibu_estimated" class="form-control" value="${escHtml(data.ibu_estimated||'')}" step="1">`)}
        </div>

        <div class="form-group">
          <label class="form-label">Этикетка (JPG/PNG)</label>
          <div style="display:flex;gap:12px;align-items:center">
            ${data.label_image
              ? `<img src="${data.label_image}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
              : `<div style="width:64px;height:64px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1.5em">📷</div>`}
            <div style="display:flex;flex-direction:column;gap:6px">
              <input type="file" id="label-upload" accept="image/jpeg,image/png,image/webp" style="display:none">
              <input type="hidden" name="label_image" value="${escHtml(data.label_image||'')}">
              <button type="button" class="btn btn-secondary btn-upload-label">Загрузить</button>
              ${data.label_image ? `<button type="button" class="btn btn-danger btn-clear-label">Удалить</button>` : ''}
            </div>
          </div>
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
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          <span class="text-muted text-sm">Шаблон:</span>
          ${Object.entries(MASH_PRESETS).map(([k,p]) =>
            `<button type="button" class="btn btn-sm btn-secondary btn-preset" data-preset="${k}">${escHtml(p.label)}</button>`
          ).join('')}
        </div>
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

function resizeImageToBase64(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const scale = Math.min(maxW / w, maxH / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadMashPreset(key, restsArr) {
  const preset = MASH_PRESETS[key];
  if (!preset) return;
  restsArr.length = 0;
  const ts = now();
  preset.rests.forEach((r, i) => {
    restsArr.push({
      id: genId(),
      name: r.name,
      temp_c: String(r.temp_c),
      duration_min: String(r.duration_min),
      rest_type: r.rest_type || 'rest',
      sort_order: String(i),
      created_at: ts,
    });
  });
}

async function createBatchFromRecipe(recipe) {
  const recipeIngs = ingredients.filter(i => i.recipe_id === recipe.id);
  const recipeMRests = mashRests.filter(r => r.recipe_id === recipe.id);

  // Stock check
  const deficit = recipeIngs.map(ing => {
    const comp = components.find(c => c.id === ing.component_id);
    if (!comp) return null;
    const need = parseFloat(ing.qty) || 0;
    const have = inventory
      .filter(m => m.component_id === ing.component_id)
      .reduce((s, m) => s + (parseFloat(m.qty_delta) || 0), 0);
    if (need <= 0 || have >= need) return null;
    return { name: comp.name, unit: comp.unit, need, have, short: need - have };
  }).filter(Boolean);

  if (deficit.length > 0) {
    const rows = deficit.map(d =>
      `<tr>
        <td>${escHtml(d.name)}</td>
        <td>${d.need} ${escHtml(d.unit)}</td>
        <td class="${d.have <= 0 ? 'text-danger' : 'text-warning'}">${d.have.toFixed(2)} ${escHtml(d.unit)}</td>
        <td class="text-danger"><strong>${d.short.toFixed(2)} ${escHtml(d.unit)}</strong></td>
      </tr>`
    ).join('');

    showModal('Недостаточно ингредиентов на складе', `
      <p style="margin-bottom:12px">Для запуска партии не хватает следующих ингредиентов:</p>
      <table class="data-table">
        <thead><tr><th>Компонент</th><th>Нужно</th><th>Есть</th><th>Не хватает</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:12px;color:var(--text-muted);font-size:0.9em">Можно создать партию сейчас и докупить позже.</p>
    `, [
      { label: 'Отмена', class: 'btn-secondary', action: 'cancel', onClick: closeModal },
      { label: 'Создать всё равно', class: 'btn-primary', action: 'save', onClick: async () => {
        closeModal();
        await _doCreateBatch(recipe, recipeIngs, recipeMRests);
      }},
    ]);
    return;
  }

  await _doCreateBatch(recipe, recipeIngs, recipeMRests);
}

async function _doCreateBatch(recipe, recipeIngs, recipeMRests) {
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
