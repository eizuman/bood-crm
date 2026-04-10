// Bood CRM — Configuration
// Replace these values with your own credentials

export const GOOGLE_CLIENT_ID = '142870288719-uqoo2rk3llaajn4upvq5kfth8is50k3d.apps.googleusercontent.com';
export const SPREADSHEET_ID = '1TxavRP31LKApJkcJrSq4pK69In_eompA_nVyshDGmI0';
export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

export const SHEET_NAMES = {
  COMPONENTS: 'Components',
  INVENTORY: 'Inventory',
  RECIPES: 'Recipes',
  RECIPE_INGREDIENTS: 'RecipeIngredients',
  RECIPE_MASH_RESTS: 'RecipeMashRests',
  BATCHES: 'Batches',
  CUSTOMERS: 'Customers',
  SALES: 'Sales',
  MONEY_LEDGER: 'MoneyLedger',
  SETTINGS: 'Settings',
};

export const SHEET_HEADERS = {
  Components: ['id','name','type','unit','cost_per_unit','ebc','alpha_acid','attenuation','spirit_type','notes','is_active','created_at','updated_at'],
  Inventory: ['id','component_id','qty_delta','movement_type','ref_type','ref_id','unit_cost','notes','created_at'],
  Recipes: ['id','name','type','style','description','batch_size_l','fermenter_l','packaged_l','water_total_l','water_mash_l','water_sparge_l','hydromodule','boil_time_min','ferment_temp_c','ferment_days','og_target','fg_target','ibu_estimated','ebc_estimated','abv_estimated','estimated_cost','notes','manual_notes','is_active','created_at','updated_at'],
  RecipeIngredients: ['id','recipe_id','component_id','qty','stage_key','time_meta','sort_order','created_at'],
  RecipeMashRests: ['id','recipe_id','sort_order','name','temp_c','duration_min','rest_type','created_at'],
  Batches: ['id','recipe_id','recipe_snapshot','name','type','status','brew_date','og','fg','abv','to_fermenter_l','packaged_l','package_date','kwh_used','labor_hours','brew_notes','ferment_notes','package_notes','brew_posted','brew_posted_at','packaging_posted','packaging_posted_at','cogs_snapshot','cogs_frozen_at','is_active','created_at','updated_at'],
  Customers: ['id','name','phone','email','notes','is_active','created_at','updated_at'],
  Sales: ['id','customer_id','items_snapshot','status','total_amount','posted_at','notes','is_active','created_at','updated_at'],
  MoneyLedger: ['id','customer_id','amount_signed','movement_type','ref_type','ref_id','notes','created_at'],
  Settings: ['key','value','updated_at'],
};

export const DEFAULT_SETTINGS = {
  electricity_cost_kwh: '6.5',
  water_cost_l: '0.05',
  labor_rate_hour: '300',
  brew_loss_pct: '10',
  fermenter_loss_pct: '5',
  distill_loss_pct: '15',
  currency: 'RUB',
  language: 'ru',
};
