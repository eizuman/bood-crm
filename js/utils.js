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
  return_in:          '#4CAF50',
  adjustment:         '#9A8F7E',
  deposit:            '#059669',
  sale_charge:        '#F44336',
  refund:             '#4CAF50',
  purchase_expense:   '#B5622A',
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
  if (currency === 'RUB') return n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { style: 'currency', currency: currency || 'USD' });
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
export function generateBeerSteps(recipe, ingredients, mashRests) {
  const steps = [];
  const waterMash = parseFloat(recipe.water_mash_l) || 0;
  const waterSparge = parseFloat(recipe.water_sparge_l) || 0;
  const boilTime = parseInt(recipe.boil_time_min) || 60;

  const grains = ingredients.filter(i => ['mash'].includes(i.stage_key));
  const boilHops = ingredients.filter(i => i.stage_key === 'boil').sort((a,b) => parseFloat(b.time_meta||0) - parseFloat(a.time_meta||0));
  const whirlpoolItems = ingredients.filter(i => i.stage_key === 'whirlpool');
  const fermentItems = ingredients.filter(i => ['fermentation','dry_hop'].includes(i.stage_key));
  const packItems = ingredients.filter(i => i.stage_key === 'packaging');

  if (mashRests.length) {
    const firstRest = mashRests[0];
    steps.push(`1. Нагреть ${waterMash} л воды до ${parseFloat(firstRest.temp_c)+2}°C (с учётом теплопотерь)`);
    mashRests.forEach((rest, i) => {
      steps.push(`${i+2}. Пауза: ${rest.name} — ${rest.temp_c}°C, ${rest.duration_min} мин`);
    });
    steps.push(`${mashRests.length+2}. Промывка: ${waterSparge} л воды при 76°C`);
    steps.push(`${mashRests.length+3}. Довести до кипения`);
  } else {
    steps.push(`1. Нагреть ${waterMash} л воды, затирание`);
    steps.push(`2. Промывка: ${waterSparge} л`);
    steps.push(`3. Довести до кипения`);
  }

  let stepN = (mashRests.length || 1) + 3;
  steps.push(`${stepN++}. Кипячение ${boilTime} мин`);

  boilHops.forEach(h => {
    steps.push(`  → Хмель ${h._name||h.component_id}: ${h.qty} г за ${h.time_meta} мин до конца кипячения`);
  });

  if (whirlpoolItems.length) {
    steps.push(`${stepN++}. Вирпул`);
    whirlpoolItems.forEach(h => { steps.push(`  → ${h._name||h.component_id}: ${h.qty} г`); });
  }

  steps.push(`${stepN++}. Охлаждение до ${recipe.ferment_temp_c || 18}°C`);
  steps.push(`${stepN++}. Внесение в ферментёр (${recipe.fermenter_l || '?'} л)`);

  const yeast = fermentItems.find(i => i._type === 'yeast' || i.stage_key === 'fermentation');
  if (yeast) steps.push(`${stepN++}. Внести дрожжи: ${yeast._name||yeast.component_id} ${yeast.qty}`);

  const dryHops = fermentItems.filter(i => i.stage_key === 'dry_hop');
  dryHops.forEach(h => {
    steps.push(`${stepN++}. Сухое охмеление (день ${h.time_meta||'?'}): ${h._name||h.component_id} ${h.qty} г`);
  });

  steps.push(`${stepN++}. Упаковка через ${recipe.ferment_days || '?'} дней`);

  if (packItems.length) {
    steps.push(`${stepN++}. Упаковочные материалы:`);
    packItems.forEach(p => { steps.push(`  → ${p._name||p.component_id}: ${p.qty}`); });
  }

  return steps;
}

export function generateSpiritSteps(recipe, ingredients) {
  const steps = [];
  let n = 1;
  const washItems = ingredients.filter(i => i.stage_key === 'wash' || i.stage_key === 'mash');
  steps.push(`${n++}. Подготовить брагу (${recipe.batch_size_l || '?'} л):`);
  washItems.forEach(i => { steps.push(`  → ${i._name||i.component_id}: ${i.qty} ${i._unit||''}`); });
  steps.push(`${n++}. Брожение при ${recipe.ferment_temp_c || '?'}°C, ${recipe.ferment_days || '?'} дней`);
  steps.push(`${n++}. Первый перегон`);
  steps.push(`${n++}. Второй перегон: отбор голов, тела, хвостов`);
  steps.push(`${n++}. Разбавление до конечной крепости`);
  steps.push(`${n++}. Выдержка (если требуется)`);
  steps.push(`${n++}. Фильтрация`);
  steps.push(`${n++}. Розлив`);
  return steps;
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
