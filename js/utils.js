// Bood CRM — Utilities & Business Logic

export const TYPE_COLORS = {
  malt:           '#D97706',
  hop:            '#059669',
  yeast:          '#7C3AED',
  additive:       '#2563EB',
  salt:           '#0891B2',
  packaging:      '#6B7280',
  equipment:      '#475569',
  grain_distill:  '#92400E',
  sugar:          '#BE185D',
  fruit:          '#DC2626',
  finished_beer:  '#D4890A',
  finished_spirit:'#B5622A',
  other:          '#374151',
};

export const STATUS_COLORS = {
  planned:    '#6B7280',
  brewing:    '#2563EB',
  fermenting: '#7C3AED',
  distilling: '#B5622A',
  aging:      '#92400E',
  packaging:  '#D97706',
  done:       '#059669',
  archived:   '#374151',
};

export const MOVEMENT_COLORS = {
  purchase:           '#059669',
  brew_consume:       '#D97706',
  distill_consume:    '#B5622A',
  packaging_consume:  '#6B7280',
  packaging_produce:  '#2563EB',
  sale_out:           '#F44336',
  gift_out:           '#9C27B0',
  return_in:          '#4CAF50',
  adjustment:         '#9A8F7E',
  deposit:            '#059669',
  sale_charge:        '#F44336',
  refund:             '#4CAF50',
  purchase_expense:   '#B5622A',
  equipment_purchase: '#7C3AED',
  equipment_sale:     '#059669',
};

// ─── Unit helpers ─────────────────────────────────────────────────────────────
// Convert qty to grams (solids) or ml (liquids) for physics calculations
export function toGrams(qty, unit) {
  const n = parseFloat(qty) || 0;
  switch (unit) {
    case 'кг': return n * 1000;
    case 'г':  return n;
    case 'л':  return n * 1000;
    case 'мл': return n;
    default:   return n;
  }
}

// Returns effective price per unit: last purchase → component.cost_per_unit → null
// source: 'purchase' | 'reference' | 'none'
export function getEffectivePrice(componentId, inventory, components) {
  const purchases = (inventory || [])
    .filter(m => m.component_id === componentId && m.movement_type === 'purchase' && parseFloat(m.unit_cost) > 0)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (purchases.length > 0) {
    return { price: parseFloat(purchases[0].unit_cost), source: 'purchase' };
  }
  const comp = (components || []).find(c => c.id === componentId);
  if (comp?.cost_per_unit && parseFloat(comp.cost_per_unit) > 0) {
    return { price: parseFloat(comp.cost_per_unit), source: 'reference' };
  }
  return { price: null, source: 'none' };
}

// ─── Calculations ──────────────────────────────────────────────────────────────
export function calcABV(og, fg) {
  if (!og || !fg) return 0;
  return ((parseFloat(og) - parseFloat(fg)) * 131.25).toFixed(2);
}

export function calcIBU(hops) {
  // Tinseth formula simplified
  return hops.reduce((sum, hop) => {
    const aa = parseFloat(hop.alpha_acid || 0) / 100;
    const grams = toGrams(hop.qty || 0, hop._unit || 'г');
    const time = parseFloat(hop.time_meta || 0); // minutes
    const og = 1.050; // placeholder
    const utilization = (1 - Math.exp(-0.04 * time)) / 4.15;
    const bignessFactor = 1.65 * Math.pow(0.000125, og - 1);
    return sum + (aa * grams * 1000 * bignessFactor * utilization);
  }, 0).toFixed(1);
}

export function calcEstimatedOG(grains, batchSizeL) {
  // PPG method
  if (!batchSizeL || batchSizeL <= 0) return 0;
  const totalPoints = grains.reduce((sum, g) => {
    const ppg = (parseFloat(g.attenuation || 75) / 100) * 46; // rough PPG from extract
    const kg = toGrams(g.qty || 0, g._unit || 'г') / 1000;
    return sum + (ppg * kg * 2.2046); // convert to PPG·lbs
  }, 0);
  const gallons = batchSizeL / 3.785;
  const points = gallons > 0 ? totalPoints / gallons : 0;
  return (1 + points / 1000).toFixed(3);
}

export function calcOnHand(inventory, componentId) {
  return inventory
    .filter(r => r.component_id === componentId)
    .reduce((sum, r) => sum + parseFloat(r.qty_delta || 0), 0);
}

export function calcCustomerBalance(moneyLedger, customerId) {
  return moneyLedger
    .filter(r => r.customer_id === customerId)
    .reduce((sum, r) => sum + parseFloat(r.amount_signed || 0), 0);
}

export function calcCOGS(batch, inventoryMovements, settings) {
  const batchMovements = inventoryMovements.filter(m => m.ref_id === batch.id);
  const materials = batchMovements
    .filter(m => ['brew_consume','distill_consume'].includes(m.movement_type))
    .reduce((sum, m) => sum + Math.abs(parseFloat(m.qty_delta || 0) * parseFloat(m.unit_cost || 0)), 0);
  const packaging = batchMovements
    .filter(m => m.movement_type === 'packaging_consume')
    .reduce((sum, m) => sum + Math.abs(parseFloat(m.qty_delta || 0) * parseFloat(m.unit_cost || 0)), 0);
  const energy = (parseFloat(batch.kwh_used) || 0) * parseFloat(settings.electricity_cost_kwh || 6.5);
  const labor = (parseFloat(batch.labor_hours) || 0) * parseFloat(settings.labor_rate_hour || 300);
  const total = materials + packaging + energy + labor;
  return { materials, packaging, energy, labor, total };
}

// ─── Formatting ────────────────────────────────────────────────────────────────
export function formatCurrency(amount, currency = 'RUB') {
  const n = parseFloat(amount) || 0;
  if (currency === 'RUB') return n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatQty(qty, unit = '') {
  const n = parseFloat(qty) || 0;
  if (unit === 'г' || unit === 'g') {
    if (Math.abs(n) >= 1000) return `${(n/1000).toFixed(n % 1000 === 0 ? 0 : 2)} кг`;
    return `${n.toLocaleString()} г`;
  }
  if (unit === 'мл' || unit === 'ml') {
    if (Math.abs(n) >= 1000) return `${(n/1000).toFixed(n % 1000 === 0 ? 0 : 2)} л`;
    return `${n.toLocaleString()} мл`;
  }
  return `${n.toLocaleString()} ${unit}`.trim();
}

export function formatNumber(n, decimals = 2) {
  return (parseFloat(n) || 0).toFixed(decimals);
}

export function formatGravity(g) {
  const n = parseFloat(g);
  if (!n) return '—';
  return n.toFixed(3);
}

// ─── Auto-steps generator for beer ───────────────────────────────────────────
// Returns [{text, indent}] — indent=true for sub-items (→ prefix, no counter).
// saltData: [{name, mashG, spargeG}] — salt amounts split by mash/sparge fraction.
export function generateBeerSteps(recipe, ingredients, mashRests, saltData = []) {
  const items = [];
  const add  = (text) => items.push({ text, indent: false });
  const sub  = (text) => items.push({ text, indent: true });

  const waterMash    = parseFloat(recipe.water_mash_l)    || 0;
  const waterSparge  = parseFloat(recipe.water_sparge_l)   || 0;
  const boilTime     = parseInt(recipe.boil_time_min)      || 60;
  const preboilL     = parseFloat(recipe.water_total_l)    || 0;
  const afterBoilL   = parseFloat(recipe.after_boil_l)     || 0;
  const fermenterL   = parseFloat(recipe.fermenter_l)      || 0;

  const grains      = ingredients.filter(i => i.stage_key === 'mash');
  const boilHops    = ingredients.filter(i => i.stage_key === 'boil').sort((a, b) => parseFloat(b.time_meta||0) - parseFloat(a.time_meta||0));
  const whirlItems  = ingredients.filter(i => i.stage_key === 'whirlpool');
  const ferItems    = ingredients.filter(i => i.stage_key === 'fermentation');
  const dryHops     = ingredients.filter(i => i.stage_key === 'dry_hop');

  const mashSalts   = saltData.filter(s => s.mashG > 0);
  const spargeSalts = saltData.filter(s => s.spargeG > 0);

  // 1. Нагреть воду + соли затора
  if (mashRests.length) {
    const first = mashRests[0];
    const phHint = recipe.ph_target ? `, pH ${recipe.ph_target}` : '';
    add(`Нагреть воду: ${waterMash} л до ${parseFloat(first.temp_c) + 2}°C${phHint}`);
    mashSalts.forEach(s => sub(`${s.name}: ${s.mashG} г`));
  } else if (waterMash) {
    const phHint = recipe.ph_target ? `, pH ${recipe.ph_target}` : '';
    add(`Нагреть воду: ${waterMash} л${phHint}`);
    mashSalts.forEach(s => sub(`${s.name}: ${s.mashG} г`));
  }

  // 2. Засыпь
  if (grains.length) {
    add('Засыпь');
    grains.forEach(g => sub(`${g._name || g.component_id}: ${g.qty} г`));
  }

  // 3. Паузы затирания
  mashRests.forEach(rest => add(`Пауза «${rest.name}»: ${rest.temp_c}°C, ${rest.duration_min} мин`));

  // 4. Промывка + соли промывки
  if (waterSparge) {
    add(`Промывка: ${waterSparge} л при 76°C`);
    spargeSalts.forEach(s => sub(`${s.name}: ${s.spargeG} г`));
  }

  // 5. Кипячение (с литражами до/после)
  const boilParts = [`${boilTime} мин`];
  if (preboilL)          boilParts.push(`до кипа: ${preboilL} л`);
  if (afterBoilL)        boilParts.push(`после: ${afterBoilL} л`);
  if (recipe.og_preboil) boilParts.push(`OG до кипа: ${recipe.og_preboil}`);
  if (recipe.ph_preboil) boilParts.push(`pH до кипа: ${recipe.ph_preboil}`);
  add(`Кипячение ${boilParts.join(', ')}`);
  boilHops.forEach(h => sub(`${h._name || h.component_id}: ${h.qty} г — за ${h.time_meta} мин до конца`));

  // 5. Вирпул
  if (whirlItems.length) {
    const wtemp = recipe.whirlpool_temp_c    ? ` при ${recipe.whirlpool_temp_c}°C`     : '';
    const wtime = recipe.whirlpool_time_min  ? `, ${recipe.whirlpool_time_min} мин`    : '';
    add(`Вирпул${wtemp}${wtime}`);
    whirlItems.forEach(h => sub(`${h._name || h.component_id}: ${h.qty} г`));
  }

  // 6. Охлаждение + внесение в ферментёр
  if (recipe.ferment_temp_c || fermenterL) {
    const tempPart = recipe.ferment_temp_c ? `Охлаждение до ${recipe.ferment_temp_c}°C` : 'Охлаждение';
    const fermPart = fermenterL ? `, внести в ферментёр (${fermenterL} л)` : '';
    add(`${tempPart}${fermPart}`);
  }

  // 7. Брожение / дрожжи
  if (ferItems.length) {
    const yeast = ferItems[0];
    const days  = recipe.ferment_days;
    let text = `Брожение: ${yeast._name || yeast.component_id}`;
    if (yeast.qty) text += ` ${yeast.qty}`;
    if (days) text += `, ${days} дней`;
    if (recipe.ferment_temp_c) text += ` при ${recipe.ferment_temp_c}°C`;
    add(text);
    ferItems.slice(1).forEach(i => sub(`${i._name || i.component_id}: ${i.qty}`));
  } else if (recipe.ferment_days) {
    add(`Брожение: ${recipe.ferment_days} дней при ${recipe.ferment_temp_c || '?'}°C`);
  }

  // 8. Сухое охмеление
  if (dryHops.length) {
    add('Сухое охмеление');
    dryHops.forEach(h => {
      const day = h.time_meta ? ` (день ${h.time_meta})` : '';
      sub(`${h._name || h.component_id}: ${h.qty} г${day}`);
    });
  }

  // 9. Заметки
  if (recipe.manual_notes && recipe.manual_notes.trim()) {
    add(`Заметки: ${recipe.manual_notes.trim()}`);
  }

  return items;
}

export function generateSpiritSteps(recipe, ingredients) {
  const items = [];
  const add = (text) => items.push({ text, indent: false });
  const sub = (text) => items.push({ text, indent: true });
  const washItems = ingredients.filter(i => i.stage_key === 'wash' || i.stage_key === 'mash');
  add(`Подготовить брагу (${recipe.batch_size_l || '?'} л)`);
  washItems.forEach(i => sub(`${i._name || i.component_id}: ${i.qty} ${i._unit || ''}`));
  add(`Брожение при ${recipe.ferment_temp_c || '?'}°C, ${recipe.ferment_days || '?'} дней`);
  add('Первый перегон');
  add('Второй перегон: отбор голов, тела, хвостов');
  add('Разбавление до конечной крепости');
  add('Выдержка (если требуется)');
  add('Фильтрация');
  add('Розлив');
  return items;
}

// ─── Misc ──────────────────────────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export function thisMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function dateInputValue(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
