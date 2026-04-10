# BOOD BREWING & DISTILLING — CRM SYSTEM
## Промпт для Claude Code

---

## ЦЕЛЬ

Создай полноценное веб-приложение **Bood CRM** для управления домашним пивоварением и дистилляцией/ректификацией. Хранилище данных — **Google Sheets** (через Google Sheets API v4). Стек — ванильный HTML/CSS/JS без фреймворков и сборщиков.

---

## СТЕК

- Чистый HTML5 + CSS3 + JavaScript (ES Modules)
- Google Sheets API v4 (через fetch, без SDK)
- Google Identity Services (OAuth 2.0, для авторизации)
- Никаких npm, webpack, react — только файлы
- Открывается напрямую через `index.html` в браузере или на GitHub Pages
- Mobile-first, полностью адаптивный

---

## СТРУКТУРА ПРОЕКТА

```
bood-crm/
├── index.html
├── css/
│   └── app.css
├── js/
│   ├── config.js          # GOOGLE_CLIENT_ID, SPREADSHEET_ID
│   ├── auth.js            # Google OAuth 2.0 flow
│   ├── sheets.js          # все операции с Google Sheets API
│   ├── router.js          # hash-роутер
│   ├── ui.js              # переиспользуемые UI-компоненты
│   ├── i18n.js            # EN/RU переводы
│   ├── utils.js           # форматирование, расчёты
│   └── pages/
│       ├── dashboard.js
│       ├── components.js
│       ├── inventory.js
│       ├── recipes.js
│       ├── batches.js
│       ├── distillation.js
│       ├── customers.js
│       ├── sales.js
│       └── settings.js
├── assets/
│   └── logo.svg           # логотип Bood (см. ниже)
└── README.md
```

---

## GOOGLE SHEETS — СТРУКТУРА БАЗЫ ДАННЫХ

Одна Google Таблица, 10 листов. Каждый лист = таблица с заголовками в строке 1.

### Лист 1: Components
```
id | name | type | unit | cost_per_unit | ebc | alpha_acid | attenuation | spirit_type | notes | is_active | created_at | updated_at
```
Типы (`type`): `malt` / `hop` / `yeast` / `additive` / `salt` / `packaging` / `equipment` / `grain_distill` / `sugar` / `fruit` / `finished_beer` / `finished_spirit` / `other`

Поле `spirit_type` — только для дистилляции: `wash` / `grain` / `fruit` / `sugar`

### Лист 2: Inventory
```
id | component_id | qty_delta | movement_type | ref_type | ref_id | unit_cost | notes | created_at
```
`movement_type`: `purchase` / `brew_consume` / `distill_consume` / `packaging_consume` / `packaging_produce` / `sale_out` / `return_in` / `adjustment`

### Лист 3: Recipes
```
id | name | type | style | description | batch_size_l | fermenter_l | packaged_l | water_total_l | water_mash_l | water_sparge_l | hydromodule | boil_time_min | ferment_temp_c | ferment_days | og_target | fg_target | ibu_estimated | ebc_estimated | abv_estimated | estimated_cost | notes | manual_notes | is_active | created_at | updated_at
```
`type`: `beer` / `distillate`

### Лист 4: RecipeIngredients
```
id | recipe_id | component_id | qty | stage_key | time_meta | sort_order | created_at
```
`stage_key` для пива: `mash` / `boil` / `whirlpool` / `fermentation` / `dry_hop` / `packaging`
`stage_key` для дистилляции: `mash` / `wash` / `distillation` / `cuts` / `aging` / `bottling`

### Лист 5: RecipeMashRests
```
id | recipe_id | sort_order | name | temp_c | duration_min | rest_type | created_at
```
`rest_type`: `rest` / `decoction` / `step`

### Лист 6: Batches
```
id | recipe_id | recipe_snapshot | name | type | status | brew_date | og | fg | abv | to_fermenter_l | packaged_l | package_date | kwh_used | labor_hours | brew_notes | ferment_notes | package_notes | brew_posted | brew_posted_at | packaging_posted | packaging_posted_at | cogs_snapshot | cogs_frozen_at | is_active | created_at | updated_at
```
`type`: `beer` / `distillate`
`status`: `planned` / `brewing` / `fermenting` / `distilling` / `aging` / `packaging` / `done` / `archived`

### Лист 7: Customers
```
id | name | phone | email | notes | is_active | created_at | updated_at
```

### Лист 8: Sales
```
id | customer_id | items_snapshot | status | total_amount | posted_at | notes | is_active | created_at | updated_at
```
`items_snapshot` — JSON строка: `[{component_id, name, qty, unit_price, refunded_qty}]`

### Лист 9: MoneyLedger
```
id | customer_id | amount_signed | movement_type | ref_type | ref_id | notes | created_at
```
`movement_type`: `deposit` / `sale_charge` / `refund` / `adjustment` / `purchase_expense`

### Лист 10: Settings
```
key | value | updated_at
```
Дефолтные значения:
```
electricity_cost_kwh | 6.5
water_cost_l         | 0.05
labor_rate_hour      | 300
brew_loss_pct        | 10
fermenter_loss_pct   | 5
currency             | RUB
language             | ru
```

---

## GOOGLE SHEETS API — РЕАЛИЗАЦИЯ

### config.js
```js
export const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
export const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
```

### auth.js
Реализовать авторизацию через Google Identity Services:
- При первом открытии — кнопка "Войти через Google"
- После авторизации — токен сохранять в sessionStorage
- При истечении токена — автоматически обновлять
- При ошибке авторизации — показывать понятное сообщение

### sheets.js
Основные функции:

```js
// Получить все строки листа
async function getRows(sheetName)

// Добавить строку
async function appendRow(sheetName, rowData)

// Обновить строку по id (найти строку где col A = id, обновить)
async function updateRow(sheetName, id, rowData)

// Пометить как неактивную (soft delete)
async function softDelete(sheetName, id)

// Batch append (несколько строк за один запрос — для posting)
async function appendRows(sheetName, rows)

// Инициализация: создать листы если не существуют, добавить заголовки
async function initializeSheets()
```

**Важно**: кэшировать данные в памяти (JS object), инвалидировать при записи. Не делать запрос при каждом рендере — читать из кэша, писать через API + обновлять кэш.

---

## ДИЗАЙН — BOOD BRAND

### Цветовая схема (тёмная тема)
```css
:root {
  --bg-primary: #0F0F0F;       /* почти чёрный фон */
  --bg-secondary: #1A1A1A;     /* карточки, сайдбар */
  --bg-tertiary: #242424;      /* инпуты, строки таблиц */
  --bg-hover: #2E2E2E;

  --accent-amber: #D4890A;     /* основной акцент — янтарное пиво */
  --accent-amber-light: #F0A832;
  --accent-copper: #B5622A;    /* медный — дистилляция */
  --accent-gold: #C8A84B;      /* золото */

  --text-primary: #F0EAD6;     /* тёплый белый */
  --text-secondary: #9A8F7E;   /* приглушённый */
  --text-muted: #5A5248;

  --border: #2E2A24;
  --border-accent: #D4890A40;

  --success: #4CAF50;
  --warning: #FF9800;
  --error: #F44336;
  --info: #2196F3;

  /* Типы продукции */
  --beer-color: #D4890A;
  --spirit-color: #B5622A;
}
```

### Типографика
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@300;400;500&display=swap');

/* Заголовки — Cormorant Garamond (элегантный serif) */
/* Тело — Inter Light/Regular */
```

### Логотип (встроить в assets/logo.svg)
Создай SVG логотип на основе описания:
- Текст "M∞RZINKA" где ∞ — символ бесконечности стилизованный под две петли
- Подпись "brewing and distilling" строчными буквами
- Белый цвет для тёмного фона
- Размер для сайдбара: высота 48px

### Layout
```
+--[sidebar 240px]--+----------[main]----------+
| ∞ BOOD       | [breadcrumb / title]      |
| brewing&distilling|                           |
|                   | [page header + actions]   |
| ● Dashboard       |                           |
| ○ Components      | [tabs if needed]          |
| ○ Inventory       |                           |
| ○ Recipes (Beer)  | [content area]            |
| ○ Recipes (Spirt) |                           |
| ○ Batches         |                           |
| ○ Distillation    |                           |
| ○ Customers       |                           |
| ○ Sales           |                           |
| ─────────────     |                           |
| ○ Settings        |                           |
|                   |                           |
| [user@gmail.com]  |                           |
| [Logout]          |                           |
+-------------------+---------------------------+
```

На мобильном: нижняя навигация (5 основных пунктов), бургер для остальных.

---

## СТРАНИЦЫ

### DASHBOARD
KPI-карточки в сетке 2×3:
- **Hobby Net Cash** — сумма MoneyLedger (deposits + sales - purchases)
- **Profit vs COGS** — выручка posted продаж - frozen COGS партий
- **Варок этого месяца** — batches.created_at текущий месяц
- **Negative Stock** — компоненты с отрицательным on_hand
- **Customer Debt** — сумма отрицательных балансов
- **Batches to Post** — партии без posting

Секция "Последние варки" — 5 последних batches.
Секция "Алерты" — отрицательные остатки + долги + неподтверждённые партии.

---

### COMPONENTS (`#/components`)

Каталог со вкладками: Все / Солод / Хмель / Дрожжи / Зерно&Сахар / Добавки / Упаковка / Готовое пиво / Готовый дистиллят / Оборудование

Таблица: Название | Тип (чип) | Ед. | Цена/ед | На складе | Хар-ки | Действия

Модальная форма добавления/редактирования.

Динамические поля по типу:
- `malt`: EBC, Экстрактивность %
- `hop`: Alpha Acid %, Форма (pellet/leaf/cryo)
- `yeast`: Аттенюация %, Температура брожения, Flocculation
- `grain_distill`: Крахмалистость %
- `finished_beer` / `finished_spirit`: Партия (batch_id), ABV%

---

### INVENTORY (`#/inventory`)

**Верхняя часть — сводные остатки:**
Таблица: Компонент | Тип | Ед. | На складе (красный если < 0) | Последнее движение

**Нижняя часть — Ledger (лента движений):**
Дата | Компонент | Тип движения (чип) | Δ Кол-во | Стоимость | Ссылка

Кнопка "+ Закупка":
```
Компонент* (searchable select + "создать новый")
Количество*
Цена за единицу*
Итого (авто)
Поставщик
Дата
Заметки
```
Сохранение: добавить строку в Inventory (movement_type=purchase) + в MoneyLedger (movement_type=purchase_expense, отрицательная сумма).

---

### RECIPES — ПИВО (`#/recipes/beer`)

Список рецептов типа `beer`. Карточки с: название, стиль, объём, OG/FG цели, IBU, EBC, ABV, себестоимость.

Редактор рецепта — 6 вкладок:

#### Вкладка 1: Overview
```
Название*
Стиль (BJCP: IPA, Stout, Lager, Wheat...)
Описание
Объём варки (л) | Объём в ферментёр (л) | Объём в упаковку (л)
OG цель | FG цель | ABV% (авторасчёт) | IBU (авторасчёт) | EBC (авторасчёт)
```

#### Вкладка 2: Water & Mash
```
Гидромодуль → авторасчёт воды
Вода затор (л) | Вода промывка (л) | Всего (л)

--- Паузы затирания ---
[+ Добавить паузу]
Каждая пауза: Название | Тип (rest/decoction/step) | Temp °C | Время (мин)
Кнопки ↑↓ для порядка

--- Химия воды ---
Профиль (Pilsen / Burton / Dublin / Custom)
pH цель
Соли: [+ Добавить соль] → Компонент (соль) + количество (г)
```

#### Вкладка 3: Boil & Hops
```
Время кипячения (мин)
OG расчётная (авто из засыпи и экстрактивности)

--- Засыпь (Grain Bill) ---
[+ Добавить солод]
Каждый: Компонент | Кол-во (г/кг) | % от засыпи | EBC | Действия

--- Хмель кипячение ---
[+ Добавить хмель]
Каждый: Компонент | Кол-во (г) | Время (мин) | AA% | IBU вклад

--- Вирпул ---
[+ Добавить в вирпул]
Компонент | Кол-во | Температура | IBU вклад
```

#### Вкладка 4: Fermentation
```
Дрожжи: Компонент | Кол-во | Температура | Дней
Старт дрожжей: температура, питательные вещества

--- Сухое охмеление ---
[+ Добавить]
Компонент | Кол-во | День внесения | Температура | Дней

--- Добавки ---
[+ Добавить]
Компонент | Кол-во | День внесения | Описание
```

#### Вкладка 5: Packaging
```
Тип: Бутылка / Кег / Оба
Бутылки: Компонент (тип packaging) | Кол-во | Объём бутылки
Кеги: Компонент | Кол-во | Объём кега
CO2: Компонент | Кол-во (г)
Этикетки: Компонент | Кол-во
Праймер (если бутылочное): Компонент | Кол-во (г)
```

#### Вкладка 6: Steps & Costs
```
--- Shopping List ---
Список дефицитных ингредиентов: Компонент | Нужно | Есть | Дефицит | [→ Закупить]

--- Auto Steps ---
Автогенерация пошагового рецепта из данных:
1. Подготовка воды: нагреть X л до Y°C
2. Затирание: [каждая пауза по шагу]
3. Промывка: X л воды при Y°C
4. Кипячение X мин: [хмель по временным точкам]
5. Вирпул при Y°C: [добавки]
6. Охлаждение до X°C
7. Внесение дрожжей...
и т.д.

--- Manual Notes ---
Свободный текст (сохраняется отдельно, не перезаписывается)

--- Cost Preview ---
Засыпь и хмель:     XXX руб
Дрожжи и добавки:   XXX руб
Упаковка:           XXX руб
Электроэнергия:     XXX руб (расч.)
Вода:               XXX руб
Труд:               XXX руб
─────────────────────────────
Итого:              XXX руб
На литр:            XX.XX руб

[🖨 Распечатать рецепт]
```

---

### RECIPES — ДИСТИЛЛЯЦИЯ (`#/recipes/spirit`)

Редактор рецепта дистилляции — 5 вкладок:

#### Вкладка 1: Overview
```
Название*
Тип (Виски / Кальвадос / Самогон / Ректификат / Джин / Другое)
Описание
Объём браги (л) | Крепость браги % | Объём выхода (л) | Крепость продукта %
Ожидаемый выход чистого спирта (авторасчёт)
```

#### Вкладка 2: Braga (Брага)
```
Тип основы: Зерновая / Сахарная / Фруктовая / Комбинированная

--- Ингредиенты браги ---
[+ Добавить]
Компонент | Кол-во | Единица | stage_key=wash

--- Дрожжи ---
Компонент | Кол-во | Температура брожения | Дней брожения

--- Питательные вещества ---
[+ Добавить]
Компонент | Кол-во | День внесения

Гидромодуль (для зерновой)
Температурные паузы (если осахаривание)
```

#### Вкладка 3: Distillation
```
Тип дистилляции: Простая / Двойная / Тройная / Ректификация
Тип куба: Pot still / Column
Объём куба (л)

--- Первый перегон ---
Скорость отбора (л/ч)
Разбавление до % перед 2-м перегоном

--- Второй перегон / Ректификация ---
Отбор голов: % от АС или мл
Отбор тела: начальная крепость / конечная крепость
Отбор хвостов: до % крепости

--- Ароматизация (если джин / ликёр) ---
[+ Добавить ботаникал]
Компонент | Кол-во | Метод (maceration/vapor)
```

#### Вкладка 4: Aging & Finishing
```
Выдержка: да/нет
  Тип ёмкости: Дуб / Нержавейка / Стекло
  Время (мес)
  Объём (л)
  Дубовые чипсы/спирали: Компонент | Кол-во

Фильтрация: активированный уголь, тип, время
Разбавление до конечной крепости: вода (л)

Розлив: Компонент (бутылки) | Кол-во | Этикетки
```

#### Вкладка 5: Steps & Costs
(аналогично пиву — shopping list, auto steps, manual notes, cost preview)

---

### BATCHES (`#/batches`)

Список партий: Название | Тип (🍺/🥃 чип) | Рецепт | Статус | Дата | ABV | Объём | COGS

Детальная карточка — вкладки адаптируются под тип (beer/distillate).

#### Для пива — 8 вкладок (как описано в оригинальном ТЗ):
Overview / Plan / Brew Day / Fermentation / Packaging / Posting / Summary / Print

#### Для дистилляции — 8 вкладок:
Overview / Plan / **Брага** (дата старта, OG браги, темп, заметки) / **Перегон** (дата, кВт·ч, выход голов/л, выход тела/л, выход хвостов/л, начальная/конечная крепость) / **Выдержка** (дата начала, ожидаемая дата готовности) / Packaging / Posting / Summary

**Posting для дистилляции:**
- Post Wash Consumption — списание ингредиентов браги
- Post Distillation Output — приход готового дистиллята на склад
- Undo для каждого

**COGS для дистилляции:**
```
Ингредиенты браги:  XXX руб
Электроэнергия:     XXX руб (kwh × rate)
Труд:               XXX руб
─────────────────────────────
Итого:              XXX руб
На литр:            XX.XX руб
На литр АС:         XX.XX руб  ← важный показатель для дистилляции
```

---

### CUSTOMERS (`#/customers`)

Таблица клиентов с балансами.
Детальная карточка: баланс, ledger движений, кнопки Deposit / Adjustment / Refund.
Баланс = SUM(amount_signed) из MoneyLedger для customer_id.

---

### SALES (`#/sales`)

Создание продажи: выбор клиента + позиции (finished_beer или finished_spirit).
Posting: атомарно списывает inventory + баланс клиента.
Возвраты: частичные и полные.
Ledger: все движения с refType/refId.

---

### SETTINGS (`#/settings`)

```
--- Ресурсы ---
Электроэнергия (руб/кВт·ч)
Вода (руб/л)
Ставка труда (руб/ч)

--- Потери ---
Потери при варке (%)
Потери ферментация (%)
Потери дистилляция (%)

--- Система ---
Валюта | Язык

--- Google Sheets ---
Spreadsheet ID (поле для ввода)
[Открыть таблицу ↗]
[Инициализировать листы] ← создать все листы с заголовками если не существуют

--- Backup ---
[📥 Экспорт JSON] — скачать всю базу как JSON
[📤 Импорт JSON] — восстановить из JSON (wipe + restore с preview)
```

---

## ОБЩИЕ UI-КОМПОНЕНТЫ (ui.js)

```js
showModal(title, contentHTML, buttons)
showConfirm(message, details, onConfirm)   // для destructive actions
showToast(message, type)                   // success/error/warning/info, auto-hide 3s
renderTabs(tabs, activeTab, onChange)
renderTable(columns, rows, options)        // sticky header, empty state, loading
createStatusChip(label, color)
createTypeChip(type)                       // возвращает цветной чип по типу компонента
formatCurrency(amount, currency)
formatDate(date)
formatQty(qty, unit)                       // 1500g → 1.5 kg, 2000ml → 2L
renderOnHandDelta(onHand, required)        // On Hand / Required / Δ с цветом
showLoading(container)
showEmpty(container, message, actionLabel, onAction)
showError(container, error)
```

---

## ЦВЕТОВЫЕ ЧИПЫ

```js
const TYPE_COLORS = {
  malt:           '#D97706',  // amber
  hop:            '#059669',  // emerald
  yeast:          '#7C3AED',  // violet
  additive:       '#2563EB',  // blue
  salt:           '#0891B2',  // cyan
  packaging:      '#6B7280',  // gray
  equipment:      '#475569',  // slate
  grain_distill:  '#92400E',  // brown
  sugar:          '#BE185D',  // pink
  fruit:          '#DC2626',  // red
  finished_beer:  '#D4890A',  // gold
  finished_spirit:'#B5622A',  // copper
};

const STATUS_COLORS = {
  planned:    '#6B7280',
  brewing:    '#2563EB',
  fermenting: '#7C3AED',
  distilling: '#B5622A',
  aging:      '#92400E',
  packaging:  '#D97706',
  done:       '#059669',
  archived:   '#374151',
};
```

---

## БИЗНЕС-ЛОГИКА

### On Hand расчёт (всегда из Inventory ledger)
```js
function getOnHand(componentId) {
  return inventory
    .filter(row => row.component_id === componentId)
    .reduce((sum, row) => sum + parseFloat(row.qty_delta), 0);
}
```

### Баланс клиента
```js
function getCustomerBalance(customerId) {
  return moneyLedger
    .filter(row => row.customer_id === customerId)
    .reduce((sum, row) => sum + parseFloat(row.amount_signed), 0);
}
```

### ABV расчёт
```js
function calcABV(og, fg) {
  return ((og - fg) * 131.25).toFixed(2);
}
```

### COGS расчёт для партии
```js
function calcCOGS(batch, inventoryMovements, settings) {
  const batchMovements = inventoryMovements.filter(m => m.ref_id === batch.id);
  
  const materials = batchMovements
    .filter(m => m.movement_type === 'brew_consume' || m.movement_type === 'distill_consume')
    .reduce((sum, m) => sum + Math.abs(m.qty_delta * m.unit_cost), 0);
  
  const packaging = batchMovements
    .filter(m => m.movement_type === 'packaging_consume')
    .reduce((sum, m) => sum + Math.abs(m.qty_delta * m.unit_cost), 0);
  
  const energy = (batch.kwh_used || 0) * parseFloat(settings.electricity_cost_kwh);
  const labor = (batch.labor_hours || 0) * parseFloat(settings.labor_rate_hour);
  
  return { materials, packaging, energy, labor, total: materials + packaging + energy + labor };
}
```

### Idempotent posting
Перед каждым posting проверять:
- `batch.brew_posted === 'TRUE'` → кнопка disabled
- `batch.packaging_posted === 'TRUE'` → кнопка disabled  
- `sale.status === 'posted'` → кнопка disabled

### recipe_snapshot
При создании партии из рецепта:
```js
const snapshot = {
  recipe: { ...recipe },
  ingredients: recipeIngredients.filter(i => i.recipe_id === recipe.id),
  mashRests: recipeMashRests.filter(r => r.recipe_id === recipe.id),
};
batch.recipe_snapshot = JSON.stringify(snapshot);
```
Posting всегда использует `JSON.parse(batch.recipe_snapshot)`, не живые данные рецепта.

---

## АВТОРИЗАЦИЯ (auth.js)

Использовать Google Identity Services (новый GIS, не deprecated gapi.auth2):

```html
<script src="https://accounts.google.com/gsi/client"></script>
```

```js
// Запросить access token для Sheets API
google.accounts.oauth2.initTokenClient({
  client_id: GOOGLE_CLIENT_ID,
  scope: 'https://www.googleapis.com/auth/spreadsheets',
  callback: (tokenResponse) => {
    sessionStorage.setItem('gsi_token', tokenResponse.access_token);
    // expire через tokenResponse.expires_in секунд
  }
}).requestAccessToken();
```

Все запросы к Sheets API добавляют заголовок:
```
Authorization: Bearer <token>
```

---

## КЭШИРОВАНИЕ ДАННЫХ

В памяти хранить объект:
```js
const cache = {
  components: null,
  inventory: null,
  recipes: null,
  recipeIngredients: null,
  recipeMashRests: null,
  batches: null,
  customers: null,
  sales: null,
  moneyLedger: null,
  settings: null,
  lastFetch: {},
};
```

Стратегия: читать из кэша, при записи — инвалидировать соответствующий ключ и перечитать.
TTL = 5 минут (потом перечитать даже без записи).

---

## ИНТЕГРАЦИЯ С CLAUDE (для Claude Projects)

Создать в корне файл `CLAUDE_CONTEXT.md`:

```markdown
# Bood CRM — Context for Claude Assistant

## Google Sheets Structure
Spreadsheet ID: [будет заполнено]
Sheets: Components, Inventory, Recipes, RecipeIngredients, RecipeMashRests, Batches, Customers, Sales, MoneyLedger, Settings

## Column Mappings
[полные маппинги колонок каждого листа]

## Business Rules
- On Hand = SUM(qty_delta) from Inventory grouped by component_id
- Customer Balance = SUM(amount_signed) from MoneyLedger grouped by customer_id
- COGS = materials + packaging + energy + labor
- Posting is idempotent

## Claude Workflow Scenarios
1. Recipe Creation: Claude helps design recipe → writes to Recipes + RecipeIngredients sheets
2. Brew Day Guidance: Claude reads recipe from Recipes sheet → guides step by step → updates Batches sheet
3. Brew Report: After brew day, Claude writes brew log to Batches sheet (og, kwh, notes)
4. Distillation Log: Claude guides distillation → writes cuts data to Batches sheet
```

Этот файл помогает Claude Project понимать структуру и работать с данными.

---

## PRINT LAYOUTS

При печати (`window.print()`) показывать:

**Recipe Sheet:**
```
BOOD — RECIPE SHEET
[Название рецепта]          [Стиль]
─────────────────────────────────
Объём: X л  OG: X.XXX  IBU: XX  EBC: X  ABV: X.X%

ЗАСЫПЬ                      ХМЕЛЬ
[таблица]                   [таблица]

МASH SCHEDULE               ФЕРМЕНТАЦИЯ
[паузы]                     [данные]

СЕБЕСТОИМОСТЬ
[breakdown]

Notes: [manual notes]
```

**Batch Sheet:**
```
BOOD — BREW LOG
[Название партии] — [Дата]
─────────────────────────────────
Рецепт: [имя]   OG: X.XXX   FG: X.XXX   ABV: X.X%
В ферментёр: X л   Упаковано: X л   кВт·ч: X.X

ИНГРЕДИЕНТЫ
[список из recipe_snapshot]

СЕБЕСТОИМОСТЬ
Materials: XXX руб
Energy:    XXX руб
Labor:     XXX руб
TOTAL:     XXX руб (XX руб/л)

Notes: [batch notes]
```

---

## README.md

Создай подробный README:

### Быстрый старт
1. Создать Google Cloud Project на console.cloud.google.com
2. Включить Google Sheets API
3. Создать OAuth 2.0 credentials (тип: Web Application)
4. Добавить в Authorized JavaScript origins: `http://localhost` и ваш GitHub Pages URL
5. Скопировать Client ID в `js/config.js`
6. Создать Google Таблицу, скопировать ID из URL в `js/config.js`
7. Открыть `index.html` → войти через Google → Settings → "Инициализировать листы"
8. Готово!

### Деплой на GitHub Pages
1. Создать репозиторий на GitHub
2. Загрузить файлы
3. Settings → Pages → Source: main branch
4. Добавить GitHub Pages URL в OAuth credentials
5. Открывать по ссылке с любого устройства

### Workflow с Claude
- Создать Claude Project "Bood"
- Подключить Google Drive коннектор
- Прикрепить CLAUDE_CONTEXT.md как системный контекст

---

## ПОРЯДОК РАЗРАБОТКИ

1. Структура файлов + index.html + router.js + layout
2. auth.js — Google авторизация
3. sheets.js — CRUD операции + инициализация листов
4. ui.js — все переиспользуемые компоненты
5. i18n.js — переводы RU/EN
6. css/app.css — полный дизайн (тёмная тема, Bood brand)
7. pages/settings.js — первая страница, тест соединения с Sheets
8. pages/components.js
9. pages/inventory.js
10. pages/recipes.js (beer + spirit)
11. pages/batches.js (beer + distillation)
12. pages/customers.js
13. pages/sales.js
14. pages/dashboard.js
15. Print layouts
16. CLAUDE_CONTEXT.md
17. README.md
18. Финальный тест: все роуты работают, posting idempotent, print работает

**Важно**: весь код ванильный JS. Никаких npm. Работает при открытии index.html напрямую. Единственные внешние зависимости — Google Fonts и Google Identity Services через <script> теги.
