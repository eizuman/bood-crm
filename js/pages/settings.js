// Bood CRM — Settings Page
import { getSettings, setSetting, initializeSheets, exportAllData, importAllData, invalidateAll } from '../sheets.js';
import { showToast, showLoading, showError, pageHeader, showModal, closeModal } from '../ui.js';
import t from '../i18n.js';
import { SPREADSHEET_ID } from '../config.js';
import { escHtml } from '../utils.js';
import { loadCatalog, SUPPORTED_COUNTRIES, getCatalogCount } from '../catalog.js';

export async function renderSettings(container) {
  showLoading(container);
  try {
    let settings;
    try {
      settings = await getSettings();
    } catch (_) {
      settings = {};
    }
    container.innerHTML = `
      ${pageHeader(t('settings'))}
      <div class="settings-grid">
        <div class="section-card">
          <div class="section-card-header"><h3>Ресурсы</h3></div>
          <div class="section-card-body">
            ${settingRow('electricity_cost_kwh', t('electricity_cost'), settings.electricity_cost_kwh, 'number')}
            ${settingRow('water_cost_l', t('water_cost'), settings.water_cost_l, 'number')}
            ${settingRow('labor_rate_hour', t('labor_rate'), settings.labor_rate_hour, 'number')}
          </div>
        </div>

        <div class="section-card">
          <div class="section-card-header"><h3>Потери</h3></div>
          <div class="section-card-body">
            ${settingRow('brew_loss_pct', t('brew_loss'), settings.brew_loss_pct, 'number')}
            ${settingRow('fermenter_loss_pct', t('fermenter_loss'), settings.fermenter_loss_pct, 'number')}
            ${settingRow('distill_loss_pct', t('distill_loss'), settings.distill_loss_pct, 'number')}
          </div>
        </div>

        <div class="section-card">
          <div class="section-card-header"><h3>Система</h3></div>
          <div class="section-card-body">
            <div class="form-field">
              <label class="form-label">${t('currency')}</label>
              <select class="form-control" data-key="currency">
                <option value="RUB" ${settings.currency === 'RUB' ? 'selected' : ''}>RUB (₽)</option>
                <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
              </select>
            </div>
            <div class="form-field">
              <label class="form-label">${t('language')}</label>
              <select class="form-control" data-key="language">
                <option value="ru" ${settings.language === 'ru' ? 'selected' : ''}>Русский</option>
                <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
              </select>
            </div>
          </div>
        </div>

        <div class="section-card">
          <div class="section-card-header"><h3>Google Sheets</h3></div>
          <div class="section-card-body">
            <div class="form-field">
              <label class="form-label">${t('spreadsheet_id')}</label>
              <input type="text" class="form-control" id="spreadsheet-id-input" value="${escHtml(SPREADSHEET_ID)}" readonly>
              <p class="form-hint">Изменить в js/config.js</p>
            </div>
            <div class="settings-actions">
              <a href="https://docs.google.com/spreadsheets/d/${escHtml(SPREADSHEET_ID)}" target="_blank" class="btn btn-secondary">
                ↗ ${t('open_sheet')}
              </a>
              <button class="btn btn-primary" id="btn-init-sheets">${t('init_sheets')}</button>
              <button class="btn btn-secondary" id="btn-load-catalog">📦 Загрузить каталог</button>
            </div>
          </div>
        </div>

        <div class="section-card">
          <div class="section-card-header"><h3>Backup</h3></div>
          <div class="section-card-body">
            <div class="settings-actions">
              <button class="btn btn-secondary" id="btn-export">📥 ${t('export_json')}</button>
              <label class="btn btn-secondary" style="cursor:pointer">
                📤 ${t('import_json')}
                <input type="file" id="btn-import" accept=".json" style="display:none">
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    // Auto-save inputs
    container.querySelectorAll('[data-key]').forEach(el => {
      el.addEventListener('change', async () => {
        try {
          await setSetting(el.dataset.key, el.value);
          showToast(t('saved'));
          if (el.dataset.key === 'language') {
            const { setLanguage } = await import('../i18n.js');
            setLanguage(el.value);
          }
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    // Init sheets
    container.querySelector('#btn-init-sheets')?.addEventListener('click', async () => {
      const btn = container.querySelector('#btn-init-sheets');
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const created = await initializeSheets();
        showToast(created.length ? `${t('sheets_initialized')}: ${created.join(', ')}` : 'Все листы уже существуют');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = t('init_sheets');
      }
    });

    // Load catalog
    container.querySelector('#btn-load-catalog')?.addEventListener('click', () => {
      const countryOpts = SUPPORTED_COUNTRIES.map(c =>
        `<option value="${escHtml(c.code)}">${escHtml(c.label)}</option>`
      ).join('');
      showModal('Загрузить стандартный каталог', `
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Страна / рынок</label>
            <select class="form-control" id="catalog-country">${countryOpts}</select>
          </div>
          <p class="form-hint">
            Будут добавлены популярные ингредиенты для пивоварения и дистилляции
            со справочными ценами для выбранного рынка.<br>
            Уже существующие компоненты (по названию) пропускаются.
          </p>
        </div>
      `, [
        { label: 'Отмена', class: 'btn-secondary', action: 'cancel', onClick: closeModal },
        { label: 'Загрузить', class: 'btn-primary', action: 'save', onClick: async (overlay) => {
          const country = overlay.querySelector('#catalog-country').value;
          const btn = overlay.querySelector('[data-action=save]');
          btn.disabled = true;
          btn.textContent = 'Загружаю...';
          try {
            const { added, skipped } = await loadCatalog(country);
            closeModal();
            if (added > 0) {
              showToast(`Добавлено ${added} компонентов${skipped ? `, пропущено ${skipped} (уже существуют)` : ''}`);
            } else {
              showToast('Все компоненты каталога уже существуют', 'info');
            }
          } catch (e) {
            showToast(e.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Загрузить';
          }
        }},
      ]);
    });

    // Export JSON
    container.querySelector('#btn-export')?.addEventListener('click', async () => {
      try {
        showToast('Экспортирую...', 'info');
        const data = await exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bood-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Экспортировано');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });

    // Import JSON
    container.querySelector('#btn-import')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const preview = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : '?'} rows`).join('\n');
        if (!confirm(`Импортировать данные?\n\n${preview}\n\nЭто перезапишет текущие данные!`)) return;
        showToast('Импортирую...', 'info');
        await importAllData(data);
        invalidateAll();
        showToast('Импортировано успешно');
      } catch (e) {
        showToast(e.message, 'error');
      }
      e.target.value = '';
    });

  } catch (e) {
    showError(container, e);
  }
}

function settingRow(key, label, value, type = 'text') {
  return `
    <div class="form-field">
      <label class="form-label">${escHtml(label)}</label>
      <input type="${type}" class="form-control" data-key="${escHtml(key)}"
        value="${escHtml(value)}" step="any"
        ${type === 'number' ? 'min="0"' : ''}>
    </div>
  `;
}
