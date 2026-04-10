# Bood CRM — Context for Claude Assistant

## Overview
This is a home brewing and distillation CRM system. Data is stored in Google Sheets.
The application uses vanilla HTML/CSS/JS (no frameworks) with Google Sheets API v4.

## Google Sheets Structure
Spreadsheet ID: [configured in js/config.js]

### Sheets and Columns

**Components** — ingredient/product catalog
`id | name | type | unit | cost_per_unit | ebc | alpha_acid | attenuation | spirit_type | notes | is_active | created_at | updated_at`
- types: malt, hop, yeast, additive, salt, packaging, equipment, grain_distill, sugar, fruit, finished_beer, finished_spirit, other

**Inventory** — all stock movements (append-only ledger)
`id | component_id | qty_delta | movement_type | ref_type | ref_id | unit_cost | notes | created_at`
- movement_type: purchase, brew_consume, distill_consume, packaging_consume, packaging_produce, sale_out, return_in, adjustment
- On Hand = SUM(qty_delta) WHERE component_id = X (can be negative)

**Recipes** — beer and distillate recipes
`id | name | type | style | description | batch_size_l | fermenter_l | packaged_l | water_total_l | water_mash_l | water_sparge_l | hydromodule | boil_time_min | ferment_temp_c | ferment_days | og_target | fg_target | ibu_estimated | ebc_estimated | abv_estimated | estimated_cost | notes | manual_notes | is_active | created_at | updated_at`
- type: beer / distillate

**RecipeIngredients** — ingredients per recipe
`id | recipe_id | component_id | qty | stage_key | time_meta | sort_order | created_at`
- stage_key (beer): mash, boil, whirlpool, fermentation, dry_hop, packaging
- stage_key (spirit): wash, distillation, aging, bottling

**RecipeMashRests** — mash temperature rests
`id | recipe_id | sort_order | name | temp_c | duration_min | rest_type | created_at`
- rest_type: rest, decoction, step

**Batches** — production batches (beer or distillate)
`id | recipe_id | recipe_snapshot | name | type | status | brew_date | og | fg | abv | to_fermenter_l | packaged_l | package_date | kwh_used | labor_hours | brew_notes | ferment_notes | package_notes | brew_posted | brew_posted_at | packaging_posted | packaging_posted_at | cogs_snapshot | cogs_frozen_at | is_active | created_at | updated_at`
- status: planned, brewing, fermenting, distilling, aging, packaging, done, archived
- brew_posted/packaging_posted: TRUE/FALSE strings
- recipe_snapshot: JSON with {recipe, ingredients, mashRests} frozen at batch creation
- cogs_snapshot: JSON with {materials, packaging, energy, labor, total} frozen at packaging posting

**Customers** — customer registry
`id | name | phone | email | notes | is_active | created_at | updated_at`

**Sales** — sales records
`id | customer_id | items_snapshot | status | total_amount | posted_at | notes | is_active | created_at | updated_at`
- items_snapshot: JSON array [{component_id, name, qty, unit_price, refunded_qty}]
- status: draft / posted

**MoneyLedger** — all money movements (append-only ledger)
`id | customer_id | amount_signed | movement_type | ref_type | ref_id | notes | created_at`
- Customer Balance = SUM(amount_signed) WHERE customer_id = X
- movement_type: deposit, sale_charge, refund, adjustment, purchase_expense
- purchase_expense: negative amount (money out for ingredient purchases)
- sale_charge: negative amount (charged to customer)
- deposit: positive amount

**Settings** — key-value settings
`key | value | updated_at`
- Keys: electricity_cost_kwh, water_cost_l, labor_rate_hour, brew_loss_pct, fermenter_loss_pct, distill_loss_pct, currency, language

## Business Rules

### On Hand Calculation
```
On Hand(componentId) = SUM(Inventory.qty_delta WHERE component_id = componentId)
```
Always derived from the Inventory ledger — never stored directly. Can be negative.

### Customer Balance
```
Balance(customerId) = SUM(MoneyLedger.amount_signed WHERE customer_id = customerId)
```
Negative balance = customer owes money.

### COGS Calculation
```
materials = SUM(ABS(qty_delta * unit_cost)) WHERE ref_id=batchId AND movement_type IN (brew_consume, distill_consume)
packaging = SUM(ABS(qty_delta * unit_cost)) WHERE ref_id=batchId AND movement_type = packaging_consume
energy    = kwh_used * electricity_cost_kwh
labor     = labor_hours * labor_rate_hour
total     = materials + packaging + energy + labor
```

### ABV Formula
```
ABV = (OG - FG) * 131.25
```

### Posting (Idempotent)
- **Brew Posting**: batch.brew_posted = 'TRUE' → disabled. Creates Inventory rows (brew_consume/distill_consume) for recipe ingredients.
- **Packaging Posting**: batch.packaging_posted = 'TRUE' → disabled. Creates Inventory rows (packaging_consume) for packaging materials, (packaging_produce) for finished product. Freezes COGS snapshot.
- **Sale Posting**: sale.status = 'posted' → disabled. Creates Inventory (sale_out) + MoneyLedger (sale_charge) rows.

### recipe_snapshot
When creating a batch from a recipe, the current recipe state is frozen as JSON:
```json
{
  "recipe": { ...recipe fields... },
  "ingredients": [ ...RecipeIngredients rows... ],
  "mashRests": [ ...RecipeMashRests rows... ]
}
```
Posting always uses recipe_snapshot data — never live recipe data.

## Claude Workflow Scenarios

### 1. Recipe Design
"Help me design a Munich Dunkel recipe for 25L batch"
→ Claude reads Components sheet for available malts/hops
→ Suggests grain bill, hop schedule, mash rests
→ Can write to Recipes + RecipeIngredients + RecipeMashRests sheets

### 2. Brew Day Guidance
"I'm brewing batch [name] today, guide me step by step"
→ Claude reads Batches sheet for the batch, parses recipe_snapshot
→ Generates step-by-step instructions based on actual recipe data
→ Records OG, volumes, kWh, notes into Batches sheet after brew

### 3. Brew Day Report
"Brew is done. OG was 1.052, got 22L into fermenter, used 4.5 kWh"
→ Claude updates Batches sheet: og=1.052, to_fermenter_l=22, kwh_used=4.5, status=fermenting

### 4. Distillation Log
"I distilled today: got 3.5L hearts at 72%, used 2.8 kWh"
→ Claude updates Batches sheet: to_fermenter_l=3.5, fg=72, kwh_used=2.8

### 5. COGS Analysis
"What's the cost breakdown for my last 5 batches?"
→ Claude reads Batches (cogs_snapshot) + Settings → calculates and compares

### 6. Inventory Check
"What ingredients do I have enough of for the Pale Ale recipe?"
→ Reads RecipeIngredients + Inventory → calculates on_hand per component → reports shortfalls

### 7. Customer Ledger
"How much does [customer] owe?"
→ Reads MoneyLedger WHERE customer_id → sums amount_signed

## File Structure
```
index.html          — App shell, auth screen, router bootstrap
css/app.css         — All styles (dark theme, Bood brand)
js/config.js        — GOOGLE_CLIENT_ID, SPREADSHEET_ID, column headers
js/auth.js          — Google Identity Services OAuth 2.0
js/sheets.js        — Sheets API CRUD + caching + initializeSheets()
js/router.js        — Hash-based router (#/route)
js/ui.js            — Reusable UI components (modal, toast, table, form helpers)
js/i18n.js          — RU/EN translations
js/utils.js         — Business logic calculations, formatters
js/pages/           — Page modules (one per route)
```
