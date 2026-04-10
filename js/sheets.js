// Bood CRM — Google Sheets API v4 operations
import { SPREADSHEET_ID, SHEET_NAMES, SHEET_HEADERS, DEFAULT_SETTINGS } from './config.js';
import { getAccessToken } from './auth.js';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

// ─── Cache ────────────────────────────────────────────────────────────────────
const cache = {
  Components: null, Inventory: null, Recipes: null,
  RecipeIngredients: null, RecipeMashRests: null, Batches: null,
  Customers: null, Sales: null, MoneyLedger: null, Settings: null,
  Equipment: null, BrewingProfiles: null,
  lastFetch: {},
};
const TTL = 5 * 60 * 1000; // 5 min

function isCacheFresh(sheet) {
  return cache[sheet] !== null && (Date.now() - (cache.lastFetch[sheet] || 0)) < TTL;
}

function invalidate(...sheets) {
  sheets.forEach(s => { cache[s] = null; cache.lastFetch[s] = 0; });
}

export function invalidateAll() {
  Object.keys(cache).forEach(k => { if (k !== 'lastFetch') cache[k] = null; });
  cache.lastFetch = {};
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function sheetsRequest(path, method = 'GET', body = null) {
  const token = await getAccessToken();
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}/${SPREADSHEET_ID}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Parse rows ───────────────────────────────────────────────────────────────
function parseRows(sheetName, values) {
  if (!values || values.length < 2) return [];
  const headers = SHEET_HEADERS[sheetName];
  return values.slice(1).map((row, idx) => {
    const obj = { _row: idx + 2 }; // 1-indexed, +1 for header
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

// ─── Core operations ──────────────────────────────────────────────────────────
export async function getRows(sheetName, forceRefresh = false) {
  if (!forceRefresh && isCacheFresh(sheetName)) return cache[sheetName];
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
  const range = `${sheetName}!A:${colLetter(headers.length)}`;
  const data = await sheetsRequest(`/values/${encodeURIComponent(range)}`);
  const rows = parseRows(sheetName, data.values);
  cache[sheetName] = rows;
  cache.lastFetch[sheetName] = Date.now();
  return rows;
}

export async function appendRow(sheetName, rowData) {
  const headers = SHEET_HEADERS[sheetName];
  const row = headers.map(h => rowData[h] ?? '');
  await sheetsRequest(
    `/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    'POST',
    { values: [row] }
  );
  invalidate(sheetName);
}

export async function appendRows(sheetName, rowsData) {
  if (!rowsData.length) return;
  const headers = SHEET_HEADERS[sheetName];
  const rows = rowsData.map(rd => headers.map(h => rd[h] ?? ''));
  await sheetsRequest(
    `/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    'POST',
    { values: rows }
  );
  invalidate(sheetName);
}

export async function updateRow(sheetName, id, rowData) {
  const rows = await getRows(sheetName, true);
  const target = rows.find(r => r.id === id);
  if (!target) throw new Error(`Row id=${id} not found in ${sheetName}`);
  const headers = SHEET_HEADERS[sheetName];
  const row = headers.map(h => rowData[h] ?? target[h] ?? '');
  const range = `${sheetName}!A${target._row}:${colLetter(headers.length)}${target._row}`;
  await sheetsRequest(
    `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    'PUT',
    { values: [row] }
  );
  invalidate(sheetName);
}

export async function deleteRow(sheetName, id) {
  const rows = await getRows(sheetName, true);
  const target = rows.find(r => r.id === id);
  if (!target) return;
  const meta = await sheetsRequest('');
  const sheetMeta = meta.sheets.find(s => s.properties.title === sheetName);
  if (!sheetMeta) throw new Error(`Sheet ${sheetName} not found`);
  const gridId = sheetMeta.properties.sheetId;
  await batchUpdate([{
    deleteDimension: {
      range: { sheetId: gridId, dimension: 'ROWS', startIndex: target._row - 1, endIndex: target._row },
    },
  }]);
  invalidate(sheetName);
}

export async function softDelete(sheetName, id) {
  const rows = await getRows(sheetName, true);
  const target = rows.find(r => r.id === id);
  if (!target) return;
  await updateRow(sheetName, id, { ...target, is_active: 'FALSE', updated_at: now() });
  invalidate(sheetName);
}

// Settings helpers
export async function getSettings() {
  const rows = await getRows(SHEET_NAMES.SETTINGS);
  const map = {};
  rows.forEach(r => { if (r.key) map[r.key] = r.value; });
  return { ...DEFAULT_SETTINGS, ...map };
}

export async function setSetting(key, value) {
  const rows = await getRows(SHEET_NAMES.SETTINGS, true);
  const existing = rows.find(r => r.key === key);
  const ts = now();
  if (existing) {
    // Settings has no id column — write directly by row number
    const headers = SHEET_HEADERS[SHEET_NAMES.SETTINGS];
    const row = headers.map(h => ({ key, value, updated_at: ts })[h] ?? existing[h] ?? '');
    const range = `${SHEET_NAMES.SETTINGS}!A${existing._row}:${colLetter(headers.length)}${existing._row}`;
    await sheetsRequest(
      `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      'PUT',
      { values: [row] }
    );
  } else {
    await appendRow(SHEET_NAMES.SETTINGS, { key, value, updated_at: ts });
  }
  invalidate(SHEET_NAMES.SETTINGS);
}

// ─── Batch operations (atomic posting) ────────────────────────────────────────
export async function batchUpdate(requests) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/${SPREADSHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Sheet initialization ─────────────────────────────────────────────────────
export async function initializeSheets() {
  // Get existing sheets
  const meta = await sheetsRequest('');
  const existingSheets = meta.sheets.map(s => s.properties.title);

  const requests = [];
  const sheetsToCreate = [];

  for (const [name, headers] of Object.entries(SHEET_HEADERS)) {
    if (!existingSheets.includes(name)) {
      sheetsToCreate.push(name);
      requests.push({
        addSheet: { properties: { title: name } }
      });
    }
  }

  if (requests.length > 0) {
    await batchUpdate(requests);
  }

  // Write headers to new sheets
  for (const name of sheetsToCreate) {
    const headers = SHEET_HEADERS[name];
    await sheetsRequest(
      `/values/${encodeURIComponent(name)}!A1:${colLetter(headers.length)}1?valueInputOption=USER_ENTERED`,
      'PUT',
      { values: [headers] }
    );
  }

  // Initialize default settings if Settings sheet was just created
  if (sheetsToCreate.includes('Settings')) {
    const ts = now();
    const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value, updated_at: ts }));
    await appendRows('Settings', rows);
  }

  invalidateAll();
  return sheetsToCreate;
}

// ─── Export / Import ──────────────────────────────────────────────────────────
export async function exportAllData() {
  const result = {};
  for (const name of Object.keys(SHEET_HEADERS)) {
    result[name] = await getRows(name, true);
  }
  return result;
}

export async function importAllData(data) {
  // Clear all sheets then re-import
  for (const [name, rows] of Object.entries(data)) {
    if (!SHEET_HEADERS[name]) continue;
    const headers = SHEET_HEADERS[name];
    const colEnd = colLetter(headers.length);

    // Get sheet row count to clear
    const existing = await sheetsRequest(`/values/${encodeURIComponent(name)}!A:A`);
    const rowCount = (existing.values?.length || 1);
    if (rowCount > 1) {
      await sheetsRequest(
        `/values/${encodeURIComponent(name)}!A2:${colEnd}${rowCount}:clear`,
        'POST', {}
      );
    }

    if (rows.length > 0) {
      const values = rows.map(r => headers.map(h => r[h] ?? ''));
      await sheetsRequest(
        `/values/${encodeURIComponent(name)}!A2:${colEnd}${rows.length + 1}?valueInputOption=USER_ENTERED`,
        'PUT', { values }
      );
    }
  }
  invalidateAll();
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function now() {
  return new Date().toISOString();
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
