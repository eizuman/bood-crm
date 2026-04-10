// Bood CRM — Equipment Profiles page
import { getRows, appendRow, updateRow, softDelete, genId, now } from '../sheets.js';
import { showModal, closeModal, showConfirm, showToast, showLoading, showError, pageHeader, formField } from '../ui.js';
import t from '../i18n.js';
import { SHEET_NAMES } from '../config.js';

const SHEET = SHEET_NAMES.BREWING_PROFILES;

// ── Helpers ────────────────────────────────────────────────────────────────────

function val(id) {
  return document.getElementById(id)?.value ?? '';
}

function stillTypeLabel(v) {
  return { pot_still: 'Горшок', reflux_column: 'Ректификационная колонна', hybrid: 'Гибрид' }[v] ?? v ?? '—';
}

function packingTypeLabel(v) {
  return {
    copper_mesh: 'Медная сетка',
    spp: 'СПН',
    raschig: 'Кольца Рашига',
    ceramic: 'Керамика',
    none: 'Без насадки',
  }[v] ?? v ?? '—';
}

// ── Beer profile form ──────────────────────────────────────────────────────────

function beerFormHTML(p = {}) {
  return `
    <div class="form-row-2">
      ${formField('Название', `<input class="form-control" id="pf-name" value="${p.name ?? ''}" required>`, '', true)}
    </div>
    <div class="form-row-2">
      ${formField('Эффективность системы %', `<input class="form-control" id="pf-system_efficiency" type="number" step="0.1" value="${p.system_efficiency ?? 72}">`)}
      ${formField('Впитывание солода л/кг', `<input class="form-control" id="pf-grain_absorption" type="number" step="0.01" value="${p.grain_absorption ?? 1.0}">`)}
    </div>
    <div class="form-row-2">
      ${formField('Выкипание % в час', `<input class="form-control" id="pf-boiloff_rate_pct" type="number" step="0.1" value="${p.boiloff_rate_pct ?? 10}">`)}
      ${formField('Температурное сжатие %', `<input class="form-control" id="pf-wort_shrinkage_pct" type="number" step="0.1" value="${p.wort_shrinkage_pct ?? 4}">`)}
    </div>
    <div class="form-row-2">
      ${formField('Потери в котле л', `<input class="form-control" id="pf-kettle_loss_l" type="number" step="0.1" value="${p.kettle_loss_l ?? 1.5}">`)}
      ${formField('Потери в ферментёре л', `<input class="form-control" id="pf-fermenter_loss_l" type="number" step="0.1" value="${p.fermenter_loss_l ?? 1.0}">`)}
    </div>
    <div class="form-row-2">
      ${formField('Объём варочника л', `<input class="form-control" id="pf-kettle_volume_l" type="number" step="0.5" value="${p.kettle_volume_l ?? ''}">`)}
    </div>
    ${formField('Заметки', `<textarea class="form-control" id="pf-notes" rows="3">${p.notes ?? ''}</textarea>`)}
  `;
}

function spiritFormHTML(p = {}) {
  const stillOptions = [
    ['pot_still', 'Горшок'],
    ['reflux_column', 'Ректификационная колонна'],
    ['hybrid', 'Гибрид'],
  ].map(([v, l]) => `<option value="${v}" ${p.still_type === v ? 'selected' : ''}>${l}</option>`).join('');

  const packingOptions = [
    ['copper_mesh', 'Медная сетка'],
    ['spp', 'СПН'],
    ['raschig', 'Кольца Рашига'],
    ['ceramic', 'Керамика'],
    ['none', 'Без насадки'],
  ].map(([v, l]) => `<option value="${v}" ${p.packing_type === v ? 'selected' : ''}>${l}</option>`).join('');

  return `
    <div class="form-row-2">
      ${formField('Название', `<input class="form-control" id="pf-name" value="${p.name ?? ''}" required>`, '', true)}
    </div>
    <div class="form-row-2">
      ${formField('Тип аппарата', `<select class="form-control" id="pf-still_type"><option value="">— выберите —</option>${stillOptions}</select>`)}
      ${formField('Диаметр царги мм', `<input class="form-control" id="pf-column_diameter_mm" type="number" step="1" value="${p.column_diameter_mm ?? ''}">`)}
    </div>
    <div class="form-row-2">
      ${formField('Тип насадки', `<select class="form-control" id="pf-packing_type"><option value="">— выберите —</option>${packingOptions}</select>`)}
      ${formField('Скорость отбора л/ч', `<input class="form-control" id="pf-distillation_speed_lph" type="number" step="0.1" value="${p.distillation_speed_lph ?? ''}">`)}
    </div>
    <div class="form-row-2">
      ${formField('Теоретических тарелок', `<input class="form-control" id="pf-theoretical_plates" type="number" step="1" value="${p.theoretical_plates ?? ''}">`)}
    </div>
    <div class="form-row-2">
      ${formField('% голов', `<input class="form-control" id="pf-heads_pct" type="number" step="0.1" value="${p.heads_pct ?? 5}">`)}
      ${formField('% хвостов', `<input class="form-control" id="pf-tails_pct" type="number" step="0.1" value="${p.tails_pct ?? 15}">`)}
    </div>
    ${formField('Заметки', `<textarea class="form-control" id="pf-notes" rows="3">${p.notes ?? ''}</textarea>`)}
  `;
}

// ── Read form values ───────────────────────────────────────────────────────────

function readBeerForm(existing = {}) {
  const name = val('pf-name').trim();
  if (!name) { showToast('Введите название профиля', 'error'); return null; }
  return {
    ...existing,
    name,
    type: 'beer',
    system_efficiency: val('pf-system_efficiency'),
    grain_absorption:  val('pf-grain_absorption'),
    boiloff_rate_pct:  val('pf-boiloff_rate_pct'),
    wort_shrinkage_pct: val('pf-wort_shrinkage_pct'),
    kettle_loss_l:     val('pf-kettle_loss_l'),
    fermenter_loss_l:  val('pf-fermenter_loss_l'),
    kettle_volume_l:   val('pf-kettle_volume_l'),
    notes:             val('pf-notes'),
  };
}

function readSpiritForm(existing = {}) {
  const name = val('pf-name').trim();
  if (!name) { showToast('Введите название профиля', 'error'); return null; }
  return {
    ...existing,
    name,
    type: 'spirit',
    still_type:             val('pf-still_type'),
    column_diameter_mm:     val('pf-column_diameter_mm'),
    packing_type:           val('pf-packing_type'),
    distillation_speed_lph: val('pf-distillation_speed_lph'),
    theoretical_plates:     val('pf-theoretical_plates'),
    heads_pct:              val('pf-heads_pct'),
    tails_pct:              val('pf-tails_pct'),
    notes:                  val('pf-notes'),
  };
}

// ── Modal open ─────────────────────────────────────────────────────────────────

function openProfileModal(type, profile = null, onSaved) {
  const isNew = !profile;
  const isBeer = type === 'beer';
  const title = isNew
    ? (isBeer ? 'Новый пивоваренный профиль' : 'Новый профиль дистилляции')
    : (isBeer ? 'Редактировать пивоваренный профиль' : 'Редактировать профиль дистилляции');

  const bodyHTML = isBeer ? beerFormHTML(profile ?? {}) : spiritFormHTML(profile ?? {});

  const handleSave = async (overlay) => {
    const data = isBeer ? readBeerForm(profile ?? {}) : readSpiritForm(profile ?? {});
    if (!data) return;

    const btn = overlay.querySelector('[data-action="save"]');
    btn.disabled = true;
    btn.textContent = 'Сохранение…';

    try {
      if (isNew) {
        data.id = genId();
        data.is_active = 'TRUE';
        data.created_at = now();
        data.updated_at = now();
        await appendRow(SHEET, data);
        showToast('Профиль создан', 'success');
      } else {
        data.updated_at = now();
        await updateRow(SHEET, data.id, data);
        showToast('Профиль обновлён', 'success');
      }
      closeModal();
      onSaved();
    } catch (e) {
      showToast('Ошибка сохранения: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Сохранить';
    }
  };

  showModal(title, bodyHTML, [
    { label: 'Отмена',    class: 'btn-secondary', action: 'cancel', onClick: closeModal },
    { label: 'Сохранить', class: 'btn-primary',   action: 'save',   onClick: handleSave },
  ]);
}

// ── Tables ─────────────────────────────────────────────────────────────────────

function beerTable(profiles, onAction) {
  if (!profiles.length) {
    return '<p class="text-muted" style="padding:12px 0">Нет пивоваренных профилей</p>';
  }
  const rows = profiles.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.system_efficiency ? p.system_efficiency + '%' : '—'}</td>
      <td>${p.kettle_volume_l ? p.kettle_volume_l + ' л' : '—'}</td>
      <td>${p.grain_absorption ? p.grain_absorption + ' л/кг' : '—'}</td>
      <td>${p.boiloff_rate_pct ? p.boiloff_rate_pct + '%/ч' : '—'}</td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.notes ?? '—'}</td>
      <td>
        <button class="btn btn-xs btn-secondary" data-id="${p.id}" data-action="edit">Изм.</button>
        <button class="btn btn-xs btn-danger"    data-id="${p.id}" data-action="delete">Удал.</button>
      </td>
    </tr>
  `).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Эффективность</th>
          <th>Объём котла</th>
          <th>Засыпь впит.</th>
          <th>Выкипание</th>
          <th>Заметки</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function spiritTable(profiles, onAction) {
  if (!profiles.length) {
    return '<p class="text-muted" style="padding:12px 0">Нет профилей дистилляции</p>';
  }
  const rows = profiles.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${stillTypeLabel(p.still_type)}</td>
      <td>${p.column_diameter_mm ? p.column_diameter_mm + ' мм' : '—'}</td>
      <td>${packingTypeLabel(p.packing_type)}</td>
      <td>${p.distillation_speed_lph ? p.distillation_speed_lph + ' л/ч' : '—'}</td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.notes ?? '—'}</td>
      <td>
        <button class="btn btn-xs btn-secondary" data-id="${p.id}" data-action="edit">Изм.</button>
        <button class="btn btn-xs btn-danger"    data-id="${p.id}" data-action="delete">Удал.</button>
      </td>
    </tr>
  `).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Тип</th>
          <th>Диаметр</th>
          <th>Насадка</th>
          <th>Скорость</th>
          <th>Заметки</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Main render ────────────────────────────────────────────────────────────────

export async function renderProfiles(container) {
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  let allProfiles;
  try {
    allProfiles = (await getRows(SHEET)).filter(p => p.is_active !== 'false');
  } catch (e) {
    showError(container, 'Не удалось загрузить профили: ' + e.message);
    return;
  }

  function render() {
    const beerProfiles   = allProfiles.filter(p => p.type === 'beer');
    const spiritProfiles = allProfiles.filter(p => p.type === 'spirit');

    container.innerHTML = `
      ${pageHeader('Профили оборудования')}

      <div class="section-card" style="margin-bottom:20px">
        <div class="section-card-header">
          <h3>Пивоваренные профили</h3>
          <button class="btn btn-primary btn-sm" id="btn-new-beer">+ Новый профиль</button>
        </div>
        <div class="section-card-body" id="beer-table-wrap">
          ${beerTable(beerProfiles)}
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-header">
          <h3>Профили дистилляции</h3>
          <button class="btn btn-primary btn-sm" id="btn-new-spirit">+ Новый профиль</button>
        </div>
        <div class="section-card-body" id="spirit-table-wrap">
          ${spiritTable(spiritProfiles)}
        </div>
      </div>
    `;

    // New profile buttons
    document.getElementById('btn-new-beer')?.addEventListener('click', () => {
      openProfileModal('beer', null, async () => {
        allProfiles = (await getRows(SHEET)).filter(p => p.is_active !== 'false');
        render();
      });
    });

    document.getElementById('btn-new-spirit')?.addEventListener('click', () => {
      openProfileModal('spirit', null, async () => {
        allProfiles = (await getRows(SHEET)).filter(p => p.is_active !== 'false');
        render();
      });
    });

    // Edit / delete handlers via delegation
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { id, action } = btn.dataset;
      const profile = allProfiles.find(p => p.id === id);
      if (!profile) return;

      if (action === 'edit') {
        openProfileModal(profile.type, profile, async () => {
          allProfiles = (await getRows(SHEET)).filter(p => p.is_active !== 'false');
          render();
        });
      }

      if (action === 'delete') {
        const confirmed = await showConfirm(`Удалить профиль «${profile.name}»?`);
        if (!confirmed) return;
        try {
          await softDelete(SHEET, profile.id);
          showToast('Профиль удалён', 'success');
          allProfiles = allProfiles.filter(p => p.id !== id);
          render();
        } catch (err) {
          showToast('Ошибка удаления: ' + err.message, 'error');
        }
      }
    }, { once: true });
  }

  render();
}
