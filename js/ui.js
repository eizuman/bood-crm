// Bood CRM — Reusable UI Components
import { TYPE_COLORS, STATUS_COLORS, MOVEMENT_COLORS, formatCurrency, formatDate, escHtml } from './utils.js';
import t from './i18n.js';

// ─── Toast ────────────────────────────────────────────────────────────────────
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${{ success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || '✓'}</span>
    <span class="toast-msg">${escHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function createToastContainer() {
  const el = document.createElement('div');
  el.id = 'toast-container';
  document.body.appendChild(el);
  return el;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
let activeModal = null;

export function showModal(title, contentHTML, buttons = [], options = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay' + (options.wide ? ' modal-wide' : '') + (options.fullscreen ? ' modal-fullscreen' : '');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${escHtml(title)}</h2>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${contentHTML}</div>
      ${buttons.length ? `<div class="modal-footer">${buttons.map(b =>
        `<button class="btn ${b.class || 'btn-secondary'}" data-action="${escHtml(b.action || '')}">${escHtml(b.label)}</button>`
      ).join('')}</div>` : ''}
    </div>
  `;

  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  buttons.forEach(b => {
    if (b.onClick) {
      const btn = overlay.querySelector(`[data-action="${b.action}"]`);
      if (btn) btn.addEventListener('click', () => b.onClick(overlay));
    }
  });

  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  activeModal = overlay;
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));
  return overlay;
}

export function closeModal() {
  if (activeModal) {
    activeModal.classList.remove('modal-visible');
    setTimeout(() => { activeModal?.remove(); activeModal = null; }, 200);
    document.body.classList.remove('modal-open');
  }
}

export function getModalBody() {
  return activeModal?.querySelector('.modal-body');
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function showConfirm(message, details, onConfirm) {
  const overlay = showModal(t('confirm'), `
    <p class="confirm-message">${escHtml(message)}</p>
    ${details ? `<p class="confirm-details">${escHtml(details)}</p>` : ''}
  `, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: t('confirm'), class: 'btn-danger', action: 'ok', onClick: () => { closeModal(); onConfirm(); } },
  ]);
  return overlay;
}

// ─── Loading / Empty / Error ──────────────────────────────────────────────────
export function showLoading(container) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${t('loading')}</p></div>`;
}

export function showEmpty(container, message, actionLabel, onAction) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">○</div>
      <p>${escHtml(message)}</p>
      ${actionLabel ? `<button class="btn btn-primary" id="empty-action">${escHtml(actionLabel)}</button>` : ''}
    </div>
  `;
  if (actionLabel && onAction) {
    container.querySelector('#empty-action')?.addEventListener('click', onAction);
  }
}

export function showError(container, error) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  const msg = error?.message || String(error);
  container.innerHTML = `<div class="error-state"><span class="error-icon">⚠</span><p>${escHtml(msg)}</p></div>`;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export function renderTabs(container, tabs, activeTab, onChange) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `
    <div class="tabs-nav">
      ${tabs.map(tab => `
        <button class="tab-btn${tab.id === activeTab ? ' active' : ''}" data-tab="${escHtml(tab.id)}">
          ${escHtml(tab.label)}
          ${tab.badge ? `<span class="tab-badge">${tab.badge}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.tab);
    });
  });
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function renderTable(container, columns, rows, options = {}) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;

  if (!rows.length) {
    showEmpty(container, options.emptyMessage || t('no_data'), options.emptyActionLabel, options.onEmptyAction);
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>${columns.map(c => `<th${c.width ? ` style="width:${c.width}"` : ''}>${escHtml(c.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${options.rowClass?.(row) || ''}" data-id="${escHtml(row.id || '')}">
              ${columns.map(c => `<td>${c.render ? c.render(row) : escHtml(row[c.key] ?? '')}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (options.onRowClick) {
    container.querySelectorAll('tbody tr').forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('a')) {
          const row = rows.find(r => r.id === tr.dataset.id);
          if (row) options.onRowClick(row, e);
        }
      });
    });
  }
}

// ─── Chips ────────────────────────────────────────────────────────────────────
export function createTypeChip(type, labelOverride) {
  const color = TYPE_COLORS[type] || '#6B7280';
  const label = labelOverride || t(type) || type;
  return `<span class="chip" style="background:${color}20;color:${color};border-color:${color}40">${escHtml(label)}</span>`;
}

export function createStatusChip(status, labelOverride) {
  const color = STATUS_COLORS[status] || '#6B7280';
  const label = labelOverride || t(status) || status;
  return `<span class="chip" style="background:${color}20;color:${color};border-color:${color}40">${escHtml(label)}</span>`;
}

export function createMovementChip(type) {
  const color = MOVEMENT_COLORS[type] || '#6B7280';
  const label = t(type) || type;
  return `<span class="chip chip-sm" style="background:${color}20;color:${color};border-color:${color}40">${escHtml(label)}</span>`;
}

export function createBatchTypeChip(type) {
  const icon = type === 'beer' ? '🍺' : '🥃';
  const color = type === 'beer' ? '#D4890A' : '#B5622A';
  return `<span class="chip" style="background:${color}20;color:${color};border-color:${color}40">${icon} ${type === 'beer' ? 'Пиво' : 'Дистиллят'}</span>`;
}

// ─── On-Hand delta renderer ───────────────────────────────────────────────────
export function renderOnHandDelta(onHand, required = 0, unit = '') {
  const delta = onHand - required;
  const cls = onHand < 0 ? 'negative' : delta < 0 ? 'warning' : 'positive';
  return `<span class="onhand onhand-${cls}">${formatQty(onHand, unit)}</span>`;
}

function formatQty(qty, unit) {
  const n = parseFloat(qty) || 0;
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${unit}`.trim();
}

// ─── Searchable Select ────────────────────────────────────────────────────────
export function createSearchableSelect(id, options, value = '', placeholder = 'Выбрать...') {
  return `
    <div class="searchable-select" id="ss-${id}">
      <input type="text" class="ss-input form-control" placeholder="${escHtml(placeholder)}"
        value="${escHtml(options.find(o => o.value === value)?.label || value)}"
        autocomplete="off" data-value="${escHtml(value)}">
      <div class="ss-dropdown" style="display:none">
        ${options.map(o => `<div class="ss-option" data-value="${escHtml(o.value)}">${escHtml(o.label)}</div>`).join('')}
      </div>
    </div>
  `;
}

export function initSearchableSelects(container) {
  container.querySelectorAll('.searchable-select').forEach(el => {
    const input = el.querySelector('.ss-input');
    const dropdown = el.querySelector('.ss-dropdown');
    const allOptions = [...el.querySelectorAll('.ss-option')];

    input.addEventListener('focus', () => {
      dropdown.style.display = 'block';
      filterOptions('');
    });

    input.addEventListener('input', () => filterOptions(input.value));

    document.addEventListener('click', (e) => {
      if (!el.contains(e.target)) dropdown.style.display = 'none';
    }, true);

    allOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        input.value = opt.textContent;
        input.dataset.value = opt.dataset.value;
        dropdown.style.display = 'none';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    function filterOptions(q) {
      const lq = q.toLowerCase();
      allOptions.forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(lq) ? 'block' : 'none';
      });
    }
  });
}

export function getSearchableValue(container, id) {
  const input = container.querySelector(`#ss-${id} .ss-input`);
  return input?.dataset.value || input?.value || '';
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
export function formField(label, inputHTML, hint = '', required = false) {
  return `
    <div class="form-field">
      <label class="form-label">${escHtml(label)}${required ? ' <span class="required">*</span>' : ''}</label>
      ${inputHTML}
      ${hint ? `<p class="form-hint">${escHtml(hint)}</p>` : ''}
    </div>
  `;
}

export function textInput(name, value = '', attrs = '') {
  return `<input type="text" name="${name}" class="form-control" value="${escHtml(value)}" ${attrs}>`;
}

export function numberInput(name, value = '', attrs = '') {
  return `<input type="number" name="${name}" class="form-control" value="${escHtml(String(value))}" step="any" ${attrs}>`;
}

export function selectInput(name, optionsArr, value = '', attrs = '') {
  const opts = optionsArr.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return `<option value="${escHtml(v)}"${v === value ? ' selected' : ''}>${escHtml(l)}</option>`;
  }).join('');
  return `<select name="${name}" class="form-control" ${attrs}>${opts}</select>`;
}

export function textareaInput(name, value = '', attrs = '') {
  return `<textarea name="${name}" class="form-control" rows="3" ${attrs}>${escHtml(value)}</textarea>`;
}

export function checkboxInput(name, checked = false, label = '') {
  return `<label class="checkbox-label"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${escHtml(label)}</label>`;
}

// ─── Collect form data ────────────────────────────────────────────────────────
export function collectForm(formEl) {
  const data = {};
  formEl.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'checkbox') data[el.name] = el.checked ? 'TRUE' : 'FALSE';
    else data[el.name] = el.value;
  });
  // Searchable selects
  formEl.querySelectorAll('.ss-input[data-value]').forEach(el => {
    const name = el.closest('.searchable-select')?.id?.replace('ss-', '');
    if (name) data[name] = el.dataset.value || el.value;
  });
  return data;
}

// ─── Page layout helpers ──────────────────────────────────────────────────────
export function pageHeader(title, actions = '') {
  return `
    <div class="page-header">
      <h1 class="page-title">${escHtml(title)}</h1>
      <div class="page-actions">${actions}</div>
    </div>
  `;
}

export function kpiCard(label, value, sub = '', color = '') {
  return `
    <div class="kpi-card">
      <div class="kpi-label">${escHtml(label)}</div>
      <div class="kpi-value" style="${color ? `color:${color}` : ''}">${value}</div>
      ${sub ? `<div class="kpi-sub">${escHtml(sub)}</div>` : ''}
    </div>
  `;
}

export function sectionCard(title, contentHTML) {
  return `
    <div class="section-card">
      <div class="section-card-header"><h3>${escHtml(title)}</h3></div>
      <div class="section-card-body">${contentHTML}</div>
    </div>
  `;
}
