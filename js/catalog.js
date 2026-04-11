// Bood CRM — Standard ingredients catalog
import { getRows, appendRows, appendRow, genId, now } from './sheets.js';

export const SUPPORTED_COUNTRIES = [
  { code: 'RU', label: 'Россия (РФ)' },
];

// Prices: cost_per_unit in rubles per unit (г, шт, кг)
// Malt/hops/salts: unit = 'г', price per gram
// Yeast: unit = 'шт', price per pack
// Sugar/grain bulk: unit = 'кг', price per kg
const CATALOG = {
  RU: [
    // ── Базовые солоды ─────────────────────────────────────────────────────
    { name: 'Pilsner Malt', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '3', attenuation: '80', notes: 'Базовый пилснерный солод' },
    { name: 'Pale Ale Malt', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '7', attenuation: '78', notes: 'Базовый пейл-эль солод' },
    { name: 'Maris Otter', type: 'malt', unit: 'г', cost_per_unit: '0.13', ebc: '6', attenuation: '81', notes: 'Английский базовый солод' },
    { name: 'Венский солод (Vienna)', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '8', attenuation: '78', notes: 'Мальтовый, хлебный вкус' },
    { name: 'Мюнхенский солод (Munich)', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '17', attenuation: '76', notes: 'Насыщенный хлебный вкус' },
    { name: 'Пшеничный солод (Wheat)', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '4', attenuation: '82', notes: 'Для пшеничных сортов' },
    { name: 'Ржаной солод (Rye)', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '8', attenuation: '75', notes: 'Пряный, землистый вкус' },
    { name: 'Овсяный солод (Oat)', type: 'malt', unit: 'г', cost_per_unit: '0.13', ebc: '3', attenuation: '70', notes: 'Кремовая текстура, полное тело' },
    { name: 'Ячменный солод (Barley)', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '4', attenuation: '78', notes: 'Универсальный базовый' },

    // ── Специальные солоды ─────────────────────────────────────────────────
    { name: 'Карамельный 15L (Crystal 15)', type: 'malt', unit: 'г', cost_per_unit: '0.15', ebc: '30', attenuation: '73', notes: 'Лёгкая карамельность' },
    { name: 'Карамельный 40L (Crystal 40)', type: 'malt', unit: 'г', cost_per_unit: '0.15', ebc: '80', attenuation: '73', notes: 'Карамель, мёд' },
    { name: 'Карамельный 60L (Crystal 60)', type: 'malt', unit: 'г', cost_per_unit: '0.16', ebc: '120', attenuation: '73', notes: 'Насыщенная карамель' },
    { name: 'Карамельный 80L (Crystal 80)', type: 'malt', unit: 'г', cost_per_unit: '0.16', ebc: '160', attenuation: '73', notes: 'Изюм, карамель, сливы' },
    { name: 'Карамельный 120L (Crystal 120)', type: 'malt', unit: 'г', cost_per_unit: '0.17', ebc: '240', attenuation: '73', notes: 'Тёмная карамель, изюм' },
    { name: 'Меланоидиновый (Melanoidin)', type: 'malt', unit: 'г', cost_per_unit: '0.16', ebc: '60', attenuation: '74', notes: 'Мёд, карамель, насыщенное тело' },
    { name: 'Бисквитный (Biscuit)', type: 'malt', unit: 'г', cost_per_unit: '0.17', ebc: '50', attenuation: '72', notes: 'Хлеб, бисквит, орехи' },
    { name: 'Шоколадный (Chocolate Malt)', type: 'malt', unit: 'г', cost_per_unit: '0.20', ebc: '900', attenuation: '60', notes: 'Шоколад, кофе, орехи' },
    { name: 'Чёрный (Black Patent)', type: 'malt', unit: 'г', cost_per_unit: '0.20', ebc: '1300', attenuation: '55', notes: 'Жжёный, кофейный, горький' },
    { name: 'Жжёный ячмень (Roasted Barley)', type: 'malt', unit: 'г', cost_per_unit: '0.18', ebc: '1400', attenuation: '55', notes: 'Сухой стаут, кофе, горечь' },
    { name: 'Carafa Special II (Де-гуш.)', type: 'malt', unit: 'г', cost_per_unit: '0.22', ebc: '1100', attenuation: '55', notes: 'Мягкий тёмный цвет без горечи' },
    { name: 'Копчёный (Smoked Malt)', type: 'malt', unit: 'г', cost_per_unit: '0.20', ebc: '4', attenuation: '77', notes: 'Дымный, торфяной вкус' },
    { name: 'Acidulated Malt (Sauermalz)', type: 'malt', unit: 'г', cost_per_unit: '0.20', ebc: '4', attenuation: '78', notes: 'Подкисление затора, кислые сорта' },
    { name: 'Мюнхен Тёмный (Dark Munich)', type: 'malt', unit: 'г', cost_per_unit: '0.12', ebc: '30', attenuation: '74', notes: 'Тёмный хлеб, карамель' },
    { name: 'Хлопья ячменя (Flaked Barley)', type: 'malt', unit: 'г', cost_per_unit: '0.11', ebc: '4', attenuation: '70', notes: 'Плотность, пена, стауты' },
    { name: 'Хлопья овса (Flaked Oats)', type: 'malt', unit: 'г', cost_per_unit: '0.11', ebc: '2', attenuation: '65', notes: 'Кремовая текстура, овсяный стаут' },
    { name: 'Хлопья пшеницы (Flaked Wheat)', type: 'malt', unit: 'г', cost_per_unit: '0.11', ebc: '3', attenuation: '77', notes: 'Мутность, тело, вайцен' },
    { name: 'Декстриновый (Carapils/Dextrin)', type: 'malt', unit: 'г', cost_per_unit: '0.17', ebc: '4', attenuation: '68', notes: 'Пена, тело без цвета и вкуса' },

    // ── Хмель ─────────────────────────────────────────────────────────────
    { name: 'Cascade', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '6.5', notes: 'Цитрус, цветочный, грейпфрут' },
    { name: 'Centennial', type: 'hop', unit: 'г', cost_per_unit: '5.00', alpha_acid: '10.0', notes: 'Цитрус, цветочный, смола' },
    { name: 'Citra', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '12.0', notes: 'Лайм, тропические фрукты, цитрус' },
    { name: 'Simcoe', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '13.0', notes: 'Сосна, пассифрут, земля' },
    { name: 'Mosaic', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '12.5', notes: 'Тропики, ягоды, цитрус' },
    { name: 'Chinook', type: 'hop', unit: 'г', cost_per_unit: '4.50', alpha_acid: '13.0', notes: 'Смола, сосна, умеренный цитрус' },
    { name: 'Amarillo', type: 'hop', unit: 'г', cost_per_unit: '5.50', alpha_acid: '9.5', notes: 'Апельсин, грейпфрут, цветочный' },
    { name: 'Columbus (CTZ)', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '15.0', notes: 'Земля, смола, пряности' },
    { name: 'Galaxy', type: 'hop', unit: 'г', cost_per_unit: '6.50', alpha_acid: '14.0', notes: 'Пассифрут, цитрус, персик' },
    { name: 'El Dorado', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '15.0', notes: 'Тропики, дыня, груша' },
    { name: 'Idaho 7', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '14.0', notes: 'Тропики, чёрный чай, смородина' },
    { name: 'Ekuanot', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '14.5', notes: 'Перец, дыня, цитрус' },
    { name: 'Saaz (Жатецкий)', type: 'hop', unit: 'г', cost_per_unit: '3.50', alpha_acid: '3.5', notes: 'Пряный, землистый, травяной. Лагеры, пилснеры' },
    { name: 'Hallertau Mittelfrüh', type: 'hop', unit: 'г', cost_per_unit: '4.50', alpha_acid: '4.0', notes: 'Цветочный, мягкий, пряный' },
    { name: 'Tettnanger', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '4.5', notes: 'Пряный, земляной, цветочный' },
    { name: 'Fuggle', type: 'hop', unit: 'г', cost_per_unit: '3.50', alpha_acid: '4.5', notes: 'Земля, дерево, мягкая горечь. Английские сорта' },
    { name: 'East Kent Goldings (EKG)', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '5.0', notes: 'Мёд, цветочный, пряный. Английские эли' },
    { name: 'Magnum', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '12.0', notes: 'Чистая горечь, нейтральный аромат' },
    { name: 'Nugget', type: 'hop', unit: 'г', cost_per_unit: '3.50', alpha_acid: '12.0', notes: 'Смола, трава, умеренная горечь' },
    { name: 'Perle', type: 'hop', unit: 'г', cost_per_unit: '3.50', alpha_acid: '8.0', notes: 'Мята, цветочный, пряный' },
    { name: 'Willamette', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '5.0', notes: 'Земля, трава, цветочный' },

    // ── Дрожжи ────────────────────────────────────────────────────────────
    { name: 'Fermentis US-05', type: 'yeast', unit: 'шт', cost_per_unit: '280', attenuation: '81', notes: 'Американский эль, чистый. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
    { name: 'Fermentis S-04', type: 'yeast', unit: 'шт', cost_per_unit: '280', attenuation: '75', notes: 'Английский эль, фруктовый. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
    { name: 'Fermentis W-34/70', type: 'yeast', unit: 'шт', cost_per_unit: '280', attenuation: '82', notes: 'Классический лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
    { name: 'Fermentis BE-256 (Abbaye)', type: 'yeast', unit: 'шт', cost_per_unit: '320', attenuation: '81', notes: 'Бельгийский эль, фруктовый. 15-30°C', ferment_temp_min: '15', ferment_temp_max: '30', ferment_days_typical: '10' },
    { name: 'Fermentis K-97', type: 'yeast', unit: 'шт', cost_per_unit: '320', attenuation: '81', notes: 'Немецкий вайцен, банановый. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
    { name: 'Fermentis S-23', type: 'yeast', unit: 'шт', cost_per_unit: '280', attenuation: '82', notes: 'Западноевропейский лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
    { name: 'Lallemand Nottingham', type: 'yeast', unit: 'шт', cost_per_unit: '280', attenuation: '80', notes: 'Английский эль, нейтральный. 14-21°C', ferment_temp_min: '14', ferment_temp_max: '21', ferment_days_typical: '14' },
    { name: 'Lallemand BRY-97', type: 'yeast', unit: 'шт', cost_per_unit: '280', attenuation: '81', notes: 'Западный американский эль. 17-23°C', ferment_temp_min: '17', ferment_temp_max: '23', ferment_days_typical: '14' },
    { name: 'Mangrove Jack\'s M44', type: 'yeast', unit: 'шт', cost_per_unit: '320', attenuation: '80', notes: 'US West Coast IPA. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
    { name: 'Mangrove Jack\'s M47 (Belgian Abbey)', type: 'yeast', unit: 'шт', cost_per_unit: '320', attenuation: '72', notes: 'Бельгийский аббатский. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
    { name: 'Mangrove Jack\'s M42 (New World)', type: 'yeast', unit: 'шт', cost_per_unit: '320', attenuation: '80', notes: 'Универсальный эль, чистый. 16-22°C', ferment_temp_min: '16', ferment_temp_max: '22', ferment_days_typical: '14' },
    { name: 'Mangrove Jack\'s M29 (French Saison)', type: 'yeast', unit: 'шт', cost_per_unit: '320', attenuation: '83', notes: 'Сезон, пряный, сухой. 20-30°C', ferment_temp_min: '20', ferment_temp_max: '30', ferment_days_typical: '7' },

    // ── Соли и кислоты ────────────────────────────────────────────────────
    { name: 'Сульфат кальция (Гипс, CaSO₄)', type: 'salt', unit: 'г', cost_per_unit: '0.50', notes: 'Повышает жёсткость, подчёркивает горечь' },
    { name: 'Хлорид кальция (CaCl₂)', type: 'salt', unit: 'г', cost_per_unit: '0.50', notes: 'Мягкость воды, полнота вкуса' },
    { name: 'Хлорид натрия (Соль, NaCl)', type: 'salt', unit: 'г', cost_per_unit: '0.10', notes: 'Усилитель вкуса, округлость' },
    { name: 'Бикарбонат натрия (NaHCO₃)', type: 'salt', unit: 'г', cost_per_unit: '0.30', notes: 'Повышает pH, жёсткость воды' },
    { name: 'Хлорид магния (MgCl₂)', type: 'salt', unit: 'г', cost_per_unit: '0.50', notes: 'Смягчает воду' },
    { name: 'Сульфат магния (Эпсомовая соль, MgSO₄)', type: 'salt', unit: 'г', cost_per_unit: '0.40', notes: 'Сухость, хмелевая горечь' },
    { name: 'Молочная кислота (88%)', type: 'salt', unit: 'мл', cost_per_unit: '1.50', notes: 'Понижение pH затора' },
    { name: 'Фосфорная кислота (85%)', type: 'salt', unit: 'мл', cost_per_unit: '1.50', notes: 'Понижение pH, нейтральный вкус' },

    // ── Добавки и стабилизаторы ───────────────────────────────────────────
    { name: 'Ирландский мох (Irish Moss)', type: 'additive', unit: 'г', cost_per_unit: '2.00', notes: 'Осветлитель, добавлять за 15 мин до конца кипячения' },
    { name: 'Вирфлок (Whirlfloc)', type: 'additive', unit: 'шт', cost_per_unit: '15', notes: 'Таблетка осветлителя, 1 шт за 10 мин до конца' },
    { name: 'Питательные соли для дрожжей', type: 'additive', unit: 'г', cost_per_unit: '1.00', notes: 'DAP, повышает жизнеспособность дрожжей' },
    { name: 'Амилаза (Amylase)', type: 'additive', unit: 'г', cost_per_unit: '2.50', notes: 'Фермент для осахаривания крахмала' },
    { name: 'Пектиназа', type: 'additive', unit: 'г', cost_per_unit: '3.00', notes: 'Расщепление пектина, осветление фруктового сусла' },
    { name: 'Желатин (осветлитель)', type: 'additive', unit: 'г', cost_per_unit: '0.80', notes: 'Коллоидный осветлитель, вносить холодным' },
    { name: 'Бентонит', type: 'additive', unit: 'г', cost_per_unit: '0.50', notes: 'Осветлитель для виноделия и дистилляции' },
    { name: 'Активированный уголь', type: 'additive', unit: 'г', cost_per_unit: '1.00', notes: 'Очистка дистиллята от посторонних запахов' },
    { name: 'Дубовая щепа (Medium Toast)', type: 'additive', unit: 'г', cost_per_unit: '2.00', notes: 'Выдержка дистиллята, ванильный, карамельный вкус' },
    { name: 'Дубовая спираль', type: 'additive', unit: 'шт', cost_per_unit: '250', notes: 'Быстрая выдержка дистиллята' },

    // ── Сахар и зерно для дистилляции ────────────────────────────────────
    { name: 'Сахар-песок', type: 'sugar', unit: 'кг', cost_per_unit: '70', notes: 'Обычный сахар для браги' },
    { name: 'Декстроза (Глюкоза)', type: 'sugar', unit: 'кг', cost_per_unit: '130', notes: 'Чистая ферментируемость без привкуса' },
    { name: 'Инвертный сироп', type: 'sugar', unit: 'кг', cost_per_unit: '90', notes: 'Более полная ферментация' },
    { name: 'Мёд', type: 'sugar', unit: 'кг', cost_per_unit: '350', notes: 'Медовуха и добавка вкуса' },
    { name: 'Кукуруза (дроблёная)', type: 'grain_distill', unit: 'кг', cost_per_unit: '35', notes: 'Зерновая брага, бурбон' },
    { name: 'Рожь (дроблёная)', type: 'grain_distill', unit: 'кг', cost_per_unit: '40', notes: 'Ржаная брага, ржаной виски' },
    { name: 'Пшеница (дроблёная)', type: 'grain_distill', unit: 'кг', cost_per_unit: '35', notes: 'Пшеничная брага' },
    { name: 'Ячмень (дроблёный)', type: 'grain_distill', unit: 'кг', cost_per_unit: '35', notes: 'Зерновой виски, самогон' },
    { name: 'Рисовая крупа', type: 'grain_distill', unit: 'кг', cost_per_unit: '80', notes: 'Лёгкий нейтральный дистиллят' },
  ],
};

// ─── Ensure at least one default beer profile exists ─────────────────────────
export async function ensureDefaultProfile() {
  try {
    const profiles = await getRows('BrewingProfiles');
    const beer = profiles.filter(p => p.type === 'beer' && p.is_active !== 'FALSE');
    if (beer.length > 0) return beer[0];
    const ts = now();
    const def = {
      id: genId(), name: 'Стандартная система', type: 'beer',
      system_efficiency: '72', grain_absorption: '1.0', boiloff_rate_pct: '10',
      wort_shrinkage_pct: '4', kettle_loss_l: '1.5', fermenter_loss_l: '1.0',
      kettle_volume_l: '30', notes: 'Автоматически созданный профиль',
      is_active: 'TRUE', created_at: ts, updated_at: ts,
    };
    await appendRow('BrewingProfiles', def);
    return def;
  } catch { return null; }
}

export function getCatalogCount(country = 'RU') {
  return (CATALOG[country] || []).length;
}

export async function loadCatalog(country = 'RU') {
  const existing = await getRows('Components');
  const existingNames = new Set(existing.map(c => c.name.trim().toLowerCase()));

  const entries = CATALOG[country] || [];
  const toAdd = entries.filter(c => !existingNames.has(c.name.trim().toLowerCase()));

  if (!toAdd.length) {
    return { added: 0, skipped: entries.length };
  }

  const ts = now();
  const rows = toAdd.map(c => ({
    id: genId(),
    name: c.name,
    type: c.type,
    unit: c.unit,
    cost_per_unit: c.cost_per_unit || '',
    ebc: c.ebc || '',
    alpha_acid: c.alpha_acid || '',
    attenuation: c.attenuation || '',
    spirit_type: c.spirit_type || '',
    notes: c.notes || '',
    is_active: 'TRUE',
    created_at: ts,
    updated_at: ts,
    brand: '',
    ferment_temp_min: c.ferment_temp_min || '',
    ferment_temp_max: c.ferment_temp_max || '',
    ferment_days_typical: c.ferment_days_typical || '',
  }));

  // Append in batches of 50 to stay within Sheets API limits
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await appendRows('Components', rows.slice(i, i + BATCH));
  }

  return { added: toAdd.length, skipped: entries.length - toAdd.length };
}
