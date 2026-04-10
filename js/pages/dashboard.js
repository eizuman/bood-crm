// Bood CRM — Dashboard Page
import { getRows, getSettings } from '../sheets.js';
import { calcOnHand, calcCustomerBalance, calcCOGS, formatCurrency, formatDate, isThisMonth, escHtml } from '../utils.js';
import { showLoading, showError, pageHeader, kpiCard, createStatusChip, createBatchTypeChip } from '../ui.js';
import t from '../i18n.js';

export async function renderDashboard(container) {
  showLoading(container);
  try {
    const [components, inventory, batches, customers, sales, moneyLedger, settings] = await Promise.all([
      getRows('Components'),
      getRows('Inventory'),
      getRows('Batches'),
      getRows('Customers'),
      getRows('Sales'),
      getRows('MoneyLedger'),
      getSettings(),
    ]);

    // ── KPI Calculations ──────────────────────────────────────────────────────
    // 1. Hobby Net Cash = SUM(MoneyLedger.amount_signed)
    const hobbyCash = moneyLedger.reduce((s, r) => s + parseFloat(r.amount_signed || 0), 0);

    // 2. Profit vs COGS = posted sales revenue - frozen COGS
    const postedSales = sales.filter(s => s.status === 'posted');
    const salesRevenue = postedSales.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
    const frozenCOGS = batches.filter(b => b.cogs_snapshot)
      .reduce((s, b) => { try { return s + JSON.parse(b.cogs_snapshot).total; } catch { return s; } }, 0);
    const profit = salesRevenue - frozenCOGS;

    // 3. Batches this month
    const batchesThisMonth = batches.filter(b => b.is_active !== 'FALSE' && isThisMonth(b.created_at)).length;

    // 4. Negative Stock
    const activeComponents = components.filter(c => c.is_active !== 'FALSE');
    const negativeStock = activeComponents.filter(c => calcOnHand(inventory, c.id) < 0);

    // 5. Customer Debt (negative balances)
    const activeCustomers = customers.filter(c => c.is_active !== 'FALSE');
    const customerDebt = activeCustomers.reduce((s, c) => {
      const bal = calcCustomerBalance(moneyLedger, c.id);
      return s + (bal < 0 ? Math.abs(bal) : 0);
    }, 0);

    // 6. Batches to Post
    const batchesToPost = batches.filter(b =>
      b.is_active !== 'FALSE' &&
      b.status !== 'archived' &&
      (b.brew_posted !== 'TRUE' || b.packaging_posted !== 'TRUE') &&
      ['fermenting','packaging','done'].includes(b.status)
    ).length;

    // ── Recent Batches ────────────────────────────────────────────────────────
    const recentBatches = [...batches]
      .filter(b => b.is_active !== 'FALSE')
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    // ── Alerts ────────────────────────────────────────────────────────────────
    const alerts = [];
    negativeStock.forEach(c => {
      const qty = calcOnHand(inventory, c.id);
      alerts.push({ type: 'danger', msg: `⚠ Отрицательный остаток: ${c.name} (${qty.toFixed(2)} ${c.unit})` });
    });
    activeCustomers.forEach(c => {
      const bal = calcCustomerBalance(moneyLedger, c.id);
      if (bal < 0) alerts.push({ type: 'warning', msg: `💰 Долг клиента: ${c.name} — ${formatCurrency(Math.abs(bal), settings.currency)}` });
    });
    if (batchesToPost > 0) {
      alerts.push({ type: 'info', msg: `📋 Партий без проводки: ${batchesToPost}` });
    }

    // ── Render ────────────────────────────────────────────────────────────────
    container.innerHTML = `
      ${pageHeader('Обзор')}

      <div class="kpi-grid">
        ${kpiCard(t('hobby_net_cash'), formatCurrency(hobbyCash, settings.currency), 'Все приходы минус расходы', hobbyCash >= 0 ? 'var(--success)' : 'var(--error)')}
        ${kpiCard(t('profit_vs_cogs'), formatCurrency(profit, settings.currency), `Выручка: ${formatCurrency(salesRevenue, settings.currency)}`, profit >= 0 ? 'var(--success)' : 'var(--error)')}
        ${kpiCard(t('batches_this_month'), String(batchesThisMonth), 'Новых партий в этом месяце')}
        ${kpiCard(t('negative_stock'), String(negativeStock.length), 'Компонентов с дефицитом', negativeStock.length > 0 ? 'var(--error)' : '')}
        ${kpiCard(t('customer_debt'), formatCurrency(customerDebt, settings.currency), 'Суммарный долг клиентов', customerDebt > 0 ? 'var(--warning)' : '')}
        ${kpiCard(t('batches_to_post'), String(batchesToPost), 'Ожидают проводки', batchesToPost > 0 ? 'var(--warning)' : '')}
      </div>

      <div class="dashboard-grid">
        <div class="section-card">
          <div class="section-card-header">
            <h3>${t('recent_batches')}</h3>
            <a href="#/batches" class="btn btn-sm btn-secondary">Все партии →</a>
          </div>
          <div class="section-card-body p-0">
            ${recentBatches.length === 0 ? '<p class="p-16 text-muted">Нет партий</p>' : `
              <table class="data-table">
                <thead><tr><th>Название</th><th>Тип</th><th>Статус</th><th>Дата</th></tr></thead>
                <tbody>
                  ${recentBatches.map(b => `<tr style="cursor:pointer" onclick="location.hash='/batches'">
                    <td><strong>${escHtml(b.name)}</strong></td>
                    <td>${createBatchTypeChip(b.type)}</td>
                    <td>${createStatusChip(b.status)}</td>
                    <td class="text-muted">${formatDate(b.brew_date || b.created_at)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>

        <div class="section-card">
          <div class="section-card-header"><h3>${t('alerts')}</h3></div>
          <div class="section-card-body">
            ${alerts.length === 0
              ? `<p class="text-success">✓ ${t('no_alerts')}</p>`
              : alerts.map(a => `<div class="alert alert-${a.type}">${escHtml(a.msg)}</div>`).join('')}
          </div>
        </div>
      </div>
    `;

  } catch (e) {
    showError(container, e);
  }
}
