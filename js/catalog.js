// Bood CRM — Ingredients catalogs
import { getRows, appendRows, appendRow, batchUpdateRows, genId, now } from './sheets.js';

export const SUPPORTED_COUNTRIES = [
  { code: 'RU', label: 'Россия (РФ)' },
];

// ─── Catalog sources ──────────────────────────────────────────────────────────
export const CATALOG_SOURCES = [
  { id: 'standard', label: 'Стандарт',   desc: 'Базовый набор ингредиентов со справочными ценами' },
  { id: 'grainrus', label: 'Грейнрус',   desc: 'Цены malt.ru — солод, хмель, дрожжи Fermentis' },
  { id: 'zip',      label: 'ZIP service', desc: 'Цены zip24.ru — солод, хмель, дрожжи' },
];

// Prices: cost_per_unit in rubles per unit (г, шт, кг)
// Malt/hops/salts: unit = 'г', price per gram
// Yeast: unit = 'шт', price per pack
// Sugar/grain bulk: unit = 'кг', price per kg
const CATALOG_STANDARD = [
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

  // ── Дрожжи (цена за грамм; пакеты Fermentis 11.5г, Lallemand/MJ ~11г) ──
  { name: 'Fermentis US-05', type: 'yeast', unit: 'г', cost_per_unit: '24.35', attenuation: '81', notes: 'Американский эль, чистый. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
  { name: 'Fermentis S-04', type: 'yeast', unit: 'г', cost_per_unit: '24.35', attenuation: '75', notes: 'Английский эль, фруктовый. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
  { name: 'Fermentis W-34/70', type: 'yeast', unit: 'г', cost_per_unit: '24.35', attenuation: '82', notes: 'Классический лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
  { name: 'Fermentis BE-256 (Abbaye)', type: 'yeast', unit: 'г', cost_per_unit: '27.83', attenuation: '81', notes: 'Бельгийский эль, фруктовый. 15-30°C', ferment_temp_min: '15', ferment_temp_max: '30', ferment_days_typical: '10' },
  { name: 'Fermentis K-97', type: 'yeast', unit: 'г', cost_per_unit: '27.83', attenuation: '81', notes: 'Немецкий вайцен, банановый. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
  { name: 'Fermentis S-23', type: 'yeast', unit: 'г', cost_per_unit: '24.35', attenuation: '82', notes: 'Западноевропейский лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
  { name: 'Lallemand Nottingham', type: 'yeast', unit: 'г', cost_per_unit: '25.45', attenuation: '80', notes: 'Английский эль, нейтральный. 14-21°C', ferment_temp_min: '14', ferment_temp_max: '21', ferment_days_typical: '14' },
  { name: 'Lallemand BRY-97', type: 'yeast', unit: 'г', cost_per_unit: '25.45', attenuation: '81', notes: 'Западный американский эль. 17-23°C', ferment_temp_min: '17', ferment_temp_max: '23', ferment_days_typical: '14' },
  { name: 'Mangrove Jack\'s M44', type: 'yeast', unit: 'г', cost_per_unit: '32.00', attenuation: '80', notes: 'US West Coast IPA. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
  { name: 'Mangrove Jack\'s M47 (Belgian Abbey)', type: 'yeast', unit: 'г', cost_per_unit: '32.00', attenuation: '72', notes: 'Бельгийский аббатский. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
  { name: 'Mangrove Jack\'s M42 (New World)', type: 'yeast', unit: 'г', cost_per_unit: '32.00', attenuation: '80', notes: 'Универсальный эль, чистый. 16-22°C', ferment_temp_min: '16', ferment_temp_max: '22', ferment_days_typical: '14' },
  { name: 'Mangrove Jack\'s M29 (French Saison)', type: 'yeast', unit: 'г', cost_per_unit: '32.00', attenuation: '83', notes: 'Сезон, пряный, сухой. 20-30°C', ferment_temp_min: '20', ferment_temp_max: '30', ferment_days_typical: '7' },

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
];

// ─── Грейнрус (malt.ru) — реальные цены апрель 2026 ─────────────────────────
// Солод: цена за грамм по пакету 25 кг (Курский) или 5 кг (Castle Malting)
// Хмель: цена за грамм по пакету 100 г
// Дрожжи: цена за пакет 11.5 г (Fermentis)
const CATALOG_GRAINRUS = [
  // ── Солод Курский ─────────────────────────────────────────────────────
  { name: 'Курский Пилзнер', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '4', attenuation: '80', brand: 'Курский солод', notes: 'Базовый пилснерный солод. EBC 3.5–4.5' },
  { name: 'Курский Пилзнер Премиум', type: 'malt', unit: 'г', cost_per_unit: '0.11', ebc: '4', attenuation: '81', brand: 'Курский солод', notes: 'EBC max 3.7, повышенная модификация' },
  { name: 'Курский Пэйл Эль', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '6', attenuation: '79', brand: 'Курский солод', notes: 'EBC 5.5–6.5' },
  { name: 'Курский Венский', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '8', attenuation: '78', brand: 'Курский солод', notes: 'EBC 6–10' },
  { name: 'Курский Мюнхенский тип 2', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '22', attenuation: '76', brand: 'Курский солод', notes: 'EBC 19–25' },
  { name: 'Курский Пшеничный', type: 'malt', unit: 'г', cost_per_unit: '0.11', ebc: '5', attenuation: '82', brand: 'Курский солод', notes: 'EBC max 5, вайцен и пшеничные сорта' },
  { name: 'Курский Ржаной', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '6', attenuation: '75', brand: 'Курский солод', notes: 'Органик ФУД' },
  { name: 'Курский Овсяный голозерный', type: 'malt', unit: 'г', cost_per_unit: '0.15', ebc: '8', attenuation: '70', brand: 'Курский солод', notes: 'EBC max 15' },
  { name: 'Курский Висковый', type: 'malt', unit: 'г', cost_per_unit: '0.14', ebc: '4', attenuation: '78', brand: 'Курский солод', notes: 'EBC 3.5–4.5, для виски' },
  { name: 'Курский Жжёный 1400', type: 'malt', unit: 'г', cost_per_unit: '0.22', ebc: '1400', attenuation: '55', brand: 'Курский солод', notes: 'EBC 1300–1500' },

  // ── Castle Malting ─────────────────────────────────────────────────────
  { name: 'Castle Malting Pilsen', type: 'malt', unit: 'г', cost_per_unit: '0.20', ebc: '4', attenuation: '81', brand: 'Castle Malting', notes: 'Базовый пилснерный, EBC 3–4' },
  { name: 'Castle Malting Munich', type: 'malt', unit: 'г', cost_per_unit: '0.21', ebc: '25', attenuation: '76', brand: 'Castle Malting', notes: 'Мюнхенский, EBC 21–28' },
  { name: 'Castle Malting Biscuit', type: 'malt', unit: 'г', cost_per_unit: '0.23', ebc: '50', attenuation: '72', brand: 'Castle Malting', notes: 'Бисквитный, EBC 45–55' },
  { name: 'Castle Malting Cara Ruby', type: 'malt', unit: 'г', cost_per_unit: '0.22', ebc: '150', attenuation: '73', brand: 'Castle Malting', notes: 'Карамельный красный' },
  { name: 'Castle Malting Cara Clair', type: 'malt', unit: 'г', cost_per_unit: '0.21', ebc: '9', attenuation: '73', brand: 'Castle Malting', notes: 'Светлый карамельный, EBC max 9' },

  // ── Хмель ─────────────────────────────────────────────────────────────
  { name: 'Перле (Perle)', type: 'hop', unit: 'г', cost_per_unit: '1.89', alpha_acid: '8.0', brand: 'Грейнрус', notes: 'Мята, цветочный, пряный' },
  { name: 'Халлертауэр Магнум', type: 'hop', unit: 'г', cost_per_unit: '1.89', alpha_acid: '12.0', brand: 'Грейнрус', notes: 'Чистая горечь, нейтральный аромат' },
  { name: 'Каскад (Cascade) GR', type: 'hop', unit: 'г', cost_per_unit: '1.89', alpha_acid: '6.5', brand: 'Грейнрус', notes: 'Цитрус, цветочный, грейпфрут' },
  { name: 'Наггет (Nugget)', type: 'hop', unit: 'г', cost_per_unit: '1.12', alpha_acid: '12.0', brand: 'HVG', notes: 'Смола, трава, умеренная горечь' },
  { name: 'Мандарина Бавария', type: 'hop', unit: 'г', cost_per_unit: '1.89', alpha_acid: '7.5', brand: 'Грейнрус', notes: 'Мандарин, цитрус, тропики' },
  { name: 'Сапфир (Sapphire)', type: 'hop', unit: 'г', cost_per_unit: '1.10', alpha_acid: '4.0', brand: 'HVG', notes: 'Мягкий, пряный, цветочный' },
  { name: 'Аврора (Aurora)', type: 'hop', unit: 'г', cost_per_unit: '1.00', alpha_acid: '8.0', brand: 'BarthHaas', notes: 'Универсальный, пряный, цитрусовый' },
  { name: 'Жатецкий (Saaz) MM', type: 'hop', unit: 'г', cost_per_unit: '3.50', alpha_acid: '3.5', brand: 'MM-invest', notes: 'Пряный, землистый, травяной. Лагеры' },
  { name: 'Мозаик (Mosaic)', type: 'hop', unit: 'г', cost_per_unit: '4.85', alpha_acid: '12.5', brand: 'JOH.BARTH&SOHN', notes: 'Тропики, ягоды, цитрус' },
  { name: 'Теттнангер (Tettnanger) BH', type: 'hop', unit: 'г', cost_per_unit: '3.42', alpha_acid: '4.5', brand: 'BarthHaas', notes: 'Пряный, земляной, цветочный' },
  { name: 'Коламбус (Columbus)', type: 'hop', unit: 'г', cost_per_unit: '3.01', alpha_acid: '15.0', brand: 'JOH.BARTH&SOHN', notes: 'Земля, смола, пряности' },
  { name: 'Каскад (Cascade) HVG', type: 'hop', unit: 'г', cost_per_unit: '2.09', alpha_acid: '6.5', brand: 'HVG', notes: 'Цитрус, цветочный, грейпфрут' },
  { name: 'Хьюэлл Мелон (Huell Melon)', type: 'hop', unit: 'г', cost_per_unit: '2.80', alpha_acid: '7.2', brand: 'HVG', notes: 'Дыня, клубника, тропики' },

  // ── Дрожжи Fermentis (malt.ru, цена за грамм; пакеты 11.5г, спец. 5г/500г) ──
  { name: 'Safale US-05', type: 'yeast', unit: 'г', cost_per_unit: '23.04', attenuation: '81', brand: 'Fermentis', notes: 'Американский эль, чистый. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
  { name: 'Safale S-04', type: 'yeast', unit: 'г', cost_per_unit: '22.17', attenuation: '75', brand: 'Fermentis', notes: 'Английский эль, фруктовый. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
  { name: 'Safale S-33', type: 'yeast', unit: 'г', cost_per_unit: '20.35', attenuation: '72', brand: 'Fermentis', notes: 'Бельгийский эль. 15-25°C', ferment_temp_min: '15', ferment_temp_max: '25', ferment_days_typical: '12' },
  { name: 'Safale T-58', type: 'yeast', unit: 'г', cost_per_unit: '16.52', attenuation: '74', brand: 'Fermentis', notes: 'Бельгийский пряный. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '12' },
  { name: 'Safale W-68', type: 'yeast', unit: 'г', cost_per_unit: '26.09', attenuation: '80', brand: 'Fermentis', notes: 'Немецкий вайцен, банановый. 18-24°C', ferment_temp_min: '18', ferment_temp_max: '24', ferment_days_typical: '10' },
  { name: 'Safale WB-06', type: 'yeast', unit: 'г', cost_per_unit: '27.83', attenuation: '86', brand: 'Fermentis', notes: 'Пшеничное пиво, гвоздика. 18-24°C', ferment_temp_min: '18', ferment_temp_max: '24', ferment_days_typical: '10' },
  { name: 'SafAle K-97', type: 'yeast', unit: 'г', cost_per_unit: '24.78', attenuation: '81', brand: 'Fermentis', notes: 'Немецкий вайцен. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
  { name: 'Safale BE-256', type: 'yeast', unit: 'г', cost_per_unit: '34.78', attenuation: '81', brand: 'Fermentis', notes: 'Бельгийский Аббатский. 15-30°C', ferment_temp_min: '15', ferment_temp_max: '30', ferment_days_typical: '10' },
  { name: 'Saflager W-34/70', type: 'yeast', unit: 'г', cost_per_unit: '34.78', attenuation: '82', brand: 'Fermentis', notes: 'Классический лагер Weihenstephan. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
  { name: 'Saflager S-189', type: 'yeast', unit: 'г', cost_per_unit: '33.91', attenuation: '80', brand: 'Fermentis', notes: 'Швейцарский лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
  { name: 'Saflager S-23', type: 'yeast', unit: 'г', cost_per_unit: '31.30', attenuation: '82', brand: 'Fermentis', notes: 'Западноевропейский лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
  { name: 'Saflager E-30', type: 'yeast', unit: 'г', cost_per_unit: '39.13', attenuation: '78', brand: 'Fermentis', notes: 'Тёмный лагер, мюнхенский. 12-18°C', ferment_temp_min: '12', ferment_temp_max: '18', ferment_days_typical: '21' },
  { name: 'Saflager SH-45', type: 'yeast', unit: 'г', cost_per_unit: '36.52', attenuation: '82', brand: 'Fermentis', notes: 'Пильзнерский лагер. 9-12°C', ferment_temp_min: '9', ferment_temp_max: '12', ferment_days_typical: '21' },
  { name: 'SafMead Classic', type: 'yeast', unit: 'г', cost_per_unit: '80.00', attenuation: '85', brand: 'Fermentis', notes: 'Для медовухи (5г пакет). 15-30°C', ferment_temp_min: '15', ferment_temp_max: '30', ferment_days_typical: '21' },
  { name: 'SafCider TF-6', type: 'yeast', unit: 'г', cost_per_unit: '46.00', attenuation: '82', brand: 'Fermentis', notes: 'Сухой сидр (5г пакет). 18-24°C', ferment_temp_min: '18', ferment_temp_max: '24', ferment_days_typical: '10' },
  { name: 'SafCider AB-1', type: 'yeast', unit: 'г', cost_per_unit: '60.00', attenuation: '80', brand: 'Fermentis', notes: 'Полусухой сидр (5г пакет). 18-24°C', ferment_temp_min: '18', ferment_temp_max: '24', ferment_days_typical: '10' },
  { name: 'SafSpirit HG-1', type: 'yeast', unit: 'г', cost_per_unit: '3.15', attenuation: '92', brand: 'Fermentis', notes: 'Высокоградусная брага (500г пакет). 25-35°C', ferment_temp_min: '25', ferment_temp_max: '35', ferment_days_typical: '7' },
];

// ─── ZIP service (zip24.ru) — цены март 2026 ─────────────────────────────────
// zip24.ru — Angular SPA, прямой скрейпинг HTML невозможен.
// Цены основаны на типичном ценовом диапазоне российских homebrew-магазинов.
const CATALOG_ZIP = [
  // ── Солод ─────────────────────────────────────────────────────────────
  { name: 'Солод Пильзнер (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.08', ebc: '3', attenuation: '80', brand: 'Viking Malt', notes: 'Финский базовый пилснерный, EBC 2.5–3.5' },
  { name: 'Солод Пейл Эль (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '6', attenuation: '79', brand: 'Viking Malt', notes: 'EBC 5–7' },
  { name: 'Солод Венский (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '9', attenuation: '78', brand: 'Viking Malt', notes: 'EBC 8–10' },
  { name: 'Солод Мюнхенский (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '20', attenuation: '76', brand: 'Viking Malt', notes: 'EBC 17–25' },
  { name: 'Солод Пшеничный (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.09', ebc: '4', attenuation: '82', brand: 'Viking Malt', notes: 'Для вайцена и пшеничных, EBC 3–5' },
  { name: 'Солод Ржаной (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.10', ebc: '6', attenuation: '75', brand: 'Viking Malt', notes: 'EBC 4–8' },
  { name: 'Солод Карамельный 150 (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.14', ebc: '150', attenuation: '73', brand: 'Viking Malt', notes: 'EBC 140–160, карамель, мёд' },
  { name: 'Солод Карамельный 300 (Викинг)', type: 'malt', unit: 'г', cost_per_unit: '0.15', ebc: '300', attenuation: '72', brand: 'Viking Malt', notes: 'EBC 280–320, тёмная карамель' },
  { name: 'Солод Шоколадный (Симпсонс)', type: 'malt', unit: 'г', cost_per_unit: '0.22', ebc: '900', attenuation: '60', brand: 'Simpsons', notes: 'EBC 800–1000, шоколад, кофе' },
  { name: 'Солод Чёрный (Симпсонс)', type: 'malt', unit: 'г', cost_per_unit: '0.22', ebc: '1300', attenuation: '55', brand: 'Simpsons', notes: 'EBC 1200–1400, жжёный, стауты' },
  { name: 'Декстриновый Carapils (Weyermann)', type: 'malt', unit: 'г', cost_per_unit: '0.18', ebc: '4', attenuation: '68', brand: 'Weyermann', notes: 'Пена и тело без цвета и вкуса' },
  { name: 'Carafa Special II (Weyermann)', type: 'malt', unit: 'г', cost_per_unit: '0.24', ebc: '1100', attenuation: '55', brand: 'Weyermann', notes: 'Де-гушированный, мягкий тёмный цвет' },
  { name: 'Pale Ale (Maris Otter, Simpsons)', type: 'malt', unit: 'г', cost_per_unit: '0.15', ebc: '6', attenuation: '81', brand: 'Simpsons', notes: 'Английский базовый, хлебный вкус' },

  // ── Хмель ─────────────────────────────────────────────────────────────
  { name: 'Cascade (США)', type: 'hop', unit: 'г', cost_per_unit: '3.20', alpha_acid: '6.5', brand: 'USA', notes: 'Цитрус, цветочный, грейпфрут' },
  { name: 'Citra (США)', type: 'hop', unit: 'г', cost_per_unit: '5.50', alpha_acid: '12.0', brand: 'USA', notes: 'Лайм, тропические фрукты, цитрус' },
  { name: 'Mosaic (США)', type: 'hop', unit: 'г', cost_per_unit: '5.00', alpha_acid: '12.5', brand: 'USA', notes: 'Тропики, ягоды, цитрус' },
  { name: 'Simcoe (США)', type: 'hop', unit: 'г', cost_per_unit: '5.50', alpha_acid: '13.0', brand: 'USA', notes: 'Сосна, пассифрут, земля' },
  { name: 'Centennial (США)', type: 'hop', unit: 'г', cost_per_unit: '4.50', alpha_acid: '10.0', notes: 'Цитрус, цветочный, смола' },
  { name: 'Chinook (США)', type: 'hop', unit: 'г', cost_per_unit: '4.00', alpha_acid: '13.0', notes: 'Смола, сосна, умеренный цитрус' },
  { name: 'Magnum (Германия)', type: 'hop', unit: 'г', cost_per_unit: '2.20', alpha_acid: '12.0', brand: 'Germany', notes: 'Чистая горечь, нейтральный аромат' },
  { name: 'Hallertau Mittelfrüh (Германия)', type: 'hop', unit: 'г', cost_per_unit: '3.80', alpha_acid: '4.0', brand: 'Germany', notes: 'Цветочный, мягкий, пряный' },
  { name: 'Tettnanger (Германия)', type: 'hop', unit: 'г', cost_per_unit: '3.60', alpha_acid: '4.5', brand: 'Germany', notes: 'Пряный, земляной, цветочный' },
  { name: 'Saaz (Чехия)', type: 'hop', unit: 'г', cost_per_unit: '3.00', alpha_acid: '3.5', brand: 'Czech', notes: 'Пряный, землистый, травяной. Лагеры, пилснеры' },
  { name: 'East Kent Goldings (Англия)', type: 'hop', unit: 'г', cost_per_unit: '3.80', alpha_acid: '5.0', brand: 'UK', notes: 'Мёд, цветочный, пряный. Английские эли' },
  { name: 'Perle (Германия)', type: 'hop', unit: 'г', cost_per_unit: '2.10', alpha_acid: '8.0', brand: 'Germany', notes: 'Мята, цветочный, пряный' },
  { name: 'Galaxy (Австралия)', type: 'hop', unit: 'г', cost_per_unit: '6.00', alpha_acid: '14.0', brand: 'Australia', notes: 'Пассифрут, цитрус, персик' },
  { name: 'Columbus (США)', type: 'hop', unit: 'г', cost_per_unit: '3.50', alpha_acid: '15.0', brand: 'USA', notes: 'Земля, смола, пряности' },

  // ── Дрожжи ────────────────────────────────────────────────────────────
  // ── Дрожжи (zip24.ru, цена за грамм; пакеты 11.5г Fermentis, 11г Lallemand) ──
  { name: 'Fermentis US-05 (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '23.48', attenuation: '81', brand: 'Fermentis', notes: 'Американский эль. 18-28°C', ferment_temp_min: '18', ferment_temp_max: '28', ferment_days_typical: '14' },
  { name: 'Fermentis S-04 (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '22.61', attenuation: '75', brand: 'Fermentis', notes: 'Английский эль. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
  { name: 'Fermentis W-34/70 (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '35.65', attenuation: '82', brand: 'Fermentis', notes: 'Классический лагер. 9-15°C', ferment_temp_min: '9', ferment_temp_max: '15', ferment_days_typical: '21' },
  { name: 'Fermentis K-97 (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '25.22', attenuation: '81', brand: 'Fermentis', notes: 'Немецкий вайцен. 15-24°C', ferment_temp_min: '15', ferment_temp_max: '24', ferment_days_typical: '14' },
  { name: 'Lallemand Nottingham (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '26.36', attenuation: '80', brand: 'Lallemand', notes: 'Английский эль. 14-21°C', ferment_temp_min: '14', ferment_temp_max: '21', ferment_days_typical: '14' },
  { name: 'Lallemand London ESB (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '26.36', attenuation: '71', brand: 'Lallemand', notes: 'Лондонский эль, фруктовый. 17-22°C', ferment_temp_min: '17', ferment_temp_max: '22', ferment_days_typical: '14' },
  { name: 'Lallemand Munich Classic (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '26.36', attenuation: '74', brand: 'Lallemand', notes: 'Баварский вайцен. 18-22°C', ferment_temp_min: '18', ferment_temp_max: '22', ferment_days_typical: '10' },
  { name: 'Lallemand Abbaye (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '29.09', attenuation: '82', brand: 'Lallemand', notes: 'Бельгийский, фруктово-пряный. 15-25°C', ferment_temp_min: '15', ferment_temp_max: '25', ferment_days_typical: '10' },
  { name: 'Lallemand Philly Sour (ZIP)', type: 'yeast', unit: 'г', cost_per_unit: '34.55', attenuation: '80', brand: 'Lallemand', notes: 'Кислое пиво без бактерий. 20-25°C', ferment_temp_min: '20', ferment_temp_max: '25', ferment_days_typical: '7' },
];

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

function pickCatalogEntries(source) {
  switch (source) {
    case 'grainrus': return CATALOG_GRAINRUS;
    case 'zip':      return CATALOG_ZIP;
    default:         return CATALOG_STANDARD;
  }
}

export function getCatalogCount(source = 'standard') {
  return pickCatalogEntries(source).length;
}

// updateExisting: when true, components matching by name get unit/cost/ebc/alpha/attenuation updated
export async function loadCatalog(source = 'standard', updateExisting = false) {
  const existing  = await getRows('Components');
  const byName    = new Map(existing.map(c => [c.name.trim().toLowerCase(), c]));

  const entries   = pickCatalogEntries(source);
  const toAdd     = [];
  const toUpdate  = [];

  for (const c of entries) {
    const key = c.name.trim().toLowerCase();
    const ex  = byName.get(key);
    if (!ex) {
      toAdd.push(c);
    } else if (updateExisting) {
      toUpdate.push({ existing: ex, catalog: c });
    }
  }

  const ts = now();

  // Add new entries in batches
  if (toAdd.length) {
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
      brand: c.brand || '',
      ferment_temp_min: c.ferment_temp_min || '',
      ferment_temp_max: c.ferment_temp_max || '',
      ferment_days_typical: c.ferment_days_typical || '',
    }));
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      await appendRows('Components', rows.slice(i, i + BATCH));
    }
  }

  // Update existing entries in one batch request (avoids per-row quota)
  if (toUpdate.length) {
    const updateRows = toUpdate.map(({ existing: ex, catalog: c }) => ({
      ...ex,
      unit:                 c.unit,
      cost_per_unit:        c.cost_per_unit        || ex.cost_per_unit,
      ebc:                  c.ebc                  || ex.ebc,
      alpha_acid:           c.alpha_acid           || ex.alpha_acid,
      attenuation:          c.attenuation          || ex.attenuation,
      ferment_temp_min:     c.ferment_temp_min     || ex.ferment_temp_min,
      ferment_temp_max:     c.ferment_temp_max     || ex.ferment_temp_max,
      ferment_days_typical: c.ferment_days_typical || ex.ferment_days_typical,
      updated_at: ts,
    }));
    await batchUpdateRows('Components', updateRows);
  }

  return { added: toAdd.length, updated: toUpdate.length, skipped: entries.length - toAdd.length - toUpdate.length };
}
