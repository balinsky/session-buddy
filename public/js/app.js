/**
 * Session Buddy — main application logic.
 *
 * Views are plain div elements shown/hidden by toggling the .active CSS class.
 * All data is fetched from the server on each navigation, keeping the UI simple.
 */

// ===== CONSTANTS =====

const TUNE_TYPES = [
  'Reel', 'Jig', 'Slip Jig', 'Hornpipe', 'Polka', 'Slide',
  'Air', 'Barndance', 'Fling', 'Gavotte', 'Highland', 'Hop Jig',
  'March', 'Mazurka', 'Ridee', 'Rond', 'Shetland', 'Strathspey', 'Waltz',
  '3/2 Tune', '7/8 Tune',
];

const INSTRUMENTS = [
  'Bb Whistle', 'C Whistle', 'Concertina', 'D Flute',
  'D Generic', 'Fiddle', 'High D Whistle', 'Low F Whistle',
];

// Default ABC time signature for each tune type
const METER_BY_TYPE = {
  'Reel': 'M:C', 'Hornpipe': 'M:C', 'Air': 'M:C',
  'Jig': 'M:6/8', 'Slide': 'M:12/8', 'Ridee': 'M:6/8',
  'Slip Jig': 'M:9/8', 'Hop Jig': 'M:9/8',
  'Polka': 'M:2/4',
  'Waltz': 'M:3/4', 'Mazurka': 'M:3/4',
  '3/2 Tune': 'M:3/2',
  '7/8 Tune': 'M:7/8',
  'March': 'M:4/4', 'Strathspey': 'M:4/4', 'Highland': 'M:4/4',
  'Fling': 'M:4/4', 'Gavotte': 'M:4/4', 'Barndance': 'M:4/4',
  'Rond': 'M:4/4', 'Shetland': 'M:4/4',
};

const STATUS_ORDER = { 'Memorized': 0, 'Learning': 1, 'Not Learned': 2 };
const STATUS_CYCLE = ['Not Learned', 'Learning', 'Memorized'];

function nextStatus(current) {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ===== STATE =====

const state = {
  tunes: [],
  editingTune: null,
  editingSet: null,
  selectedTuneIds: [],
  backStack: [],
  tuneSearch: '',
  tuneFilter: {
    favoriteOnly: false,
    statuses: [],
    types: [],
    key: '',
    instruments: [],
    where: '',
    who: '',
    practicedDays: null,
  },
  setFilter: {
    favoriteOnly: false,
    types: [],
  },
};

// ===== UTILITIES =====

function getSortName(name) {
  if (/^the\s+/i.test(name)) {
    return name.replace(/^the\s+/i, '') + ', The';
  }
  return name;
}

function sortTunes(tunes) {
  return [...tunes].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.learning_status] ?? 2) - (STATUS_ORDER[b.learning_status] ?? 2);
    if (statusDiff !== 0) return statusDiff;
    return getSortName(a.name).localeCompare(getSortName(b.name));
  });
}

function statusClass(status) {
  if (status === 'Memorized') return 'memorized';
  if (status === 'Learning') return 'learning';
  return 'not-learned';
}

function buildAbcString(incipit, tuneType, tuneKey) {
  if (!incipit) return '';
  const meter = METER_BY_TYPE[tuneType] || 'M:4/4';
  const key = tuneKey || 'C';
  return `X:1\nT:\n${meter}\nL:1/8\nK:${key}\n${incipit}`;
}

function renderAbcInto(elementId, incipit, tuneType, tuneKey) {
  if (!incipit || !window.ABCJS) return;
  const el = document.getElementById(elementId);
  if (!el) return;
  const abcStr = buildAbcString(incipit, tuneType, tuneKey);
  try {
    ABCJS.renderAbc(elementId, abcStr, { responsive: 'resize', staffwidth: 280, scale: 0.85 });
  } catch (e) {
    el.textContent = '(Could not render notation)';
  }
}

function buildSessionUrl(thesessionId, setting) {
  if (!thesessionId) return null;
  const base = `https://thesession.org/tunes/${thesessionId}`;
  return setting ? `${base}#${setting}` : base;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setDisplayName(set) {
  if (!set.tunes || set.tunes.length === 0) return '(empty set)';
  return set.tunes.map(t => t.name).join(' / ');
}

function setTypeLabel(set) {
  const types = [...new Set((set.tunes || []).map(t => t.type).filter(Boolean))];
  if (types.length === 0) return '';
  if (types.length > 1) return 'Mixed';
  const type = types[0];
  if (type === 'Slip Jig') return 'Slip Jigs';
  if (type === 'Hop Jig') return 'Hop Jigs';
  if (type === '3/2 Tune') return '3/2 Tunes';
  if (type === '7/8 Tune') return '7/8 Tunes';
  if (type === 'Air') return 'Airs';
  return type + 's';
}

function showError(msg) {
  alert(msg);
}

// ===== FILTER HELPERS =====

function isTuneFilterActive() {
  const f = state.tuneFilter;
  return f.favoriteOnly || f.statuses.length > 0 || f.types.length > 0 ||
    f.key !== '' || f.instruments.length > 0 || f.where !== '' ||
    f.who !== '' || f.practicedDays !== null;
}

function isSetFilterActive() {
  const f = state.setFilter;
  return f.favoriteOnly || f.types.length > 0;
}

function applyTuneFilter(tunes) {
  const f = state.tuneFilter;
  return tunes.filter(t => {
    if (f.favoriteOnly && !t.favorite) return false;
    if (f.statuses.length && !f.statuses.includes(t.learning_status || 'Not Learned')) return false;
    if (f.types.length && !f.types.includes(t.type)) return false;
    if (f.key && !(t.key || '').toLowerCase().includes(f.key.toLowerCase())) return false;
    if (f.instruments.length) {
      const tuneInstr = (t.instrument || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!f.instruments.some(i => tuneInstr.includes(i))) return false;
    }
    if (f.where && !(t.where_learned || '').toLowerCase().includes(f.where.toLowerCase())) return false;
    if (f.who && !(t.who || '').toLowerCase().includes(f.who.toLowerCase())) return false;
    if (f.practicedDays != null) {
      if (!t.last_practiced_date) return false;
      const daysAgo = (Date.now() - new Date(t.last_practiced_date).getTime()) / 86400000;
      if (daysAgo > f.practicedDays) return false;
    }
    return true;
  });
}

function applySetFilter(sets) {
  const f = state.setFilter;
  return sets.filter(s => {
    if (f.favoriteOnly && !s.favorite) return false;
    if (f.types.length) {
      const setTypes = (s.tunes || []).map(t => t.type).filter(Boolean);
      if (!f.types.some(type => setTypes.includes(type))) return false;
    }
    return true;
  });
}

function updateFilterBtnStyle(btnId, isActive) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('btn-filter-active', isActive);
  btn.classList.toggle('btn-outline', !isActive);
}

// ===== VIEW MANAGEMENT =====

// Maps any view to which nav tab should be highlighted
const NAV_SECTION = {
  tunes: 'tunes', 'tune-detail': 'tunes', 'tune-form': 'tunes', import: 'tunes',
  sets: 'sets', 'set-detail': 'sets', 'set-form': 'sets', 'set-import': 'sets',
};

function showView(viewId, pushToHistory = true) {
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');

  // Nav is always visible except on the welcome screen
  document.getElementById('bottom-nav').classList.toggle('hidden', viewId === 'welcome');

  const showBack = viewId !== 'welcome' && viewId !== 'tunes' && viewId !== 'sets';
  document.getElementById('back-btn').classList.toggle('hidden', !showBack);

  const activeSection = NAV_SECTION[viewId];
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === activeSection);
  });

  if (pushToHistory && viewId !== 'welcome') {
    state.backStack.push(viewId);
  }

  document.getElementById('main-content').scrollTop = 0;
}

function goBack() {
  state.backStack.pop();
  const prev = state.backStack[state.backStack.length - 1];
  // Always refresh list views so changes (e.g. favorites) are visible
  if (!prev || prev === 'tunes') {
    goToTunes();
  } else if (prev === 'sets') {
    goToSets();
  } else {
    showView(prev, false);
  }
}

// ===== TUNES VIEW =====

async function goToTunes() {
  state.backStack = ['tunes'];
  showView('tunes', false);
  document.getElementById('header-title').textContent = 'My Tunes';

  try {
    const tunes = await API.getTunes();
    state.tunes = tunes;
    renderTuneList(tunes, state.tuneSearch);
  } catch (e) {
    showError('Could not load tunes: ' + e.message);
  }
}

function renderTuneList(tunes, searchQuery) {
  const container = document.getElementById('tune-list');
  const query = (searchQuery || '').toLowerCase().trim();

  let filtered = tunes;
  if (query) {
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.type || '').toLowerCase().includes(query) ||
      (t.key || '').toLowerCase().includes(query) ||
      (t.thesession_id || '').toLowerCase().includes(query) ||
      (t.sequence_id || '').toLowerCase().includes(query)
    );
  }
  filtered = applyTuneFilter(filtered);

  updateFilterBtnStyle('btn-tune-filter', isTuneFilterActive());

  const sorted = sortTunes(filtered);

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-list">
        <div class="empty-icon">&#119070;</div>
        <p>${(query || isTuneFilterActive()) ? 'No tunes match.' : 'No tunes yet. Add one or import a CSV!'}</p>
      </div>`;
    return;
  }

  // Favorites at the top, then non-favorites grouped by status
  const favorites = sorted.filter(t => t.favorite);
  const nonFavs   = sorted.filter(t => !t.favorite);

  const groups = [];
  if (favorites.length > 0) {
    groups.push({ label: `Favorites (${favorites.length})`, tunes: favorites });
  }
  ['Memorized', 'Learning', 'Not Learned'].forEach(status => {
    const g = nonFavs.filter(t => (t.learning_status || 'Not Learned') === status);
    if (g.length > 0) groups.push({ label: `${status} (${g.length})`, tunes: g });
  });

  let html = '';
  groups.forEach(group => {
    if (!query) {
      html += `<div class="status-group-header">${esc(group.label)}</div>`;
    }
    group.tunes.forEach(tune => {
      const sc = statusClass(tune.learning_status);
      const typKey = [tune.type, tune.key].filter(Boolean).join(' · ');
      const isFav = tune.favorite ? 'is-favorite' : '';
      html += `
        <div class="list-card ${sc}" data-id="${tune.id}" role="button" tabindex="0">
          <div class="tune-card-top">
            <div class="tune-card-name">${esc(tune.name)}</div>
            <button class="list-heart-btn ${isFav}" data-id="${tune.id}" aria-label="Toggle favorite">&#9829;</button>
          </div>
          ${tune.incipit_a ? `<div class="tune-card-incipit">${esc(tune.incipit_a)}</div>` : ''}
          <div class="tune-card-meta">
            ${typKey ? `<span class="tune-card-type-key">${esc(typKey)}</span>` : ''}
            <span class="status-badge ${sc} tappable" data-id="${tune.id}" data-status="${tune.learning_status || 'Not Learned'}" title="Tap to change status">${esc(tune.learning_status || 'Not Learned')} ↻</span>
          </div>
        </div>`;
    });
  });

  container.innerHTML = html;

  container.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.status-badge.tappable')) return;
      if (e.target.closest('.list-heart-btn')) return;
      goToTuneDetail(Number(card.dataset.id));
    });
  });

  container.querySelectorAll('.status-badge.tappable').forEach(badge => {
    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tuneId = Number(badge.dataset.id);
      const currentStatus = badge.dataset.status;
      const newStatus = nextStatus(currentStatus);
      const tune = state.tunes.find(t => t.id === tuneId);
      if (!tune) return;

      badge.dataset.status = newStatus;
      const newSc = statusClass(newStatus);
      badge.className = `status-badge ${newSc} tappable`;
      badge.textContent = newStatus + ' ↻';

      try {
        const updated = await API.updateTune(tuneId, { ...tune, learning_status: newStatus });
        const idx = state.tunes.findIndex(t => t.id === tuneId);
        if (idx !== -1) state.tunes[idx] = updated;
        renderTuneList(state.tunes, state.tuneSearch);
      } catch (err) {
        showError('Could not update status: ' + err.message);
        renderTuneList(state.tunes, state.tuneSearch);
      }
    });
  });

  container.querySelectorAll('.list-heart-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tuneId = Number(btn.dataset.id);
      const tune = state.tunes.find(t => t.id === tuneId);
      if (!tune) return;
      const newFav = tune.favorite ? 0 : 1;
      btn.classList.toggle('is-favorite', !!newFav);
      try {
        const updated = await API.patchTune(tuneId, { favorite: newFav });
        const idx = state.tunes.findIndex(t => t.id === tuneId);
        if (idx !== -1) state.tunes[idx] = updated;
        renderTuneList(state.tunes, state.tuneSearch);
      } catch (err) {
        showError('Could not update favorite: ' + err.message);
        renderTuneList(state.tunes, state.tuneSearch);
      }
    });
  });
}

// ===== TUNE DETAIL VIEW =====

async function goToTuneDetail(tuneId) {
  showView('tune-detail');
  document.getElementById('header-title').textContent = 'Tune Detail';

  try {
    const tune = await API.getTune(tuneId);
    renderTuneDetail(tune);
  } catch (e) {
    showError('Could not load tune: ' + e.message);
  }
}

function renderTuneDetail(tune) {
  const sessionUrl = buildSessionUrl(tune.thesession_id, tune.setting);

  let html = `
    <div class="detail-header">
      <div class="detail-title-row">
        <div class="detail-title">${esc(tune.name)}</div>
        <button class="heart-btn ${tune.favorite ? 'is-favorite' : ''}" id="btn-favorite-tune" aria-label="Toggle favorite">&#9829;</button>
      </div>
      <div class="detail-meta">
        ${tune.type ? `<span class="detail-meta-item">${esc(tune.type)}</span>` : ''}
        ${tune.key ? `<span class="detail-meta-item">&#9835; ${esc(tune.key)}</span>` : ''}
        ${tune.parts ? `<span class="detail-meta-item">${esc(tune.parts)} parts</span>` : ''}
      </div>
      <div class="status-control" id="status-control">
        ${['Not Learned', 'Learning', 'Memorized'].map(s => `
          <button class="status-btn ${statusClass(s)}${s === (tune.learning_status || 'Not Learned') ? ' active' : ''}" data-status="${s}">${s}</button>
        `).join('')}
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary btn-small" id="btn-add-tune-from-detail">+ Add Tune</button>
        <button class="btn btn-outline btn-small" id="btn-add-to-set">+ Add to Set</button>
        <button class="btn btn-outline btn-small" id="btn-edit-tune">Edit</button>
        <button class="btn btn-danger btn-small" id="btn-delete-tune">Delete</button>
      </div>
    </div>`;

  // Incipits
  const hasAny = tune.incipit_a || tune.incipit_b || tune.incipit_c;
  if (hasAny) {
    html += `<div class="detail-card"><div class="detail-card-title">Incipits</div>`;
    ['a', 'b', 'c'].forEach(part => {
      const incipit = tune[`incipit_${part}`];
      if (!incipit) return;
      html += `
        <div class="incipit-block">
          <div class="incipit-label">Part ${part.toUpperCase()}</div>
          <div class="incipit-abc-text">${esc(incipit)}</div>
          <div class="incipit-notation" id="notation-${tune.id}-${part}"></div>
        </div>`;
    });
    html += `</div>`;
  }

  // Always-visible fields
  const visibleFields = [];
  if (tune.instrument) visibleFields.push(['Instrument', esc(tune.instrument)]);
  if (tune.sequence_id) visibleFields.push(['Sequence ID', esc(tune.sequence_id)]);
  if (tune.mnemonic) visibleFields.push(['Mnemonic', esc(tune.mnemonic)]);
  if (tune.composer) visibleFields.push(['Composer', esc(tune.composer)]);
  if (tune.notes) visibleFields.push(['Notes', esc(tune.notes)]);
  if (tune.tunebooks) visibleFields.push(['Tunebooks', esc(tune.tunebooks)]);
  if (sessionUrl) visibleFields.push(['thesession.org', `<span class="field-value-split"><a href="${sessionUrl}" target="_blank" rel="noopener">View on thesession.org &#8599;</a><span class="field-value-right">${esc(tune.thesession_id)}</span></span>`]);
  if (tune.count) visibleFields.push(['Heard count', esc(tune.count)]);

  if (visibleFields.length > 0) {
    html += `<div class="detail-card"><div class="detail-card-title">Details</div>`;
    visibleFields.forEach(([label, value]) => {
      html += `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${value}</span></div>`;
    });
    html += `</div>`;
  }

  // Last Practiced — always shown with a Today button
  html += `
    <div class="detail-card">
      <div class="detail-card-title">Practice</div>
      <div class="detail-field">
        <span class="detail-field-label">Last Practiced</span>
        <span class="detail-field-value" id="last-practiced-value">${esc(tune.last_practiced_date) || '<em>Not recorded</em>'}</span>
        <button class="btn btn-small btn-primary" id="btn-today">Today</button>
      </div>
    </div>`;

  // Hidden fields
  const hiddenFields = [];
  if (tune.who) hiddenFields.push(['Learned from', esc(tune.who)]);
  if (tune.where_learned) hiddenFields.push(['Where', esc(tune.where_learned)]);
  if (tune.date_learned) hiddenFields.push(['Date Learned', esc(tune.date_learned)]);
  if (tune.added_date) hiddenFields.push(['Date Added', esc(tune.added_date)]);
  if (tune.setting) hiddenFields.push(['Setting', esc(tune.setting)]);

  if (hiddenFields.length > 0) {
    html += `<button class="show-more-btn" id="btn-show-more">Show more &#8964;</button>`;
    html += `<div class="detail-card hidden" id="hidden-fields-card"><div class="detail-card-title">Additional Info</div>`;
    hiddenFields.forEach(([label, value]) => {
      html += `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${value}</span></div>`;
    });
    html += `</div>`;
  }

  const container = document.getElementById('tune-detail-content');
  container.innerHTML = html;

  requestAnimationFrame(() => {
    ['a', 'b', 'c'].forEach(part => {
      const incipit = tune[`incipit_${part}`];
      if (incipit) renderAbcInto(`notation-${tune.id}-${part}`, incipit, tune.type, tune.key);
    });
  });

  // Favorite heart toggle
  document.getElementById('btn-favorite-tune').addEventListener('click', async () => {
    const newFav = tune.favorite ? 0 : 1;
    try {
      const updated = await API.patchTune(tune.id, { favorite: newFav });
      tune.favorite = updated.favorite;
      const btn = document.getElementById('btn-favorite-tune');
      if (btn) btn.classList.toggle('is-favorite', !!updated.favorite);
      const idx = state.tunes.findIndex(t => t.id === updated.id);
      if (idx !== -1) state.tunes[idx] = updated;
    } catch (e) {
      showError('Could not update favorite: ' + e.message);
    }
  });

  // Add Tune / Add to Set
  document.getElementById('btn-add-tune-from-detail').addEventListener('click', () => goToTuneForm(null));
  document.getElementById('btn-add-to-set').addEventListener('click', () => goToSetForm(null, tune.id));
  document.getElementById('btn-edit-tune').addEventListener('click', () => goToTuneForm(tune));
  document.getElementById('btn-delete-tune').addEventListener('click', () => deleteTune(tune));

  document.getElementById('status-control').addEventListener('click', async (e) => {
    const btn = e.target.closest('.status-btn');
    if (!btn || btn.classList.contains('active')) return;
    const newStatus = btn.dataset.status;
    try {
      const updated = await API.updateTune(tune.id, { ...tune, learning_status: newStatus });
      tune.learning_status = newStatus;
      document.querySelectorAll('.status-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.status === newStatus);
      });
      const idx = state.tunes.findIndex(t => t.id === updated.id);
      if (idx !== -1) state.tunes[idx] = updated;
    } catch (e) {
      showError('Could not update status: ' + e.message);
    }
  });

  document.getElementById('btn-today').addEventListener('click', async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const updated = await API.updateTune(tune.id, { ...tune, last_practiced_date: today });
      document.getElementById('last-practiced-value').textContent = today;
      tune.last_practiced_date = today;
      const idx = state.tunes.findIndex(t => t.id === updated.id);
      if (idx !== -1) state.tunes[idx] = updated;
    } catch (e) {
      showError('Could not update: ' + e.message);
    }
  });

  const showMoreBtn = document.getElementById('btn-show-more');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      document.getElementById('hidden-fields-card').classList.remove('hidden');
      showMoreBtn.classList.add('hidden');
    });
  }
}

// ===== TUNE FORM =====

function goToTuneForm(tune = null) {
  state.editingTune = tune;
  showView('tune-form');
  document.getElementById('header-title').textContent = tune ? 'Edit Tune' : 'Add Tune';
  document.getElementById('tune-form-title').textContent = tune ? 'Edit Tune' : 'Add Tune';

  const form = document.getElementById('tune-form');
  form.reset();

  if (tune) {
    form.elements['name'].value = tune.name || '';
    form.elements['type'].value = tune.type || '';
    form.elements['key'].value = tune.key || '';
    form.elements['parts'].value = tune.parts || '';
    form.elements['learning_status'].value = tune.learning_status || 'Not Learned';
    form.elements['favorite'].checked = !!tune.favorite;
    form.elements['incipit_a'].value = tune.incipit_a || '';
    form.elements['incipit_b'].value = tune.incipit_b || '';
    form.elements['incipit_c'].value = tune.incipit_c || '';
    form.elements['thesession_id'].value = tune.thesession_id || '';
    form.elements['setting'].value = tune.setting || '';
    form.elements['who'].value = tune.who || '';
    form.elements['where_learned'].value = tune.where_learned || '';
    form.elements['tunebooks'].value = tune.tunebooks || '';
    form.elements['mnemonic'].value = tune.mnemonic || '';
    const savedInstruments = (tune.instrument || '').split(',').map(s => s.trim()).filter(Boolean);
    document.querySelectorAll('#f-instrument input[type="checkbox"]').forEach(cb => {
      cb.checked = savedInstruments.includes(cb.value);
    });
    form.elements['sequence_id'].value = tune.sequence_id || '';
    form.elements['composer'].value = tune.composer || '';
    form.elements['count'].value = tune.count || '';
    form.elements['added_date'].value = tune.added_date || '';
    form.elements['date_learned'].value = tune.date_learned || '';
    form.elements['last_practiced_date'].value = tune.last_practiced_date || '';
    form.elements['notes'].value = tune.notes || '';

    requestAnimationFrame(() => {
      ['a', 'b', 'c'].forEach(part => {
        const val = tune[`incipit_${part}`];
        if (val) renderAbcInto(`preview-${part}`, val, tune.type, tune.key);
      });
    });
  }
}

async function saveTuneForm(e) {
  e.preventDefault();
  const form = document.getElementById('tune-form');
  const data = {
    name: form.elements['name'].value.trim(),
    type: form.elements['type'].value,
    key: form.elements['key'].value.trim(),
    parts: form.elements['parts'].value.trim(),
    learning_status: form.elements['learning_status'].value,
    favorite: form.elements['favorite'].checked,
    incipit_a: form.elements['incipit_a'].value.trim(),
    incipit_b: form.elements['incipit_b'].value.trim(),
    incipit_c: form.elements['incipit_c'].value.trim(),
    thesession_id: form.elements['thesession_id'].value.trim(),
    setting: form.elements['setting'].value.trim(),
    who: form.elements['who'].value.trim(),
    where_learned: form.elements['where_learned'].value.trim(),
    tunebooks: form.elements['tunebooks'].value.trim(),
    mnemonic: form.elements['mnemonic'].value.trim(),
    instrument: Array.from(document.querySelectorAll('#f-instrument input:checked')).map(cb => cb.value).join(', '),
    sequence_id: form.elements['sequence_id'].value.trim(),
    composer: form.elements['composer'].value.trim(),
    count: form.elements['count'].value,
    added_date: form.elements['added_date'].value.trim(),
    date_learned: form.elements['date_learned'].value.trim(),
    last_practiced_date: form.elements['last_practiced_date'].value.trim(),
    notes: form.elements['notes'].value.trim(),
  };

  if (!data.name) { showError('Tune name is required.'); return; }

  try {
    if (state.editingTune) {
      await API.updateTune(state.editingTune.id, data);
      await goToTunes();
    } else {
      const tune = await API.createTune(data);
      state.tunes = await API.getTunes();
      await goToTuneDetail(tune.id);
    }
  } catch (e) {
    showError('Could not save tune: ' + e.message);
  }
}

async function deleteTune(tune) {
  if (!confirm(`Delete "${tune.name}"? This cannot be undone.`)) return;
  try {
    await API.deleteTune(tune.id);
    await goToTunes();
  } catch (e) {
    showError('Could not delete tune: ' + e.message);
  }
}

// ===== SETS VIEW =====

async function goToSets() {
  state.backStack = ['sets'];
  showView('sets', false);
  document.getElementById('header-title').textContent = 'My Sets';

  try {
    const sets = await API.getSets();
    renderSetList(sets);
  } catch (e) {
    showError('Could not load sets: ' + e.message);
  }
}

function renderSetList(sets) {
  const container = document.getElementById('set-list');

  const filtered = applySetFilter(sets);
  updateFilterBtnStyle('btn-set-filter', isSetFilterActive());

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-list">
        <div class="empty-icon">&#127925;</div>
        <p>${isSetFilterActive() ? 'No sets match the filter.' : 'No sets yet. Tap "+ New Set" to build your first set!'}</p>
      </div>`;
    return;
  }

  // Favorites first
  const favSets   = filtered.filter(s => s.favorite);
  const otherSets = filtered.filter(s => !s.favorite);

  let html = '';
  if (favSets.length > 0) {
    html += `<div class="status-group-header">Favorites (${favSets.length})</div>`;
    favSets.forEach(set => { html += renderSetCard(set); });
  }
  if (otherSets.length > 0) {
    if (favSets.length > 0) html += `<div class="status-group-header">Sets (${otherSets.length})</div>`;
    otherSets.forEach(set => { html += renderSetCard(set); });
  }

  container.innerHTML = html;

  container.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.list-heart-btn')) return;
      goToSetDetail(Number(card.dataset.id));
    });
  });

  container.querySelectorAll('.list-heart-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const setId = Number(btn.dataset.id);
      const isCurrFav = btn.classList.contains('is-favorite');
      const newFav = isCurrFav ? 0 : 1;
      btn.classList.toggle('is-favorite', !!newFav);
      try {
        await API.patchSet(setId, { favorite: newFav });
        // Refresh the full list so grouping updates
        const sets = await API.getSets();
        renderSetList(sets);
      } catch (err) {
        showError('Could not update favorite: ' + err.message);
        const sets = await API.getSets();
        renderSetList(sets);
      }
    });
  });
}

function renderSetCard(set) {
  const name = setDisplayName(set);
  const isFav = set.favorite ? 'is-favorite' : '';
  const typeLabel = setTypeLabel(set);
  const incipits = (set.tunes || []).map(t => t.incipit_a).filter(Boolean);

  return `
    <div class="list-card" data-id="${set.id}" role="button" tabindex="0">
      <div class="set-card-top">
        <div class="set-card-name">${esc(name)}</div>
        <button class="list-heart-btn ${isFav}" data-id="${set.id}" aria-label="Toggle favorite">&#9829;</button>
      </div>
      ${typeLabel ? `<div class="set-card-type">${esc(typeLabel)}</div>` : ''}
      ${incipits.map(inc => `<div class="set-card-incipit">${esc(inc)}</div>`).join('')}
    </div>`;
}

// ===== SET DETAIL VIEW =====

async function goToSetDetail(setId) {
  showView('set-detail');
  document.getElementById('header-title').textContent = 'Set Detail';

  try {
    const set = await API.getSet(setId);
    renderSetDetail(set);
  } catch (e) {
    showError('Could not load set: ' + e.message);
  }
}

function renderSetDetail(set) {
  let html = `
    <div class="detail-header">
      <div class="detail-title-row">
        <div class="detail-title">${esc(setDisplayName(set))}</div>
        <button class="heart-btn ${set.favorite ? 'is-favorite' : ''}" id="btn-favorite-set" aria-label="Toggle favorite">&#9829;</button>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary btn-small" id="btn-new-set-from-detail">+ New Set</button>
        <button class="btn btn-outline btn-small" id="btn-edit-set">Edit Set</button>
        <button class="btn btn-danger btn-small" id="btn-delete-set">Delete</button>
      </div>
    </div>`;

  if (set.tunes.length === 0) {
    html += `<p class="hint">This set has no tunes.</p>`;
  } else {
    set.tunes.forEach((tune, idx) => {
      const incipitParts = ['a']
        .filter(p => tune[`incipit_${p}`])
        .map(p => ({ part: p, incipit: tune[`incipit_${p}`] }));

      html += `
        <div class="set-tune-card" data-id="${tune.id}">
          <div class="set-tune-name">${idx + 1}. ${esc(tune.name)}</div>`;

      incipitParts.forEach(({ part, incipit }) => {
        html += `
          <div class="incipit-block">
            <div class="incipit-abc-text">${esc(incipit)}</div>
            <div class="incipit-notation" id="set-notation-${tune.id}-${part}"></div>
          </div>`;
      });

      html += `</div>`;
    });
  }

  // Practice card
  html += `
    <div class="detail-card">
      <div class="detail-card-title">Practice</div>
      <div class="detail-field">
        <span class="detail-field-label">Last Practiced</span>
        <span class="detail-field-value" id="set-practiced-value">${esc(set.last_practiced_date) || '<em>Not recorded</em>'}</span>
        <button class="btn btn-small btn-primary" id="btn-set-today">Today</button>
      </div>
    </div>`;

  const container = document.getElementById('set-detail-content');
  container.innerHTML = html;

  requestAnimationFrame(() => {
    set.tunes.forEach(tune => {
      if (tune.incipit_a) renderAbcInto(`set-notation-${tune.id}-a`, tune.incipit_a, tune.type, tune.key);
    });
  });

  // Favorite heart toggle
  document.getElementById('btn-favorite-set').addEventListener('click', async () => {
    const newFav = set.favorite ? 0 : 1;
    try {
      const updated = await API.patchSet(set.id, { favorite: newFav });
      set.favorite = updated.favorite;
      const btn = document.getElementById('btn-favorite-set');
      if (btn) btn.classList.toggle('is-favorite', !!updated.favorite);
    } catch (e) {
      showError('Could not update favorite: ' + e.message);
    }
  });

  // Practice Today — updates set AND all its tunes
  document.getElementById('btn-set-today').addEventListener('click', async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      await API.practiceSet(set.id, today);
      document.getElementById('set-practiced-value').textContent = today;
      set.last_practiced_date = today;
      // Refresh cached tunes so their practiced dates are current
      state.tunes = await API.getTunes();
    } catch (e) {
      showError('Could not update: ' + e.message);
    }
  });

  document.getElementById('btn-new-set-from-detail').addEventListener('click', () => goToSetForm(null));
  document.getElementById('btn-edit-set').addEventListener('click', () => goToSetForm(set));
  document.getElementById('btn-delete-set').addEventListener('click', () => deleteSet(set));

  container.querySelectorAll('.set-tune-card').forEach(card => {
    card.addEventListener('click', () => goToTuneDetail(Number(card.dataset.id)));
  });
}

// ===== SET FORM =====

async function goToSetForm(set = null, preTuneId = null) {
  state.editingSet = set;
  state.selectedTuneIds = set ? set.tunes.map(t => t.id) : [];
  if (preTuneId && !state.selectedTuneIds.includes(preTuneId)) {
    state.selectedTuneIds.push(preTuneId);
  }
  showView('set-form');
  document.getElementById('header-title').textContent = set ? 'Edit Set' : 'New Set';

  try {
    if (state.tunes.length === 0) {
      state.tunes = await API.getTunes();
    }
    renderSetFormTuneList('');
    renderSelectedTunes();
  } catch (e) {
    showError('Could not load tunes: ' + e.message);
  }
}

function renderSelectedTunes() {
  const container = document.getElementById('selected-tunes-list');
  if (state.selectedTuneIds.length === 0) {
    container.innerHTML = '<span class="empty-hint">None yet</span>';
    return;
  }

  const last = state.selectedTuneIds.length - 1;
  let html = '';
  state.selectedTuneIds.forEach((id, idx) => {
    const tune = state.tunes.find(t => t.id === id);
    if (!tune) return;
    html += `
      <div class="selected-tune-item">
        <span class="tune-pos">${idx + 1}.</span>
        <span class="tune-name">${esc(tune.name)}</span>
        <div class="tune-order-btns">
          <button class="btn-move-up" data-idx="${idx}" aria-label="Move up" ${idx === 0 ? 'disabled' : ''}>&#8593;</button>
          <button class="btn-move-down" data-idx="${idx}" aria-label="Move down" ${idx === last ? 'disabled' : ''}>&#8595;</button>
        </div>
        <button class="btn-remove-tune" data-id="${id}" aria-label="Remove">&#10005;</button>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.btn-remove-tune').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      state.selectedTuneIds = state.selectedTuneIds.filter(x => x !== id);
      renderSelectedTunes();
      renderSetFormTuneList(document.getElementById('set-form-search').value);
    });
  });

  container.querySelectorAll('.btn-move-up, .btn-move-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const idx = Number(btn.dataset.idx);
      const swapWith = btn.classList.contains('btn-move-up') ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= state.selectedTuneIds.length) return;
      const ids = [...state.selectedTuneIds];
      const temp = ids[idx];
      ids[idx] = ids[swapWith];
      ids[swapWith] = temp;
      state.selectedTuneIds = ids;
      renderSelectedTunes();
    });
  });
}

function renderSetFormTuneList(searchQuery) {
  const container = document.getElementById('set-form-tune-list');
  const query = (searchQuery || '').toLowerCase().trim();

  let tunes = sortTunes(state.tunes);
  if (query) {
    tunes = tunes.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.type || '').toLowerCase().includes(query) ||
      (t.thesession_id || '').toLowerCase().includes(query) ||
      (t.sequence_id || '').toLowerCase().includes(query)
    );
  }

  if (tunes.length === 0) {
    container.innerHTML = '<div class="empty-list"><p>No tunes found.</p></div>';
    return;
  }

  let html = '';
  tunes.forEach(tune => {
    const isSelected = state.selectedTuneIds.includes(tune.id);
    const typKey = [tune.type, tune.key].filter(Boolean).join(' · ');
    const sc = statusClass(tune.learning_status);
    html += `
      <div class="list-card ${sc} ${isSelected ? 'selected' : ''}" data-id="${tune.id}" role="button" tabindex="0">
        <div class="tune-card-name">${esc(tune.name)}</div>
        ${typKey ? `<div class="tune-card-meta"><span class="tune-card-type-key">${esc(typKey)}</span></div>` : ''}
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.list-card:not(.selected)').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      if (state.selectedTuneIds.length >= 8) {
        showError('A set can have at most 8 tunes. Remove one to add another.');
        return;
      }
      state.selectedTuneIds.push(id);
      renderSelectedTunes();
      renderSetFormTuneList(document.getElementById('set-form-search').value);
    });
  });
}

async function saveSet() {
  if (state.selectedTuneIds.length < 1) {
    showError('A set needs at least 1 tune.');
    return;
  }

  try {
    if (state.editingSet) {
      await API.updateSet(state.editingSet.id, state.selectedTuneIds);
      await goToSets();
    } else {
      const set = await API.createSet(state.selectedTuneIds);
      await goToSetDetail(set.id);
    }
  } catch (e) {
    showError('Could not save set: ' + e.message);
  }
}

async function deleteSet(set) {
  if (!confirm('Delete this set? The tunes themselves will not be deleted.')) return;
  try {
    await API.deleteSet(set.id);
    await goToSets();
  } catch (e) {
    showError('Could not delete set: ' + e.message);
  }
}

// ===== CSV IMPORT VIEW =====

function goToSetImport() {
  showView('set-import');
  document.getElementById('header-title').textContent = 'Import Sets CSV';
  document.getElementById('set-import-status').textContent = '';
  document.getElementById('set-import-status').className = 'import-status';
  document.getElementById('btn-run-set-import').disabled = true;
  document.getElementById('set-csv-file-label').textContent = 'Tap to choose a CSV file';
  document.getElementById('set-csv-file-input').value = '';
  document.getElementById('set-import-error-section').classList.add('hidden');
}

function downloadSetImportErrors(errorRows) {
  const headers = ['Tune 1', 'Tune 2', 'Tune 3', 'Tune 4', 'Tune 5', 'Errors'];
  const lines = [headers.join(',')];
  for (const row of errorRows) {
    lines.push(headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'set-import-errors.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function goToImport() {
  showView('import');
  document.getElementById('header-title').textContent = 'Import CSV';
  document.getElementById('import-status').textContent = '';
  document.getElementById('import-status').className = 'import-status';
  document.getElementById('btn-run-import').disabled = true;
  document.getElementById('csv-file-label').textContent = 'Tap to choose a CSV file';
  document.getElementById('csv-file-input').value = '';
}

// ===== SYNC CODE MODAL =====

function openSyncModal() {
  const code = localStorage.getItem('syncCode') || '';
  document.getElementById('display-sync-code').textContent = code;
  document.getElementById('modal-sync').classList.remove('hidden');
}

function closeSyncModal() {
  document.getElementById('modal-sync').classList.add('hidden');
}

// ===== TUNE FILTER MODAL =====

function openTuneFilter() {
  const f = state.tuneFilter;
  document.getElementById('ff-fav-only').checked = f.favoriteOnly;
  document.querySelectorAll('.ff-status').forEach(cb => { cb.checked = f.statuses.includes(cb.value); });
  document.querySelectorAll('.ff-type').forEach(cb => { cb.checked = f.types.includes(cb.value); });
  document.getElementById('ff-key').value = f.key;
  document.querySelectorAll('.ff-instrument').forEach(cb => { cb.checked = f.instruments.includes(cb.value); });
  document.getElementById('ff-where').value = f.where;
  document.getElementById('ff-who').value = f.who;
  document.getElementById('ff-days').value = f.practicedDays != null ? f.practicedDays : '';
  document.getElementById('modal-tune-filter').classList.remove('hidden');
}

function closeTuneFilter() {
  document.getElementById('modal-tune-filter').classList.add('hidden');
}

function applyTuneFilterFromModal() {
  state.tuneFilter = {
    favoriteOnly: document.getElementById('ff-fav-only').checked,
    statuses: Array.from(document.querySelectorAll('.ff-status:checked')).map(cb => cb.value),
    types: Array.from(document.querySelectorAll('.ff-type:checked')).map(cb => cb.value),
    key: document.getElementById('ff-key').value.trim(),
    instruments: Array.from(document.querySelectorAll('.ff-instrument:checked')).map(cb => cb.value),
    where: document.getElementById('ff-where').value.trim(),
    who: document.getElementById('ff-who').value.trim(),
    practicedDays: document.getElementById('ff-days').value ? Number(document.getElementById('ff-days').value) : null,
  };
  closeTuneFilter();
  renderTuneList(state.tunes, state.tuneSearch);
}

function clearTuneFilter() {
  state.tuneFilter = { favoriteOnly: false, statuses: [], types: [], key: '', instruments: [], where: '', who: '', practicedDays: null };
  closeTuneFilter();
  renderTuneList(state.tunes, state.tuneSearch);
}

// ===== SET FILTER MODAL =====

function openSetFilter() {
  const f = state.setFilter;
  document.getElementById('sf-fav-only').checked = f.favoriteOnly;
  document.querySelectorAll('.sf-type').forEach(cb => { cb.checked = f.types.includes(cb.value); });
  document.getElementById('modal-set-filter').classList.remove('hidden');
}

function closeSetFilter() {
  document.getElementById('modal-set-filter').classList.add('hidden');
}

async function applySetFilterFromModal() {
  state.setFilter = {
    favoriteOnly: document.getElementById('sf-fav-only').checked,
    types: Array.from(document.querySelectorAll('.sf-type:checked')).map(cb => cb.value),
  };
  closeSetFilter();
  // Re-render the sets view if we're on it, or just update button style
  const sets = await API.getSets();
  renderSetList(sets);
}

async function clearSetFilter() {
  state.setFilter = { favoriteOnly: false, types: [] };
  closeSetFilter();
  const sets = await API.getSets();
  renderSetList(sets);
}

// ===== INCIPIT LIVE PREVIEW IN FORM =====

let previewDebounceTimer = null;

function handleIncipitInput(e) {
  const input = e.target;
  const previewId = input.dataset.preview;
  const form = document.getElementById('tune-form');
  const tuneType = form.elements['type'].value;
  const tuneKey = form.elements['key'].value.trim();

  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => {
    renderAbcInto(previewId, input.value.trim(), tuneType, tuneKey);
  }, 400);
}

// ===== SYNC / WELCOME FLOW =====

async function handleNewCode() {
  try {
    const { syncCode } = await API.newSyncCode();
    localStorage.setItem('syncCode', syncCode);
    openSyncModal();
    await goToTunes();
  } catch (e) {
    showError('Could not create a new collection: ' + e.message);
  }
}

async function handleJoinCode() {
  const input = document.getElementById('input-sync-code');
  const code = input.value.trim().toLowerCase();
  if (!code) { showError('Please enter a sync code.'); return; }

  try {
    const { syncCode } = await API.joinSyncCode(code);
    localStorage.setItem('syncCode', syncCode);
    await goToTunes();
  } catch (e) {
    showError(e.message);
  }
}

// ===== INITIALISATION =====

function init() {
  // Populate filter type checkboxes (tune filter and set filter)
  const ffTypeGroup = document.getElementById('ff-type-group');
  TUNE_TYPES.forEach(type => {
    const label = document.createElement('label');
    label.className = 'filter-check';
    label.innerHTML = `<input type="checkbox" class="ff-type" value="${esc(type)}" /> ${esc(type)}`;
    ffTypeGroup.appendChild(label);
  });

  const sfTypeGroup = document.getElementById('sf-type-group');
  TUNE_TYPES.forEach(type => {
    const label = document.createElement('label');
    label.className = 'filter-check';
    label.innerHTML = `<input type="checkbox" class="sf-type" value="${esc(type)}" /> ${esc(type)}`;
    sfTypeGroup.appendChild(label);
  });

  const ffInstGroup = document.getElementById('ff-instrument-group');
  INSTRUMENTS.forEach(inst => {
    const label = document.createElement('label');
    label.className = 'filter-check';
    label.innerHTML = `<input type="checkbox" class="ff-instrument" value="${esc(inst)}" /> ${esc(inst)}`;
    ffInstGroup.appendChild(label);
  });

  // If a sync code is already stored, go straight to tunes
  if (localStorage.getItem('syncCode')) {
    goToTunes();
  } else {
    showView('welcome', false);
    document.getElementById('header-title').textContent = 'Session Buddy';
  }

  // Welcome screen
  document.getElementById('btn-new-code').addEventListener('click', handleNewCode);
  document.getElementById('btn-join-code').addEventListener('click', handleJoinCode);
  document.getElementById('input-sync-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleJoinCode();
  });

  // Header buttons
  document.getElementById('back-btn').addEventListener('click', goBack);
  document.getElementById('sync-btn').addEventListener('click', openSyncModal);

  // Bottom nav
  document.getElementById('nav-tunes').addEventListener('click', goToTunes);
  document.getElementById('nav-sets').addEventListener('click', goToSets);

  // Tune list search
  document.getElementById('tune-search').addEventListener('input', e => {
    state.tuneSearch = e.target.value;
    renderTuneList(state.tunes, state.tuneSearch);
  });

  // Add tune / import
  document.getElementById('btn-add-tune').addEventListener('click', () => goToTuneForm(null));
  document.getElementById('btn-import').addEventListener('click', goToImport);

  // Tune filter
  document.getElementById('btn-tune-filter').addEventListener('click', openTuneFilter);
  document.getElementById('btn-apply-tune-filter').addEventListener('click', applyTuneFilterFromModal);
  document.getElementById('btn-clear-tune-filter').addEventListener('click', clearTuneFilter);
  document.getElementById('modal-tune-filter').querySelector('.modal-backdrop').addEventListener('click', closeTuneFilter);

  // Set filter
  document.getElementById('btn-set-filter').addEventListener('click', openSetFilter);
  document.getElementById('btn-apply-set-filter').addEventListener('click', applySetFilterFromModal);
  document.getElementById('btn-clear-set-filter').addEventListener('click', clearSetFilter);
  document.getElementById('modal-set-filter').querySelector('.modal-backdrop').addEventListener('click', closeSetFilter);

  // Tune form
  document.getElementById('tune-form').addEventListener('submit', saveTuneForm);
  document.getElementById('btn-cancel-tune-form').addEventListener('click', goBack);

  // Live ABC preview in tune form
  document.querySelectorAll('.abc-input').forEach(input => {
    input.addEventListener('input', handleIncipitInput);
  });

  // Sets list
  document.getElementById('btn-set-import').addEventListener('click', goToSetImport);
  document.getElementById('btn-add-set').addEventListener('click', () => goToSetForm(null));
  // Set form
  document.getElementById('btn-save-set').addEventListener('click', saveSet);
  document.getElementById('btn-cancel-set-form').addEventListener('click', goBack);
  document.getElementById('set-form-search').addEventListener('input', e => {
    renderSetFormTuneList(e.target.value);
  });

  // Set CSV import
  const setCsvInput = document.getElementById('set-csv-file-input');
  const runSetImportBtn = document.getElementById('btn-run-set-import');

  setCsvInput.addEventListener('change', () => {
    if (setCsvInput.files[0]) {
      document.getElementById('set-csv-file-label').textContent = setCsvInput.files[0].name;
      runSetImportBtn.disabled = false;
    }
  });

  runSetImportBtn.addEventListener('click', async () => {
    const file = setCsvInput.files[0];
    if (!file) return;
    const statusEl = document.getElementById('set-import-status');
    runSetImportBtn.disabled = true;
    statusEl.textContent = 'Importing…';
    statusEl.className = 'import-status';
    document.getElementById('set-import-error-section').classList.add('hidden');

    try {
      const result = await API.importSetsCsv(file);
      const n = result.imported;
      const d = result.duplicates || 0;
      const e = result.errorRows.length;
      const parts = [];
      if (n > 0) parts.push(`${n} set${n !== 1 ? 's' : ''} imported`);
      if (d > 0) parts.push(`${d} duplicate${d !== 1 ? 's' : ''} skipped`);
      if (e > 0) parts.push(`${e} row${e !== 1 ? 's' : ''} had errors`);
      if (parts.length === 0) parts.push('No sets found in CSV');
      statusEl.textContent = parts.join(', ') + '.';
      statusEl.className = n > 0 ? 'import-status success' : 'import-status error';
      if (n === 0 && e > 0) runSetImportBtn.disabled = false;
      if (e > 0) {
        const errSection = document.getElementById('set-import-error-section');
        errSection.classList.remove('hidden');
        document.getElementById('btn-download-errors').onclick = () => downloadSetImportErrors(result.errorRows);
      }
    } catch (err) {
      statusEl.textContent = 'Import failed: ' + err.message;
      statusEl.className = 'import-status error';
      runSetImportBtn.disabled = false;
    }
  });

  // Tune CSV import
  const csvInput = document.getElementById('csv-file-input');
  const runImportBtn = document.getElementById('btn-run-import');

  csvInput.addEventListener('change', () => {
    if (csvInput.files[0]) {
      document.getElementById('csv-file-label').textContent = csvInput.files[0].name;
      runImportBtn.disabled = false;
    }
  });

  runImportBtn.addEventListener('click', async () => {
    const file = csvInput.files[0];
    if (!file) return;
    const statusEl = document.getElementById('import-status');
    runImportBtn.disabled = true;
    statusEl.textContent = 'Importing…';
    statusEl.className = 'import-status';

    try {
      const result = await API.importCsv(file);
      statusEl.textContent = `Successfully imported ${result.imported} tune${result.imported !== 1 ? 's' : ''}!`;
      statusEl.className = 'import-status success';
      state.tunes = await API.getTunes();
    } catch (e) {
      statusEl.textContent = 'Import failed: ' + e.message;
      statusEl.className = 'import-status error';
      runImportBtn.disabled = false;
    }
  });

  // Sync modal
  document.getElementById('btn-close-sync-modal').addEventListener('click', closeSyncModal);
  document.getElementById('modal-sync').querySelector('.modal-backdrop').addEventListener('click', closeSyncModal);
  document.getElementById('btn-change-code').addEventListener('click', () => {
    if (confirm('This will log you out and take you back to the welcome screen. Your tunes will remain and you can rejoin with your current code.')) {
      localStorage.removeItem('syncCode');
      closeSyncModal();
      showView('welcome', false);
      document.getElementById('header-title').textContent = 'Session Buddy';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
