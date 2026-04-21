// Bood CRM — Dashboard Page
import { getRows, getSettings } from '../sheets.js';
import { calcOnHand, calcCustomerBalance, calcCOGS, formatCurrency, formatDate, isThisMonth, escHtml } from '../utils.js';
import { showLoading, showError, showModal, closeModal, pageHeader, kpiCard, createStatusChip, createBatchTypeChip } from '../ui.js';
import t from '../i18n.js';

const ML_TYPE_LABELS = {
  deposit:             'Депозиты клиентов',
  withdrawal:          'Снятие с баланса',
  sale_charge:         'Списания за продажи (долг)',
  equipment_purchase:  'Покупка оборудования',
  equipment_sale:      'Продажа оборудования',
  purchase:            'Закупки сырья',
  ingredient_purchase: 'Закупки ингредиентов',
  expense:             'Расходы',
  refund:              'Возврат клиентам',
};

let _bd = {};

function _mlLabel(type) { return ML_TYPE_LABELS[type] || escHtml(`(${type})`); }

function _bdRow(labelHtml, valueHtml, bold = false) {
  return `<div class="bd-line${bold ? ' bd-total' : ''}"><span>${labelHtml}</span><span>${valueHtml}</span></div>`;
}

function _colored(amount, cur, showSign = true) {
  const sign = showSign && amount > 0 ? '+' : '';
  const color = amount >= 0 ? 'var(--success)' : 'var(--error)';
  return `<span style="color:${color}">${sign}${formatCurrency(amount, cur)}</span>`;
}

function _neutral(amount, cur) {
  return `<span>${formatCurrency(amount, cur)}</span>`;
}

function _showBreakdown(key) {
  const bd = _bd[key];
  if (!bd) return;
  showModal(bd.title, `
    ${bd.note ? `<p class="bd-note">${bd.note}</p>` : ''}
    <div class="bd-lines">${bd.rows}</div>
  `, [{ label: 'Закрыть', class: 'btn-secondary', action: 'close', onClick: closeModal }]);
}

export async function renderDashboard(container) {
  showLoading(container);
  try {
    const [components, inventory, batches, customers, sales, moneyLedger, equipment, settings] = await Promise.all([
      getRows('Components'),
      getRows('Inventory'),
      getRows('Batches'),
      getRows('Customers'),
      getRows('Sales'),
      getRows('MoneyLedger'),
      getRows('Equipment'),
      getSettings(),
    ]);

    const cur = settings.currency;

    // ── KPI Calculations ──────────────────────────────────────────────────────
    // 1. Hobby Net Cash = SUM(MoneyLedger.amount_signed)
    const hobbyCash = moneyLedger.reduce((s, r) => s + parseFloat(r.amount_signed || 0), 0);

    // ML grouped by movement_type
    const mlGrouped = {};
    moneyLedger.forEach(r => {
      const mt = r.movement_type || 'other';
      mlGrouped[mt] = (mlGrouped[mt] || 0) + parseFloat(r.amount_signed || 0);
    });

    // 2. Revenue & COGS
    const postedSales = sales.filter(s => s.status === 'posted' && s.sale_type !== 'gift');
    const salesRevenue = postedSales.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
    const giftCount = sales.filter(s => s.status === 'posted' && s.sale_type === 'gift').length;
    const frozenCOGS = batches.filter(b => b.cogs_snapshot)
      .reduce((s, b) => { try { return s + JSON.parse(b.cogs_snapshot).total; } catch { return s; } }, 0);
    const hasCOGS = frozenCOGS > 0;
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

    // 7. CAPEX & Break-even
    const activeEquipment = equipment.filter(e => e.is_active !== 'FALSE');
    const capexInvested = activeEquipment.reduce((s, e) => s + (parseFloat(e.purchase_price) || 0), 0);
    const capexRecovered = activeEquipment
      .filter(e => e.sale_price && parseFloat(e.sale_price) > 0)
      .reduce((s, e) => s + (parseFloat(e.sale_price) || 0), 0);
    const netCapex = capexInvested - capexRecovered;

    const firstEquipDate = activeEquipment
      .map(e => new Date(e.purchase_date || e.created_at))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b)[0];

    // Operational income: non-equipment ML flow + sales revenue as proxy
    const mlOperational = moneyLedger
      .filter(r => r.movement_type !== 'equipment_purchase' && r.movement_type !== 'equipment_sale')
      .reduce((s, r) => s + parseFloat(r.amount_signed || 0), 0);
    const operationalIncome = Math.max(salesRevenue, mlOperational > 0 ? mlOperational : 0) +
      Math.min(0, mlOperational);

    const coverageAmount = Math.max(0, operationalIncome);
    const remaining = Math.max(0, netCapex - coverageAmount);
    const coveragePct = netCapex > 0 ? Math.min(100, (coverageAmount / netCapex) * 100) : 100;

    let breakEvenProjection = null;
    if (remaining > 0 && firstEquipDate && coverageAmount > 0) {
      const monthsElapsed = Math.max(1,
        (Date.now() - firstEquipDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
      );
      const monthlyRate = coverageAmount / monthsElapsed;
      if (monthlyRate > 0) {
        const monthsLeft = remaining / monthlyRate;
        const breakEvenDate = new Date(Date.now() + monthsLeft * 30.44 * 24 * 60 * 60 * 1000);
        breakEvenProjection = { monthsLeft: Math.round(monthsLeft), date: breakEvenDate, monthlyRate };
      }
    } else if (remaining <= 0 && netCapex > 0) {
      breakEvenProjection = { done: true };
    }

    // ── Build breakdowns ──────────────────────────────────────────────────────
    _bd = {};

    // Баланс кассы: ML сгруппировано по типам
    {
      const rows = Object.entries(mlGrouped)
        .sort((a, b) => a[1] - b[1])
        .map(([type, amt]) => _bdRow(_mlLabel(type), _colored(amt, cur)))
        .join('') +
        _bdRow('ИТОГО', _colored(hobbyCash, cur, false), true);
      _bd['cash'] = {
        title: 'Баланс кассы — расшифровка',
        note: 'Сумма всех записей таблицы MoneyLedger по полю amount_signed.',
        rows,
      };
    }

    // Выручка / прибыль
    {
      let rows;
      if (hasCOGS) {
        rows = [
          _bdRow('Выручка от продаж', _colored(salesRevenue, cur)),
          _bdRow(`Себестоимость (COGS, ${batches.filter(b => b.cogs_snapshot).length} партий)`, _colored(-frozenCOGS, cur)),
          _bdRow('Прибыль', _colored(profit, cur, false), true),
        ].join('');
      } else {
        rows = [
          _bdRow(`Проведённые продажи (${postedSales.length})`, _colored(salesRevenue, cur)),
          ...(giftCount > 0 ? [_bdRow(`Подарки (${giftCount}) — не учитываются`, _neutral(0, cur))] : []),
          _bdRow('ИТОГО', _colored(salesRevenue, cur, false), true),
        ].join('');
      }
      _bd['revenue'] = {
        title: hasCOGS ? 'Прибыль — расшифровка' : 'Выручка от продаж — расшифровка',
        rows,
      };
    }

    // Капекс
    {
      const equipRows = activeEquipment
        .slice(0, 8)
        .map(e => _bdRow(
          escHtml(e.name || '—') + (e.purchase_date ? ` <span class="text-muted" style="font-size:11px">${formatDate(e.purchase_date)}</span>` : ''),
          `<span>${formatCurrency(parseFloat(e.purchase_price) || 0, cur)}</span>`
        )).join('');
      const moreCount = activeEquipment.length - 8;
      const moreRow = moreCount > 0
        ? _bdRow(`...ещё ${moreCount} позиций`, _neutral(activeEquipment.slice(8).reduce((s, e) => s + (parseFloat(e.purchase_price) || 0), 0), cur))
        : '';
      const rows = equipRows + moreRow +
        `<div class="bd-line bd-section-header"><span>ИТОГО</span><span></span></div>` +
        _bdRow(`Куплено (${activeEquipment.length} ед.)`, _neutral(capexInvested, cur)) +
        (capexRecovered > 0 ? _bdRow('Возвращено (продажи)', _colored(capexRecovered, cur)) : '') +
        _bdRow('НЕТТО CAPEX', `<span style="color:var(--accent)">${formatCurrency(netCapex, cur)}</span>`, true);
      _bd['capex'] = {
        title: 'Капекс — расшифровка',
        note: 'Данные из таблицы «Оборудование».',
        rows,
      };
    }

    // Покрыто операционным потоком
    {
      const mlOpEntries = Object.entries(mlGrouped)
        .filter(([type]) => type !== 'equipment_purchase' && type !== 'equipment_sale');
      const mlOpRows = mlOpEntries
        .sort((a, b) => a[1] - b[1])
        .map(([type, amt]) => _bdRow(_mlLabel(type), _colored(amt, cur)))
        .join('');

      const isProxyUsed = mlOperational <= 0;
      const rows = [
        `<div class="bd-line bd-section-header"><span>Операционные движения в кассе (без оборудования)</span><span></span></div>`,
        mlOpRows,
        _bdRow('Итого в кассе (опер.)', _colored(mlOperational, cur), false),
        `<div class="bd-line bd-section-header"><span>Формула расчёта</span><span></span></div>`,
        _bdRow(isProxyUsed ? 'Выручка от продаж (прокси дохода)' : 'Фактический доход из кассы',
          _colored(isProxyUsed ? salesRevenue : mlOperational, cur)),
        ...(isProxyUsed ? [_bdRow('Операционные расходы из кассы', _colored(mlOperational, cur))] : []),
        _bdRow('Покрыто операционным потоком', `<span style="color:var(--success);font-weight:700">${formatCurrency(coverageAmount, cur)}</span>`, true),
      ].join('');

      _bd['coverage'] = {
        title: 'Покрыто операционным потоком — расшифровка',
        note: isProxyUsed
          ? 'Выручка от продаж используется как прокси дохода хобби, из которого вычитаются прочие операционные расходы из кассы (закупки и т.п.).'
          : 'Фактический доход из кассы (депозиты минус расходы, без оборудования).',
        rows,
      };
    }

    // Осталось окупить
    {
      const rows = [
        _bdRow('Нетто CAPEX (вложено в оборудование)', _neutral(netCapex, cur)),
        _bdRow('Покрыто операционным потоком', _colored(-coverageAmount, cur)),
        _bdRow('Осталось окупить', `<span style="color:${remaining > 0 ? 'var(--error)' : 'var(--success)'};font-weight:700">${formatCurrency(remaining, cur)}</span>`, true),
      ].join('');
      _bd['remaining'] = {
        title: 'Осталось окупить — расшифровка',
        rows,
      };
    }

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
      if (bal < 0) alerts.push({ type: 'warning', msg: `💰 Долг клиента: ${c.name} — ${formatCurrency(Math.abs(bal), cur)}` });
    });
    if (batchesToPost > 0) {
      alerts.push({ type: 'info', msg: `📋 Партий без проводки: ${batchesToPost}` });
    }

    // ── Render ────────────────────────────────────────────────────────────────
    container.innerHTML = `
      ${pageHeader('Обзор')}

      <div class="kpi-grid">
        ${kpiCard('Баланс кассы', formatCurrency(hobbyCash, cur),
          'Депозиты и расходы из MoneyLedger',
          hobbyCash >= 0 ? 'var(--success)' : 'var(--error)', 'cash')}
        ${kpiCard(
          hasCOGS ? 'Прибыль (за вычетом себест.)' : 'Выручка от продаж',
          formatCurrency(hasCOGS ? profit : salesRevenue, cur),
          hasCOGS
            ? `COGS: ${formatCurrency(frozenCOGS, cur)}`
            : `${postedSales.length} продаж · ${giftCount} подарков`,
          (hasCOGS ? profit : salesRevenue) >= 0 ? 'var(--success)' : 'var(--error)', 'revenue')}
        ${kpiCard('Капекс (нетто)', formatCurrency(netCapex, cur),
          `Вложено: ${formatCurrency(capexInvested, cur)} · возвращено: ${formatCurrency(capexRecovered, cur)}`,
          'var(--accent)', 'capex')}
        ${kpiCard(t('batches_this_month'), String(batchesThisMonth), 'Новых партий в этом месяце')}
        ${kpiCard(t('negative_stock'), String(negativeStock.length), 'Компонентов с дефицитом', negativeStock.length > 0 ? 'var(--error)' : '')}
        ${kpiCard(t('customer_debt'), formatCurrency(customerDebt, cur), 'Суммарный долг клиентов', customerDebt > 0 ? 'var(--warning)' : '')}
      </div>

      <div class="section-card" style="margin-bottom:24px">
        <div class="section-card-header"><h3>Окупаемость оборудования</h3></div>
        <div class="section-card-body">
          ${netCapex <= 0 ? '<p class="text-muted">Данных о CAPEX нет.</p>' : `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
              <div>
                <div class="text-muted text-sm" style="margin-bottom:4px">
                  Вложено в оборудование
                  <button class="inline-info-btn" data-bd="capex" title="Расшифровка">ⓘ</button>
                </div>
                <div style="font-size:1.2em;font-weight:600">${formatCurrency(netCapex, cur)}</div>
              </div>
              <div>
                <div class="text-muted text-sm" style="margin-bottom:4px">
                  Покрыто операционным потоком
                  <button class="inline-info-btn" data-bd="coverage" title="Расшифровка">ⓘ</button>
                </div>
                <div style="font-size:1.2em;font-weight:600;color:var(--success)">${formatCurrency(coverageAmount, cur)}</div>
              </div>
              <div>
                <div class="text-muted text-sm" style="margin-bottom:4px">
                  Осталось окупить
                  <button class="inline-info-btn" data-bd="remaining" title="Расшифровка">ⓘ</button>
                </div>
                <div style="font-size:1.2em;font-weight:600;color:${remaining > 0 ? 'var(--error)' : 'var(--success)'}">${formatCurrency(remaining, cur)}</div>
              </div>
            </div>
            <div style="background:var(--bg-secondary);border-radius:8px;height:12px;overflow:hidden;margin-bottom:12px">
              <div style="height:100%;width:${coveragePct.toFixed(1)}%;background:var(--success);border-radius:8px;transition:width 0.5s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span class="text-muted text-sm">${coveragePct.toFixed(1)}% окупаемости</span>
              <span class="text-sm">
                ${breakEvenProjection?.done
                  ? '<span style="color:var(--success);font-weight:600">Оборудование окупилось!</span>'
                  : breakEvenProjection
                    ? `Прогноз окупаемости: <strong>${breakEvenProjection.date.toLocaleDateString('ru-RU', {month:'long',year:'numeric'})}</strong> (~${breakEvenProjection.monthsLeft} мес.) · ${formatCurrency(Math.round(breakEvenProjection.monthlyRate), cur)}/мес.`
                    : '<span class="text-muted">Недостаточно данных для прогноза</span>'
                }
              </span>
            </div>
          `}
        </div>
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

    // ── Breakdown click handler ────────────────────────────────────────────────
    if (!container._bdListenerAdded) {
      container.addEventListener('click', e => {
        const btn = e.target.closest('.kpi-info-btn, .inline-info-btn');
        if (btn?.dataset?.bd) _showBreakdown(btn.dataset.bd);
      });
      container._bdListenerAdded = true;
    }

  } catch (e) {
    showError(container, e);
  }
}
