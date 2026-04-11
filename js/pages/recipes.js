// Bood CRM — Recipes Page (Beer & Spirit)
import { getRows, appendRow, appendRows, updateRow, softDelete, genId, now } from '../sheets.js';
import { getSettings } from '../sheets.js';
import { BJCP_STYLES, getBjcpGroups, sgToBrix, brixToSg, MASH_PRESETS } from '../bjcp.js';
import { BREWING_SALTS, WATER_PROFILES, getStyleWaterProfile, calcWaterProfile, calcIBUTinseth, calcEBC } from '../water.js';
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
let equipmentProfiles = [];
let recipeType = 'beer';

export async function renderRecipes(container, type = 'beer') {
  recipeType = type;
  showLoading(container);
  try {
    [components, recipes, ingredients, mashRests, inventory, settings, equipmentProfiles] = await Promise.all([
      getRows('Components'),
      getRows('Recipes'),
      getRows('RecipeIngredients'),
      getRows('RecipeMashRests'),
      getRows('Inventory'),
      getSettings(),
      getRows('BrewingProfiles'),
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
  let isSaving = false;

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
        const ogfgUnit = recipeData._ogfgUnit || el.dataset.unit || 'sg';
        if (el.name === 'og_target' && ogfgUnit === 'brix' && el.value) {
          recipeData.og_target = String(brixToSg(parseFloat(el.value)));
        } else if (el.name === 'fg_target' && ogfgUnit === 'brix' && el.value) {
          recipeData.fg_target = String(brixToSg(parseFloat(el.value)));
        } else {
          recipeData[el.name] = el.value;
        }
        isDirty = true;
        // Auto-calc ABV (always from stored SG values)
        if (['og_target','fg_target'].includes(el.name)) {
          const abv = calcABV(recipeData.og_target, recipeData.fg_target);
          recipeData.abv_estimated = abv;
          const hiddenAbv = tabContent.querySelector('#inp-abv-estimated');
          if (hiddenAbv) hiddenAbv.value = abv;
          const statAbv = tabContent.querySelector('#stat-abv');
          if (statAbv) statAbv.textContent = (abv || '—') + '%';
        }
        // (manual IBU/EBC inputs removed — auto-calculated from ingredients)
      });
    });

    // Ingredient add buttons
    tabContent.querySelector('.btn-add-grain')?.addEventListener('click', () => {
      addIngredient('mash', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-boil-hop')?.addEventListener('click', () => {
      addIngredientFiltered('boil', recipeIngredients, renderView, ['hop']);
    });
    tabContent.querySelector('.btn-add-whirlpool')?.addEventListener('click', () => {
      addIngredientFiltered('whirlpool', recipeIngredients, renderView, ['hop', 'additive']);
    });
    // Yeast picker — replaces previous yeast entry, auto-fills temp/days if possible
    tabContent.querySelector('#yeast-select')?.addEventListener('change', (e) => {
      const yeastId = e.target.value;
      // Remove existing yeast from fermentation stage
      const toRemove = recipeIngredients.filter(i =>
        i.stage_key === 'fermentation' && components.find(c => c.id === i.component_id)?.type === 'yeast'
      );
      toRemove.forEach(r => {
        const idx = recipeIngredients.indexOf(r);
        if (idx !== -1) recipeIngredients.splice(idx, 1);
      });
      if (yeastId) {
        recipeIngredients.push({
          id: genId(),
          component_id: yeastId,
          qty: '',
          stage_key: 'fermentation',
          time_meta: '',
          sort_order: String(recipeIngredients.filter(i => i.stage_key === 'fermentation').length),
          created_at: now(),
        });
        // Auto-fill temp/days from structured fields or notes
        const yeastComp = components.find(c => c.id === yeastId);
        if (yeastComp) {
          if (yeastComp.ferment_temp_min) {
            recipeData.ferment_temp_c = yeastComp.ferment_temp_min;
            isDirty = true;
          } else if (yeastComp.notes) {
            const tempMatch = yeastComp.notes.match(/(\d+)[-–]?(\d*)[\s°]*[Cc°]/);
            if (tempMatch) { recipeData.ferment_temp_c = tempMatch[1]; isDirty = true; }
          }
          if (yeastComp.ferment_days_typical) {
            recipeData.ferment_days = yeastComp.ferment_days_typical;
            isDirty = true;
          } else if (yeastComp.notes) {
            const daysMatch = yeastComp.notes.match(/(\d+)\s*д(ней|ня|ень)/i);
            if (daysMatch) { recipeData.ferment_days = daysMatch[1]; isDirty = true; }
          }
        }
      }
      isDirty = true;
      renderView();
    });
    // Fallback for spirit tab fermentation (uses old combined button)
    tabContent.querySelector('.btn-add-yeast')?.addEventListener('click', () => {
      addIngredient('fermentation', recipeIngredients, renderView);
    });
    tabContent.querySelector('.btn-add-ferment-additive')?.addEventListener('click', () => {
      addIngredientFiltered('fermentation', recipeIngredients, renderView, ['additive','salt']);
    });
    tabContent.querySelector('.btn-add-dry-hop')?.addEventListener('click', () => {
      addIngredient('dry_hop', recipeIngredients, renderView);
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
        const ingId = btn.dataset.id;
        recipeIngredients = recipeIngredients.filter(i => i.id !== ingId);
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

    // Update component selection + unit label + alpha acid badge (hops)
    tabContent.querySelectorAll('.ingredient-comp').forEach(sel => {
      sel.addEventListener('change', () => {
        const ingId = sel.dataset.id;
        const comp  = components.find(c => c.id === sel.value);
        const row   = sel.closest('.ingredient-row');

        // Update unit label
        const unitLabel = row?.querySelector('.ingredient-unit');
        if (unitLabel) unitLabel.textContent = comp?.unit || '';

        // Update alpha acid badge for hop rows
        if (row) {
          const aa = comp?.alpha_acid ? parseFloat(comp.alpha_acid) : null;
          let aaBadge = row.querySelector('.hop-aa-badge');
          if (aa !== null) {
            if (aaBadge) {
              aaBadge.textContent = `${aa}%α`;
            } else {
              aaBadge = document.createElement('span');
              aaBadge.className = 'hop-aa-badge';
              aaBadge.style.cssText = 'font-size:10px;color:var(--accent-amber);white-space:nowrap;flex-shrink:0';
              aaBadge.textContent = `${aa}%α`;
              const timeEl = row.querySelector('.ingredient-time');
              if (timeEl) timeEl.insertAdjacentElement('beforebegin', aaBadge);
            }
          } else if (aaBadge) {
            aaBadge.remove();
          }
        }

        // Update EBC chip for grain rows
        if (row) {
          const newEbc = comp?.ebc ? parseFloat(comp.ebc) : 0;
          let ebcChip  = row.querySelector('.grain-ebc-chip');
          if (newEbc > 0) {
            const hex = ebcToHex(newEbc);
            if (ebcChip) {
              ebcChip.textContent = `${newEbc}EBC`;
              ebcChip.style.background   = `${hex}22`;
              ebcChip.style.color        = hex;
              ebcChip.style.borderColor  = `${hex}55`;
            } else {
              ebcChip = document.createElement('span');
              ebcChip.className  = 'grain-ebc-chip';
              ebcChip.style.cssText = `background:${hex}22;color:${hex};border:1px solid ${hex}55;border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap;flex-shrink:0`;
              ebcChip.textContent = `${newEbc}EBC`;
              const removeBtn = row.querySelector('.btn-remove-ingredient');
              if (removeBtn) removeBtn.insertAdjacentElement('beforebegin', ebcChip);
            }
          } else if (ebcChip) {
            ebcChip.remove();
          }
        }

        const ing = recipeIngredients.find(i => i.id === ingId);
        if (ing) ing.component_id = sel.value;
        isDirty = true;
      });
    });

    // Update ingredient qty/meta inline
    tabContent.querySelectorAll('.ingredient-qty').forEach(input => {
      input.addEventListener('change', () => {
        const ingId = input.dataset.id;
        const ing = recipeIngredients.find(i => i.id === ingId);
        if (ing) ing.qty = input.value;
        isDirty = true;
      });
    });
    tabContent.querySelectorAll('.ingredient-time').forEach(input => {
      input.addEventListener('change', () => {
        const ingId = input.dataset.id;
        const ing = recipeIngredients.find(i => i.id === ingId);
        if (ing) ing.time_meta = input.value;
        isDirty = true;
      });
    });
    tabContent.querySelectorAll('.mash-rest-field').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        if (recipeMashRests[idx]) {
          recipeMashRests[idx][field] = input.value;
          isDirty = true;
          // Update data-type on the row for live CSS coloring
          if (field === 'rest_type') {
            (input.closest('.mash-block') || input.closest('.mash-rest-row'))?.setAttribute('data-type', input.value);
          }
        }
      });
    });

    // ── Full water chain (anchor = packaged_l, calculates backwards) ─────────
    function updateWaterChain() {
      const getN = (sel, fallback = 0) => parseFloat(tabContent.querySelector(sel)?.value) || parseFloat(fallback) || 0;

      const packaged = getN('[name=packaged_l]', recipeData.packaged_l);
      const fermLoss = parseFloat(recipeData.fermenter_loss_pct) || parseFloat(settings.fermenter_loss_pct) || 5;
      const brewLoss = parseFloat(recipeData.brew_loss_pct)      || parseFloat(settings.brew_loss_pct)      || 10;
      const hm       = getN('[name=hydromodule]', recipeData.hydromodule) || 4;
      const boilMins = getN('[name=boil_time_min]', recipeData.boil_time_min) || 60;

      // Equipment profile params
      const selProfId = tabContent.querySelector('[name=equipment_profile_id]')?.value || recipeData.equipment_profile_id;
      const sp = equipmentProfiles.find(p => p.id === selProfId);
      const grainAbs  = parseFloat(sp?.grain_absorption   || settings.grain_absorption   || 1.0);
      const boilPct   = parseFloat(sp?.boiloff_rate_pct   || settings.boiloff_rate_pct   || 10);
      const shrinkPct = parseFloat(sp?.wort_shrinkage_pct || settings.wort_shrinkage_pct || 4);

      // Grain kg from current ingredient list
      const grainKg = recipeIngredients
        .filter(i => i.stage_key === 'mash')
        .reduce((s, i) => s + (parseFloat(i.qty) || 0), 0) / 1000;

      if (!packaged) return;

      // Reverse chain: packaged → fermenter → after boil → preboil → mash / sparge
      const fermenter   = fermLoss < 100 ? +(packaged / (1 - fermLoss / 100)).toFixed(2) : 0;
      const afterBoil   = brewLoss < 100 && fermenter ? +(fermenter / (1 - brewLoss / 100)).toFixed(2) : 0;
      const divisor     = (1 - boilPct / 100 * (boilMins / 60)) * (1 - shrinkPct / 100);
      const preboil     = afterBoil > 0 && divisor > 0 ? +(afterBoil / divisor).toFixed(2) : 0;
      const mashWater   = grainKg > 0 ? +(grainKg * hm).toFixed(2) : 0;
      const spargeWater = preboil > 0 && mashWater > 0
        ? +(preboil - mashWater + grainKg * grainAbs).toFixed(2) : 0;

      // Update hidden fermenter / batch_size fields
      const fermEl  = tabContent.querySelector('#vol-fermenter');
      const batchEl = tabContent.querySelector('#vol-batch');
      if (fermEl)  { fermEl.value  = fermenter  > 0 ? String(fermenter)  : ''; recipeData.fermenter_l  = String(fermenter); }
      if (batchEl) { batchEl.value = afterBoil  > 0 ? String(afterBoil)  : ''; recipeData.batch_size_l = String(afterBoil); }

      // Fill water chain fields
      const fill = (sel, val, key) => {
        const el = tabContent.querySelector(sel);
        if (!el) return;
        const v = val > 0 ? String(val) : '';
        el.value = v;
        recipeData[key] = v;
        // Mismatch: field was already set to a different value before auto-fill
        el.classList.toggle('wc-mismatch', false); // cleared — values are now consistent
      };
      fill('[name=after_boil_l]',   afterBoil,   'after_boil_l');
      if (preboil    > 0) fill('[name=water_total_l]',  preboil,     'water_total_l');
      if (mashWater  > 0) fill('[name=water_mash_l]',   mashWater,   'water_mash_l');
      if (spargeWater > 0) fill('[name=water_sparge_l]', spargeWater, 'water_sparge_l');
    }

    // Trigger on any volume-affecting field change
    ['[name=packaged_l]','[name=hydromodule]','[name=boil_time_min]'].forEach(sel => {
      tabContent.querySelector(sel)?.addEventListener('input', updateWaterChain);
    });
    tabContent.querySelector('[name=equipment_profile_id]')?.addEventListener('change', updateWaterChain);

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

    // ── Shared OG/FG unit toggle ───────────────────────────────────────────────
    tabContent.querySelector('.btn-unit-sg')?.addEventListener('click', () => {
      if ((recipeData._ogfgUnit || 'sg') === 'brix') {
        const ogEl = tabContent.querySelector('[name=og_target]');
        const fgEl = tabContent.querySelector('[name=fg_target]');
        if (ogEl?.value) recipeData.og_target = String(brixToSg(parseFloat(ogEl.value)));
        if (fgEl?.value) recipeData.fg_target = String(brixToSg(parseFloat(fgEl.value)));
      }
      recipeData._ogfgUnit = 'sg';
      renderView();
    });
    tabContent.querySelector('.btn-unit-brix')?.addEventListener('click', () => {
      recipeData._ogfgUnit = 'brix';
      renderView();
    });
    // keep legacy beer-tab toggle handlers for spirit tab
    tabContent.querySelector('.btn-og-sg')?.addEventListener('click', () => { recipeData._ogfgUnit = 'sg'; renderView(); });
    tabContent.querySelector('.btn-og-brix')?.addEventListener('click', () => { recipeData._ogfgUnit = 'brix'; renderView(); });
    tabContent.querySelector('.btn-fg-sg')?.addEventListener('click', () => { recipeData._ogfgUnit = 'sg'; renderView(); });
    tabContent.querySelector('.btn-fg-brix')?.addEventListener('click', () => { recipeData._ogfgUnit = 'brix'; renderView(); });

    // ── Description toggle ─────────────────────────────────────────────────────
    tabContent.querySelector('.btn-desc-toggle')?.addEventListener('click', () => {
      // save any current description text before toggling
      const descEl = tabContent.querySelector('[name=description]');
      if (descEl) recipeData.description = descEl.value;
      recipeData._descOpen = !recipeData._descOpen;
      renderView();
    });

    // ── Equipment profile selector ─────────────────────────────────────────────
    tabContent.querySelector('#equipment-profile-select')?.addEventListener('change', (e) => {
      recipeData.equipment_profile_id = e.target.value;
      isDirty = true;
    });

    // ── Mash preset selector (in header) ──────────────────────────────────────
    tabContent.querySelector('.mash-preset-select')?.addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key) return;
      if (recipeMashRests.length > 0 && !confirm('Заменить текущие паузы шаблоном?')) { e.target.value = ''; return; }
      loadMashPreset(key, recipeMashRests);
      e.target.value = '';
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
        if (recipeMashRests.length > 0 && !confirm('Заменить текущие паузы шаблоном?')) return;
        loadMashPreset(key, recipeMashRests);
        renderView();
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
    if (isSaving) return;
    isSaving = true;
    const saveBtn = overlay.querySelector('[data-action=save]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

    // Collect all open form fields (with Brix→SG conversion for OG/FG)
    // water_additions is managed separately via recipeData directly — don't overwrite
    overlay.querySelectorAll('[name]').forEach(el => {
      if (el.name === 'water_additions') return; // managed via recipeData
      const saveUnit = recipeData._ogfgUnit || el.dataset.unit || 'sg';
      if (el.name === 'og_target' && saveUnit === 'brix' && el.value) {
        recipeData.og_target = String(brixToSg(parseFloat(el.value)));
      } else if (el.name === 'fg_target' && saveUnit === 'brix' && el.value) {
        recipeData.fg_target = String(brixToSg(parseFloat(el.value)));
      } else {
        recipeData[el.name] = el.value;
      }
    });

    if (!recipeData.name?.trim()) {
      showToast('Введите название рецепта', 'warning');
      isSaving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = t('save'); }
      return;
    }
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
    } catch (e) {
      showToast(e.message, 'error');
      isSaving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = t('save'); }
    }
  }
}

// ─── EBC → approximate hex colour ────────────────────────────────────────────
function ebcToHex(ebc) {
  const e = parseFloat(ebc) || 0;
  if (e <=  4) return '#F8F4B4';
  if (e <=  8) return '#FBE27A';
  if (e <= 16) return '#F5B235';
  if (e <= 30) return '#E07B10';
  if (e <= 60) return '#C04A00';
  if (e <= 120) return '#8B2500';
  if (e <= 300) return '#5A1000';
  return '#2E0800';
}

// ─── Grain bill rows ──────────────────────────────────────────────────────────
function renderGrainRows(grains, totalGrainG) {
  if (!grains.length) return '<p class="text-muted" style="font-size:12px;padding:4px 0">Нет солода</p>';
  const grainComps = components.filter(c => ['malt','grain_distill','sugar','other'].includes(c.type) && c.is_active !== 'FALSE');
  return grains.map(ing => {
    const comp = components.find(c => c.id === ing.component_id);
    const qty  = parseFloat(ing.qty) || 0;
    const pct  = totalGrainG > 0 ? Math.round(qty / totalGrainG * 100) : 0;
    const ebc  = parseFloat(comp?.ebc) || 0;
    const hex  = ebcToHex(ebc);
    return `
      <div class="ingredient-row">
        <select class="form-control ingredient-comp" data-id="${escHtml(ing.id)}" style="flex:2">
          ${grainComps.map(c => `<option value="${c.id}" ${c.id===ing.component_id?'selected':''}>${escHtml(c.name)}</option>`).join('')}
        </select>
        <input type="number" class="form-control ingredient-qty" data-id="${escHtml(ing.id)}"
          value="${escHtml(ing.qty||'')}" placeholder="г" step="50" style="width:80px">
        <span class="ingredient-unit text-muted">г</span>
        ${ebc > 0 ? `<span class="grain-ebc-chip" style="background:${hex}22;color:${hex};border:1px solid ${hex}55;border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap;flex-shrink:0">${ebc}EBC</span>` : ''}
        <span class="text-muted" style="font-size:10px;min-width:28px;text-align:right;flex-shrink:0">${pct}%</span>
        <button type="button" class="btn btn-sm btn-danger btn-remove-ingredient" data-id="${escHtml(ing.id)}">✕</button>
      </div>`;
  }).join('');
}

// ─── Hop rows (boil / whirlpool) ─────────────────────────────────────────────
function renderHopRows(hops, stageKey, boilTimeMin, og, batchVol, isWhirlpool = false) {
  if (!hops.length) return `<p class="text-muted" style="font-size:12px;padding:4px 0">Нет хмеля</p>`;
  const hopComps = components.filter(c => c.type === 'hop' && c.is_active !== 'FALSE');
  const rowCls   = isWhirlpool ? 'hop-row-whirlpool' : 'hop-row-boil';
  return hops.map(ing => {
    const comp = components.find(c => c.id === ing.component_id);
    const aa   = comp?.alpha_acid ? parseFloat(comp.alpha_acid) : null;
    const ibu  = (!isWhirlpool && aa && ing.qty && ing.time_meta)
      ? calcIBUTinseth(ing.qty, aa, ing.time_meta, og, batchVol)
      : 0;
    return `
      <div class="ingredient-row ${rowCls}">
        <select class="form-control ingredient-comp" data-id="${escHtml(ing.id)}" data-stage="${stageKey}" style="flex:2">
          ${hopComps.map(c => `<option value="${c.id}" ${c.id===ing.component_id?'selected':''}>${escHtml(c.name)}</option>`).join('')}
        </select>
        <input type="number" class="form-control ingredient-qty" data-id="${escHtml(ing.id)}" data-stage="${stageKey}"
          value="${escHtml(ing.qty||'')}" placeholder="г" step="5" style="width:70px">
        <span class="ingredient-unit text-muted">г</span>
        ${aa !== null ? `<span class="hop-aa-badge" style="font-size:10px;color:var(--accent-amber);white-space:nowrap;flex-shrink:0">${aa}%α</span>` : ''}
        <input type="number" class="form-control ingredient-time" data-id="${escHtml(ing.id)}" data-stage="${stageKey}"
          value="${escHtml(ing.time_meta||'')}" placeholder="${isWhirlpool?'мин':'мин'}" step="5" style="width:62px">
        ${ibu > 0 ? `<span style="font-size:10px;color:var(--accent-amber-light);white-space:nowrap;flex-shrink:0">${ibu}IBU</span>` : ''}
        <button type="button" class="btn btn-sm btn-danger btn-remove-ingredient" data-id="${escHtml(ing.id)}" data-stage="${stageKey}">✕</button>
      </div>`;
  }).join('');
}

// ─── Mash pause blocks ────────────────────────────────────────────────────────
function renderMashBlocks(rests) {
  if (!rests.length) return '<p class="text-muted" style="font-size:12px;padding:4px 0">Нет пауз. Добавьте или выберите шаблон.</p>';
  return rests.map((r, i) => `
    <div class="mash-block" data-type="${escHtml(r.rest_type||'rest')}">
      <div class="mash-block-header">
        <input type="text" class="form-control mash-rest-field" data-idx="${i}" data-field="name"
          value="${escHtml(r.name||'Осахаривание')}" placeholder="Название паузы">
        <button type="button" class="btn btn-sm btn-danger btn-remove-rest" data-idx="${i}">✕</button>
      </div>
      <div class="mash-block-params">
        <div class="mash-block-param">
          <span class="text-muted" style="font-size:11px">🌡</span>
          <input type="number" class="form-control mash-rest-field" data-idx="${i}" data-field="temp_c"
            value="${escHtml(r.temp_c||'65')}" style="width:58px" step="1">
          <span class="text-muted" style="font-size:11px">°C</span>
        </div>
        <div class="mash-block-param">
          <span class="text-muted" style="font-size:11px">⏱</span>
          <input type="number" class="form-control mash-rest-field" data-idx="${i}" data-field="duration_min"
            value="${escHtml(r.duration_min||'60')}" style="width:58px" step="5">
          <span class="text-muted" style="font-size:11px">мин</span>
        </div>
        <select class="form-control mash-rest-field" data-idx="${i}" data-field="rest_type" style="width:96px">
          <option value="rest"      ${r.rest_type==='rest'      ?'selected':''}>Пауза</option>
          <option value="decoction" ${r.rest_type==='decoction' ?'selected':''}>Декокция</option>
        </select>
      </div>
    </div>`).join('');
}

// ─── Beer Grid Layout (desktop: 3 columns) ───────────────────────────────────
function renderBeerGrid(container, data, ingredients, mashRests) {
  const unit     = data._ogfgUnit || 'sg';   // shared OG/FG unit
  const ogSgVal  = data.og_target || '';
  const fgSgVal  = data.fg_target || '';
  const ogDisp   = unit === 'sg' ? ogSgVal : (ogSgVal ? String(sgToBrix(parseFloat(ogSgVal))) : '');
  const fgDisp   = unit === 'sg' ? fgSgVal : (fgSgVal ? String(sgToBrix(parseFloat(fgSgVal))) : '');
  const selectedStyle = data.style ? BJCP_STYLES.find(s => s.name === data.style) : null;
  const bjcpOptions = Object.entries(getBjcpGroups()).map(([cat, styles]) => `
    <optgroup label="${escHtml(cat)}">
      ${styles.map(s => `<option value="${escHtml(s.name)}" ${data.style === s.name ? 'selected' : ''}>${s.code} — ${escHtml(s.name)}</option>`).join('')}
    </optgroup>`).join('');
  const togBtn = (cls, label, active) =>
    `<button type="button" class="btn ${cls}" style="padding:1px 8px;font-size:0.78em;border-radius:${cls.includes('sg')||cls.includes('unit-sg')?'4px 0 0 4px':'0 4px 4px 0'};background:${active?'var(--accent)':'var(--bg-secondary)'};color:${active?'#fff':'var(--text-muted)'};border:1px solid var(--border);${!cls.includes('sg')&&!cls.includes('unit-sg')?'border-left:none;':''}cursor:pointer">${label}</button>`;

  // Water chemistry
  let waterAdditions = [];
  try { waterAdditions = JSON.parse(data.water_additions || '[]'); } catch {}
  const waterVol = parseFloat(data.water_mash_l) || 10;
  const waterIons = calcWaterProfile(waterAdditions, waterVol);
  const recommendedProfile = getStyleWaterProfile(data.style);
  const currentProfile = data.water_profile || '';
  function ionPpm(v) { return v > 0 ? Math.round(v) : '0'; }

  // Ingredient groups
  const grains       = ingredients.filter(i => i.stage_key === 'mash');
  const boilHops     = ingredients.filter(i => i.stage_key === 'boil');
  const whirlpool    = ingredients.filter(i => i.stage_key === 'whirlpool');
  const fermentItems = ingredients.filter(i => i.stage_key === 'fermentation');
  const dryHops      = ingredients.filter(i => i.stage_key === 'dry_hop');
  const packItems    = ingredients.filter(i => i.stage_key === 'packaging');

  // Auto-calc IBU (Tinseth) and EBC (Morey)
  const batchVol = parseFloat(data.batch_size_l) || parseFloat(data.fermenter_l) || 20;
  const og       = parseFloat(data.og_target) || 1.050;
  let autoIBU = 0; let hasAlpha = false;
  for (const hop of boilHops) {
    const comp = components.find(c => c.id === hop.component_id);
    if (comp?.alpha_acid) { hasAlpha = true; autoIBU += calcIBUTinseth(hop.qty, comp.alpha_acid, hop.time_meta, og, batchVol); }
  }
  if (hasAlpha) data.ibu_estimated = String(Math.round(autoIBU));
  const grainData = grains.map(g => { const c = components.find(x => x.id === g.component_id); return { qty_g: parseFloat(g.qty)||0, ebc: parseFloat(c?.ebc)||0 }; }).filter(g => g.qty_g > 0 && g.ebc > 0);
  if (grainData.length > 0) { const autoEBC = calcEBC(grainData, batchVol); if (autoEBC > 0) data.ebc_estimated = String(autoEBC); }

  // Grain totals
  const totalGrainG = grains.reduce((s, g) => s + (parseFloat(g.qty)||0), 0);

  // Equipment profiles
  const beerProfs  = equipmentProfiles.filter(p => p.type === 'beer' && p.is_active !== 'FALSE');
  const profOpts   = beerProfs.map(p => `<option value="${escHtml(p.id)}" ${data.equipment_profile_id===p.id?'selected':''}>${escHtml(p.name)}</option>`).join('');

  // Water chain validation
  const selProf    = beerProfs.find(p => p.id === data.equipment_profile_id);
  const wcp = {
    grain_absorption:  parseFloat(selProf?.grain_absorption  || settings.grain_absorption  || 1.0),
    boiloff_rate_pct:  parseFloat(selProf?.boiloff_rate_pct  || settings.boiloff_rate_pct  || 10),
    wort_shrinkage_pct:parseFloat(selProf?.wort_shrinkage_pct|| settings.wort_shrinkage_pct|| 4),
  };
  const wcGrainKg    = totalGrainG / 1000;
  const wcHM         = parseFloat(data.hydromodule) || 4;
  const wcMash       = parseFloat(data.water_mash_l) || 0;
  const wcSparge     = parseFloat(data.water_sparge_l) || 0;
  const wcPreboil    = parseFloat(data.water_total_l) || 0;   // repurposed field
  const wcBoilMins   = parseFloat(data.boil_time_min) || 60;
  const wcBrewLoss   = parseFloat(data.brew_loss_pct) || parseFloat(settings.brew_loss_pct) || 10;
  const wcFermLoss   = parseFloat(data.fermenter_loss_pct) || parseFloat(settings.fermenter_loss_pct) || 5;
  const wcPackaged   = parseFloat(data.packaged_l) || 0;
  // Expected values
  const wcExpMash    = wcGrainKg > 0 ? +(wcGrainKg * wcHM).toFixed(2) : 0;
  const wcExpPreboil = (wcMash + wcSparge - wcGrainKg * wcp.grain_absorption);
  const wcExpAfterBoil = wcPreboil > 0
    ? +(wcPreboil * (1 - wcp.boiloff_rate_pct / 100 * (wcBoilMins / 60)) * (1 - wcp.wort_shrinkage_pct / 100)).toFixed(2)
    : 0;
  // Mismatch flags (tolerance 0.4 L)
  const WC_TOL = 0.4;
  const wcMashMm    = wcMash > 0 && wcExpMash > 0 && Math.abs(wcMash - wcExpMash) > WC_TOL;
  const wcSpargeMm  = false; // no independent formula for sparge — no highlight
  const wcPreboilMm = wcPreboil > 0 && wcExpPreboil > 0 && Math.abs(wcPreboil - wcExpPreboil) > WC_TOL;
  const wcAfterMm   = false; // after-boil is output, not independently set
  function wcHint(expected, unit='л') { return expected > 0 ? `<span class="wc-hint">≈ ${expected.toFixed(1)} ${unit}</span>` : ''; }

  // Current yeast
  const currentYeast     = fermentItems.find(i => components.find(c => c.id === i.component_id)?.type === 'yeast');
  const currentYeastComp = currentYeast ? components.find(c => c.id === currentYeast.component_id) : null;
  const yeastComps       = components.filter(c => c.type === 'yeast' && c.is_active !== 'FALSE');

  const activeTab = data._activeTab || 'overview';

  container.innerHTML = `
  <div class="recipe-mobile-tabs" role="tablist">
    ${['overview','water','grain','mash','boil','fermentation','packaging'].map(t =>
      `<button class="rmt-tab${t===activeTab?' active':''}" data-tab="${t}">${{overview:'Обзор',water:'Вода',grain:'Засыпь',mash:'Затирание',boil:'Кипячение',fermentation:'Брожение',packaging:'Упаковка'}[t]}</button>`
    ).join('')}
  </div>
  <div class="recipe-editor-grid" data-active-tab="${activeTab}">

  <!-- ── Col 1: Overview + Water ───────────────────────────────────────── -->
  <div class="recipe-editor-col">

    <div class="section-card" data-section="overview">
      <div class="section-card-header"><h4>📋 Обзор</h4></div>
      <div class="section-card-body">
        <div class="form-grid">

          <!-- Label + Name row -->
          <div class="overview-top">
            <div class="overview-label-wrap">
              ${data.label_image
                ? `<img src="${data.label_image}" class="overview-label-img btn-upload-label" title="Нажмите для замены" style="cursor:pointer">`
                : `<div class="overview-label-placeholder btn-upload-label">📷</div>`}
              <input type="file" id="label-upload" accept="image/jpeg,image/png,image/webp" style="display:none">
              <input type="hidden" name="label_image" value="${escHtml(data.label_image||'')}">
              ${data.label_image ? `<button type="button" class="btn btn-xs btn-danger btn-clear-label" style="margin-top:4px;font-size:10px;width:100%">✕</button>` : ''}
            </div>
            <div class="overview-name-wrap">
              <input type="text" name="name" class="form-control overview-name-input" value="${escHtml(data.name||'')}" placeholder="Название рецепта *">
              <div style="display:flex;gap:5px;align-items:center;margin-top:5px">
                <select name="style" class="form-control" id="bjcp-style-select" style="flex:1">
                  <option value="">— стиль —</option>
                  ${bjcpOptions}
                </select>
                <button type="button" class="btn btn-sm btn-secondary btn-desc-toggle" title="Описание" style="flex-shrink:0;padding:4px 8px">ℹ</button>
              </div>
              ${data._descOpen ? `<textarea name="description" class="form-control" rows="2" style="margin-top:5px">${escHtml(data.description||'')}</textarea>` : `<input type="hidden" name="description" value="${escHtml(data.description||'')}">`}
            </div>
          </div>

          <!-- Stats -->
          <div class="overview-stats-row">
            <div class="recipe-stat-block">
              <div class="recipe-stat-value stat-abv" id="stat-abv">${escHtml(data.abv_estimated||calcABV(data.og_target,data.fg_target)||'—')}%</div>
              <div class="recipe-stat-label">ABV${selectedStyle?.abv?`<span class="recipe-stat-target"> ${selectedStyle.abv[0]}–${selectedStyle.abv[1]}%</span>`:''}</div>
            </div>
            <div class="recipe-stat-block">
              <div class="recipe-stat-value stat-ibu" id="stat-ibu">${escHtml(data.ibu_estimated||'—')}</div>
              <div class="recipe-stat-label">IBU${selectedStyle?.ibu?`<span class="recipe-stat-target"> ${selectedStyle.ibu[0]}–${selectedStyle.ibu[1]}</span>`:''}</div>
            </div>
            <div class="recipe-stat-block">
              <div class="recipe-stat-value stat-ebc" id="stat-ebc">${escHtml(data.ebc_estimated||'—')}</div>
              <div class="recipe-stat-label">EBC${selectedStyle?.ebc?`<span class="recipe-stat-target"> ${selectedStyle.ebc[0]}–${selectedStyle.ebc[1]}</span>`:''}</div>
            </div>
          </div>
          <input type="hidden" name="abv_estimated" id="inp-abv-estimated" value="${escHtml(data.abv_estimated||calcABV(data.og_target,data.fg_target)||'')}">
          <input type="hidden" name="ibu_estimated" value="${escHtml(data.ibu_estimated||'')}">
          <input type="hidden" name="ebc_estimated" value="${escHtml(data.ebc_estimated||'')}">

          <!-- OG / FG / Упаковка -->
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-bottom:3px">
            <span style="font-size:10px;color:var(--text-muted)">OG/FG:</span>
            ${togBtn('btn-unit-sg','SG',unit==='sg')}${togBtn('btn-unit-brix','°Bx',unit==='brix')}
          </div>
          <div class="form-row-3">
            <div class="form-group">
              <label class="form-label">OG ${unit==='brix'&&ogSgVal?`<span class="text-muted" style="font-weight:400">≈ SG ${ogSgVal}</span>`:''}</label>
              <input type="number" name="og_target" class="form-control" value="${escHtml(String(ogDisp))}" step="${unit==='sg'?'0.001':'0.1'}" placeholder="${unit==='sg'?'1.050':'12.4'}" data-unit="${unit}">
            </div>
            <div class="form-group">
              <label class="form-label">FG ${unit==='brix'&&fgSgVal?`<span class="text-muted" style="font-weight:400">≈ SG ${fgSgVal}</span>`:''}</label>
              <input type="number" name="fg_target" class="form-control" value="${escHtml(String(fgDisp))}" step="${unit==='sg'?'0.001':'0.1'}" placeholder="${unit==='sg'?'1.010':'2.6'}" data-unit="${unit}">
            </div>
            <div class="form-group">
              <label class="form-label">Упаковка (л) <span style="color:var(--accent);font-size:0.78em">●</span></label>
              <input type="number" name="packaged_l" class="form-control" id="vol-packaged" value="${escHtml(data.packaged_l||'')}" step="0.5" placeholder="19">
            </div>
          </div>
          <input type="hidden" name="batch_size_l" id="vol-batch" value="${escHtml(data.batch_size_l||'')}">

          <!-- Equipment profile selector -->
          ${beerProfs.length > 0 ? `
            <div class="form-group">
              <label class="form-label">Профиль оборудования</label>
              <select name="equipment_profile_id" class="form-control" id="equipment-profile-select">
                <option value="">— стандартные параметры —</option>
                ${profOpts}
              </select>
            </div>
          ` : `<div class="text-muted" style="font-size:10px;padding:2px 0">Нет профилей оборудования — <a href="#/profiles" style="color:var(--accent)">создайте</a></div>`}
        </div>
      </div>
    </div>

    <!-- Water & Salts -->
    <div class="section-card" data-section="water">
      <div class="section-card-header"><h4>💧 Вода и Соли</h4></div>
      <div class="section-card-body">
        <div class="form-grid">

          <!-- hidden loss% — read by updateWaterChain, sourced from settings -->
          <input type="hidden" name="brew_loss_pct"      id="vol-brew-loss"  value="${escHtml(data.brew_loss_pct||'')}">
          <input type="hidden" name="fermenter_loss_pct" id="vol-ferm-loss"  value="${escHtml(data.fermenter_loss_pct||'')}">

          <!-- Smart water chain: ГМ | Мэш | Промывка | Пребоил | После кипа | В ферментёр -->
          <div class="water-chain-row">
            <div class="water-chain-cell">
              <label class="wc-label">ГМ</label>
              <input type="number" name="hydromodule" class="form-control wc-input" value="${escHtml(data.hydromodule||'4')}" step="0.1" placeholder="4">
              ${wcGrainKg > 0 ? `<span class="wc-hint">→ ${wcExpMash.toFixed(1)} л</span>` : ''}
            </div>
            <div class="water-chain-cell">
              <label class="wc-label">Мэш (л)</label>
              <input type="number" name="water_mash_l" class="form-control wc-input${wcMashMm?' wc-mismatch':''}" value="${escHtml(data.water_mash_l||'')}" step="0.1" placeholder="—">
              ${wcHint(wcExpMash)}
            </div>
            <div class="water-chain-cell">
              <label class="wc-label">Промывка (л)</label>
              <input type="number" name="water_sparge_l" class="form-control wc-input" value="${escHtml(data.water_sparge_l||'')}" step="0.1" placeholder="—">
            </div>
            <div class="water-chain-cell">
              <label class="wc-label">Пребоил (л)</label>
              <input type="number" name="water_total_l" class="form-control wc-input${wcPreboilMm?' wc-mismatch':''}" value="${escHtml(data.water_total_l||'')}" step="0.1" placeholder="—">
              ${wcHint(wcExpPreboil > 0 ? +wcExpPreboil.toFixed(1) : 0)}
            </div>
            <div class="water-chain-cell">
              <label class="wc-label">После кипа (л)</label>
              <input type="number" name="after_boil_l" class="form-control wc-input" value="${escHtml(String(wcExpAfterBoil > 0 ? wcExpAfterBoil : (data.after_boil_l||'')))}" step="0.1" placeholder="—" readonly style="background:var(--bg-secondary)">
            </div>
            <div class="water-chain-cell">
              <label class="wc-label">В ферментёр (л)</label>
              <input type="number" name="fermenter_l" class="form-control wc-input" id="vol-fermenter" value="${escHtml(data.fermenter_l||'')}" step="0.1" placeholder="—" readonly style="background:var(--bg-secondary)">
            </div>
          </div>

          <!-- Water profile & pH -->
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Профиль воды${recommendedProfile && recommendedProfile !== currentProfile ? `<span class="text-muted" style="font-weight:400;font-size:0.78em;margin-left:4px">рек: ${WATER_PROFILES[recommendedProfile]?.name}</span>` : ''}</label>
              <select name="water_profile" class="form-control" id="water-profile-select">
                <option value="">— не выбран —</option>
                ${Object.entries(WATER_PROFILES).map(([k,p]) => `<option value="${k}" ${currentProfile===k?'selected':''}>${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">pH затора (цель)</label>
              <input type="number" name="ph_target" class="form-control" value="${escHtml(data.ph_target||'')}" step="0.05" placeholder="5.4" min="4.5" max="6.5">
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label class="form-label" style="margin:0">Соли (в затор)</label>
              <button type="button" class="btn btn-sm btn-secondary btn-add-salt">+ Соль</button>
            </div>
            <div id="water-salts-list">
              ${waterAdditions.length === 0 ? '<p class="text-muted" style="font-size:12px">Нет добавок</p>' :
                waterAdditions.map((add, i) => `<div class="water-salt-row">
                  <select class="form-control water-salt-select" data-idx="${i}">
                    ${BREWING_SALTS.map(s => `<option value="${s.id}" ${s.id===add.salt?'selected':''}>${s.formula} — ${escHtml(s.name)}</option>`).join('')}
                  </select>
                  <input type="number" class="form-control water-salt-amount" data-idx="${i}" value="${escHtml(String(add.amount||''))}" step="0.1" placeholder="г" min="0">
                  <span class="text-muted" style="font-size:11px;white-space:nowrap">г</span>
                  <button type="button" class="btn btn-sm btn-danger btn-remove-salt" data-idx="${i}">✕</button>
                </div>`).join('')}
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
          <div class="text-muted" style="font-size:0.75em;text-align:center">ppm · ${waterVol} л затора</div>
        </div>
      </div>
    </div>

  </div><!-- /col 1 -->

  <!-- ── Col 2: Grain + Mash ───────────────────────────────────────────── -->
  <div class="recipe-editor-col">

    <div class="section-card" data-section="grain">
      <div class="section-card-header">
        <h4>🌾 Засыпь${totalGrainG > 0 ? `<span class="text-muted" style="font-weight:400;margin-left:6px">${(totalGrainG/1000).toFixed(2)} кг</span>` : ''}</h4>
      </div>
      <div class="section-card-body">
        <div class="form-grid">
          ${renderGrainRows(grains, totalGrainG)}
          <button type="button" class="btn btn-secondary btn-add-grain">+ Добавить солод</button>
        </div>
      </div>
    </div>

    <div class="section-card" data-section="mash">
      <div class="section-card-header">
        <h4 style="display:flex;align-items:center;gap:6px;flex:1;overflow:hidden">
          🌡 Затирание
          <select class="form-control mash-preset-select" style="font-size:10px;height:22px;padding:0 4px;min-width:0;flex:1">
            <option value="">— шаблон —</option>
            ${Object.entries(MASH_PRESETS).map(([k,p]) => `<option value="${k}">${escHtml(p.label)}</option>`).join('')}
          </select>
        </h4>
      </div>
      <div class="section-card-body">
        <div class="form-grid">
          <div id="mash-rests-list">${renderMashBlocks(mashRests)}</div>
          <button type="button" class="btn btn-secondary btn-add-mash-rest">+ Добавить паузу</button>
        </div>
      </div>
    </div>

  </div><!-- /col 2 -->

  <!-- ── Col 3: Boil + Fermentation + Packaging ────────────────────────── -->
  <div class="recipe-editor-col">

    <div class="section-card" data-section="boil">
      <div class="section-card-header"><h4>🔥 Кипячение & Хмель</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          <div class="form-row-3">
            ${formField('Кипячение (мин)', `<input type="number" name="boil_time_min" class="form-control" value="${escHtml(data.boil_time_min||'60')}" step="5">`)}
            ${formField('OG до кипа (SG)', `<input type="number" name="og_preboil" class="form-control" value="${escHtml(data.og_preboil||'')}" step="0.001" min="1" max="1.2" placeholder="1.055">`)}
            ${formField('pH до кипа', `<input type="number" name="ph_preboil" class="form-control" value="${escHtml(data.ph_preboil||'')}" step="0.1" min="4" max="8" placeholder="5.4">`)}
          </div>
          <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px;margin:4px 0 2px">Хмель — кипячение</div>
          ${renderHopRows(boilHops, 'boil', data.boil_time_min, og, batchVol)}
          <button type="button" class="btn btn-secondary btn-add-boil-hop">+ Добавить хмель</button>
          <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px">Вирпул</div>
            <div class="form-row-2" style="margin-bottom:4px">
              ${formField('Темп. вирпула (°C)', `<input type="number" name="whirlpool_temp_c" class="form-control" value="${escHtml(data.whirlpool_temp_c||'85')}" step="1">`)}
              ${formField('Время вирпула (мин)', `<input type="number" name="whirlpool_time_min" class="form-control" value="${escHtml(data.whirlpool_time_min||'20')}" step="5">`)}
            </div>
            ${renderHopRows(whirlpool, 'whirlpool', data.whirlpool_time_min, og, batchVol, true)}
            <button type="button" class="btn btn-secondary btn-add-whirlpool">+ Добавить в вирпул</button>
          </div>
        </div>
      </div>
    </div>

    <div class="section-card" data-section="fermentation">
      <div class="section-card-header"><h4>🧬 Брожение</h4></div>
      <div class="section-card-body">
        <div class="form-grid">
          ${formField('Дрожжи', `
            <select class="form-control" id="yeast-select">
              <option value="">— не выбраны —</option>
              ${yeastComps.map(c => `<option value="${escHtml(c.id)}" ${currentYeastComp?.id===c.id?'selected':''}>${escHtml(c.name)}${c.attenuation?` (${c.attenuation}%)`:''}</option>`).join('')}
            </select>
          `)}
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Температура (°C)${currentYeastComp?.ferment_temp_min&&currentYeastComp?.ferment_temp_max?`<span class="text-muted" style="font-weight:400;margin-left:4px">${currentYeastComp.ferment_temp_min}–${currentYeastComp.ferment_temp_max}°C</span>`:''}</label>
              <input type="number" name="ferment_temp_c" class="form-control" value="${escHtml(data.ferment_temp_c||'18')}" step="0.5">
            </div>
            <div class="form-group">
              <label class="form-label">Дней брожения${currentYeastComp?.ferment_days_typical?`<span class="text-muted" style="font-weight:400;margin-left:4px">~${currentYeastComp.ferment_days_typical}</span>`:''}</label>
              <input type="number" name="ferment_days" class="form-control" value="${escHtml(data.ferment_days||'14')}" step="1">
            </div>
          </div>
          <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px;margin:2px 0">Добавки к брожению</div>
          ${renderIngredientList(fermentItems.filter(i => { const c = components.find(c => c.id === i.component_id); return !c || c.type !== 'yeast'; }), 'fermentation', ['additive','salt'])}
          <button type="button" class="btn btn-secondary btn-add-ferment-additive">+ Добавить добавку</button>
          <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px;margin:4px 0 2px">Сухое охмеление</div>
          ${renderIngredientList(dryHops, 'dry_hop', ['hop'])}
          <button type="button" class="btn btn-secondary btn-add-dry-hop">+ Сухой хмель</button>
        </div>
      </div>
    </div>

    <div class="section-card" data-section="packaging">
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

  // Mobile tab bar
  const activeTabEl = data._activeTab || 'overview';
  container.querySelectorAll('.rmt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      data._activeTab = tab;
      container.querySelectorAll('.rmt-tab').forEach(b => b.classList.toggle('active', b === btn));
      container.querySelector('.recipe-editor-grid')?.setAttribute('data-active-tab', tab);
    });
  });
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
    <div class="mash-rest-row" data-type="${escHtml(r.rest_type||'rest')}">
      <input type="text" class="form-control mash-rest-field" data-idx="${i}" data-field="name" value="${escHtml(r.name||'Осахаривание')}" placeholder="Название">
      <input type="number" class="form-control mash-rest-field" data-idx="${i}" data-field="temp_c" value="${escHtml(r.temp_c||'65')}" placeholder="°C" style="width:70px">
      <input type="number" class="form-control mash-rest-field" data-idx="${i}" data-field="duration_min" value="${escHtml(r.duration_min||'60')}" placeholder="мин" style="width:65px">
      <select class="form-control mash-rest-field" data-idx="${i}" data-field="rest_type" style="width:110px">
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
        <select class="form-control ingredient-comp" data-id="${escHtml(ing.id)}" data-stage="${stageKey}" style="flex:2">
          ${filteredComponents.map(c => `<option value="${c.id}" ${c.id===ing.component_id?'selected':''}>${escHtml(c.name)}</option>`).join('')}
        </select>
        <input type="number" class="form-control ingredient-qty" data-id="${escHtml(ing.id)}" data-stage="${stageKey}"
          value="${escHtml(ing.qty||'')}" placeholder="Кол-во" step="any" style="width:90px">
        <span class="ingredient-unit text-muted" style="min-width:28px;font-size:0.85em">${escHtml(unit)}</span>
        ${stageKey === 'boil' || stageKey === 'dry_hop' ? `<input type="number" class="form-control ingredient-time" data-id="${escHtml(ing.id)}" data-stage="${stageKey}" value="${escHtml(ing.time_meta||'')}" placeholder="${stageKey==='boil'?'мин':'день'}" style="width:80px">` : ''}
        <button type="button" class="btn btn-sm btn-danger btn-remove-ingredient" data-id="${escHtml(ing.id)}" data-stage="${stageKey}">✕</button>
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

function addIngredientFiltered(stageKey, ingredientsArr, refresh, allowedTypes) {
  const filtered = components.filter(c => c.is_active !== 'FALSE' && allowedTypes.includes(c.type));
  if (!filtered.length) { showToast('Нет подходящих компонентов. Добавьте их в Компоненты.', 'warning'); return; }
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
