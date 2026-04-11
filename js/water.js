// Bood CRM — Water Chemistry Data

// ─── Brewing salts (ion contribution in mg per gram of salt) ─────────────────
export const BREWING_SALTS = [
  { id: 'gypsum',  name: 'Гипс',            formula: 'CaSO₄·2H₂O', ions: { ca: 61.5, so4: 147.4 } },
  { id: 'cacl2',   name: 'Хлорид кальция',   formula: 'CaCl₂',       ions: { ca: 272.6, cl: 482.6 } },
  { id: 'epsom',   name: 'Эпсомит',          formula: 'MgSO₄·7H₂O', ions: { mg: 98.6, so4: 394.3 } },
  { id: 'nacl',    name: 'Поваренная соль',   formula: 'NaCl',         ions: { na: 393.4, cl: 606.6 } },
  { id: 'nahco3',  name: 'Сода пищевая',      formula: 'NaHCO₃',      ions: { na: 274.2, hco3: 725.8 } },
  { id: 'caco3',   name: 'Мел',               formula: 'CaCO₃',       ions: { ca: 400.4, hco3: 599.6 } },
  { id: 'mgcl2',   name: 'Хлорид магния',     formula: 'MgCl₂·6H₂O', ions: { mg: 119.6, cl: 348.9 } },
];

// ─── Classic water profiles ──────────────────────────────────────────────────
// All values in ppm (mg/L). ph_target for mash.
// additions_per_10l: typical salt additions in g per 10L to approximate profile from RO water.
export const WATER_PROFILES = {
  ro: {
    name: 'Дистиллят / RO',
    ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0,
    ph_target: '5.4',
    additions_per_10l: {},
    styles: [],
  },
  pilsner: {
    name: 'Пльзень (мягкая)',
    ca: 7, mg: 3, na: 2, so4: 5, cl: 5, hco3: 25,
    ph_target: '5.4',
    additions_per_10l: { gypsum: 0.3, cacl2: 0.3 },
    styles: ['lager', 'pilsner', 'pale lager', 'helles'],
  },
  munich: {
    name: 'Мюнхен',
    ca: 77, mg: 17, na: 1, so4: 18, cl: 8, hco3: 295,
    ph_target: '5.5',
    additions_per_10l: { cacl2: 0.3, caco3: 2.5 },
    styles: ['dunkel', 'weizen', 'bock', 'doppelbock', 'wheat'],
  },
  vienna: {
    name: 'Вена',
    ca: 75, mg: 15, na: 10, so4: 60, cl: 15, hco3: 145,
    ph_target: '5.4',
    additions_per_10l: { gypsum: 0.8, cacl2: 0.5, nahco3: 0.5 },
    styles: ['vienna', 'märzen', 'festbier', 'amber lager'],
  },
  balanced: {
    name: 'Сбалансированная',
    ca: 75, mg: 10, na: 10, so4: 100, cl: 75, hco3: 50,
    ph_target: '5.3',
    additions_per_10l: { gypsum: 1.5, cacl2: 1.0, nacl: 0.3 },
    styles: ['pale ale', 'amber ale', 'cream ale', 'kolsch'],
  },
  burton: {
    name: 'Бёртон (горькая)',
    ca: 275, mg: 40, na: 25, so4: 610, cl: 36, hco3: 270,
    ph_target: '5.2',
    additions_per_10l: { gypsum: 9.0, cacl2: 0.5, nacl: 0.4, nahco3: 1.0 },
    styles: ['ipa', 'bitter', 'english ipa', 'pale ale', 'strong bitter'],
  },
  london: {
    name: 'Лондон',
    ca: 52, mg: 32, na: 86, so4: 32, cl: 34, hco3: 104,
    ph_target: '5.4',
    additions_per_10l: { cacl2: 0.8, nacl: 1.4, nahco3: 0.8 },
    styles: ['brown ale', 'porter', 'english porter', 'brown british'],
  },
  dublin: {
    name: 'Дублин (стаут)',
    ca: 119, mg: 4, na: 12, so4: 54, cl: 19, hco3: 315,
    ph_target: '5.5',
    additions_per_10l: { cacl2: 0.3, nacl: 0.4, caco3: 4.5 },
    styles: ['stout', 'porter', 'dry stout', 'imperial stout'],
  },
};

// ─── Suggest water profile for a BJCP style name ────────────────────────────
export function getStyleWaterProfile(styleName) {
  if (!styleName) return null;
  const name = styleName.toLowerCase();
  for (const [key, profile] of Object.entries(WATER_PROFILES)) {
    if (key === 'ro') continue;
    if (profile.styles.some(s => name.includes(s))) return key;
  }
  // Category fallbacks
  if (name.includes('lager') || name.includes('pilsner') || name.includes('helles')) return 'pilsner';
  if (name.includes('ipa') || name.includes('bitter')) return 'burton';
  if (name.includes('stout') || name.includes('porter')) return 'dublin';
  if (name.includes('wheat') || name.includes('weizen') || name.includes('dunkel') || name.includes('bock')) return 'munich';
  if (name.includes('vienna') || name.includes('märzen') || name.includes('rauch')) return 'vienna';
  return 'balanced';
}

// ─── Default brew system parameters ─────────────────────────────────────────
export const DEFAULT_BREW_PARAMS = {
  system_efficiency:  72,
  grain_absorption:   1.0,
  boiloff_rate_pct:   10,
  wort_shrinkage_pct: 4,
  kettle_loss_l:      1.5,
  fermenter_loss_l:   1.0,
};

// ─── Volume chain: packaged_l → fermenter_l → batch_size_l → preboil_l ───────
// params: object matching DEFAULT_BREW_PARAMS shape (keys optional, defaults applied)
// boil_time_min: boil duration; grain_kg: total grain for absorption calc
export function calcBrewWater(packaged_l, params = {}, boil_time_min = 60, grain_kg = 0) {
  const p = { ...DEFAULT_BREW_PARAMS, ...params };
  const pack       = parseFloat(packaged_l) || 0;
  const fermenter  = pack + parseFloat(p.fermenter_loss_l);
  const batch      = fermenter + parseFloat(p.kettle_loss_l);
  const shrink     = parseFloat(p.wort_shrinkage_pct) / 100;
  const postShrink = batch / (1 - shrink);
  const hours      = parseFloat(boil_time_min) / 60;
  const boiloff    = parseFloat(p.boiloff_rate_pct) / 100;
  const preboil    = postShrink / (1 - boiloff * hours);
  const grainAbs   = parseFloat(grain_kg) * parseFloat(p.grain_absorption);
  return {
    packaged_l:  Math.round(pack       * 10) / 10,
    fermenter_l: Math.round(fermenter  * 10) / 10,
    batch_size_l:Math.round(batch      * 10) / 10,
    preboil_l:   Math.round(preboil    * 10) / 10,
    total_l:     Math.round((preboil + grainAbs) * 10) / 10,
  };
}

// ─── Tinseth IBU formula ──────────────────────────────────────────────────────
// grams: hop weight (g), aa: alpha acid % (e.g. 6.5), time_min: boil minutes,
// og: wort OG (e.g. 1.050), vol_l: batch volume (litres, post-boil)
export function calcIBUTinseth(grams, aa, time_min, og, vol_l) {
  const g  = parseFloat(grams)    || 0;
  const a  = (parseFloat(aa)      || 0) / 100;
  const t  = parseFloat(time_min) || 0;
  const OG = parseFloat(og)       || 1.050;
  const L  = parseFloat(vol_l)    || 20;
  if (!g || !a || !t) return 0;
  const bigness = 1.65 * Math.pow(0.000125, OG - 1);
  const util    = (1 - Math.exp(-0.04 * t)) / 4.15;
  return Math.round(((g / 28.35) * a * bigness * util * 74.89 / (L / 3.785)) * 10) / 10;
}

// ─── Morey EBC formula ────────────────────────────────────────────────────────
// grains: [{qty_g, ebc}], vol_l: batch volume in litres
export function calcEBC(grains, vol_l) {
  const L = parseFloat(vol_l) || 20;
  if (!grains.length || !L) return 0;
  const gal = L / 3.785;
  let mcu = 0;
  for (const g of grains) {
    const lb  = (parseFloat(g.qty_g) || 0) / 453.59;
    const srm = (parseFloat(g.ebc)   || 0) / 1.97;
    mcu += (lb * srm) / gal;
  }
  return Math.round(1.4922 * Math.pow(Math.max(0, mcu), 0.6859) * 1.97);
}

// ─── Heuristic salt solver: ion targets (ppm) → suggested salt additions ─────
// targets: { ca, mg, na, so4, cl, hco3 } in ppm
export function solveSaltsFromIons(targets, volumeL) {
  const vol = parseFloat(volumeL) || 10;
  const rem = { ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0, ...targets };
  Object.keys(rem).forEach(k => { rem[k] = parseFloat(rem[k]) || 0; });
  const additions = [];

  function addSalt(id, ionKey) {
    const salt = BREWING_SALTS.find(s => s.id === id);
    if (!salt || rem[ionKey] <= 0) return;
    const g = Math.max(0, (rem[ionKey] * vol) / salt.ions[ionKey]);
    if (g < 0.01) return;
    additions.push({ salt: id, amount: Math.round(g * 10) / 10 });
    Object.entries(salt.ions).forEach(([ion, mg_per_g]) => { rem[ion] -= (g * mg_per_g) / vol; });
  }

  addSalt('epsom',  'mg');   // Mg → MgSO₄
  addSalt('gypsum', 'so4'); // SO₄ → CaSO₄
  addSalt('cacl2',  'ca');  // Ca → CaCl₂
  addSalt('nahco3', 'hco3');// HCO₃ → NaHCO₃
  addSalt('nacl',   'na');  // Na → NaCl
  return additions;
}

// ─── Compute resulting water ion profile (ppm) from salt additions ───────────
// additions: [{salt: 'gypsum', amount: 2.5}, ...]  (amount in grams)
// volumeL: mash water volume in litres
export function calcWaterProfile(additions, volumeL) {
  const vol = parseFloat(volumeL) || 1;
  const ions = { ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0 };
  for (const add of additions) {
    const salt = BREWING_SALTS.find(s => s.id === add.salt);
    if (!salt) continue;
    const g = parseFloat(add.amount) || 0;
    for (const [ion, mg_per_g] of Object.entries(salt.ions)) {
      ions[ion] = (ions[ion] || 0) + (g * mg_per_g) / vol;
    }
  }
  return ions; // ppm (mg/L)
}
