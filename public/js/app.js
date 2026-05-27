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
  'Fiddle', 'High D Whistle', 'Low F Whistle',
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
  sets: [],
  classes: [],
  editingTune: null,
  editingSet: null,
  tuneFormWhoMusicianId: null,
  tuneFormWhoText: '',
  tuneFormAllMusicians: [],
  selectedTuneIds: [],
  backStack: [],
  tuneSearch: '',
  setSearch: '',
  classSearch: '',
  tuneSort: 'default',
  tuneFilter: {
    favoriteOnly: false,
    statuses: [],
    types: [],
    key: '',
    instruments: [],
    where: '',
    who: '',
    practicedDays: null,
    classIds: [],
    minTunebooks: null,
  },
  setFilter: {
    favoriteOnly: false,
    types: [],
    key: '',
    practicedDays: null,
    classIds: [],
  },
  classFilter: {
    seriesIds: [],
    instrument: '',
    organizer: '',
    instructor: '',
    dateFrom: '',
    dateTo: '',
  },
  duplicateGroups: [],
  // Filter modal scratch state — see renderFilterClassChips comment block.
  filterClasses: [],
  filterMusicians: [],
  filterDraftClassIds: { ff: [], sf: [] },
  filterDraftClassSeriesIds: [],
};

// Tracks the currently swiped-open list card wrapper (only one at a time).
let openSwipeWrap = null;

// ===== UTILITIES =====

function getSortName(name) {
  // Strip a leading article ("The", "An", "A") for sort purposes and append it
  // back with a comma so that "The Blarney Pilgrim" sorts under B, not T.
  const m = name.match(/^(The|An|A)\s+(.+)$/i);
  if (m) return m[2] + ', ' + m[1];
  return name;
}

function countTunebooks(tune) {
  return tune.tunebooks || 0;
}

function sortTunes(tunes) {
  return [...tunes].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[bestStatusInfo(a).status] ?? 2) - (STATUS_ORDER[bestStatusInfo(b).status] ?? 2);
    if (statusDiff !== 0) return statusDiff;
    if (state.tuneSort === 'tunebooks-desc') {
      const tbDiff = countTunebooks(b) - countTunebooks(a);
      if (tbDiff !== 0) return tbDiff;
    } else if (state.tuneSort === 'tunebooks-asc') {
      const tbDiff = countTunebooks(a) - countTunebooks(b);
      if (tbDiff !== 0) return tbDiff;
    }
    return getSortName(a.name).localeCompare(getSortName(b.name));
  });
}

// ===== SWIPE TO DELETE =====

const SWIPE_DELETE_WIDTH = 80;
const SWIPE_THRESHOLD = 40;

function closeOpenSwipe() {
  if (!openSwipeWrap) return;
  if (openSwipeWrap._swipeClose) openSwipeWrap._swipeClose();
  openSwipeWrap = null;
}

function wrapCardWithSwipe(card, onDelete) {
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrap';
  card.parentNode.insertBefore(wrap, card);
  wrap.appendChild(card);

  const delBtn = document.createElement('button');
  delBtn.className = 'swipe-delete-btn';
  delBtn.textContent = 'Delete';
  delBtn.setAttribute('aria-label', 'Delete');
  wrap.appendChild(delBtn);

  let startX, startY, dragging = false, isOpen = false;

  wrap._swipeClose = () => {
    card.style.transition = '';
    card.style.transform = '';
    isOpen = false;
  };

  wrap.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = false;
    if (openSwipeWrap && openSwipeWrap !== wrap) closeOpenSwipe();
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      if (Math.abs(dy) >= Math.abs(dx)) return;
      dragging = true;
    }
    e.preventDefault();
    const base = isOpen ? -SWIPE_DELETE_WIDTH : 0;
    const x = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, base + dx));
    card.style.transition = 'none';
    card.style.transform = `translateX(${x}px)`;
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    if (!dragging) {
      if (isOpen) closeOpenSwipe();
      return;
    }
    dragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    const finalX = (isOpen ? -SWIPE_DELETE_WIDTH : 0) + dx;
    card.style.transition = '';
    if (finalX < -SWIPE_THRESHOLD) {
      card.style.transform = `translateX(-${SWIPE_DELETE_WIDTH}px)`;
      openSwipeWrap = wrap;
      isOpen = true;
    } else {
      card.style.transform = '';
      if (openSwipeWrap === wrap) openSwipeWrap = null;
      isOpen = false;
    }
  });

  // Stop touch events from bubbling to the wrap so it can't interfere.
  delBtn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  // Act on touchend directly — avoids iOS's 300ms click delay, which causes
  // the card to slide back over the button before click fires.
  delBtn.addEventListener('touchend', e => {
    e.stopPropagation();
    e.preventDefault(); // suppress the subsequent click
    openSwipeWrap = null;
    isOpen = false;
    onDelete();
  }, { passive: false });
  // Fallback for desktop (mouse click, no touchend).
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    openSwipeWrap = null;
    isOpen = false;
    onDelete();
  });
}

function statusClass(status) {
  if (status === 'Memorized') return 'memorized';
  if (status === 'Learning') return 'learning';
  return 'not-learned';
}

// For the list-card status badge: picks the best-of status across the tune's
// per-instrument rows (Memorized > Learning > Not Learned). Returns
// { status, count, mixed } where `count` is 0/1/many tracked instruments and
// `mixed` is true when 2+ instruments disagree on status. A tune with no
// tracked instruments displays as Not Learned (the user can add instruments
// from the tune detail).
function bestStatusInfo(tune) {
  const rows = tune.instrument_statuses || [];
  if (rows.length === 0) {
    return { status: 'Not Learned', count: 0, mixed: false };
  }
  const STATUS_RANK = { 'Memorized': 2, 'Learning': 1, 'Not Learned': 0 };
  const best = rows.reduce(
    (b, r) => (STATUS_RANK[r.status] ?? 0) > (STATUS_RANK[b] ?? 0) ? r.status : b,
    'Not Learned'
  );
  const distinct = new Set(rows.map(r => r.status));
  return { status: best, count: rows.length, mixed: rows.length > 1 && distinct.size > 1 };
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

function pluralizeTuneType(type) {
  // English: words ending in s, x, z, ch, sh take 'es' (e.g. Waltz → Waltzes, March → Marches)
  if (/(?:s|x|z|ch|sh)$/i.test(type)) return type + 'es';
  return type + 's';
}

function setTypeLabel(set) {
  const tunes = set.tunes || [];
  const types = [...new Set(tunes.map(t => t.type).filter(Boolean))];
  if (types.length === 0) return '';
  if (types.length > 1) return 'Mixed';
  const type = types[0];
  if (tunes.length === 1) return type;
  return pluralizeTuneType(type);
}

function showError(msg) {
  const toast = document.getElementById('error-toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
}

// ===== FILTER HELPERS =====

function isTuneFilterActive() {
  const f = state.tuneFilter;
  return f.favoriteOnly || f.statuses.length > 0 || f.types.length > 0 ||
    f.key !== '' || f.instruments.length > 0 || f.where !== '' ||
    f.who !== '' || f.practicedDays !== null || f.classIds.length > 0 ||
    f.minTunebooks != null;
}

function isSetFilterActive() {
  const f = state.setFilter;
  return f.favoriteOnly || f.types.length > 0 || f.key !== '' ||
    f.practicedDays !== null || f.classIds.length > 0;
}

function isClassFilterActive() {
  const f = state.classFilter;
  return f.seriesIds.length > 0 || f.instrument !== '' || f.organizer !== '' ||
    f.instructor !== '' || f.dateFrom !== '' || f.dateTo !== '';
}

function applyClassFilter(classes) {
  const f = state.classFilter;
  return classes.filter(c => {
    if (f.seriesIds.length && !f.seriesIds.includes(c.series_id)) return false;
    if (f.instrument && !(c.instrument || '').toLowerCase().includes(f.instrument.toLowerCase())) return false;
    if (f.organizer && !(c.organizer || '').toLowerCase().includes(f.organizer.toLowerCase())) return false;
    if (f.instructor) {
      const q = f.instructor.toLowerCase();
      const match = (c.instructors || []).some(i => i.name.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (f.dateFrom && (!c.date || c.date < f.dateFrom)) return false;
    if (f.dateTo && (!c.date || c.date > f.dateTo)) return false;
    return true;
  });
}

// Cross-criterion status × instrument check (design/PerInstrumentStatus.md,
// Phases 4 & 6).
//
// All three filter modes read from per-instrument rows now that the legacy
// columns are gone:
//   - Both selected: tune passes if some row's instrument is in `instruments`
//     AND its status is in `statuses` ("Memorized + D Flute" means D Flute
//     specifically Memorized).
//   - Status alone: tune passes if any tracked instrument has a matching status
//     ("show memorized tunes" = at least one instrument memorized).
//   - Instrument alone: tune passes if it tracks any selected instrument.
// A tune with no per-instrument rows is implicitly Not Learned on no instruments
// — only matches the "Not Learned" status filter when no instrument is also set.
function matchesStatusAndInstrument(tune, statuses, instruments) {
  const wantStatus = statuses.length > 0;
  const wantInstrument = instruments.length > 0;
  if (!wantStatus && !wantInstrument) return true;

  const rows = tune.instrument_statuses || [];
  if (wantStatus && wantInstrument) {
    return rows.some(r => instruments.includes(r.instrument) && statuses.includes(r.status));
  }
  if (wantInstrument) {
    return rows.some(r => instruments.includes(r.instrument));
  }
  // wantStatus only.
  if (rows.length === 0) return statuses.includes('Not Learned');
  return rows.some(r => statuses.includes(r.status));
}

function applyTuneFilter(tunes) {
  const f = state.tuneFilter;
  return tunes.filter(t => {
    if (f.favoriteOnly && !t.favorite) return false;
    if (!matchesStatusAndInstrument(t, f.statuses, f.instruments)) return false;
    if (f.types.length && !f.types.includes(t.type)) return false;
    if (f.key && !(t.key || '').toLowerCase().includes(f.key.toLowerCase())) return false;
    if (f.where && !(t.where_learned || '').toLowerCase().includes(f.where.toLowerCase())) return false;
    if (f.who) {
      const q = f.who.toLowerCase();
      const matchesText = (t.who || '').toLowerCase().includes(q);
      const matchesMusician = (t.who_musician_name || '').toLowerCase().includes(q);
      if (!matchesText && !matchesMusician) return false;
    }
    if (f.practicedDays != null) {
      if (!t.last_practiced_date) return false;
      const daysAgo = (Date.now() - new Date(t.last_practiced_date).getTime()) / 86400000;
      if (daysAgo > f.practicedDays) return false;
    }
    if (f.classIds.length) {
      const ids = t.class_ids || [];
      if (!f.classIds.some(id => ids.includes(id))) return false;
    }
    if (f.minTunebooks != null && countTunebooks(t) < f.minTunebooks) return false;
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
    if (f.key) {
      const q = f.key.toLowerCase();
      const match = (s.tunes || []).some(t => (t.key || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    if (f.practicedDays != null) {
      if (!s.last_practiced_date) return false;
      const daysAgo = (Date.now() - new Date(s.last_practiced_date).getTime()) / 86400000;
      if (daysAgo > f.practicedDays) return false;
    }
    if (f.classIds.length) {
      // A set passes if ANY tune in it belongs to ANY of the selected classes.
      const tunesInSet = s.tunes || [];
      const match = tunesInSet.some(t => (t.class_ids || []).some(id => f.classIds.includes(id)));
      if (!match) return false;
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
  'image-viewer': 'tunes',
  sets: 'sets', 'set-detail': 'sets', 'set-form': 'sets', 'set-import': 'sets',
  classes: 'classes', 'class-detail': 'classes', 'class-form': 'classes',
  'series-detail': 'classes', 'series-form': 'classes',
  'musician-detail': 'classes', 'musician-form': 'classes',
  'class-import': 'classes',
  musicians: null,
};

function showView(viewId, pushToHistory = true) {
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');

  // Nav is always visible except on the welcome screen
  document.getElementById('bottom-nav').classList.toggle('hidden', viewId === 'welcome');

  const showBack = viewId !== 'welcome' && viewId !== 'tunes' && viewId !== 'sets' && viewId !== 'classes' && viewId !== 'musicians';
  document.getElementById('back-btn').classList.toggle('hidden', !showBack);
  document.getElementById('hamburger-btn').classList.toggle('hidden', showBack || viewId === 'welcome');

  const activeSection = NAV_SECTION[viewId];
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === activeSection);
  });

  if (pushToHistory && viewId !== 'welcome') {
    state.backStack.push(viewId);
  }

  document.getElementById('main-content').scrollTop = 0;
}

// Header text to restore when navigating back to a view that doesn't re-render
// itself on goBack (i.e., views other than 'tunes' / 'sets' which call their
// own goTo* helper). Without this, the header would stick on whatever the
// previous view set (e.g., "Edit Tune" persists when backing out of the form).
const VIEW_TITLES = {
  'tune-detail': 'Tune Detail',
  'set-detail': 'Set Detail',
  'class-detail': 'Class Detail',
  'series-detail': 'Series Detail',
  'musician-detail': 'Musician',
  'class-import': 'Import Classes CSV',
};

function goBack() {
  state.backStack.pop();
  const prev = state.backStack[state.backStack.length - 1];
  // Always refresh list views so changes (e.g. favorites) are visible
  if (!prev || prev === 'tunes') {
    goToTunes();
  } else if (prev === 'sets') {
    goToSets();
  } else if (prev === 'classes') {
    goToClasses();
  } else if (prev === 'musicians') {
    goToMusicians();
  } else {
    showView(prev, false);
    if (VIEW_TITLES[prev]) {
      document.getElementById('header-title').textContent = VIEW_TITLES[prev];
    }
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
    // Strip whitespace for incipit fuzzy matching (query already lowercased)
    const strippedQuery = query.replace(/\s+/g, '');
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.alternate_titles || '').toLowerCase().includes(query) ||
      (t.type || '').toLowerCase().includes(query) ||
      (t.key || '').toLowerCase().includes(query) ||
      (t.thesession_id || '').toLowerCase().includes(query) ||
      (t.sequence_id || '').toLowerCase().includes(query) ||
      (strippedQuery.length >= 2 && ['incipit_a', 'incipit_b', 'incipit_c'].some(f =>
        (t[f] || '').replace(/\s+/g, '').toLowerCase().includes(strippedQuery)
      ))
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
    const g = nonFavs.filter(t => bestStatusInfo(t).status === status);
    if (g.length > 0) groups.push({ label: `${status} (${g.length})`, tunes: g });
  });

  let html = '';
  groups.forEach(group => {
    if (!query) {
      html += `<div class="status-group-header">${esc(group.label)}</div>`;
    }
    group.tunes.forEach(tune => {
      const info = bestStatusInfo(tune);
      const sc = statusClass(info.status);
      const typKey = [tune.type, tune.key].filter(Boolean).join(' · ');
      const isFav = tune.favorite ? 'is-favorite' : '';
      // Tappable cycle only when exactly one instrument is tracked. Zero
      // instruments → opens the detail (where the user can add one); two or
      // more → also opens the detail (cycling is ambiguous across rows).
      const tappable = info.count === 1;
      const title = tappable
        ? 'Tap to change status'
        : info.count === 0
          ? 'No instruments tracked yet — tap to view details'
          : 'Mixed across instruments — tap to view details';
      const cycleHint = tappable ? ' ↻' : '';
      const mixedDot = info.mixed ? ' <span class="status-badge-mixed" title="Statuses differ across instruments">•••</span>' : '';
      html += `
        <div class="list-card ${sc}" data-id="${tune.id}" role="button" tabindex="0">
          <div class="tune-card-top">
            <div class="tune-card-name">${esc(tune.name)}</div>
            <button class="list-heart-btn ${isFav}" data-id="${tune.id}" aria-label="Toggle favorite">&#9829;</button>
          </div>
          ${tune.incipit_a ? `<div class="tune-card-incipit">${esc(tune.incipit_a)}</div>` : ''}
          <div class="tune-card-meta">
            ${typKey ? `<span class="tune-card-type-key">${esc(typKey)}</span>` : ''}
            <span class="status-badge ${sc}${tappable ? ' tappable' : ''}" data-id="${tune.id}" data-status="${info.status}" data-count="${info.count}" title="${title}">${esc(info.status)}${cycleHint}</span>${mixedDot}
            <span class="tune-card-count-row">
              <button class="tune-count-btn tune-count-dec" data-id="${tune.id}" aria-label="Decrease count">−</button>
              <span class="tune-count-value" data-id="${tune.id}">${tune.count || 0}</span>
              <button class="tune-count-btn tune-count-inc" data-id="${tune.id}" aria-label="Increase count">+</button>
            </span>
          </div>
        </div>`;
    });
  });

  container.innerHTML = html;

  container.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.status-badge.tappable')) return;
      if (e.target.closest('.list-heart-btn')) return;
      if (e.target.closest('.tune-count-btn')) return;
      if (card.closest('.swipe-wrap') === openSwipeWrap && openSwipeWrap) { closeOpenSwipe(); return; }
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

      // Optimistic UI update
      badge.dataset.status = newStatus;
      const newSc = statusClass(newStatus);
      badge.className = `status-badge ${newSc} tappable`;
      badge.textContent = newStatus + ' ↻';

      try {
        // Only single-instrument tunes are tappable here (count === 1).
        // Cycle that instrument's row; the list re-render picks up the new
        // best-of via instrument_statuses.
        const inst = tune.instrument_statuses[0].instrument;
        await API.setTuneInstrumentStatus(tuneId, inst, newStatus);
        tune.instrument_statuses[0].status = newStatus;
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

  container.querySelectorAll('.tune-count-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tuneId = Number(btn.dataset.id);
      const tune = state.tunes.find(t => t.id === tuneId);
      if (!tune) return;
      const isInc = btn.classList.contains('tune-count-inc');
      const current = tune.count || 0;
      const newCount = isInc ? current + 1 : Math.max(0, current - 1);
      if (newCount === current) return;

      const display = container.querySelector(`.tune-count-value[data-id="${tuneId}"]`);
      if (display) display.textContent = newCount;

      try {
        const updated = await API.patchTune(tuneId, { count: newCount });
        const idx = state.tunes.findIndex(t => t.id === tuneId);
        if (idx !== -1) state.tunes[idx] = updated;
      } catch (err) {
        showError('Could not update count: ' + err.message);
        if (display) display.textContent = current;
      }
    });
  });

  openSwipeWrap = null;
  container.querySelectorAll('.list-card').forEach(card => {
    wrapCardWithSwipe(card, () => deleteTuneFromSwipe(Number(card.dataset.id)));
  });
}

async function deleteTuneFromSwipe(tuneId) {
  try {
    await API.deleteTune(tuneId);
    state.tunes = state.tunes.filter(t => t.id !== tuneId);
    renderTuneList(state.tunes, state.tuneSearch);
  } catch (e) {
    showError('Could not delete tune: ' + e.message);
  }
}

// ===== TUNE DETAIL VIEW =====

async function goToTuneDetail(tuneId) {
  showView('tune-detail');
  document.getElementById('header-title').textContent = 'Tune Detail';

  try {
    const [tune, allSets, images, instrumentStatuses, practiceLog] = await Promise.all([
      API.getTune(tuneId), API.getSets(), API.getTuneImages(tuneId),
      API.getTuneInstrumentStatuses(tuneId), API.getPracticeLog(tuneId),
    ]);
    const tuneSets = allSets.filter(s => s.tunes.some(t => t.id === tuneId));
    renderTuneDetail(tune, tuneSets, images, instrumentStatuses, practiceLog);
  } catch (e) {
    showError('Could not load tune: ' + e.message);
  }
}

function renderTuneDetail(tune, tuneSets = [], images = [], instrumentStatuses = [], practiceLog = []) {
  const sessionUrl = buildSessionUrl(tune.thesession_id, tune.setting);
  const trackedInstruments = new Set(instrumentStatuses.map(s => s.instrument));
  const unusedInstruments = INSTRUMENTS.filter(i => !trackedInstruments.has(i));

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

  // Attachments section (images + PDFs)
  const syncCode = encodeURIComponent(localStorage.getItem('syncCode') || '');
  const attachUrl = (img) => {
    const base = img.source === 'set'
      ? `/api/sets/${img.source_id}/image/${img.id}`
      : `/api/tunes/${img.source_id}/image/${img.id}`;
    return `${base}?code=${syncCode}&t=${Date.now()}`;
  };
  html += `<div class="detail-card" id="tune-image-card">
    <div class="detail-card-title">Images &amp; Attachments</div>
    ${images.length > 0 ? `<div class="tune-image-list">${images.map(img => {
      const isPdf = img.mime_type === 'application/pdf';
      const src = img.source || 'tune';
      const srcId = img.source_id || tune.id;
      return `<div class="tune-image-item">
        <button class="tune-image-thumb" type="button"
                data-image-id="${img.id}" data-source="${src}" data-source-id="${srcId}"
                data-mime="${esc(img.mime_type)}" data-filename="${esc(img.filename)}">
          ${isPdf
            ? `<span class="tune-image-pdf-icon">&#128196;</span>`
            : `<img src="${attachUrl(img)}" class="tune-image-thumb-img" alt="${esc(img.filename)}"
                   onerror="this.parentNode.innerHTML='<span class=tune-image-broken>&#128444;</span>'" />`
          }
          <span class="tune-image-thumb-label">&#128269; View</span>
        </button>
        <div class="tune-image-filename">${esc(img.filename)}${src === 'set' ? ' <span class="tune-image-set-badge">set</span>' : ''}</div>
        <button class="btn btn-danger btn-small tune-image-delete-btn"
                data-image-id="${img.id}" data-source="${src}" data-source-id="${srcId}">Remove</button>
      </div>`;
    }).join('')}</div>` : ''}
    <label class="file-drop-zone file-drop-zone--compact" id="tune-image-drop-zone">
      <span id="tune-image-file-label">Tap to add image or PDF</span>
      <input id="tune-image-file-input" type="file"
             accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" style="display:none" />
    </label>
    <button class="btn btn-primary btn-small hidden" id="btn-upload-image" style="margin-top:8px;">Upload</button>
    <div id="tune-image-status" class="hint" style="margin-top:6px;min-height:1em;"></div>
  </div>`;

  // Per-instrument learning status (sits below incipits + attachments,
  // above Details / Practice / Additional Info).
  html += `<div class="detail-card">
    <div class="detail-card-title">Learning status</div>
    <div class="instrument-status-table" id="instrument-status-table">
      ${instrumentStatuses.length === 0
        ? `<div class="instrument-status-empty">No instruments tracked yet. Add one below.</div>`
        : instrumentStatuses.map(row => `
            <div class="instrument-status-row" data-instrument="${esc(row.instrument)}">
              <span class="instrument-status-name">${esc(row.instrument)}</span>
              <button class="status-badge ${statusClass(row.status)} tappable instrument-status-cycle"
                      data-status="${row.status}" title="Tap to change status">${row.status} ↻</button>
              <button class="instrument-status-remove" title="Remove this instrument" aria-label="Remove">&times;</button>
            </div>
          `).join('')}
      ${unusedInstruments.length > 0
        ? `<div class="instrument-status-add">
             <select id="instrument-status-add-select">
               <option value="">+ Add instrument…</option>
               ${unusedInstruments.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('')}
             </select>
           </div>`
        : ''}
    </div>
  </div>`;

  // Always-visible fields. Instrument list is shown by the per-instrument
  // status table above, so it's not duplicated here.
  const visibleFields = [];
  if (tune.alternate_titles) visibleFields.push(['Also known as', esc(tune.alternate_titles)]);
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

  // Practice log — inline log form + history list
  const today = new Date().toISOString().split('T')[0];
  html += `
    <div class="detail-card">
      <div class="detail-card-title">Practice Log</div>
      <form id="practice-log-form" class="practice-log-form">
        <div class="practice-log-form-fields">
          <input type="date" id="pl-date" value="${today}" required />
          <select id="pl-type" class="pl-form-type">
            <option value="practice">Practice</option>
            <option value="session">Session</option>
            <option value="class">Class</option>
          </select>
          <select id="pl-instrument" class="pl-form-instrument">
            <option value="">Instrument…</option>
            ${INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('')}
          </select>
        </div>
        <div class="practice-log-notes-row">
          <input type="text" id="pl-notes" placeholder="Notes (optional)" />
          <button type="submit" class="btn btn-primary btn-small">Log</button>
        </div>
      </form>
      ${practiceLog.length > 0
        ? `<div class="practice-log-history">${practiceLog.map(entry => `
            <div class="practice-log-entry">
              <span class="pl-date">${esc(entry.date)}</span>
              <span class="pl-type pl-type--${esc(entry.event_type)}">${entry.event_type.charAt(0).toUpperCase() + entry.event_type.slice(1)}</span>
              <span class="pl-instrument">${esc(entry.instrument)}</span>
              ${entry.notes ? `<span class="pl-notes">${esc(entry.notes)}</span>` : ''}
              <button class="pl-delete btn btn-danger btn-small" data-entry-id="${entry.id}">&times;</button>
            </div>`).join('')}
          </div>`
        : `<div class="hint" style="padding-top:8px">No events logged yet.</div>`}
    </div>`;

  // Classes (Phase 2e of design/Classes.md). Each entry links to its
  // class detail; the series name sits underneath as context.
  if (tune.classes && tune.classes.length > 0) {
    html += `<div class="detail-card"><div class="detail-card-title">Classes</div>`;
    tune.classes.forEach(c => {
      const sub = [c.series_name, formatDate(c.date)].filter(Boolean).join(' · ');
      html += `<div class="detail-field"><span class="detail-field-value tune-in-set-link" data-tune-class-id="${c.id}">${esc(c.name)}${sub ? ` <span class="hint">— ${esc(sub)}</span>` : ''} &#8599;</span></div>`;
    });
    html += `</div>`;
  }

  // Hidden fields
  const hiddenFields = [];
  if (tune.who_musician) {
    hiddenFields.push(['Learned from', `<span class="chip tappable" data-musician-id="${tune.who_musician.id}">${esc(tune.who_musician.name)} &#8599;</span>`]);
  } else if (tune.who) {
    hiddenFields.push(['Learned from', `${esc(tune.who)}<span class="who-link-actions"> <button class="btn btn-outline btn-small" id="btn-who-link">Link</button> <button class="btn btn-outline btn-small" id="btn-who-create">Create</button></span>`]);
  }
  if (tune.where_learned) hiddenFields.push(['Where', esc(tune.where_learned)]);
  if (tune.date_learned) hiddenFields.push(['Date Learned', esc(tune.date_learned)]);
  if (tune.added_date) hiddenFields.push(['Date Added', esc(tune.added_date)]);
  if (tune.setting) hiddenFields.push(['Setting', esc(tune.setting)]);

  // Always show Additional Info — it always has at least the "In sets" row
  {
    html += `<button class="show-more-btn" id="btn-show-more">Show more &#8964;</button>`;
    html += `<div class="detail-card hidden" id="hidden-fields-card"><div class="detail-card-title">Additional Info</div>`;
    hiddenFields.forEach(([label, value]) => {
      html += `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${value}</span></div>`;
    });
    if (tuneSets.length > 0) {
      html += `<div class="detail-field detail-field--sets"><span class="detail-field-label">In sets</span><span class="detail-field-value">`;
      tuneSets.forEach(set => {
        const setLabel = set.tunes.map(t => esc(t.name)).join(' / ');
        html += `<span class="tune-in-set-link" data-set-id="${set.id}">${setLabel} &#8599;</span>`;
      });
      html += `</span></div>`;
    } else {
      html += `<div class="detail-field"><span class="detail-field-label">In sets</span><span class="detail-field-value"><em>Not in any sets yet</em></span></div>`;
    }
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

  // Classes section: each entry links to its class detail.
  container.querySelectorAll('[data-tune-class-id]').forEach(link => {
    link.addEventListener('click', () => goToClassDetail(Number(link.dataset.tuneClassId)));
  });

  // Learned from: linked musician chip → musician detail.
  container.querySelectorAll('[data-musician-id]').forEach(chip => {
    chip.addEventListener('click', () => goToMusicianDetail(Number(chip.dataset.musicianId)));
  });

  // Learned from: unmatched who text — inline "Link" picker and direct "Create".
  const whoLinkBtn = document.getElementById('btn-who-link');
  const whoCreateBtn = document.getElementById('btn-who-create');
  if (whoLinkBtn) {
    whoLinkBtn.addEventListener('click', async () => {
      let allMusicians;
      try { allMusicians = await API.getMusicians(); } catch (e) { showError('Could not load musicians.'); return; }
      const whoValueEl = whoLinkBtn.closest('.detail-field-value');
      whoValueEl.innerHTML = `
        <span>${esc(tune.who)}</span>
        <div class="typeahead-wrapper" style="margin-top:6px;">
          <input id="who-inline-input" type="text" placeholder="Search musician…" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;font-family:inherit" />
          <div id="who-inline-suggestions" class="typeahead-suggestions hidden"></div>
        </div>`;
      const inp = document.getElementById('who-inline-input');
      const sug = document.getElementById('who-inline-suggestions');
      inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        if (!q) { sug.classList.add('hidden'); return; }
        const hits = allMusicians.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
        sug.innerHTML = hits.map(m => `<div class="typeahead-item" data-id="${m.id}">${esc(m.name)}</div>`).join('');
        sug.classList.toggle('hidden', !hits.length);
        sug.querySelectorAll('.typeahead-item').forEach(item => {
          item.addEventListener('click', async () => {
            try {
              await API.patchTune(tune.id, { who_musician_id: Number(item.dataset.id) });
              await refreshDetail();
            } catch (err) { showError('Could not link musician: ' + err.message); }
          });
        });
      });
      inp.focus();
    });
  }
  if (whoCreateBtn) {
    whoCreateBtn.addEventListener('click', async () => {
      try {
        const musician = await API.createMusician({ name: tune.who });
        await API.patchTune(tune.id, { who_musician_id: musician.id });
        await refreshDetail();
      } catch (err) { showError('Could not create musician: ' + err.message); }
    });
  }
  document.getElementById('btn-add-to-set').addEventListener('click', () => goToSetForm(null, tune.id));
  document.getElementById('btn-edit-tune').addEventListener('click', () => goToTuneForm(tune));
  document.getElementById('btn-delete-tune').addEventListener('click', () => deleteTune(tune));

  // Per-instrument status table — tap badge to cycle, × to remove, picker to add.
  const INSTRUMENT_STATUS_NEXT = { 'Not Learned': 'Learning', 'Learning': 'Memorized', 'Memorized': 'Not Learned' };

  async function refreshDetail() {
    try {
      const [statuses, refreshed, newLog] = await Promise.all([
        API.getTuneInstrumentStatuses(tune.id),
        API.getTune(tune.id),
        API.getPracticeLog(tune.id),
      ]);
      // Keep state.tunes in sync so the list view reflects the recomputed legacy status.
      const idx = state.tunes.findIndex(t => t.id === refreshed.id);
      if (idx !== -1) state.tunes[idx] = refreshed;
      renderTuneDetail(refreshed, tuneSets, images, statuses, newLog);
    } catch (err) {
      showError('Could not reload tune detail: ' + err.message);
    }
  }

  const instrumentTable = document.getElementById('instrument-status-table');
  if (instrumentTable) {
    instrumentTable.addEventListener('click', async (e) => {
      const cycle = e.target.closest('.instrument-status-cycle');
      const remove = e.target.closest('.instrument-status-remove');
      const row = e.target.closest('.instrument-status-row');
      if (!row) return;
      const instrument = row.dataset.instrument;
      try {
        if (cycle) {
          const next = INSTRUMENT_STATUS_NEXT[cycle.dataset.status] || 'Not Learned';
          await API.setTuneInstrumentStatus(tune.id, instrument, next);
          await refreshDetail();
        } else if (remove) {
          if (!confirm(`Remove ${instrument} from this tune?`)) return;
          await API.deleteTuneInstrumentStatus(tune.id, instrument);
          await refreshDetail();
        }
      } catch (err) {
        showError('Could not update instrument status: ' + err.message);
      }
    });

    const addSelect = document.getElementById('instrument-status-add-select');
    if (addSelect) {
      addSelect.addEventListener('change', async () => {
        const instrument = addSelect.value;
        if (!instrument) return;
        try {
          await API.setTuneInstrumentStatus(tune.id, instrument, 'Not Learned');
          await refreshDetail();
        } catch (err) {
          showError('Could not add instrument: ' + err.message);
        }
      });
    }
  }

  document.getElementById('practice-log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('pl-date').value;
    const event_type = document.getElementById('pl-type').value;
    const instrument = document.getElementById('pl-instrument').value;
    const notes = document.getElementById('pl-notes').value.trim();
    if (!instrument) { showError('Please select an instrument.'); return; }
    try {
      await API.addPracticeLogEntry(tune.id, { date, event_type, instrument, notes });
      await refreshDetail();
    } catch (err) {
      showError('Could not log event: ' + err.message);
    }
  });

  document.getElementById('tune-detail-content').querySelectorAll('.pl-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this log entry?')) return;
      try {
        await API.deletePracticeLogEntry(tune.id, Number(btn.dataset.entryId));
        await refreshDetail();
      } catch (err) {
        showError('Could not delete log entry: ' + err.message);
      }
    });
  });

  // Scope to elements that actually carry data-set-id — this class is reused
  // by the Classes card (data-tune-class-id) and would otherwise catch those
  // clicks and try to load a set with id=NaN.
  document.querySelectorAll('.tune-in-set-link[data-set-id]').forEach(el => {
    el.addEventListener('click', () => goToSetDetail(Number(el.dataset.setId)));
  });

  const showMoreBtn = document.getElementById('btn-show-more');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      document.getElementById('hidden-fields-card').classList.remove('hidden');
      showMoreBtn.classList.add('hidden');
    });
  }

  // Attachment thumbnails — open viewer
  container.querySelectorAll('.tune-image-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      goToImageViewer(
        Number(btn.dataset.sourceId), Number(btn.dataset.imageId),
        btn.dataset.mime, btn.dataset.filename,
        btn.dataset.source, tune.id
      );
    });
  });

  // Attachment delete buttons
  container.querySelectorAll('.tune-image-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this attachment?')) return;
      try {
        const imageId = Number(btn.dataset.imageId);
        const sourceId = Number(btn.dataset.sourceId);
        if (btn.dataset.source === 'set') {
          await API.deleteSetImage(sourceId, imageId);
        } else {
          await API.deleteTuneImage(sourceId, imageId);
        }
        goToTuneDetail(tune.id);
      } catch (err) {
        showError('Could not remove: ' + err.message);
      }
    });
  });

  // Upload
  const imgFileInput = document.getElementById('tune-image-file-input');
  const imgFileLabel = document.getElementById('tune-image-file-label');
  const btnUploadImage = document.getElementById('btn-upload-image');
  const imgStatus = document.getElementById('tune-image-status');
  // No click listener on the label — the <input> is inside it so the browser
  // already opens the picker when the label is tapped.

  imgFileInput.addEventListener('change', () => {
    const f = imgFileInput.files[0];
    imgFileLabel.textContent = f ? f.name : 'Tap to add image or PDF';
    btnUploadImage.classList.toggle('hidden', !f);
    imgStatus.textContent = '';
  });

  btnUploadImage.addEventListener('click', async () => {
    const f = imgFileInput.files[0];
    if (!f) return;
    btnUploadImage.disabled = true;
    imgStatus.textContent = 'Uploading…';
    try {
      await API.uploadTuneImage(tune.id, f);
      goToTuneDetail(tune.id);
    } catch (err) {
      imgStatus.textContent = 'Upload failed: ' + err.message;
      btnUploadImage.disabled = false;
    }
  });
}

// ===== IMAGE VIEWER =====

// source: 'tune'|'set'; sourceId: the tune or set id the image belongs to;
// originTuneId/originSetId: which detail page to return to after delete.
function goToImageViewer(sourceId, imageId, mimeType, filename, source = 'tune', originTuneId = null, originSetId = null) {
  showView('image-viewer');
  document.getElementById('header-title').textContent = filename || 'Attachment';
  const code = encodeURIComponent(localStorage.getItem('syncCode') || '');
  const basePath = source === 'set'
    ? `/api/sets/${sourceId}/image/${imageId}`
    : `/api/tunes/${sourceId}/image/${imageId}`;
  const url = `${basePath}?code=${code}&t=${Date.now()}`;

  const mediaHtml = mimeType === 'application/pdf'
    ? `<embed src="${url}" type="application/pdf" class="image-viewer-pdf" />
       <p class="hint" style="text-align:center;margin-top:8px;">
         <a href="${url}" target="_blank" rel="noopener">Open in new tab &#8599;</a>
       </p>`
    : `<img src="${url}" class="image-viewer-img" alt="${esc(filename)}"
           onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'hint',textContent:'Could not load image.'}))" />`;

  document.getElementById('image-viewer-content').innerHTML = `
    <div class="image-viewer-wrapper">${mediaHtml}</div>
    <div class="image-viewer-actions">
      <button class="btn btn-danger btn-small" id="btn-viewer-remove">Remove</button>
    </div>`;

  document.getElementById('btn-viewer-remove').addEventListener('click', async () => {
    if (!confirm('Remove this attachment?')) return;
    try {
      if (source === 'set') {
        await API.deleteSetImage(sourceId, imageId);
      } else {
        await API.deleteTuneImage(sourceId, imageId);
      }
      // Clear image-viewer from back stack then return to the originating detail view
      state.backStack = state.backStack.filter(v => v !== 'image-viewer');
      if (originSetId) goToSetDetail(originSetId);
      else goToTuneDetail(originTuneId);
    } catch (err) {
      showError('Could not remove: ' + err.message);
    }
  });
}

// ===== TUNE FORM =====

async function goToTuneForm(tune = null) {
  state.editingTune = tune;
  state.tuneFormClassIds = tune && tune.classes ? tune.classes.map(c => c.id) : [];
  state.tuneFormAllClasses = [];
  state.tuneFormWhoMusicianId = tune ? (tune.who_musician_id || null) : null;
  state.tuneFormWhoText = tune ? (tune.who || '') : '';
  state.tuneFormAllMusicians = [];
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
    // Prefill the Learning Status dropdown with the tune's best-of (just for
    // display while editing). On save the dropdown applies only to instruments
    // newly checked during this edit; existing per-instrument rows keep their
    // status.
    form.elements['learning_status'].value = bestStatusInfo(tune).status;
    form.elements['favorite'].checked = !!tune.favorite;
    form.elements['incipit_a'].value = tune.incipit_a || '';
    form.elements['incipit_b'].value = tune.incipit_b || '';
    form.elements['incipit_c'].value = tune.incipit_c || '';
    form.elements['thesession_id'].value = tune.thesession_id || '';
    form.elements['setting'].value = tune.setting || '';
    form.elements['where_learned'].value = tune.where_learned || '';
    form.elements['tunebooks'].value = tune.tunebooks || '';
    form.elements['mnemonic'].value = tune.mnemonic || '';
    const savedInstruments = new Set((tune.instrument_statuses || []).map(s => s.instrument));
    document.querySelectorAll('#f-instrument input[type="checkbox"]').forEach(cb => {
      cb.checked = savedInstruments.has(cb.value);
    });
    form.elements['sequence_id'].value = tune.sequence_id || '';
    form.elements['composer'].value = tune.composer || '';
    form.elements['count'].value = tune.count || '';
    form.elements['added_date'].value = tune.added_date || '';
    form.elements['date_learned'].value = tune.date_learned || '';
    form.elements['last_practiced_date'].value = tune.last_practiced_date || '';
    form.elements['notes'].value = tune.notes || '';
    form.elements['alternate_titles'].value = tune.alternate_titles || '';

    requestAnimationFrame(() => {
      ['a', 'b', 'c'].forEach(part => {
        const val = tune[`incipit_${part}`];
        if (val) renderAbcInto(`preview-${part}`, val, tune.type, tune.key);
      });
    });
  }

  // Load classes and musicians for the pickers on this form.
  document.getElementById('f-class-input').value = '';
  hideTuneFormClassSuggestions();
  hideTuneFormWhoSuggestions();
  try {
    const [classes, musicians] = await Promise.all([API.getClasses(), API.getMusicians()]);
    state.tuneFormAllClasses = classes;
    state.tuneFormAllMusicians = musicians;
  } catch (e) {
    showError('Could not load form data: ' + e.message);
    state.tuneFormAllClasses = [];
    state.tuneFormAllMusicians = [];
  }
  renderTuneFormClassChips();
  renderTuneFormWhoField();
}

function renderTuneFormClassChips() {
  const container = document.getElementById('f-class-chips');
  const ids = state.tuneFormClassIds || [];
  if (ids.length === 0) {
    container.innerHTML = '<span class="empty-hint">No classes attached</span>';
    return;
  }
  const byId = new Map((state.tuneFormAllClasses || []).map(c => [c.id, c]));
  container.innerHTML = ids.map(id => {
    const c = byId.get(id);
    if (!c) return '';
    const sub = c.series ? c.series.name : '';
    return `<span class="chip removable" data-id="${id}" title="${sub ? esc(sub) : ''}">${esc(c.name)}<button type="button" class="chip-remove" aria-label="Remove">&times;</button></span>`;
  }).join('');
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.closest('.chip').dataset.id);
      state.tuneFormClassIds = state.tuneFormClassIds.filter(x => x !== id);
      renderTuneFormClassChips();
    });
  });
}

function renderTuneFormClassSuggestions(query) {
  const list = document.getElementById('f-class-suggestions');
  const q = (query || '').trim().toLowerCase();
  if (!q) { hideTuneFormClassSuggestions(); return; }
  const all = state.tuneFormAllClasses || [];
  const taken = new Set(state.tuneFormClassIds || []);
  const matches = all.filter(c => {
    if (taken.has(c.id)) return false;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.series && c.series.name.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, 8);
  if (matches.length === 0) {
    list.innerHTML = `<div class="typeahead-item typeahead-create" style="cursor:default">No matching classes — create one in the Classes tab first.</div>`;
  } else {
    list.innerHTML = matches.map(c => {
      const sub = c.series ? c.series.name : '';
      return `<div class="typeahead-item" data-id="${c.id}">${esc(c.name)}${sub ? ` <span class="hint">— ${esc(sub)}</span>` : ''}</div>`;
    }).join('');
  }
  list.classList.remove('hidden');
  list.querySelectorAll('[data-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.id);
      if (!state.tuneFormClassIds.includes(id)) state.tuneFormClassIds.push(id);
      document.getElementById('f-class-input').value = '';
      hideTuneFormClassSuggestions();
      renderTuneFormClassChips();
    });
  });
}

function hideTuneFormClassSuggestions() {
  document.getElementById('f-class-suggestions').classList.add('hidden');
}

// Who (musician) picker for the tune form — single-select, typeahead + quick-create.

function renderTuneFormWhoField() {
  const chipArea = document.getElementById('f-who-chip');
  const wrapper = document.querySelector('#f-who-input')?.parentElement;
  const input = document.getElementById('f-who-input');
  if (!chipArea) return;

  if (state.tuneFormWhoMusicianId) {
    const m = state.tuneFormAllMusicians.find(x => x.id === state.tuneFormWhoMusicianId);
    const name = m ? m.name : `Musician #${state.tuneFormWhoMusicianId}`;
    chipArea.innerHTML = `<span class="chip removable"><span class="chip-name">${esc(name)}</span><button type="button" class="chip-remove" aria-label="Remove">&times;</button></span>`;
    chipArea.querySelector('.chip-remove').addEventListener('click', () => {
      state.tuneFormWhoMusicianId = null;
      renderTuneFormWhoField();
    });
    if (wrapper) wrapper.style.display = 'none';
  } else {
    chipArea.innerHTML = state.tuneFormWhoText
      ? `<span class="hint" style="font-size:0.8rem">Currently: "${esc(state.tuneFormWhoText)}"</span>`
      : '';
    if (wrapper) wrapper.style.display = '';
    if (input) input.value = '';
  }
}

function renderTuneFormWhoSuggestions(query) {
  const list = document.getElementById('f-who-suggestions');
  const q = query.trim().toLowerCase();
  if (!q) { hideTuneFormWhoSuggestions(); return; }
  const matches = state.tuneFormAllMusicians.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  const hasExact = state.tuneFormAllMusicians.some(m => m.name.toLowerCase() === q);
  let html = matches.map(m => `<div class="typeahead-item" data-id="${m.id}">${esc(m.name)}</div>`).join('');
  if (!hasExact) {
    html += `<div class="typeahead-item typeahead-create" data-create="${esc(query.trim())}">+ Add new musician "${esc(query.trim())}"</div>`;
  }
  list.innerHTML = html;
  list.classList.remove('hidden');
  list.querySelectorAll('.typeahead-item').forEach(item => {
    item.addEventListener('click', () => onTuneFormWhoSuggestionPicked(item));
  });
}

function hideTuneFormWhoSuggestions() {
  const el = document.getElementById('f-who-suggestions');
  if (el) el.classList.add('hidden');
}

async function onTuneFormWhoSuggestionPicked(item) {
  if (item.dataset.id) {
    state.tuneFormWhoMusicianId = Number(item.dataset.id);
  } else if (item.dataset.create) {
    try {
      const created = await API.createMusician({ name: item.dataset.create });
      state.tuneFormAllMusicians.push(created);
      state.tuneFormWhoMusicianId = created.id;
    } catch (e) {
      showError('Could not create musician: ' + e.message);
      return;
    }
  }
  hideTuneFormWhoSuggestions();
  renderTuneFormWhoField();
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
    who: state.tuneFormWhoMusicianId ? null : state.tuneFormWhoText,
    who_musician_id: state.tuneFormWhoMusicianId,
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
    alternate_titles: form.elements['alternate_titles'].value.trim(),
    class_ids: state.tuneFormClassIds || [],
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
    if (e.status === 409 && e.conflictingTuneId) {
      // Duplicate detected. Offer to navigate to the existing tune so the
      // user can update its characteristics instead of creating a new one.
      if (confirm(`${e.message}\n\nOpen the existing tune?`)) {
        state.tunes = await API.getTunes();
        await goToTuneDetail(e.conflictingTuneId);
      }
      return;
    }
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
  document.getElementById('set-search').value = state.setSearch;

  try {
    state.sets = await API.getSets();
    renderSetList(state.sets, state.setSearch);
  } catch (e) {
    showError('Could not load sets: ' + e.message);
  }
}

function renderSetList(sets, searchQuery) {
  const container = document.getElementById('set-list');
  const query = (searchQuery || '').toLowerCase().trim();

  let filtered = sets;
  if (query) {
    filtered = filtered.filter(s =>
      (s.tunes || []).some(t =>
        t.name.toLowerCase().includes(query) ||
        (t.alternate_titles || '').toLowerCase().includes(query) ||
        (t.type || '').toLowerCase().includes(query) ||
        (t.key || '').toLowerCase().includes(query) ||
        (t.thesession_id || '').toLowerCase().includes(query) ||
        (t.sequence_id || '').toLowerCase().includes(query)
      )
    );
  }
  filtered = applySetFilter(filtered);
  updateFilterBtnStyle('btn-set-filter', isSetFilterActive());

  const isActive = query || isSetFilterActive();
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-list">
        <div class="empty-icon">&#127925;</div>
        <p>${isActive ? 'No sets match.' : 'No sets yet. Tap "+ New Set" to build your first set!'}</p>
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
      if (card.closest('.swipe-wrap') === openSwipeWrap && openSwipeWrap) { closeOpenSwipe(); return; }
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
        state.sets = await API.getSets();
        renderSetList(state.sets, state.setSearch);
      } catch (err) {
        showError('Could not update favorite: ' + err.message);
        state.sets = await API.getSets();
        renderSetList(state.sets, state.setSearch);
      }
    });
  });

  openSwipeWrap = null;
  container.querySelectorAll('.list-card').forEach(card => {
    wrapCardWithSwipe(card, () => deleteSetFromSwipe(Number(card.dataset.id)));
  });
}

async function deleteSetFromSwipe(setId) {
  try {
    await API.deleteSet(setId);
    state.sets = state.sets.filter(s => s.id !== setId);
    renderSetList(state.sets, state.setSearch);
  } catch (e) {
    showError('Could not delete set: ' + e.message);
  }
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
    const [set, setImages] = await Promise.all([
      API.getSet(setId),
      API.getSetImages(setId),
    ]);
    // Fetch each component tune's own images (filter to source==='tune' to
    // avoid re-showing the set PDF that already appears in setImages).
    const perTuneImages = await Promise.all(set.tunes.map(t => API.getTuneImages(t.id)));
    const tuneImagesMap = new Map(
      set.tunes.map((t, i) => [t.id, perTuneImages[i].filter(img => img.source === 'tune')])
    );
    renderSetDetail(set, setImages, tuneImagesMap);
  } catch (e) {
    showError('Could not load set: ' + e.message);
  }
}

function renderSetDetail(set, setImages = [], tuneImagesMap = new Map()) {
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
          <div class="tune-card-top">
            <div class="set-tune-name">${idx + 1}. ${esc(tune.name)}</div>
            <button class="list-heart-btn ${tune.favorite ? 'is-favorite' : ''}" data-id="${tune.id}" aria-label="Toggle favorite">&#9829;</button>
          </div>`;

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

  // Attachments card — set-level PDFs + per-tune images + upload
  const syncCode = encodeURIComponent(localStorage.getItem('syncCode') || '');
  {
    html += `<div class="detail-card" id="set-image-card">
      <div class="detail-card-title">Scores &amp; Attachments</div>`;

    if (setImages.length > 0) {
      html += `<div class="tune-image-list">${setImages.map(img => {
        const isPdf = img.mime_type === 'application/pdf';
        const url = `/api/sets/${set.id}/image/${img.id}?code=${syncCode}&t=${Date.now()}`;
        return `<div class="tune-image-item">
          <button class="tune-image-thumb set-image-thumb" type="button"
                  data-image-id="${img.id}" data-set-id="${set.id}" data-source="set"
                  data-mime="${esc(img.mime_type)}" data-filename="${esc(img.filename)}">
            ${isPdf
              ? `<span class="tune-image-pdf-icon">&#128196;</span>`
              : `<img src="${url}" class="tune-image-thumb-img" alt="${esc(img.filename)}"
                     onerror="this.parentNode.innerHTML='<span class=tune-image-broken>&#128444;</span>'" />`
            }
            <span class="tune-image-thumb-label">&#128269; View</span>
          </button>
          <div class="tune-image-filename">${esc(img.filename)}</div>
          <button class="btn btn-danger btn-small set-image-delete-btn"
                  data-image-id="${img.id}" data-set-id="${set.id}">Remove</button>
        </div>`;
      }).join('')}</div>`;
    }

    set.tunes.forEach(tune => {
      const imgs = tuneImagesMap.get(tune.id) || [];
      if (imgs.length === 0) return;
      html += `<div class="set-tune-image-group">
        <div class="set-tune-image-label">${esc(tune.name)}</div>
        <div class="tune-image-list">${imgs.map(img => {
          const isPdf = img.mime_type === 'application/pdf';
          const url = `/api/tunes/${img.source_id}/image/${img.id}?code=${syncCode}&t=${Date.now()}`;
          return `<div class="tune-image-item">
            <button class="tune-image-thumb set-image-thumb" type="button"
                    data-image-id="${img.id}" data-source-id="${img.source_id}" data-source="tune"
                    data-mime="${esc(img.mime_type)}" data-filename="${esc(img.filename)}">
              ${isPdf
                ? `<span class="tune-image-pdf-icon">&#128196;</span>`
                : `<img src="${url}" class="tune-image-thumb-img" alt="${esc(img.filename)}"
                       onerror="this.parentNode.innerHTML='<span class=tune-image-broken>&#128444;</span>'" />`
              }
              <span class="tune-image-thumb-label">&#128269; View</span>
            </button>
            <div class="tune-image-filename">${esc(img.filename)}</div>
          </div>`;
        }).join('')}</div>
      </div>`;
    });

    html += `
      <label class="file-drop-zone file-drop-zone--compact" id="set-image-drop-zone">
        <span id="set-image-file-label">Tap to add image or PDF</span>
        <input id="set-image-file-input" type="file"
               accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" style="display:none" />
      </label>
      <button class="btn btn-primary btn-small hidden" id="btn-upload-set-image" style="margin-top:8px;">Upload</button>
      <div id="set-image-status" class="hint" style="margin-top:6px;min-height:1em;"></div>
    </div>`;
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

  // Tune favorite hearts
  container.querySelectorAll('.list-heart-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const tuneId = Number(btn.dataset.id);
      const newFav = btn.classList.contains('is-favorite') ? 0 : 1;
      btn.classList.toggle('is-favorite', !!newFav);
      try {
        await API.patchTune(tuneId, { favorite: newFav });
      } catch (err) {
        btn.classList.toggle('is-favorite', !newFav);
        showError('Could not update favorite: ' + err.message);
      }
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

  // Set image thumbnails — open viewer
  container.querySelectorAll('.set-image-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      const sourceId = Number(btn.dataset.setId || btn.dataset.sourceId);
      goToImageViewer(
        sourceId, Number(btn.dataset.imageId),
        btn.dataset.mime, btn.dataset.filename,
        btn.dataset.source, null, set.id
      );
    });
  });

  // Set image upload
  const setImgFileInput = document.getElementById('set-image-file-input');
  const setImgFileLabel = document.getElementById('set-image-file-label');
  const btnUploadSetImage = document.getElementById('btn-upload-set-image');
  const setImgStatus = document.getElementById('set-image-status');

  setImgFileInput.addEventListener('change', () => {
    const f = setImgFileInput.files[0];
    setImgFileLabel.textContent = f ? f.name : 'Tap to add image or PDF';
    btnUploadSetImage.classList.toggle('hidden', !f);
    setImgStatus.textContent = '';
  });

  btnUploadSetImage.addEventListener('click', async () => {
    const f = setImgFileInput.files[0];
    if (!f) return;
    btnUploadSetImage.disabled = true;
    setImgStatus.textContent = 'Uploading…';
    try {
      await API.uploadSetImage(set.id, f);
      goToSetDetail(set.id);
    } catch (err) {
      setImgStatus.textContent = 'Upload failed: ' + err.message;
      btnUploadSetImage.disabled = false;
    }
  });

  // Set image delete buttons (set-level PDFs only; tune images are read-only from set view)
  container.querySelectorAll('.set-image-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this attachment?')) return;
      try {
        await API.deleteSetImage(Number(btn.dataset.setId), Number(btn.dataset.imageId));
        goToSetDetail(set.id);
      } catch (err) {
        showError('Could not remove: ' + err.message);
      }
    });
  });

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
      (t.alternate_titles || '').toLowerCase().includes(query) ||
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
    const sc = statusClass(bestStatusInfo(tune).status);
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

// ===== CLASSES VIEW (design/Classes.md, phase 2) =====

// A class's organizer / instrument are stored explicitly on the row. The form
// pre-populates from the selected series (see autoFillFromSeries) so the user
// sees the inherited value before saving — but the display layer reads the
// class's own values, with no silent fallback to the series. That keeps
// "what the form saved" and "what the detail shows" in sync.
function effectiveOrganizer(klass) { return klass.organizer || ''; }
function effectiveInstrument(klass) { return klass.instrument || ''; }

function formatDate(dateStr) {
  if (!dateStr) return '';
  // The API returns ISO timestamps (YYYY-MM-DDT...). Strip everything after T.
  return String(dateStr).split('T')[0];
}

async function goToClasses() {
  state.backStack = ['classes'];
  showView('classes', false);
  document.getElementById('header-title').textContent = 'My Classes';
  document.getElementById('class-search').value = state.classSearch;
  try {
    // Fetch series alongside classes so empty series still appear as
    // navigable headers — otherwise the user couldn't reach a series'
    // Edit/Delete page after deleting all of its classes.
    const [classes, allSeries] = await Promise.all([
      API.getClasses(), API.getClassSeries(),
    ]);
    state.classes = classes;
    state.allSeries = allSeries;
    renderClassesList(classes, allSeries, state.classSearch);
  } catch (e) {
    showError('Could not load classes: ' + e.message);
  }
}

function renderClassesList(classes, allSeries, searchQuery) {
  updateFilterBtnStyle('btn-class-filter', isClassFilterActive());
  const query = (searchQuery || '').toLowerCase().trim();
  let filtered = applyClassFilter(classes || []);
  if (query) {
    filtered = filtered.filter(c => (c.name || '').toLowerCase().includes(query));
  }
  const filterActive = isClassFilterActive() || !!query;
  const container = document.getElementById('class-list');
  if ((!filtered.length) && (!allSeries || allSeries.length === 0 || filterActive)) {
    const msg = filterActive
      ? '<div class="empty-list"><p>No classes match.</p></div>'
      : '<div class="empty-list"><p>No classes yet.</p><p class="hint">Tap + New Class to add one.</p></div>';
    container.innerHTML = msg;
    return;
  }
  // Group filtered classes by series_id (null bucket holds standalone classes).
  const bySeries = new Map();
  for (const c of filtered) {
    const sid = c.series_id || null;
    if (!bySeries.has(sid)) bySeries.set(sid, []);
    bySeries.get(sid).push(c);
  }

  // Render order: standalone classes first (if any), then all series sorted
  // by name. When a filter is active, skip series that have no matching
  // classes (they're just noise). Without a filter, include empty series so
  // they remain reachable for editing/deletion.
  const groups = [];
  const standalone = bySeries.get(null) || [];
  if (standalone.length > 0) {
    groups.push({ sid: null, name: 'Standalone classes', classes: standalone });
  }
  for (const s of [...(allSeries || [])].sort((a, b) => a.name.localeCompare(b.name))) {
    const seriesClasses = bySeries.get(s.id) || [];
    if (filterActive && seriesClasses.length === 0) continue;
    groups.push({ sid: s.id, name: s.name, classes: seriesClasses });
  }

  let html = '';
  for (const group of groups) {
    // Show the standalone header only when at least one series group also
    // exists — otherwise it's redundant ("everything is standalone").
    const showHeader = group.sid !== null || groups.length > 1;
    if (showHeader) {
      const headerActions = group.sid
        ? `<div class="series-actions">
             <button class="btn-card-add" data-add-to-series="${group.sid}" title="Add class to this series" aria-label="Add class to this series">+</button>
             <button class="btn-card-edit" data-edit-series="${group.sid}" title="Edit series" aria-label="Edit series">&#9998;</button>
             <button class="btn-card-delete" data-delete-series="${group.sid}" title="Delete series" aria-label="Delete series">&times;</button>
           </div>`
        : '';
      html += `<div class="status-group-header${group.sid ? ' clickable' : ''}" ${group.sid ? `data-series-id="${group.sid}"` : ''}><span class="status-group-name">${esc(group.name)}</span>${headerActions}</div>`;
    }
    if (group.classes.length === 0) {
      html += `<div class="hint" style="padding:0 4px 8px;">No classes in this series yet.</div>`;
      continue;
    }
    for (const c of group.classes) {
      const inst = c.instructors || [];
      let instructorLabel = '';
      if (inst.length === 1) instructorLabel = esc(inst[0].name);
      else if (inst.length >= 2) instructorLabel = `${esc(inst[0].name)} +${inst.length - 1}`;
      const meta = [
        formatDate(c.date),
        effectiveOrganizer(c),
        effectiveInstrument(c),
      ].filter(Boolean).map(esc).join(' · ');
      html += `
        <div class="list-card" data-class-id="${c.id}" role="button" tabindex="0">
          <div class="tune-card-top">
            <div class="tune-card-name">${esc(c.name)}</div>
            <div class="card-actions">
              <button class="btn-card-edit" data-edit-class="${c.id}" title="Edit class" aria-label="Edit class">&#9998;</button>
              <button class="btn-card-delete" data-delete-class="${c.id}" title="Delete class" aria-label="Delete class">&times;</button>
            </div>
          </div>
          ${meta ? `<div class="tune-card-meta"><span class="tune-card-type-key">${meta}</span></div>` : ''}
          ${instructorLabel ? `<div class="tune-card-meta"><span class="tune-card-type-key">${instructorLabel}</span></div>` : ''}
        </div>`;
    }
  }
  container.innerHTML = html;

  container.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', () => goToClassDetail(Number(card.dataset.classId)));
  });
  container.querySelectorAll('.status-group-header.clickable').forEach(h => {
    h.addEventListener('click', () => goToSeriesDetail(Number(h.dataset.seriesId)));
  });

  // Inline edit/delete buttons (stopPropagation so the card/header click
  // doesn't also fire and navigate to detail).
  container.querySelectorAll('[data-edit-class]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const klass = await API.getClass(Number(btn.dataset.editClass));
        goToClassForm(klass);
      } catch (err) { showError('Could not load class: ' + err.message); }
    });
  });
  container.querySelectorAll('[data-delete-class]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.deleteClass);
      const klass = state.classes.find(c => c.id === id);
      if (!klass || !confirm(`Delete "${klass.name}"?`)) return;
      try {
        await API.deleteClass(id);
        await goToClasses();
      } catch (err) { showError('Could not delete class: ' + err.message); }
    });
  });
  container.querySelectorAll('[data-add-to-series]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      goToClassForm(null, { preSeriesId: Number(btn.dataset.addToSeries) });
    });
  });
  container.querySelectorAll('[data-edit-series]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const series = await API.getClassSeriesById(Number(btn.dataset.editSeries));
        goToSeriesForm(series);
      } catch (err) { showError('Could not load series: ' + err.message); }
    });
  });
  container.querySelectorAll('[data-delete-series]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sid = Number(btn.dataset.deleteSeries);
      const series = (state.allSeries || []).find(s => s.id === sid);
      const classCount = state.classes.filter(c => c.series_id === sid).length;
      if (!series) return;
      const msg = classCount > 0
        ? `Delete "${series.name}"? Its ${classCount} class${classCount === 1 ? '' : 'es'} will be kept but unlinked from the series.`
        : `Delete "${series.name}"?`;
      if (!confirm(msg)) return;
      try {
        await API.deleteClassSeries(sid);
        await goToClasses();
      } catch (err) { showError('Could not delete series: ' + err.message); }
    });
  });
}

async function goToClassDetail(classId) {
  showView('class-detail');
  document.getElementById('header-title').textContent = 'Class Detail';
  try {
    const klass = await API.getClass(classId);
    renderClassDetail(klass);
  } catch (e) {
    showError('Could not load class: ' + e.message);
  }
}

function renderClassDetail(klass) {
  const container = document.getElementById('class-detail-content');
  const seriesLine = klass.series
    ? `<div class="detail-meta"><span class="detail-meta-item series-link" data-series-id="${klass.series.id}">${esc(klass.series.name)} &#8599;</span></div>`
    : '';
  const fields = [];
  const org = effectiveOrganizer(klass);
  const inst = effectiveInstrument(klass);
  if (org) fields.push(['Organizer', esc(org)]);
  if (inst) fields.push(['Instrument', esc(inst)]);
  if (klass.date) fields.push(['Date', esc(formatDate(klass.date))]);
  if (klass.notes) fields.push(['Notes', esc(klass.notes)]);

  let html = `
    <div class="detail-header">
      ${seriesLine}
      <div class="detail-title-row">
        <div class="detail-title">${esc(klass.name)}</div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-outline btn-small" id="btn-edit-class">Edit</button>
        <button class="btn btn-danger btn-small" id="btn-delete-class">Delete</button>
      </div>
    </div>`;

  if (fields.length > 0) {
    html += `<div class="detail-card"><div class="detail-card-title">Details</div>`;
    fields.forEach(([label, value]) => {
      html += `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${value}</span></div>`;
    });
    html += `</div>`;
  }

  // Instructors
  html += `<div class="detail-card"><div class="detail-card-title">Instructors</div>`;
  if (!klass.instructors || klass.instructors.length === 0) {
    html += `<div class="hint">No instructors recorded.</div>`;
  } else {
    html += `<div class="instructor-chips">`;
    klass.instructors.forEach(m => {
      html += `<span class="chip" data-musician-id="${m.id}">${esc(m.name)} &#8599;</span>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // Tunes
  html += `<div class="detail-card"><div class="detail-card-title">Tunes</div>`;
  if (!klass.tunes || klass.tunes.length === 0) {
    html += `<div class="hint">No tunes attached to this class.</div>`;
  } else {
    klass.tunes.forEach(t => {
      const meta = [t.type, t.key].filter(Boolean).join(' · ');
      html += `<div class="detail-field"><span class="detail-field-value tune-in-set-link" data-tune-id="${t.id}">${esc(t.name)}${meta ? ` <span class="hint">— ${esc(meta)}</span>` : ''} &#8599;</span></div>`;
    });
  }
  html += `</div>`;

  container.innerHTML = html;

  // Wire navigation
  if (klass.series) {
    container.querySelector('.series-link').addEventListener('click', () =>
      goToSeriesDetail(klass.series.id));
  }
  container.querySelectorAll('.chip[data-musician-id]').forEach(chip => {
    chip.addEventListener('click', () => goToMusicianDetail(Number(chip.dataset.musicianId)));
  });
  container.querySelectorAll('.tune-in-set-link[data-tune-id]').forEach(link => {
    link.addEventListener('click', () => goToTuneDetail(Number(link.dataset.tuneId)));
  });
  document.getElementById('btn-edit-class').addEventListener('click', () => goToClassForm(klass));
  document.getElementById('btn-delete-class').addEventListener('click', () => deleteClassFromDetail(klass));
}

async function deleteClassFromDetail(klass) {
  if (!confirm(`Delete "${klass.name}"? This won't delete its tunes or instructors.`)) return;
  try {
    await API.deleteClass(klass.id);
    await goToClasses();
  } catch (e) {
    showError('Could not delete class: ' + e.message);
  }
}

// ===== CLASS FORM (design/Classes.md, phase 2c) =====

async function goToClassForm(klass = null, options = {}) {
  // options.preSeriesId pre-selects a series when creating a new class
  // (used by "+ Add Class" affordances on series detail and the classes list).
  state.classForm = {
    editing: klass,
    instructorIds: klass ? klass.instructors.map(m => m.id) : [],
    tuneIds: klass ? klass.tunes.map(t => t.id) : [],
    allMusicians: [],
    allSeries: [],
    preSeriesId: options.preSeriesId || null,
  };
  showView('class-form');
  document.getElementById('header-title').textContent = klass ? 'Edit Class' : 'New Class';
  document.getElementById('class-form-title').textContent = klass ? 'Edit Class' : 'New Class';

  // Load reference data the form needs.
  try {
    const [series, musicians, tunes] = await Promise.all([
      API.getClassSeries(), API.getMusicians(),
      state.tunes.length > 0 ? Promise.resolve(state.tunes) : API.getTunes(),
    ]);
    state.classForm.allSeries = series;
    state.classForm.allMusicians = musicians;
    if (state.tunes.length === 0) state.tunes = tunes;
  } catch (e) {
    showError('Could not load form data: ' + e.message);
    return;
  }

  // Populate instrument selects (for the class itself and the new-series form).
  const instrumentOptions = '<option value="">— No instrument —</option>' +
    INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  document.getElementById('cf-instrument').innerHTML = instrumentOptions;
  document.getElementById('cf-new-series-instrument').innerHTML = instrumentOptions;

  // Populate the series dropdown.
  renderClassFormSeriesOptions();

  // Hide the inline new-series form (in case it was open from a previous visit).
  document.getElementById('cf-new-series-form').classList.add('hidden');

  // Prefill basic fields.
  const form = document.getElementById('class-form');
  form.elements['name'].value = klass ? klass.name : '';
  const initialSeriesId = klass && klass.series_id
    ? String(klass.series_id)
    : (state.classForm.preSeriesId ? String(state.classForm.preSeriesId) : '');
  form.elements['series_id'].value = initialSeriesId;
  form.elements['organizer'].value = klass ? (klass.organizer || '') : '';
  form.elements['instrument'].value = klass ? (klass.instrument || '') : '';
  form.elements['date'].value = klass && klass.date ? formatDate(klass.date) : '';
  form.elements['notes'].value = klass ? (klass.notes || '') : '';

  // If a series is selected and the class doesn't already have its own
  // organizer/instrument, copy them down from the series so the user sees
  // the inherited value in the form before saving (and saves it explicitly
  // on the class row, not via display-side fallback).
  autoFillFromSeries();

  // Render the dynamic pieces.
  renderClassFormInstructors();
  document.getElementById('cf-instructor-input').value = '';
  hideInstructorSuggestions();
  renderClassFormSelectedTunes();
  document.getElementById('cf-tune-search').value = '';
  renderClassFormTuneList('');
}

// Fills the organizer and instrument fields from the currently-selected
// series, but only if those fields are empty — so anything the user has
// already typed/picked stays put. Triggered on form open and on series-
// dropdown change.
function autoFillFromSeries() {
  const seriesId = document.getElementById('cf-series').value;
  if (!seriesId) return;
  const series = state.classForm.allSeries.find(s => s.id === Number(seriesId));
  if (!series) return;
  const orgInput = document.getElementById('cf-organizer');
  const instSelect = document.getElementById('cf-instrument');
  if (!orgInput.value && series.organizer) orgInput.value = series.organizer;
  if (!instSelect.value && series.instrument) instSelect.value = series.instrument;
}

function renderClassFormSeriesOptions(selectId = null) {
  const select = document.getElementById('cf-series');
  const all = state.classForm.allSeries;
  let html = '<option value="">— Standalone class —</option>';
  for (const s of all) {
    html += `<option value="${s.id}">${esc(s.name)}${s.organizer ? ` (${esc(s.organizer)})` : ''}</option>`;
  }
  select.innerHTML = html;
  if (selectId) select.value = String(selectId);
}

function renderClassFormInstructors() {
  const container = document.getElementById('cf-instructor-chips');
  const ids = state.classForm.instructorIds;
  if (ids.length === 0) {
    container.innerHTML = '<span class="empty-hint">No instructors yet</span>';
    return;
  }
  const byId = new Map(state.classForm.allMusicians.map(m => [m.id, m]));
  container.innerHTML = ids.map(id => {
    const m = byId.get(id);
    if (!m) return '';
    return `<span class="chip removable" data-id="${id}">${esc(m.name)}<button type="button" class="chip-remove" aria-label="Remove">&times;</button></span>`;
  }).join('');
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.closest('.chip').dataset.id);
      state.classForm.instructorIds = state.classForm.instructorIds.filter(x => x !== id);
      renderClassFormInstructors();
    });
  });
}

function renderInstructorSuggestions(query) {
  const list = document.getElementById('cf-instructor-suggestions');
  const q = query.trim().toLowerCase();
  if (!q) { hideInstructorSuggestions(); return; }
  const all = state.classForm.allMusicians;
  const taken = new Set(state.classForm.instructorIds);
  const matches = all.filter(m =>
    !taken.has(m.id) && m.name.toLowerCase().includes(q)
  ).slice(0, 8);
  const hasExact = all.some(m => m.name.toLowerCase() === q);
  let html = matches.map(m =>
    `<div class="typeahead-item" data-id="${m.id}">${esc(m.name)}</div>`
  ).join('');
  if (!hasExact) {
    html += `<div class="typeahead-item typeahead-create" data-create="${esc(query.trim())}">+ Add new musician “${esc(query.trim())}”</div>`;
  }
  list.innerHTML = html;
  list.classList.remove('hidden');
  list.querySelectorAll('.typeahead-item').forEach(item => {
    item.addEventListener('click', () => onInstructorSuggestionPicked(item));
  });
}

function hideInstructorSuggestions() {
  document.getElementById('cf-instructor-suggestions').classList.add('hidden');
}

async function onInstructorSuggestionPicked(item) {
  if (item.dataset.id) {
    const id = Number(item.dataset.id);
    if (!state.classForm.instructorIds.includes(id)) state.classForm.instructorIds.push(id);
  } else if (item.dataset.create) {
    try {
      const created = await API.createMusician({ name: item.dataset.create });
      state.classForm.allMusicians.push(created);
      state.classForm.instructorIds.push(created.id);
    } catch (e) {
      showError('Could not create musician: ' + e.message);
      return;
    }
  }
  document.getElementById('cf-instructor-input').value = '';
  hideInstructorSuggestions();
  renderClassFormInstructors();
}

function renderClassFormSelectedTunes() {
  const container = document.getElementById('cf-selected-tunes');
  const ids = state.classForm.tuneIds;
  if (ids.length === 0) {
    container.innerHTML = '<span class="empty-hint">None selected</span>';
    return;
  }
  const byId = new Map(state.tunes.map(t => [t.id, t]));
  container.innerHTML = ids.map(id => {
    const t = byId.get(id);
    if (!t) return '';
    return `<div class="selected-tune-item">
      <span class="tune-name">${esc(t.name)}</span>
      <button type="button" class="btn-remove-tune" data-id="${id}" aria-label="Remove">&times;</button>
    </div>`;
  }).join('');
  container.querySelectorAll('.btn-remove-tune').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(e.currentTarget.dataset.id);
      state.classForm.tuneIds = state.classForm.tuneIds.filter(x => x !== id);
      renderClassFormSelectedTunes();
      renderClassFormTuneList(document.getElementById('cf-tune-search').value);
    });
  });
}

function renderClassFormTuneList(searchQuery) {
  const container = document.getElementById('cf-tune-list');
  const query = (searchQuery || '').toLowerCase().trim();
  let tunes = sortTunes(state.tunes);
  if (query) {
    tunes = tunes.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.alternate_titles || '').toLowerCase().includes(query) ||
      (t.type || '').toLowerCase().includes(query) ||
      (t.thesession_id || '').toLowerCase().includes(query) ||
      (t.sequence_id || '').toLowerCase().includes(query)
    );
  }
  if (tunes.length === 0) {
    container.innerHTML = '<div class="empty-list"><p>No tunes found.</p></div>';
    return;
  }
  const selected = new Set(state.classForm.tuneIds);
  container.innerHTML = tunes.map(t => {
    const typKey = [t.type, t.key].filter(Boolean).join(' · ');
    return `<div class="list-card${selected.has(t.id) ? ' selected' : ''}" data-id="${t.id}" role="button" tabindex="0">
      <div class="tune-card-name">${esc(t.name)}</div>
      ${typKey ? `<div class="tune-card-meta"><span class="tune-card-type-key">${esc(typKey)}</span></div>` : ''}
    </div>`;
  }).join('');
  container.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      if (state.classForm.tuneIds.includes(id)) {
        state.classForm.tuneIds = state.classForm.tuneIds.filter(x => x !== id);
      } else {
        state.classForm.tuneIds.push(id);
      }
      renderClassFormSelectedTunes();
      renderClassFormTuneList(document.getElementById('cf-tune-search').value);
    });
  });
}

async function saveClassForm(e) {
  e.preventDefault();
  const form = document.getElementById('class-form');
  const name = form.elements['name'].value.trim();
  if (!name) { showError('Class name is required.'); return; }
  const data = {
    name,
    series_id: form.elements['series_id'].value
      ? Number(form.elements['series_id'].value)
      : null,
    organizer: form.elements['organizer'].value.trim() || null,
    instrument: form.elements['instrument'].value || null,
    date: form.elements['date'].value || null,
    notes: form.elements['notes'].value.trim() || null,
    instructor_ids: state.classForm.instructorIds,
    tune_ids: state.classForm.tuneIds,
  };
  try {
    let klass;
    if (state.classForm.editing) {
      klass = await API.updateClass(state.classForm.editing.id, data);
    } else {
      klass = await API.createClass(data);
    }
    await goToClassDetail(klass.id);
  } catch (err) {
    showError('Could not save class: ' + err.message);
  }
}

async function createSeriesInline() {
  const name = document.getElementById('cf-new-series-name').value.trim();
  if (!name) { showError('Series name is required.'); return; }
  const data = {
    name,
    organizer: document.getElementById('cf-new-series-organizer').value.trim() || null,
    instrument: document.getElementById('cf-new-series-instrument').value || null,
    date_from: document.getElementById('cf-new-series-date-from').value || null,
    date_to: document.getElementById('cf-new-series-date-to').value || null,
  };
  try {
    const series = await API.createClassSeries(data);
    state.classForm.allSeries.push(series);
    renderClassFormSeriesOptions(series.id);
    autoFillFromSeries();
    document.getElementById('cf-new-series-form').classList.add('hidden');
    // Clear the inline form so a second open starts fresh.
    document.getElementById('cf-new-series-name').value = '';
    document.getElementById('cf-new-series-organizer').value = '';
    document.getElementById('cf-new-series-instrument').value = '';
    document.getElementById('cf-new-series-date-from').value = '';
    document.getElementById('cf-new-series-date-to').value = '';
  } catch (err) {
    showError('Could not create series: ' + err.message);
  }
}

// ===== SERIES DETAIL & FORM =====

async function goToSeriesDetail(seriesId) {
  showView('series-detail');
  document.getElementById('header-title').textContent = 'Series Detail';
  try {
    const series = await API.getClassSeriesById(seriesId);
    renderSeriesDetail(series);
  } catch (e) {
    showError('Could not load series: ' + e.message);
  }
}

function renderSeriesDetail(series) {
  const container = document.getElementById('series-detail-content');
  const fields = [];
  if (series.organizer) fields.push(['Organizer', esc(series.organizer)]);
  if (series.instrument) fields.push(['Instrument', esc(series.instrument)]);
  const dateRange = [series.date_from, series.date_to].filter(Boolean).map(formatDate).join(' – ');
  if (dateRange) fields.push(['Dates', esc(dateRange)]);
  if (series.notes) fields.push(['Notes', esc(series.notes)]);

  let html = `
    <div class="detail-header">
      <div class="detail-title-row">
        <div class="detail-title">${esc(series.name)}</div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary btn-small" id="btn-add-class-to-series">+ Add Class</button>
        <button class="btn btn-outline btn-small" id="btn-edit-series">Edit</button>
        <button class="btn btn-danger btn-small" id="btn-delete-series">Delete</button>
      </div>
    </div>`;

  if (fields.length > 0) {
    html += `<div class="detail-card"><div class="detail-card-title">Details</div>`;
    fields.forEach(([label, value]) => {
      html += `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${value}</span></div>`;
    });
    html += `</div>`;
  }

  html += `<div class="detail-card"><div class="detail-card-title">Classes in this series</div>`;
  if (!series.classes || series.classes.length === 0) {
    html += `<div class="hint">No classes in this series yet.</div>`;
  } else {
    series.classes.forEach(c => {
      const meta = formatDate(c.date);
      html += `<div class="detail-field"><span class="detail-field-value tune-in-set-link" data-class-id="${c.id}">${esc(c.name)}${meta ? ` <span class="hint">— ${esc(meta)}</span>` : ''} &#8599;</span></div>`;
    });
  }
  html += `</div>`;

  container.innerHTML = html;
  container.querySelectorAll('[data-class-id]').forEach(link => {
    link.addEventListener('click', () => goToClassDetail(Number(link.dataset.classId)));
  });
  document.getElementById('btn-add-class-to-series').addEventListener('click', () =>
    goToClassForm(null, { preSeriesId: series.id }));
  document.getElementById('btn-edit-series').addEventListener('click', () => goToSeriesForm(series));
  document.getElementById('btn-delete-series').addEventListener('click', () => deleteSeriesFromDetail(series));
}

async function deleteSeriesFromDetail(series) {
  // Series deletion sets each child class's series_id to NULL, leaving the
  // classes themselves intact (per the schema's ON DELETE SET NULL).
  const childCount = (series.classes || []).length;
  const msg = childCount > 0
    ? `Delete "${series.name}"? Its ${childCount} class${childCount === 1 ? '' : 'es'} will be kept but unlinked from the series.`
    : `Delete "${series.name}"?`;
  if (!confirm(msg)) return;
  try {
    await API.deleteClassSeries(series.id);
    await goToClasses();
  } catch (e) {
    showError('Could not delete series: ' + e.message);
  }
}

function goToSeriesForm(series = null) {
  state.editingSeries = series;
  showView('series-form');
  document.getElementById('header-title').textContent = series ? 'Edit Series' : 'New Series';
  document.getElementById('series-form-title').textContent = series ? 'Edit Series' : 'New Series';

  // Populate instrument dropdown.
  const instrOptions = '<option value="">— No instrument —</option>' +
    INSTRUMENTS.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  document.getElementById('sf-instrument').innerHTML = instrOptions;

  const form = document.getElementById('series-form');
  form.elements['name'].value = series ? series.name : '';
  form.elements['organizer'].value = series ? (series.organizer || '') : '';
  form.elements['instrument'].value = series ? (series.instrument || '') : '';
  form.elements['date_from'].value = series && series.date_from ? formatDate(series.date_from) : '';
  form.elements['date_to'].value = series && series.date_to ? formatDate(series.date_to) : '';
  form.elements['notes'].value = series ? (series.notes || '') : '';
}

async function saveSeriesForm(e) {
  e.preventDefault();
  const form = document.getElementById('series-form');
  const name = form.elements['name'].value.trim();
  if (!name) { showError('Series name is required.'); return; }
  const data = {
    name,
    organizer: form.elements['organizer'].value.trim() || null,
    instrument: form.elements['instrument'].value || null,
    date_from: form.elements['date_from'].value || null,
    date_to: form.elements['date_to'].value || null,
    notes: form.elements['notes'].value.trim() || null,
  };
  try {
    let series;
    if (state.editingSeries) {
      series = await API.updateClassSeries(state.editingSeries.id, data);
    } else {
      series = await API.createClassSeries(data);
    }
    await goToSeriesDetail(series.id);
  } catch (err) {
    showError('Could not save series: ' + err.message);
  }
}

// ===== MUSICIANS LIST =====

async function goToMusicians() {
  state.backStack = ['musicians'];
  showView('musicians', false);
  document.getElementById('header-title').textContent = 'Musicians';
  try {
    const musicians = await API.getMusicians();
    renderMusiciansList(musicians);
  } catch (e) {
    showError('Could not load musicians: ' + e.message);
  }
}

function renderMusiciansList(musicians) {
  const container = document.getElementById('musician-list');
  if (!musicians.length) {
    container.innerHTML = '<div class="empty-list"><p>No musicians yet.</p><p class="hint">Link a musician from a tune or class detail page.</p></div>';
    return;
  }
  container.innerHTML = musicians.map(m => `
    <div class="musician-list-item" data-musician-id="${m.id}">
      <span class="musician-list-item-name">${esc(m.name)}</span>
      ${m.is_session_player ? `<span class="status-badge status-memorized" style="font-size:0.72rem;padding:2px 7px;">Session</span>` : ''}
    </div>
  `).join('');
  container.querySelectorAll('.musician-list-item').forEach(el => {
    el.addEventListener('click', () => goToMusicianDetail(Number(el.dataset.musicianId)));
  });
}

// ===== MUSICIAN DETAIL & FORM =====

async function goToMusicianDetail(musicianId) {
  showView('musician-detail');
  document.getElementById('header-title').textContent = 'Musician';
  try {
    const musician = await API.getMusician(musicianId);
    renderMusicianDetail(musician);
  } catch (e) {
    showError('Could not load musician: ' + e.message);
  }
}

function renderMusicianDetail(musician) {
  const container = document.getElementById('musician-detail-content');
  const fields = [];
  if (musician.instruments) fields.push(['Instruments', esc(musician.instruments)]);
  if (musician.website) {
    fields.push(['Website', `<a href="${esc(musician.website)}" target="_blank" rel="noopener">${esc(musician.website)} &#8599;</a>`]);
  }
  if (musician.notes) fields.push(['Notes', esc(musician.notes)]);

  let html = `
    <div class="detail-header">
      <div class="detail-title-row">
        <div class="detail-title">${esc(musician.name)}</div>
        ${musician.is_session_player ? `<span class="status-badge status-memorized" style="font-size:0.75rem;padding:3px 8px;margin-left:8px;">Session player</span>` : ''}
      </div>
      <div class="detail-actions">
        <button class="btn btn-outline btn-small" id="btn-edit-musician">Edit</button>
        <button class="btn btn-danger btn-small" id="btn-delete-musician">Delete</button>
      </div>
    </div>`;

  if (fields.length > 0) {
    html += `<div class="detail-card"><div class="detail-card-title">Details</div>`;
    fields.forEach(([label, value]) => {
      html += `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${value}</span></div>`;
    });
    html += `</div>`;
  }

  html += `<div class="detail-card"><div class="detail-card-title">Classes taught</div>`;
  if (!musician.classes || musician.classes.length === 0) {
    html += `<div class="hint">No classes recorded yet.</div>`;
  } else {
    musician.classes.forEach(c => {
      const meta = formatDate(c.date);
      html += `<div class="detail-field"><span class="detail-field-value tune-in-set-link" data-class-id="${c.id}">${esc(c.name)}${meta ? ` <span class="hint">— ${esc(meta)}</span>` : ''} &#8599;</span></div>`;
    });
  }
  html += `</div>`;

  html += `<div class="detail-card"><div class="detail-card-title">Tunes learned from</div>`;
  if (!musician.tunes_learned_from || musician.tunes_learned_from.length === 0) {
    html += `<div class="hint">No tunes linked yet.</div>`;
  } else {
    musician.tunes_learned_from.forEach(t => {
      const meta = t.type || '';
      html += `<div class="detail-field"><span class="detail-field-value tune-in-set-link" data-tune-id="${t.id}">${esc(t.name)}${meta ? ` <span class="hint">— ${esc(meta)}</span>` : ''} &#8599;</span></div>`;
    });
  }
  html += `</div>`;

  container.innerHTML = html;
  container.querySelectorAll('[data-class-id]').forEach(link => {
    link.addEventListener('click', () => goToClassDetail(Number(link.dataset.classId)));
  });
  container.querySelectorAll('[data-tune-id]').forEach(link => {
    link.addEventListener('click', () => goToTuneDetail(Number(link.dataset.tuneId)));
  });
  document.getElementById('btn-edit-musician').addEventListener('click', () => goToMusicianForm(musician));
  document.getElementById('btn-delete-musician').addEventListener('click', () => deleteMusicianFromDetail(musician));
}

async function deleteMusicianFromDetail(musician) {
  const childCount = (musician.classes || []).length;
  const msg = childCount > 0
    ? `Delete "${musician.name}"? They'll be removed as instructor from ${childCount} class${childCount === 1 ? '' : 'es'} (the classes themselves stay).`
    : `Delete "${musician.name}"?`;
  if (!confirm(msg)) return;
  try {
    await API.deleteMusician(musician.id);
    await goToClasses();
  } catch (e) {
    showError('Could not delete musician: ' + e.message);
  }
}

function goToMusicianForm(musician = null) {
  state.editingMusician = musician;
  showView('musician-form');
  document.getElementById('header-title').textContent = musician ? 'Edit Musician' : 'New Musician';
  document.getElementById('musician-form-title').textContent = musician ? 'Edit Musician' : 'New Musician';

  // Populate instruments checkbox grid (same vocab as tunes).
  const grid = document.getElementById('mf-instruments');
  grid.innerHTML = INSTRUMENTS.map(i =>
    `<label class="checkbox-item"><input type="checkbox" value="${esc(i)}" /> ${esc(i)}</label>`
  ).join('');

  const form = document.getElementById('musician-form');
  form.elements['name'].value = musician ? musician.name : '';
  form.elements['website'].value = musician ? (musician.website || '') : '';
  form.elements['notes'].value = musician ? (musician.notes || '') : '';
  document.getElementById('mf-session-player').checked = !!(musician && musician.is_session_player);

  const saved = new Set(((musician && musician.instruments) || '')
    .split(',').map(s => s.trim()).filter(Boolean));
  grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = saved.has(cb.value);
  });
}

async function saveMusicianForm(e) {
  e.preventDefault();
  const form = document.getElementById('musician-form');
  const name = form.elements['name'].value.trim();
  if (!name) { showError('Musician name is required.'); return; }
  const instruments = Array.from(
    document.querySelectorAll('#mf-instruments input:checked')
  ).map(cb => cb.value).join(', ');
  const data = {
    name,
    instruments: instruments || null,
    website: form.elements['website'].value.trim() || null,
    notes: form.elements['notes'].value.trim() || null,
    is_session_player: document.getElementById('mf-session-player').checked,
  };
  try {
    let musician;
    if (state.editingMusician) {
      musician = await API.updateMusician(state.editingMusician.id, data);
    } else {
      musician = await API.createMusician(data);
    }
    // Remove musician-form (and any preceding musician-detail) so Back from
    // the detail page returns to wherever the user came from, not the form.
    state.backStack = state.backStack.filter(v => v !== 'musician-form');
    if (state.backStack[state.backStack.length - 1] === 'musician-detail') {
      state.backStack.pop();
    }
    await goToMusicianDetail(musician.id);
  } catch (err) {
    showError('Could not save musician: ' + err.message);
  }
}

// ===== CSV IMPORT VIEW =====

function restoreTuneImportUndo() {
  const saved = localStorage.getItem('lastTuneImport');
  const undoSection = document.getElementById('import-undo-section');
  if (!saved) { undoSection.classList.add('hidden'); return; }
  const { createdIds, count } = JSON.parse(saved);
  undoSection.classList.remove('hidden');
  document.getElementById('btn-undo-import').onclick = async () => {
    if (!confirm(`Delete the ${count} tune${count !== 1 ? 's' : ''} that were imported?`)) return;
    undoSection.classList.add('hidden');
    const statusEl = document.getElementById('import-status');
    statusEl.textContent = 'Undoing…';
    statusEl.className = 'import-status';
    await Promise.allSettled(createdIds.map(id => API.deleteTune(id)));
    localStorage.removeItem('lastTuneImport');
    state.tunes = await API.getTunes();
    statusEl.textContent = `Import undone — ${count} tune${count !== 1 ? 's' : ''} deleted.`;
    statusEl.className = 'import-status';
    document.getElementById('btn-run-import').disabled = false;
  };
}

function restoreSetImportUndo() {
  const saved = localStorage.getItem('lastSetImport');
  const undoSection = document.getElementById('set-import-undo-section');
  if (!saved) { undoSection.classList.add('hidden'); return; }
  const { createdIds, count } = JSON.parse(saved);
  undoSection.classList.remove('hidden');
  document.getElementById('btn-undo-set-import').onclick = async () => {
    if (!confirm(`Delete the ${count} set${count !== 1 ? 's' : ''} that were imported?`)) return;
    undoSection.classList.add('hidden');
    const statusEl = document.getElementById('set-import-status');
    statusEl.textContent = 'Undoing…';
    statusEl.className = 'import-status';
    await Promise.allSettled(createdIds.map(id => API.deleteSet(id)));
    localStorage.removeItem('lastSetImport');
    statusEl.textContent = `Import undone — ${count} set${count !== 1 ? 's' : ''} deleted.`;
    statusEl.className = 'import-status';
    document.getElementById('btn-run-set-import').disabled = false;
  };
}

function goToSetImport() {
  showView('set-import');
  document.getElementById('header-title').textContent = 'Import Sets CSV';
  document.getElementById('set-import-status').textContent = '';
  document.getElementById('set-import-status').className = 'import-status';
  document.getElementById('btn-run-set-import').disabled = true;
  document.getElementById('set-csv-file-label').textContent = 'Tap to choose a CSV file';
  document.getElementById('set-csv-file-input').value = '';
  document.getElementById('set-import-error-section').classList.add('hidden');
  restoreSetImportUndo();
}

function restoreClassImportUndo() {
  const saved = localStorage.getItem('lastClassImport');
  const undoSection = document.getElementById('class-import-undo-section');
  if (!saved) { undoSection.classList.add('hidden'); return; }
  const { createdIds, count } = JSON.parse(saved);
  undoSection.classList.remove('hidden');
  document.getElementById('btn-undo-class-import').onclick = async () => {
    if (!confirm(`Delete the ${count} class${count !== 1 ? 'es' : ''} that were imported?`)) return;
    undoSection.classList.add('hidden');
    const statusEl = document.getElementById('class-import-status');
    statusEl.textContent = 'Undoing…';
    statusEl.className = 'import-status';
    await Promise.allSettled(createdIds.map(id => API.deleteClass(id)));
    localStorage.removeItem('lastClassImport');
    statusEl.textContent = `Import undone — ${count} class${count !== 1 ? 'es' : ''} deleted.`;
    statusEl.className = 'import-status';
    document.getElementById('btn-run-class-import').disabled = false;
  };
}

function goToClassImport() {
  showView('class-import');
  document.getElementById('header-title').textContent = 'Import Classes CSV';
  document.getElementById('class-import-status').textContent = '';
  document.getElementById('class-import-status').className = 'import-status';
  document.getElementById('btn-run-class-import').disabled = true;
  document.getElementById('class-csv-file-label').textContent = 'Tap to choose a CSV file';
  document.getElementById('class-csv-file-input').value = '';
  document.getElementById('class-import-error-section').classList.add('hidden');
  restoreClassImportUndo();
}

function downloadCsv(filename, headers, rows) {
  function escape(val) {
    const s = String(val == null ? '' : val);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSetImportErrors(errorRows) {
  const headers = ['Tune 1', 'Tune 2', 'Tune 3', 'Tune 4', 'Tune 5', 'Errors'];
  downloadCsv('set-import-errors.csv', headers,
    errorRows.map(r => headers.map(h => r[h] || ''))
  );
}

function exportTunesCsv() {
  // Phase 6: per-instrument columns replace the single Learned column.
  // Cell vocabulary: X = Memorized, L = Learning, "-" = tracked but Not
  // Learned, blank = not tracked. The "-" preserves tracking state through
  // export/import round-trips (a blank cell means the instrument isn't
  // tracked for that tune).
  const perInstrumentHeaders = INSTRUMENTS.map(i => `Learned (${i})`);
  const headers = [
    'Name', 'Alternate Titles', 'Type', 'Key', 'Parts', 'Incipit A', 'Incipit B', 'Incipit C',
    'Count', 'Added', 'Where', 'Who', 'Mnemonic', 'Tunebooks', 'Date Learned',
    'Favorite', 'Thesession ID', 'Setting', 'Notes', 'Composer',
    'Last Practiced Date', 'Instrument', 'Sequence ID',
    ...perInstrumentHeaders,
  ];
  const statusToCell = { 'Memorized': 'X', 'Learning': 'L', 'Not Learned': '-' };
  const rows = state.tunes.map(t => {
    const byInstrument = {};
    for (const r of t.instrument_statuses || []) byInstrument[r.instrument] = r.status;
    const instrumentList = (t.instrument_statuses || []).map(r => r.instrument).join(', ');
    return [
      t.name, t.alternate_titles, t.type, t.key, t.parts,
      t.incipit_a, t.incipit_b, t.incipit_c,
      t.count, t.added_date, t.where_learned, t.who,
      t.mnemonic, t.tunebooks, t.date_learned,
      t.favorite ? 'X' : '',
      t.thesession_id, t.setting, t.notes, t.composer,
      t.last_practiced_date, instrumentList, t.sequence_id,
      ...INSTRUMENTS.map(i => statusToCell[byInstrument[i]] || ''),
    ];
  });
  downloadCsv('tunes.csv', headers, rows);
}

async function exportSetsCsv() {
  let sets;
  try {
    sets = await API.getSets();
  } catch (e) {
    showError('Could not load sets: ' + e.message);
    return;
  }
  const MAX_TUNES = 8;
  const headers = Array.from({ length: MAX_TUNES }, (_, i) => `Tune ${i + 1}`);
  const rows = sets.map(set => {
    return Array.from({ length: MAX_TUNES }, (_, i) => {
      const tune = set.tunes[i];
      if (!tune || !tune.thesession_id) return '';
      return tune.setting ? `${tune.thesession_id}#setting${tune.setting}` : tune.thesession_id;
    });
  });
  downloadCsv('sets.csv', headers, rows);
}

function downloadTuneImportErrors(errorRows, classAttachRows) {
  // Merge skipped dups and class-attach notes into one downloadable CSV.
  // "Errors" column = dup reason; "Notes" column = class-attach description.
  const headers = ['Name', 'Type', 'Key', 'Thesession ID', 'Errors', 'Notes'];
  const all = [...(errorRows || []), ...(classAttachRows || [])];
  const rows = all.map(r => [r.Name, r.Type, r.Key, r['Thesession ID'], r.Errors || '', r.Notes || '']);
  downloadCsv('tune-import-errors.csv', headers, rows);
}

function checkTuneDuplicates() {
  const byName = {};
  const bySid = {};

  for (const tune of state.tunes) {
    const name = (tune.name || '').toLowerCase().trim();
    const sid = (tune.thesession_id || '').trim();
    if (name) {
      if (!byName[name]) byName[name] = [];
      byName[name].push(tune);
    }
    if (sid) {
      if (!bySid[sid]) bySid[sid] = [];
      bySid[sid].push(tune);
    }
  }

  const groups = [];
  const seen = new Set();

  for (const [, tunes] of Object.entries(byName)) {
    if (tunes.length < 2) continue;
    // A name match alone isn't enough to flag a duplicate — different tunes
    // sometimes share a name (e.g. "Last Night's Fun" exists as both a Reel
    // and a Slip Jig with different Thesession IDs). Skip the group if the
    // tunes disagree on type or on a non-empty Thesession ID.
    const types = new Set(tunes.map(t => (t.type || '').trim()).filter(Boolean));
    const sids = new Set(tunes.map(t => (t.thesession_id || '').trim()).filter(Boolean));
    if (types.size > 1) continue;
    if (sids.size > 1) continue;
    const sig = 'n:' + tunes.map(t => t.id).sort().join(',');
    if (!seen.has(sig)) {
      seen.add(sig);
      groups.push({ reason: `Same name: "${tunes[0].name}"`, tunes });
    }
  }
  for (const [sid, tunes] of Object.entries(bySid)) {
    if (tunes.length > 1) {
      const sig = 's:' + tunes.map(t => t.id).sort().join(',');
      if (!seen.has(sig)) {
        seen.add(sig);
        groups.push({ reason: `Same Thesession ID: ${sid}`, tunes });
      }
    }
  }

  state.duplicateGroups = groups;
  const resultsEl = document.getElementById('duplicate-check-results');

  if (groups.length === 0) {
    resultsEl.innerHTML = '<p class="hint">No duplicates found.</p>';
    resultsEl.classList.remove('hidden');
    return;
  }

  let html = `<p class="hint">${groups.length} duplicate group${groups.length !== 1 ? 's' : ''} found. Select which tune to keep, then merge.</p>`;
  groups.forEach((g, gIdx) => {
    html += `<div class="duplicate-group">`;
    html += `<div class="duplicate-reason">${esc(g.reason)}</div>`;
    g.tunes.forEach((t, tIdx) => {
      const meta = [t.type, t.key, bestStatusInfo(t).status, `count: ${t.count || 0}`].filter(Boolean).join(' · ');
      html += `<label class="duplicate-tune-radio">
        <input type="radio" name="keep-${gIdx}" value="${t.id}"${tIdx === 0 ? ' checked' : ''}>
        <span class="duplicate-tune-radio-text">${esc(t.name)}${meta ? ' — ' + esc(meta) : ''}</span>
        <span class="duplicate-tune-link" data-id="${t.id}" title="View tune">&#8599;</span>
      </label>`;
    });
    html += `<div class="duplicate-merge-actions">
      <button class="btn btn-primary btn-merge-group" data-group="${gIdx}">Merge</button>
      <span class="hint">Merged tune gets the sum of counts and highest learning status.</span>
    </div>`;
    html += `</div>`;
  });
  resultsEl.innerHTML = html;

  resultsEl.querySelectorAll('.duplicate-tune-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      goToTuneDetail(Number(el.dataset.id));
    });
  });

  resultsEl.querySelectorAll('.btn-merge-group').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gIdx = Number(btn.dataset.group);
      const g = state.duplicateGroups[gIdx];
      const radio = resultsEl.querySelector(`input[name="keep-${gIdx}"]:checked`);
      const primaryId = Number(radio.value);
      const mergeIds = g.tunes.map(t => t.id).filter(id => id !== primaryId);
      const primaryName = g.tunes.find(t => t.id === primaryId)?.name || '';

      if (!confirm(`Merge ${g.tunes.length} tunes into "${primaryName}"?\n\nThe other tune(s) will be deleted. This cannot be undone.`)) return;

      btn.disabled = true;
      btn.textContent = 'Merging…';
      try {
        await API.mergeTune(primaryId, mergeIds);
        state.tunes = await API.getTunes();
        checkTuneDuplicates();
      } catch (err) {
        showError('Merge failed: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Merge';
      }
    });
  });

  resultsEl.classList.remove('hidden');
}

function goToImport() {
  showView('import');
  document.getElementById('header-title').textContent = 'Import CSV';
  document.getElementById('import-status').textContent = '';
  document.getElementById('import-status').className = 'import-status';
  document.getElementById('btn-run-import').disabled = true;
  document.getElementById('csv-file-label').textContent = 'Tap to choose a CSV file';
  document.getElementById('csv-file-input').value = '';
  restoreTuneImportUndo();
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

// ===== FILTER CLASS PICKER (shared by tune-filter and set-filter modals) =====
//
// Working IDs are kept on state.filterDraftClassIds keyed by prefix so the
// modal can collect changes before Apply commits them to state.tuneFilter /
// state.setFilter. Class metadata comes from state.filterClasses, refreshed
// each time a filter modal opens (covers the case where the user just added
// a class from the Classes tab).

function renderFilterClassChips(prefix) {
  const container = document.getElementById(`${prefix}-class-chips`);
  if (!container) return;
  const ids = state.filterDraftClassIds[prefix] || [];
  if (ids.length === 0) {
    container.innerHTML = '';
    return;
  }
  const byId = new Map((state.filterClasses || []).map(c => [c.id, c]));
  container.innerHTML = ids.map(id => {
    const c = byId.get(id);
    const name = c ? c.name : `#${id}`;
    return `<span class="chip removable" data-id="${id}">${esc(name)}<button type="button" class="chip-remove" aria-label="Remove">&times;</button></span>`;
  }).join('');
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.closest('.chip').dataset.id);
      state.filterDraftClassIds[prefix] = (state.filterDraftClassIds[prefix] || []).filter(x => x !== id);
      renderFilterClassChips(prefix);
    });
  });
}

function renderFilterClassSuggestions(prefix, query) {
  const list = document.getElementById(`${prefix}-class-suggestions`);
  const q = (query || '').trim().toLowerCase();
  if (!q) { list.classList.add('hidden'); return; }
  const all = state.filterClasses || [];
  const taken = new Set(state.filterDraftClassIds[prefix] || []);
  const matches = all.filter(c => {
    if (taken.has(c.id)) return false;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.series && c.series.name.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, 8);
  if (matches.length === 0) {
    list.innerHTML = `<div class="typeahead-item" style="cursor:default">No matching classes.</div>`;
  } else {
    list.innerHTML = matches.map(c => {
      const sub = c.series ? c.series.name : '';
      return `<div class="typeahead-item" data-id="${c.id}">${esc(c.name)}${sub ? ` <span class="hint">— ${esc(sub)}</span>` : ''}</div>`;
    }).join('');
  }
  list.classList.remove('hidden');
  list.querySelectorAll('[data-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.id);
      const draft = state.filterDraftClassIds[prefix] || [];
      if (!draft.includes(id)) draft.push(id);
      state.filterDraftClassIds[prefix] = draft;
      document.getElementById(`${prefix}-class-input`).value = '';
      list.classList.add('hidden');
      renderFilterClassChips(prefix);
    });
  });
}

async function ensureFilterClassesLoaded() {
  try {
    state.filterClasses = await API.getClasses();
  } catch (e) {
    state.filterClasses = state.filterClasses || [];
  }
}

async function ensureFilterMusiciansLoaded() {
  try {
    state.filterMusicians = await API.getMusicians();
  } catch (e) {
    state.filterMusicians = state.filterMusicians || [];
  }
}

function renderFilterWhoSuggestions(query) {
  const list = document.getElementById('ff-who-suggestions');
  const q = (query || '').trim().toLowerCase();
  if (!q) { list.classList.add('hidden'); return; }
  const matches = (state.filterMusicians || [])
    .filter(m => m.name.toLowerCase().includes(q))
    .slice(0, 8);
  if (matches.length === 0) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map(m =>
    `<div class="typeahead-item" data-name="${esc(m.name)}">${esc(m.name)}</div>`
  ).join('');
  list.classList.remove('hidden');
  list.querySelectorAll('.typeahead-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('ff-who').value = item.dataset.name;
      list.classList.add('hidden');
    });
  });
}

// ===== TUNE FILTER MODAL =====

async function openTuneFilter() {
  const f = state.tuneFilter;
  document.getElementById('ff-fav-only').checked = f.favoriteOnly;
  document.querySelectorAll('.ff-status').forEach(cb => { cb.checked = f.statuses.includes(cb.value); });
  document.querySelectorAll('.ff-type').forEach(cb => { cb.checked = f.types.includes(cb.value); });
  document.getElementById('ff-key').value = f.key;
  document.querySelectorAll('.ff-instrument').forEach(cb => { cb.checked = f.instruments.includes(cb.value); });
  document.getElementById('ff-where').value = f.where;
  document.getElementById('ff-who').value = f.who;
  document.getElementById('ff-who-suggestions').classList.add('hidden');
  document.getElementById('ff-days').value = f.practicedDays != null ? f.practicedDays : '';
  document.getElementById('ff-min-tunebooks').value = f.minTunebooks != null ? f.minTunebooks : '';
  document.getElementById('ff-class-input').value = '';
  document.getElementById('ff-class-suggestions').classList.add('hidden');
  state.filterDraftClassIds.ff = [...f.classIds];
  document.getElementById('modal-tune-filter').classList.remove('hidden');
  await Promise.all([ensureFilterClassesLoaded(), ensureFilterMusiciansLoaded()]);
  renderFilterClassChips('ff');
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
    classIds: [...(state.filterDraftClassIds.ff || [])],
    minTunebooks: document.getElementById('ff-min-tunebooks').value ? Number(document.getElementById('ff-min-tunebooks').value) : null,
  };
  closeTuneFilter();
  renderTuneList(state.tunes, state.tuneSearch);
}

function clearTuneFilter() {
  state.tuneFilter = { favoriteOnly: false, statuses: [], types: [], key: '', instruments: [], where: '', who: '', practicedDays: null, classIds: [], minTunebooks: null };
  state.filterDraftClassIds.ff = [];
  closeTuneFilter();
  renderTuneList(state.tunes, state.tuneSearch);
}

// ===== SET FILTER MODAL =====

async function openSetFilter() {
  const f = state.setFilter;
  document.getElementById('sf-fav-only').checked = f.favoriteOnly;
  document.querySelectorAll('.sf-type').forEach(cb => { cb.checked = f.types.includes(cb.value); });
  document.getElementById('sf-key').value = f.key || '';
  document.getElementById('sf-days').value = f.practicedDays != null ? f.practicedDays : '';
  document.getElementById('sf-class-input').value = '';
  document.getElementById('sf-class-suggestions').classList.add('hidden');
  state.filterDraftClassIds.sf = [...f.classIds];
  document.getElementById('modal-set-filter').classList.remove('hidden');
  await ensureFilterClassesLoaded();
  renderFilterClassChips('sf');
}

function closeSetFilter() {
  document.getElementById('modal-set-filter').classList.add('hidden');
}

async function applySetFilterFromModal() {
  state.setFilter = {
    favoriteOnly: document.getElementById('sf-fav-only').checked,
    types: Array.from(document.querySelectorAll('.sf-type:checked')).map(cb => cb.value),
    key: document.getElementById('sf-key').value.trim(),
    practicedDays: document.getElementById('sf-days').value ? Number(document.getElementById('sf-days').value) : null,
    classIds: [...(state.filterDraftClassIds.sf || [])],
  };
  closeSetFilter();
  state.sets = await API.getSets();
  renderSetList(state.sets, state.setSearch);
}

async function clearSetFilter() {
  state.setFilter = { favoriteOnly: false, types: [], key: '', practicedDays: null, classIds: [] };
  state.filterDraftClassIds.sf = [];
  closeSetFilter();
  state.sets = await API.getSets();
  renderSetList(state.sets, state.setSearch);
}

// ===== CLASS FILTER MODAL =====

function renderClassFilterSeriesChips() {
  const ids = state.filterDraftClassSeriesIds;
  const container = document.getElementById('clf-series-chips');
  if (!ids.length) { container.innerHTML = ''; return; }
  container.innerHTML = ids.map(id => {
    const s = (state.allSeries || []).find(x => x.id === id);
    const label = s ? s.name : `Series ${id}`;
    return `<span class="instructor-chip">${esc(label)}<button class="chip-remove" data-series-id="${id}">&times;</button></span>`;
  }).join('');
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.seriesId);
      state.filterDraftClassSeriesIds = state.filterDraftClassSeriesIds.filter(x => x !== id);
      renderClassFilterSeriesChips();
    });
  });
}

function renderClassFilterSeriesSuggestions(query) {
  const box = document.getElementById('clf-series-suggestions');
  const taken = new Set(state.filterDraftClassSeriesIds);
  const matches = (state.allSeries || [])
    .filter(s => !taken.has(s.id) && s.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);
  if (!matches.length) { box.classList.add('hidden'); return; }
  box.innerHTML = matches.map(s =>
    `<div class="typeahead-item" data-series-id="${s.id}">${esc(s.name)}</div>`
  ).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.typeahead-item').forEach(item => {
    item.addEventListener('click', () => {
      state.filterDraftClassSeriesIds.push(Number(item.dataset.seriesId));
      document.getElementById('clf-series-input').value = '';
      box.classList.add('hidden');
      renderClassFilterSeriesChips();
    });
  });
}

function openClassFilter() {
  const f = state.classFilter;
  state.filterDraftClassSeriesIds = [...f.seriesIds];
  document.getElementById('clf-series-input').value = '';
  document.getElementById('clf-series-suggestions').classList.add('hidden');
  document.getElementById('clf-instrument').value = f.instrument;
  document.getElementById('clf-organizer').value = f.organizer;
  document.getElementById('clf-instructor').value = f.instructor;
  document.getElementById('clf-date-from').value = f.dateFrom;
  document.getElementById('clf-date-to').value = f.dateTo;
  renderClassFilterSeriesChips();
  document.getElementById('modal-class-filter').classList.remove('hidden');
}

function closeClassFilter() {
  document.getElementById('modal-class-filter').classList.add('hidden');
}

function applyClassFilterFromModal() {
  state.classFilter = {
    seriesIds: [...state.filterDraftClassSeriesIds],
    instrument: document.getElementById('clf-instrument').value.trim(),
    organizer: document.getElementById('clf-organizer').value.trim(),
    instructor: document.getElementById('clf-instructor').value.trim(),
    dateFrom: document.getElementById('clf-date-from').value,
    dateTo: document.getElementById('clf-date-to').value,
  };
  closeClassFilter();
  renderClassesList(state.classes, state.allSeries, state.classSearch);
}

function clearClassFilter() {
  state.classFilter = { seriesIds: [], instrument: '', organizer: '', instructor: '', dateFrom: '', dateTo: '' };
  state.filterDraftClassSeriesIds = [];
  closeClassFilter();
  renderClassesList(state.classes, state.allSeries, state.classSearch);
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

  // Hamburger menu
  const hamburgerMenu = document.getElementById('hamburger-menu');
  function openHamburgerMenu() {
    hamburgerMenu.classList.remove('hidden');
    // Trigger animation on next frame
    requestAnimationFrame(() => hamburgerMenu.classList.add('open'));
  }
  function closeHamburgerMenu() {
    hamburgerMenu.classList.remove('open');
    hamburgerMenu.addEventListener('transitionend', () => hamburgerMenu.classList.add('hidden'), { once: true });
  }
  document.getElementById('hamburger-btn').addEventListener('click', openHamburgerMenu);
  document.getElementById('hamburger-close-btn').addEventListener('click', closeHamburgerMenu);
  hamburgerMenu.querySelector('.hamburger-backdrop').addEventListener('click', closeHamburgerMenu);
  hamburgerMenu.querySelectorAll('.hamburger-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeHamburgerMenu();
      const dest = btn.dataset.goto;
      if (dest === 'tunes') goToTunes();
      else if (dest === 'sets') goToSets();
      else if (dest === 'classes') goToClasses();
      else if (dest === 'musicians') goToMusicians();
    });
  });

  // Bottom nav
  document.getElementById('nav-tunes').addEventListener('click', goToTunes);
  document.getElementById('nav-sets').addEventListener('click', goToSets);
  document.getElementById('nav-classes').addEventListener('click', goToClasses);

  // Class filter
  document.getElementById('btn-class-filter').addEventListener('click', openClassFilter);
  document.getElementById('modal-class-filter').querySelector('.modal-backdrop').addEventListener('click', closeClassFilter);
  document.getElementById('btn-apply-class-filter').addEventListener('click', applyClassFilterFromModal);
  document.getElementById('btn-clear-class-filter').addEventListener('click', clearClassFilter);
  document.getElementById('clf-series-input').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (q) renderClassFilterSeriesSuggestions(q);
    else document.getElementById('clf-series-suggestions').classList.add('hidden');
  });

  // Classes feature: export, import, + New Class, form submit, cancel, inline series quick-create.
  document.getElementById('btn-export-classes').addEventListener('click', () => {
    window.location.href = API.exportClassesCsvUrl();
  });

  document.getElementById('btn-import-classes').addEventListener('click', goToClassImport);

  // Class CSV import
  const classCsvInput = document.getElementById('class-csv-file-input');
  const runClassImportBtn = document.getElementById('btn-run-class-import');

  classCsvInput.addEventListener('change', () => {
    if (classCsvInput.files[0]) {
      document.getElementById('class-csv-file-label').textContent = classCsvInput.files[0].name;
      runClassImportBtn.disabled = false;
    }
  });

  runClassImportBtn.addEventListener('click', async () => {
    const file = classCsvInput.files[0];
    if (!file) return;
    const statusEl = document.getElementById('class-import-status');
    runClassImportBtn.disabled = true;
    statusEl.textContent = 'Importing…';
    statusEl.className = 'import-status';
    document.getElementById('class-import-error-section').classList.add('hidden');
    document.getElementById('class-import-undo-section').classList.add('hidden');

    try {
      const result = await API.importClassesCsv(file);
      const n = result.imported;
      const s = result.skipped || 0;
      const t = result.tunesAttached || 0;
      const parts = [];
      if (n > 0) parts.push(`${n} class${n !== 1 ? 'es' : ''} imported`);
      if (t > 0) parts.push(`${t} tune${t !== 1 ? 's' : ''} added to existing classes`);
      if (s > 0) parts.push(`${s} skipped (already exist)`);
      if (parts.length === 0) parts.push('No classes imported');
      statusEl.textContent = parts.join(', ') + '.';
      const success = n > 0 || t > 0;
      statusEl.className = success ? 'import-status success' : 'import-status error';
      if (!success) runClassImportBtn.disabled = false;

      // Only show error download for genuine errors (not the "tune added" info rows).
      const trueErrors = (result.errorRows || []).filter(r => !/already exists —/.test(r.Error));
      if (trueErrors.length > 0) {
        document.getElementById('class-import-error-section').classList.remove('hidden');
        document.getElementById('btn-download-class-errors').onclick = () => {
          downloadCsv('class-import-errors.csv',
            ['Name', 'Series', 'Error'],
            trueErrors.map(r => [r.Name, r.Series || '', r.Error || '']));
        };
      }

      if (n > 0 && result.createdIds?.length > 0) {
        localStorage.setItem('lastClassImport', JSON.stringify({ createdIds: result.createdIds, count: n }));
        restoreClassImportUndo();
      }
    } catch (err) {
      statusEl.textContent = 'Import failed: ' + err.message;
      statusEl.className = 'import-status error';
      runClassImportBtn.disabled = false;
    }
  });

  document.getElementById('btn-add-class').addEventListener('click', () => goToClassForm(null));
  document.getElementById('class-form').addEventListener('submit', saveClassForm);
  document.getElementById('cf-cancel-btn').addEventListener('click', goBack);
  document.getElementById('cf-new-series-btn').addEventListener('click', () => {
    document.getElementById('cf-new-series-form').classList.toggle('hidden');
  });
  document.getElementById('cf-cancel-new-series-btn').addEventListener('click', () => {
    document.getElementById('cf-new-series-form').classList.add('hidden');
  });
  document.getElementById('cf-create-series-btn').addEventListener('click', createSeriesInline);
  document.getElementById('cf-series').addEventListener('change', autoFillFromSeries);
  document.getElementById('cf-instructor-input').addEventListener('input', (e) => {
    renderInstructorSuggestions(e.target.value);
  });
  // Pressing Enter on the instructor input picks the first suggestion (existing
  // match if any, else creates a new musician with the typed name).
  document.getElementById('cf-instructor-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('#cf-instructor-suggestions .typeahead-item');
      if (first) onInstructorSuggestionPicked(first);
    }
  });
  document.getElementById('cf-instructor-input').addEventListener('blur', () => {
    // Delay so a click on a suggestion can register before we hide.
    setTimeout(hideInstructorSuggestions, 150);
  });
  document.getElementById('cf-tune-search').addEventListener('input', (e) => {
    renderClassFormTuneList(e.target.value);
  });

  // Series and musician forms (Phase 2d).
  document.getElementById('series-form').addEventListener('submit', saveSeriesForm);
  document.getElementById('sf-cancel-btn').addEventListener('click', goBack);
  document.getElementById('musician-form').addEventListener('submit', saveMusicianForm);
  document.getElementById('mf-cancel-btn').addEventListener('click', goBack);

  // Tune list search
  document.getElementById('tune-search').addEventListener('input', e => {
    state.tuneSearch = e.target.value;
    renderTuneList(state.tunes, state.tuneSearch);
  });

  // Set list search
  document.getElementById('set-search').addEventListener('input', e => {
    state.setSearch = e.target.value;
    renderSetList(state.sets, state.setSearch);
  });

  // Class list search
  document.getElementById('class-search').addEventListener('input', e => {
    state.classSearch = e.target.value;
    renderClassesList(state.classes, state.allSeries, state.classSearch);
  });

  // Add tune / import / export
  document.getElementById('btn-add-tune').addEventListener('click', () => goToTuneForm(null));
  document.getElementById('btn-import').addEventListener('click', goToImport);
  document.getElementById('btn-export-tunes').addEventListener('click', exportTunesCsv);

  // Tune sort
  document.getElementById('tune-sort-select').addEventListener('change', e => {
    state.tuneSort = e.target.value;
    renderTuneList(state.tunes, state.tuneSearch);
  });

  // Tune filter
  document.getElementById('btn-tune-filter').addEventListener('click', openTuneFilter);
  document.getElementById('btn-apply-tune-filter').addEventListener('click', applyTuneFilterFromModal);
  document.getElementById('btn-clear-tune-filter').addEventListener('click', clearTuneFilter);
  document.getElementById('modal-tune-filter').querySelector('.modal-backdrop').addEventListener('click', closeTuneFilter);
  document.getElementById('ff-who').addEventListener('input', (e) => {
    renderFilterWhoSuggestions(e.target.value);
  });
  document.getElementById('ff-class-input').addEventListener('input', (e) => {
    renderFilterClassSuggestions('ff', e.target.value);
  });

  // Set filter
  document.getElementById('btn-set-filter').addEventListener('click', openSetFilter);
  document.getElementById('btn-apply-set-filter').addEventListener('click', applySetFilterFromModal);
  document.getElementById('btn-clear-set-filter').addEventListener('click', clearSetFilter);
  document.getElementById('modal-set-filter').querySelector('.modal-backdrop').addEventListener('click', closeSetFilter);
  document.getElementById('sf-class-input').addEventListener('input', (e) => {
    renderFilterClassSuggestions('sf', e.target.value);
  });

  // Tune form
  document.getElementById('tune-form').addEventListener('submit', saveTuneForm);
  document.getElementById('btn-cancel-tune-form').addEventListener('click', goBack);

  // Tune form classes typeahead.
  document.getElementById('f-class-input').addEventListener('input', (e) => {
    renderTuneFormClassSuggestions(e.target.value);
  });
  document.getElementById('f-class-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('#f-class-suggestions .typeahead-item[data-id]');
      if (first) first.click();
    }
  });
  document.getElementById('f-class-input').addEventListener('blur', () => {
    setTimeout(hideTuneFormClassSuggestions, 150);
  });

  // Tune form: "Learned from" musician typeahead.
  document.getElementById('f-who-input').addEventListener('input', (e) => {
    renderTuneFormWhoSuggestions(e.target.value);
  });
  document.getElementById('f-who-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('#f-who-suggestions .typeahead-item');
      if (first) onTuneFormWhoSuggestionPicked(first);
    }
  });
  document.getElementById('f-who-input').addEventListener('blur', () => {
    setTimeout(hideTuneFormWhoSuggestions, 150);
  });

  // Live ABC preview in tune form
  document.querySelectorAll('.abc-input').forEach(input => {
    input.addEventListener('input', handleIncipitInput);
  });

  // Sets list
  document.getElementById('btn-set-import').addEventListener('click', goToSetImport);
  document.getElementById('btn-export-sets').addEventListener('click', exportSetsCsv);
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
    document.getElementById('set-import-undo-section').classList.add('hidden');

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
      if (n > 0 && result.createdIds?.length > 0) {
        localStorage.setItem('lastSetImport', JSON.stringify({ createdIds: result.createdIds, count: n }));
        restoreSetImportUndo();
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
    document.getElementById('import-undo-section').classList.add('hidden');
    document.getElementById('import-error-section').classList.add('hidden');

    try {
      const result = await API.importCsv(file);
      const n = result.imported;
      const d = result.duplicates || 0;
      const k = result.classesAttached || 0;
      const parts = [];
      if (n > 0) parts.push(`${n} tune${n !== 1 ? 's' : ''} imported`);
      if (d > 0) parts.push(`${d} duplicate${d !== 1 ? 's' : ''} skipped`);
      if (k > 0) parts.push(`${k} class link${k !== 1 ? 's' : ''} added`);
      if (parts.length === 0) parts.push('No tunes imported');
      statusEl.textContent = parts.join(', ') + '.';
      statusEl.className = (n > 0 || k > 0) ? 'import-status success' : 'import-status error';
      if (n === 0 && d === 0 && k === 0) runImportBtn.disabled = false;
      state.tunes = await API.getTunes();
      if (n > 0 && result.createdIds?.length > 0) {
        localStorage.setItem('lastTuneImport', JSON.stringify({ createdIds: result.createdIds, count: n }));
        restoreTuneImportUndo();
      }
      const hasDownload = (result.errorRows?.length > 0) || (result.classAttachRows?.length > 0);
      if (hasDownload) {
        document.getElementById('import-error-section').classList.remove('hidden');
        document.getElementById('btn-download-tune-errors').onclick = () =>
          downloadTuneImportErrors(result.errorRows, result.classAttachRows);
      }
    } catch (e) {
      statusEl.textContent = 'Import failed: ' + e.message;
      statusEl.className = 'import-status error';
      runImportBtn.disabled = false;
    }
  });

  document.getElementById('btn-check-duplicates').addEventListener('click', async () => {
    if (state.tunes.length === 0) state.tunes = await API.getTunes();
    checkTuneDuplicates();
  });

  // Bulk image import (tarball)
  const imageTarballInput = document.getElementById('image-tarball-input');
  const imageTarballZone = document.getElementById('image-tarball-drop-zone');
  const imageTarballLabel = document.getElementById('image-tarball-file-label');
  const btnRunImageImport = document.getElementById('btn-run-image-import');
  const imageImportStatus = document.getElementById('image-import-status');

  imageTarballInput.addEventListener('change', () => {
    const f = imageTarballInput.files[0];
    imageTarballLabel.textContent = f ? f.name : 'Tap to choose a .tar or .tar.gz file';
    btnRunImageImport.disabled = !f;
    imageImportStatus.textContent = '';
    imageImportStatus.className = 'import-status';
  });

  btnRunImageImport.addEventListener('click', async () => {
    const file = imageTarballInput.files[0];
    if (!file) return;
    btnRunImageImport.disabled = true;
    imageImportStatus.textContent = 'Importing…';
    imageImportStatus.className = 'import-status';
    try {
      const result = await API.importImages(file);
      const n = result.imported;
      const u = result.unmatched.length;
      imageImportStatus.textContent = '';
      imageImportStatus.className = n > 0 ? 'import-status success' : 'import-status error';
      imageImportStatus.appendChild(document.createTextNode(
        `${n} image${n !== 1 ? 's' : ''} imported.`
      ));
      if (u > 0) {
        const csvRows = [['filename', 'error'],
          ...result.unmatched.map(r => [r.filename, r.error])];
        const csvText = csvRows.map(row =>
          row.map(f => `"${f.replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        const url = URL.createObjectURL(new Blob([csvText], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'unmatched-images.csv';
        a.textContent = ` ${u} unmatched — download CSV`;
        a.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
        imageImportStatus.appendChild(a);
      }
      btnRunImageImport.disabled = false;
    } catch (err) {
      imageImportStatus.textContent = 'Import failed: ' + err.message;
      imageImportStatus.className = 'import-status error';
      btnRunImageImport.disabled = false;
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
