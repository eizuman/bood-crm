# Bood CRM

Система управления домашним пивоварением и дистилляцией/ректификацией.

**Хранилище данных:** Google Sheets | **Стек:** Vanilla HTML/CSS/JS, без фреймворков

---

## Возможности

- **Компоненты** — каталог солода, хмеля, дрожжей, добавок, упаковки
- **Склад** — автоматический расчёт остатков через аппенд-леджер движений
- **Рецепты (Пиво)** — 6-вкладочный редактор: вода, затор, хмель, брожение, упаковка, стоимость
- **Рецепты (Дистиллят)** — 5-вкладочный редактор: брага, перегон, выдержка
- **Партии** — полный цикл от планирования до проводки, COGS, печать
- **Дистилляция** — специализированный журнал перегона
- **Клиенты** — баланс, депозиты, история операций
- **Продажи** — создание, проводка, атомарное списание со склада
- **Dashboard** — KPI-карточки, алерты о дефиците и долгах
- **Экспорт/Импорт JSON** — резервное копирование всей базы

---

## Быстрый старт

### 1. Google Cloud Project

1. Открыть [console.cloud.google.com](https://console.cloud.google.com)
2. Создать новый проект (или выбрать существующий)
3. Перейти в **APIs & Services → Library**
4. Найти и включить **Google Sheets API**

### 2. OAuth 2.0 Credentials

1. Перейти в **APIs & Services → Credentials**
2. Нажать **Create Credentials → OAuth 2.0 Client ID**
3. Тип приложения: **Web Application**
4. Добавить в **Authorized JavaScript Origins**:
   - `http://localhost` (для локальной разработки)
   - `https://YOUR-USERNAME.github.io` (для GitHub Pages)
5. Скопировать **Client ID**

### 3. Google Таблица

1. Открыть [sheets.google.com](https://sheets.google.com) и создать новую таблицу
2. Скопировать **ID из URL**: `https://docs.google.com/spreadsheets/d/`**`1BxiM...`**`/edit`

### 4. Настройка конфига

Открыть `js/config.js` и заменить значения:

```js
export const GOOGLE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
export const SPREADSHEET_ID   = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms';
```

### 5. Запуск

```bash
# Вариант 1 — просто открыть файл
open index.html

# Вариант 2 — локальный сервер (рекомендуется из-за ES Modules)
python3 -m http.server 8080
# затем открыть http://localhost:8080
```

6. Войти через Google → **Настройки → Инициализировать листы** → Готово!

---

## Деплой на GitHub Pages

```bash
# 1. Создать репозиторий на GitHub (публичный или приватный)
git init
git add .
git commit -m "Initial Bood CRM"
git remote add origin https://github.com/YOUR-USERNAME/bood-crm.git
git push -u origin main

# 2. В настройках репозитория: Settings → Pages → Source: main branch

# 3. Добавить в OAuth credentials ваш GitHub Pages URL:
#    https://YOUR-USERNAME.github.io/bood-crm (или без /bood-crm если repo называется username.github.io)
```

После деплоя приложение будет доступно по адресу `https://YOUR-USERNAME.github.io/bood-crm`.

---

## Структура проекта

```
bood-crm/
├── index.html              — App shell, авторизация, роутер
├── css/
│   └── app.css             — Все стили (тёмная тема Bood)
├── js/
│   ├── config.js           — Client ID, Spreadsheet ID, заголовки листов
│   ├── auth.js             — Google Identity Services OAuth 2.0
│   ├── sheets.js           — Все операции с Sheets API + кэш + инициализация
│   ├── router.js           — Hash-роутер (#/route)
│   ├── ui.js               — UI компоненты (modal, toast, table, forms)
│   ├── i18n.js             — Переводы RU/EN
│   ├── utils.js            — Бизнес-логика (COGS, ABV, IBU, форматирование)
│   └── pages/
│       ├── dashboard.js    — KPI-карточки, алерты
│       ├── components.js   — Каталог компонентов
│       ├── inventory.js    — Склад и движения
│       ├── recipes.js      — Редактор рецептов (пиво + дистиллят)
│       ├── batches.js      — Партии, проводки, COGS
│       ├── distillation.js — Журнал дистилляции
│       ├── customers.js    — Клиенты и балансы
│       ├── sales.js        — Продажи
│       └── settings.js     — Настройки, экспорт/импорт
├── assets/
│   └── logo.svg            — Логотип Bood
└── CLAUDE_CONTEXT.md       — Контекст для Claude Project
```

---

## Архитектура данных

### Принцип Ledger (лента движений)

Остатки на складе **никогда не хранятся напрямую** — они всегда рассчитываются как:
```
On Hand = SUM(qty_delta) WHERE component_id = X
```

Баланс клиента:
```
Balance = SUM(amount_signed) WHERE customer_id = X
```

### Idempotent Posting

Каждое действие «Провести» проверяет флаг перед выполнением:
- `batch.brew_posted = 'TRUE'` → кнопка неактивна
- `batch.packaging_posted = 'TRUE'` → кнопка неактивна
- `sale.status = 'posted'` → кнопка неактивна

### recipe_snapshot

При создании партии из рецепта, текущее состояние рецепта **замораживается в JSON**:
```json
{
  "recipe": { ...поля рецепта... },
  "ingredients": [ ...ингредиенты... ],
  "mashRests": [ ...паузы затирания... ]
}
```

Проводка всегда использует snapshot, а не живой рецепт — изменения рецепта после создания партии не влияют на уже начатую варку.

---

## Работа с Claude

### Настройка Claude Project

1. Создать [Claude Project](https://claude.ai) «Bood Brewing»
2. Добавить `CLAUDE_CONTEXT.md` как системный контекст проекта
3. Подключить Google Drive коннектор для доступа к таблице

### Примеры запросов

```
"Помоги разработать рецепт Munich Dunkel на 25 литров.
 У меня есть: Munich Malt, CaraMunich, Melanoidin, Hallertau."

"Сегодня варил IPA. OG получилась 1.054, влил 19 литров
 в ферментёр, потратил 3.8 кВт·ч. Запиши в партию."

"Сколько стоит производство 1 литра моего последнего виски?
 Учти ингредиенты, электричество и труд."

"Какие компоненты закончились и нужно докупить
 перед следующей варкой Pale Ale?"
```

---

## Кэширование

Данные из Sheets кэшируются в памяти с TTL 5 минут. При любой записи соответствующий кэш инвалидируется немедленно. Это минимизирует количество запросов к API.

При необходимости принудительно обновить: обновить страницу или использовать функцию `invalidateAll()` из `sheets.js`.

---

## Ограничения Google Sheets API

- **Нет реального DELETE**: строки мягко удаляются через `is_active = FALSE`
- **Нет транзакций**: атомарность posting обеспечивается проверкой флагов
- **Лимиты**: 300 запросов/мин на проект, 60 запросов/мин на пользователя
- **Максимум строк**: ~10M ячеек на таблицу (для домашнего использования не критично)

---

## Разработка

Для локальной разработки нужен HTTP-сервер (из-за ES Modules):

```bash
# Python
python3 -m http.server 8080

# Node.js (npx без установки)
npx serve .

# VS Code Live Server extension
```

Открыть `http://localhost:8080`.

---

## Лицензия

MIT — используй свободно для личных проектов домашнего пивоварения.
