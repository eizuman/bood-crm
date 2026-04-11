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
  EQUIPMENT: 'Equipment',
  SETTINGS: 'Settings',
  BREWING_PROFILES: 'BrewingProfiles',
};

export const SHEET_HEADERS = {
  Components: ['id','name','type','unit','cost_per_unit','ebc','alpha_acid','attenuation','spirit_type','notes','is_active','created_at','updated_at','brand','ferment_temp_min','ferment_temp_max','ferment_days_typical'],
  Inventory: ['id','component_id','qty_delta','movement_type','ref_type','ref_id','unit_cost','notes','created_at','brand'],
  Recipes: ['id','name','type','style','description','batch_size_l','fermenter_l','packaged_l','water_total_l','water_mash_l','water_sparge_l','hydromodule','boil_time_min','ferment_temp_c','ferment_days','og_target','fg_target','ibu_estimated','ebc_estimated','abv_estimated','estimated_cost','notes','manual_notes','is_active','created_at','updated_at','label_image','brew_loss_pct','fermenter_loss_pct','ph_target','water_profile','water_additions','og_preboil','ph_preboil','equipment_profile_id','whirlpool_temp_c','whirlpool_time_min','after_boil_l'],
  RecipeIngredients: ['id','recipe_id','component_id','qty','stage_key','time_meta','sort_order','created_at'],
  RecipeMashRests: ['id','recipe_id','sort_order','name','temp_c','duration_min','rest_type','created_at'],
  Batches: ['id','recipe_id','recipe_snapshot','name','type','status','brew_date','og','fg','abv','to_fermenter_l','packaged_l','package_date','kwh_used','labor_hours','brew_notes','ferment_notes','package_notes','brew_posted','brew_posted_at','packaging_posted','packaging_posted_at','cogs_snapshot','cogs_frozen_at','is_active','created_at','updated_at'],
  Customers: ['id','name','phone','email','notes','is_active','created_at','updated_at'],
  Sales: ['id','customer_id','items_snapshot','status','total_amount','posted_at','notes','is_active','created_at','updated_at','sale_type'],
  MoneyLedger: ['id','customer_id','amount_signed','movement_type','ref_type','ref_id','notes','created_at'],
  Equipment: ['id','name','category','purchase_price','purchase_date','status','sale_price','sale_date','notes','is_active','created_at','updated_at'],
  Settings: ['key','value','updated_at'],
  BrewingProfiles: ['id','name','type','system_efficiency','grain_absorption','boiloff_rate_pct','wort_shrinkage_pct','kettle_loss_l','fermenter_loss_l','kettle_volume_l','still_type','column_diameter_mm','packing_type','distillation_speed_lph','theoretical_plates','heads_pct','tails_pct','notes','is_active','created_at','updated_at'],
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
