// Bood CRM — Customers Page
import { getRows, appendRow, updateRow, softDelete, genId, now, getSettings } from '../sheets.js';
import { calcCustomerBalance, formatCurrency, formatDate, formatDateTime, escHtml } from '../utils.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError,
  renderTable, pageHeader, formField, textInput, numberInput, textareaInput, collectForm,
  createMovementChip } from '../ui.js';
import t from '../i18n.js';

let customers = [];
let moneyLedger = [];
let settings = {};

export async function renderCustomers(container) {
  showLoading(container);
  try {
    [customers, moneyLedger, settings] = await Promise.all([
      getRows('Customers'),
      getRows('MoneyLedger'),
      getSettings(),
    ]);
    _render(container);
  } catch (e) {
    showError(container, e);
  }
}

function _render(container) {
  const active = customers.filter(c => c.is_active !== 'FALSE');
  const sorted = [...active].sort((a,b) => a.name.localeCompare(b.name));

  container.innerHTML = `
    ${pageHeader(t('customers'), `<button class="btn btn-primary" id="btn-add-customer">+ ${t('new_customer')}</button>`)}
    <div id="customers-table"></div>
  `;

  const cols = [
    { label: t('name'), render: r => `<strong>${escHtml(r.name)}</strong>` },
    { label: t('phone'), render: r => escHtml(r.phone || '—') },
    { label: t('email'), render: r => escHtml(r.email || '—') },
    { label: t('balance'), render: r => {
      const bal = calcCustomerBalance(moneyLedger, r.id);
      const cls = bal < 0 ? 'text-danger' : bal === 0 ? 'text-muted' : 'text-success';
      return `<strong class="${cls}">${formatCurrency(bal, settings.currency)}</strong>`;
    }},
    { label: t('actions'), render: r => `
      <button class="btn btn-sm btn-primary btn-deposit" data-id="${r.id}">+ Депозит</button>
      <button class="btn btn-sm btn-secondary btn-edit" data-id="${r.id}">✎</button>
      <button class="btn btn-sm btn-danger btn-delete" data-id="${r.id}">✕</button>
    `},
  ];

  renderTable(container.querySelector('#customers-table'), cols, sorted, {
    onRowClick: (row, e) => {
      if (!e.target.closest('button')) showCustomerDetail(row, container);
    },
    emptyMessage: 'Нет клиентов',
  });

  container.querySelector('#btn-add-customer')?.addEventListener('click', () => showCustomerForm(null, container));

  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation();
      const c = customers.find(c => c.id === btn.dataset.id);
      if (c) showCustomerForm(c, container);
    });
  });
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation();
      showConfirm(t('confirm_delete'), '', async () => {
        try { await softDelete('Customers', btn.dataset.id); showToast(t('deleted')); await renderCustomers(container); }
        catch (e) { showToast(e.message, 'error'); }
      });
    });
  });
  container.querySelectorAll('.btn-deposit').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation();
      const c = customers.find(c => c.id === btn.dataset.id);
      if (c) showMoneyForm(c, 'deposit', container);
    });
  });
}

function showCustomerForm(customer, pageContainer) {
  const isNew = !customer;
  const html = `
    <form id="customer-form" class="form-grid">
      ${formField(t('name'), textInput('name', customer?.name||''), '', true)}
      ${formField(t('phone'), textInput('phone', customer?.phone||''))}
      ${formField(t('email'), `<input type="email" name="email" class="form-control" value="${escHtml(customer?.email||'')}">`)}
      ${formField(t('notes'), textareaInput('notes', customer?.notes||''))}
    </form>
  `;
  showModal(isNew ? t('new_customer') : `Клиент: ${customer.name}`, html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: t('save'), class: 'btn-primary', action: 'save', onClick: async (overlay) => {
      const data = collectForm(overlay.querySelector('#customer-form'));
      if (!data.name.trim()) { showToast('Введите имя', 'warning'); return; }
      try {
        const ts = now();
        if (isNew) await appendRow('Customers', { id: genId(), ...data, is_active: 'TRUE', created_at: ts, updated_at: ts });
        else await updateRow('Customers', customer.id, { ...customer, ...data, updated_at: ts });
        closeModal(); showToast(t('saved')); await renderCustomers(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}

function showMoneyForm(customer, type, pageContainer) {
  const title = type === 'deposit' ? `Депозит — ${customer.name}` : `Корректировка — ${customer.name}`;
  const html = `
    <form id="money-form" class="form-grid">
      ${formField('Сумма (руб)', numberInput('amount', '', 'min="0.01" step="0.01"'), '', true)}
      ${formField(t('notes'), textareaInput('notes', ''))}
    </form>
  `;
  showModal(title, html, [
    { label: t('cancel'), class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Провести', class: 'btn-primary', action: 'ok', onClick: async (overlay) => {
      const data = collectForm(overlay.querySelector('#money-form'));
      if (!data.amount || parseFloat(data.amount) <= 0) { showToast('Введите сумму', 'warning'); return; }
      try {
        const signed = type === 'deposit' ? parseFloat(data.amount) : -parseFloat(data.amount);
        await appendRow('MoneyLedger', {
          id: genId(), customer_id: customer.id,
          amount_signed: String(signed),
          movement_type: type, ref_type: 'customer', ref_id: customer.id,
          notes: data.notes, created_at: now(),
        });
        closeModal(); showToast(t('saved')); await renderCustomers(pageContainer);
      } catch (e) { showToast(e.message, 'error'); }
    }},
  ]);
}

function showCustomerDetail(customer, pageContainer) {
  const ledger = moneyLedger.filter(l => l.customer_id === customer.id)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const balance = calcCustomerBalance(moneyLedger, customer.id);

  let runningBalance = balance;
  const rows = ledger.map(l => {
    const cur = runningBalance;
    runningBalance -= parseFloat(l.amount_signed || 0);
    return { ...l, _running: cur };
  });

  const html = `
    <div class="customer-detail">
      <div class="customer-header-info">
        <div class="kpi-card">
          <div class="kpi-label">${t('balance')}</div>
          <div class="kpi-value ${balance < 0 ? 'text-danger' : 'text-success'}">${formatCurrency(balance, settings.currency)}</div>
        </div>
        <div class="customer-info-fields">
          <p><strong>Телефон:</strong> ${escHtml(customer.phone || '—')}</p>
          <p><strong>Email:</strong> ${escHtml(customer.email || '—')}</p>
          ${customer.notes ? `<p><strong>Заметки:</strong> ${escHtml(customer.notes)}</p>` : ''}
        </div>
      </div>
      <div class="customer-actions" style="margin: 16px 0">
        <button class="btn btn-primary" id="btn-detail-deposit">+ Депозит</button>
        <button class="btn btn-secondary" id="btn-detail-adjust">Корректировка</button>
      </div>
      <h4>История операций</h4>
      <div class="ledger-list">
        ${rows.length === 0 ? '<p class="text-muted">Нет операций</p>' : `
          <table class="data-table">
            <thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Баланс</th><th>Заметки</th></tr></thead>
            <tbody>
              ${rows.map(l => `<tr>
                <td>${formatDateTime(l.created_at)}</td>
                <td>${createMovementChip(l.movement_type)}</td>
                <td class="${parseFloat(l.amount_signed)>=0?'text-success':'text-danger'}">${parseFloat(l.amount_signed)>=0?'+':''}${formatCurrency(l.amount_signed, settings.currency)}</td>
                <td class="${l._running<0?'text-danger':''}">${formatCurrency(l._running, settings.currency)}</td>
                <td class="text-muted text-sm">${escHtml(l.notes||'')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;

  const overlay = showModal(`Клиент: ${customer.name}`, html, [
    { label: t('close'), class: 'btn-secondary', action: 'close', onClick: closeModal },
  ], { wide: true });

  overlay.querySelector('#btn-detail-deposit')?.addEventListener('click', () => {
    closeModal();
    showMoneyForm(customer, 'deposit', pageContainer);
  });
  overlay.querySelector('#btn-detail-adjust')?.addEventListener('click', () => {
    closeModal();
    showMoneyForm(customer, 'adjustment', pageContainer);
  });
}

