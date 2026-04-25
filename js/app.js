import { loadChampions, getChampion, getAbilities, loadMovesFor, loadTypeChart, spriteUrl, loadFormSpriteUrl, loadMoveIndex, getMoveNames, loadAbilityIndex, getAbilityNames, champBaseKey } from './data.js';

const app = document.getElementById('app');

const ALL_TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

const GEN_RANGES = [[1,151],[152,251],[252,386],[387,493],[494,649],[650,721],[722,809],[810,905],[906,Infinity]];

const TARGET_LABEL = {
  'selected-pokemon':'Single','selected-pokemon-me-first':'Single',
  'all-opponents':'All foes','random-opponent':'Random foe',
  'user':'Self','user-and-allies':'Self+allies','user-or-ally':'Self/ally',
  'all-allies':'All allies','ally':'Ally','all-other-pokemon':'All others',
  'all-pokemon':'All','entire-field':'Field','opponents-field':"Foes' side",
  'users-field':'Own side','fainting-pokemon':"KO'd",'specific-move':'—',
};

function targetLabel(t) { return TARGET_LABEL[t] || t || '—'; }

function typeDot(type) {
  const t = (type || '').toLowerCase();
  if (!t) return '';
  return `<span class="type-dot type-${t}" title="${t}"></span>`;
}
function typeBadge(type) {
  const t = (type || '').toLowerCase();
  if (!t) return '';
  return `<span class="type-badge type-${t}">${t}</span>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Combobox helper (multi-select) ----------
function setupCombo(key, inputId, listId, getNames, loadIndex, onChange) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const tagsEl = document.getElementById(inputId.replace('Input', 'Tags'));
  if (!input || !list) return;

  let loaded = false;
  let allNames = [];

  function renderTags() {
    if (!tagsEl) return;
    tagsEl.innerHTML = listState[key].map(v =>
      `<span class="combo-tag">${escapeHtml(v)}<button class="tag-remove" data-key="${escapeHtml(key)}" data-val="${escapeHtml(v)}" type="button">×</button></span>`
    ).join('');
  }

  function showList(names) {
    const avail = names.filter(n => !listState[key].includes(n));
    list.innerHTML = avail.slice(0, 150).map(n =>
      `<li data-value="${escapeHtml(n)}">${escapeHtml(n)}</li>`
    ).join('');
    list.hidden = avail.length === 0;
  }

  async function open() {
    if (!loaded) {
      list.innerHTML = '<li class="combo-loading">Loading…</li>';
      list.hidden = false;
      await loadIndex();
      allNames = getNames();
      loaded = true;
    }
    const q = input.value.trim().toLowerCase();
    showList(q ? allNames.filter(n => n.toLowerCase().includes(q)) : allNames);
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', async () => {
    if (!loaded) { await loadIndex(); allNames = getNames(); loaded = true; }
    const q = input.value.trim().toLowerCase();
    showList(q ? allNames.filter(n => n.toLowerCase().includes(q)) : allNames);
  });

  list.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-value]');
    if (!li) return;
    e.preventDefault();
    const val = li.dataset.value;
    if (!listState[key].includes(val)) {
      listState[key] = [...listState[key], val];
      renderTags();
      onChange(listState[key]);
    }
    input.value = '';
    showList(allNames.filter(n => !listState[key].includes(n)));
    input.focus();
  });

  if (tagsEl) {
    tagsEl.addEventListener('click', e => {
      const btn = e.target.closest('.tag-remove');
      if (!btn) return;
      const val = btn.dataset.val;
      listState[key] = listState[key].filter(v => v !== val);
      renderTags();
      onChange(listState[key]);
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest(`#${key}Combo`)) list.hidden = true;
  }, { capture: true });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { list.hidden = true; input.blur(); }
    if (e.key === 'Enter') {
      const first = list.querySelector('li[data-value]');
      if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
    if (e.key === 'Backspace' && input.value === '' && listState[key].length > 0) {
      listState[key] = listState[key].slice(0, -1);
      renderTags();
      onChange(listState[key]);
    }
  });

  renderTags();
}

// ---------- List view ----------
const STAT_FILTERS = [
  { key: 'hp',      label: 'HP' },
  { key: 'attack',  label: 'ATK' },
  { key: 'defense', label: 'DEF' },
  { key: 'spAtk',   label: 'Sp.ATK' },
  { key: 'spDef',   label: 'Sp.DEF' },
  { key: 'speed',   label: 'SPD' },
  { key: 'total',   label: 'BST' },
];

// Cached indexes for filter
let _moveIndex = null;
let _abilityIndex = null;

let listState = {
  query: '', type: '', gen: 0, mega: '',
  move: [], ability: [],
  sortCol: 'id', sortDir: 1,
  champions: [],
  stats: Object.fromEntries(STAT_FILTERS.map(s => [s.key, { min: '', max: '' }])),
};

const COLS = [
  { key: 'id',     label: '#',       get: c => c.id },
  { key: 'name',   label: 'Pokémon', get: c => c.name },
  { key: 'hp',     label: 'HP',      get: c => c.stats?.hp ?? 0 },
  { key: 'attack', label: 'ATK',     get: c => c.stats?.attack ?? 0 },
  { key: 'defense',label: 'DEF',     get: c => c.stats?.defense ?? 0 },
  { key: 'spAtk',  label: 'Sp.ATK',  get: c => c.stats?.spAtk ?? 0 },
  { key: 'spDef',  label: 'Sp.DEF',  get: c => c.stats?.spDef ?? 0 },
  { key: 'speed',  label: 'SPD',     get: c => c.stats?.speed ?? 0 },
  { key: 'total',  label: 'BST',     get: c => c.stats?.total ?? 0 },
];

async function renderList() {
  app.innerHTML = `<div class="loading">Loading champions…</div>`;
  const champions = await loadChampions();
  listState.champions = champions;

  app.innerHTML = `
    <div class="list-layout">
      <aside class="sidebar">
        <div class="sidebar-section">
          <input class="search" id="q" placeholder="Search Pokémon…" value="${escapeHtml(listState.query)}" />
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Type</div>
          <div class="type-filter-grid" id="typeFilters">
            <button class="type-btn ${!listState.type ? 'active' : ''}" data-type="">All</button>
            ${ALL_TYPES.map(t => `<button class="type-btn type-${t} ${listState.type === t ? 'active' : ''}" data-type="${t}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Generation</div>
          <div class="gen-grid" id="genBtns">
            <button class="gen-btn ${listState.gen === 0 ? 'active' : ''}" data-gen="0">All</button>
            ${GEN_RANGES.map((_, i) => `<button class="gen-btn ${listState.gen === i+1 ? 'active' : ''}" data-gen="${i+1}">${i+1}</button>`).join('')}
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Mega Evolution</div>
          <div class="mega-btns" id="megaBtns">
            <button class="mega-btn ${listState.mega === '' ? 'active' : ''}" data-mega="">All</button>
            <button class="mega-btn ${listState.mega === 'Yes' ? 'active' : ''}" data-mega="Yes">Yes</button>
            <button class="mega-btn ${listState.mega === 'No' ? 'active' : ''}" data-mega="No">No</button>
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Move</div>
          <div class="combobox" id="moveCombo">
            <div class="combo-tags" id="moveTags"></div>
            <div class="combo-wrap">
              <input class="search combo-input" id="moveInput" placeholder="Filter by move…" autocomplete="off" />
            </div>
            <ul class="combo-list" id="moveList" hidden></ul>
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Ability</div>
          <div class="combobox" id="abilityCombo">
            <div class="combo-tags" id="abilityTags"></div>
            <div class="combo-wrap">
              <input class="search combo-input" id="abilityInput" placeholder="Filter by ability…" autocomplete="off" />
            </div>
            <ul class="combo-list" id="abilityList" hidden></ul>
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Stat Filters</div>
          ${STAT_FILTERS.map(s => `
            <div class="stat-filter-row">
              <span class="stat-filter-lbl">${s.label}</span>
              <input class="stat-input" type="number" min="0" max="999" placeholder="Min"
                data-stat="${s.key}" data-bound="min" value="${listState.stats[s.key].min}" />
              <input class="stat-input" type="number" min="0" max="999" placeholder="Max"
                data-stat="${s.key}" data-bound="max" value="${listState.stats[s.key].max}" />
            </div>`).join('')}
          <button class="clear-stats-btn" id="clearStats">Clear</button>
        </div>
        <div class="sidebar-section">
          <div id="countLabel" class="count-label"></div>
        </div>
      </aside>
      <div class="table-wrap">
        <table class="poke-table" id="pokeTable">
          <thead>
            <tr>
              ${COLS.map(c => `<th data-col="${c.key}" class="${c.key === listState.sortCol ? (listState.sortDir > 0 ? 'sort-asc' : 'sort-desc') : ''}">${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody id="pokeBody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('q').addEventListener('input', e => { listState.query = e.target.value; paintTable(); });
  document.getElementById('typeFilters').addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    listState.type = btn.dataset.type;
    document.querySelectorAll('#typeFilters .type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === listState.type));
    paintTable();
  });
  document.getElementById('genBtns').addEventListener('click', e => {
    const btn = e.target.closest('.gen-btn');
    if (!btn) return;
    listState.gen = Number(btn.dataset.gen);
    document.querySelectorAll('#genBtns .gen-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.gen) === listState.gen));
    paintTable();
  });
  document.getElementById('megaBtns').addEventListener('click', e => {
    const btn = e.target.closest('.mega-btn');
    if (!btn) return;
    listState.mega = btn.dataset.mega;
    document.querySelectorAll('#megaBtns .mega-btn').forEach(b => b.classList.toggle('active', b.dataset.mega === listState.mega));
    paintTable();
  });
  // Combobox setup (multi-select)
  setupCombo('move', 'moveInput', 'moveList', getMoveNames,
    () => loadMoveIndex().then(idx => { _moveIndex = idx; }), () => paintTable());
  setupCombo('ability', 'abilityInput', 'abilityList', getAbilityNames,
    () => loadAbilityIndex().then(idx => { _abilityIndex = idx; }), () => paintTable());

  // Load ability index eagerly (small file); move index lazily on first open
  loadAbilityIndex().then(idx => { _abilityIndex = idx; });

  document.querySelector('.sidebar').addEventListener('input', e => {
    const inp = e.target.closest('.stat-input');
    if (!inp) return;
    listState.stats[inp.dataset.stat][inp.dataset.bound] = inp.value;
    paintTable();
  });
  document.getElementById('clearStats').addEventListener('click', () => {
    listState.stats = Object.fromEntries(STAT_FILTERS.map(s => [s.key, { min: '', max: '' }]));
    document.querySelectorAll('.stat-input').forEach(i => i.value = '');
    paintTable();
  });
  document.querySelector('#pokeTable thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    const col = th.dataset.col;
    if (listState.sortCol === col) listState.sortDir *= -1;
    else { listState.sortCol = col; listState.sortDir = col === 'name' ? 1 : -1; }
    document.querySelectorAll('#pokeTable th').forEach(t => t.className = '');
    th.className = listState.sortDir > 0 ? 'sort-asc' : 'sort-desc';
    paintTable();
  });

  paintTable();
}

function paintTable() {
  const q = listState.query.trim().toLowerCase();
  const [genMin, genMax] = listState.gen > 0 ? GEN_RANGES[listState.gen - 1] : [0, Infinity];

  let filtered = listState.champions.filter(c => {
    if (q && !c.name.toLowerCase().includes(q) && !String(c.id).includes(q)) return false;
    if (listState.type) {
      const t = listState.type;
      if (c.type1?.toLowerCase() !== t && c.type2?.toLowerCase() !== t) return false;
    }
    if (listState.gen > 0 && (c.id < genMin || c.id > genMax)) return false;
    if (listState.mega && c.is_mega !== listState.mega) return false;
    for (const { key } of STAT_FILTERS) {
      const f = listState.stats[key];
      const val = c.stats?.[key] ?? 0;
      if (f.min !== '' && val < Number(f.min)) return false;
      if (f.max !== '' && val > Number(f.max)) return false;
    }
    if (listState.move.length > 0 && _moveIndex) {
      const base = champBaseKey(c);
      if (!listState.move.every(mv => { const s = _moveIndex.get(mv); return s && s.has(base); })) return false;
    }
    if (listState.ability.length > 0 && _abilityIndex) {
      const base = champBaseKey(c);
      if (!listState.ability.every(ab => { const s = _abilityIndex.get(ab); return s && s.has(base); })) return false;
    }
    return true;
  });

  const col = COLS.find(c => c.key === listState.sortCol) || COLS[0];
  filtered.sort((a, b) => {
    const av = col.get(a), bv = col.get(b);
    return typeof av === 'string' ? av.localeCompare(bv) * listState.sortDir : (av - bv) * listState.sortDir;
  });

  document.getElementById('countLabel').textContent = `${filtered.length} Pokémon`;

  const body = document.getElementById('pokeBody');
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="${COLS.length}" class="empty">No Pokémon match your search.</td></tr>`;
    return;
  }

  const statColor = v => v >= 130 ? '#22c55e' : v >= 100 ? '#84cc16' : v >= 70 ? '#eab308' : v >= 50 ? '#f97316' : '#ef4444';

  body.innerHTML = filtered.map(c => {
    const s = c.stats || {};
    const numCell = (v) => v != null && v !== 0
      ? `<td class="stat-num" style="color:${statColor(v)}">${v}</td>`
      : `<td class="stat-num muted">—</td>`;
    return `
      <tr data-slug="${c.slug}">
        <td class="num-col">#${String(c.id).padStart(4,'0')}</td>
        <td class="name-col">
          <img class="row-sprite" loading="lazy" src="${spriteUrl(c.id)}" alt="" onerror="this.style.opacity=0" />
          <div class="name-info">
            <span class="row-name">${escapeHtml(c.name)}</span>
            <div class="row-types">${typeBadge(c.type1)}${typeBadge(c.type2)}</div>
          </div>
          ${c.is_mega === 'Yes' ? '<span class="mega-badge">M</span>' : ''}
        </td>
        ${numCell(s.hp)}
        ${numCell(s.attack)}
        ${numCell(s.defense)}
        ${numCell(s.spAtk)}
        ${numCell(s.spDef)}
        ${numCell(s.speed)}
        ${numCell(s.total)}
      </tr>
    `;
  }).join('');

  body.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) location.hash = `#/pokemon/${encodeURIComponent(tr.dataset.slug)}`;
  }, { once: true });
  // re-attach each paint
  body.onclick = e => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) location.hash = `#/pokemon/${encodeURIComponent(tr.dataset.slug)}`;
  };

  // Lazy-load correct form sprites for mega/regional pokemon
  const formChamps = filtered.filter(c => c.is_mega === 'Yes' || c.form);
  (async () => {
    for (let i = 0; i < formChamps.length; i += 10) {
      await Promise.all(formChamps.slice(i, i + 10).map(async c => {
        const url = await loadFormSpriteUrl(c);
        const img = body.querySelector(`tr[data-slug="${CSS.escape(c.slug)}"] .row-sprite`);
        if (img && url) img.src = url;
      }));
    }
  })();
}

// ---------- Detail view ----------
async function renderDetail(slug) {
  app.innerHTML = `<div class="loading">Loading…</div>`;
  const c = await getChampion(slug);
  if (!c) {
    app.innerHTML = `<div class="empty">Pokémon not found. <a href="#/">Back to list</a></div>`;
    return;
  }

  const types = [c.type1, c.type2].filter(Boolean).map(t => t.toLowerCase());
  const s = c.stats || {};
  const maxStat = 255;
  const statFill = v => Math.max(4, Math.round((v / maxStat) * 100));
  const statColor = v => v >= 120 ? '#22c55e' : v >= 90 ? '#84cc16' : v >= 60 ? '#eab308' : v >= 40 ? '#f97316' : '#ef4444';

  app.innerHTML = `
    <a href="#/" class="back">← Back to champions</a>
    <div class="detail">
      <div class="hero" style="--hero-tint: ${typeTint(types[0])}">
        <div class="hid">#${String(c.id).padStart(4,'0')}${c.is_mega === 'Yes' ? ' · MEGA' : (c.form ? ` · ${c.form}` : '')}</div>
        <div class="hname">${escapeHtml(c.name)}</div>
        <img class="hart" src="${spriteUrl(c.id)}" alt="${escapeHtml(c.name)}" onerror="this.style.opacity=0.3" />
        <div class="htypes">${typeBadge(c.type1)}${typeBadge(c.type2)}</div>
        <div class="meta-row">
          <span><strong>${c.height ?? '—'}</strong> m</span>
          <span><strong>${c.weight ?? '—'}</strong> kg</span>
          <span><strong>${s.total ?? '—'}</strong> BST</span>
        </div>
      </div>
      <div class="panel">
        <h3>Base Stats</h3>
        ${statRow('HP', s.hp, statFill, statColor)}
        ${statRow('Attack', s.attack, statFill, statColor)}
        ${statRow('Defense', s.defense, statFill, statColor)}
        ${statRow('Sp. Atk', s.spAtk, statFill, statColor)}
        ${statRow('Sp. Def', s.spDef, statFill, statColor)}
        ${statRow('Speed', s.speed, statFill, statColor)}
        ${statRow('Total', s.total, v => Math.round((v/800)*100), () => '#6366f1')}
      </div>
      <div class="panel" id="abilitiesPanel"><h3>Abilities</h3><div class="loading">Loading…</div></div>
      <div class="panel" id="matchupPanel"><h3>Type Matchups (damage taken)</h3><div class="loading">Calculating…</div></div>
      <div class="panel" id="movesPanel" style="grid-column:1/-1"><h3>Learnable Moves</h3><div class="loading">Loading…</div></div>
    </div>
  `;

  // Update hero sprite with correct form artwork (mega/regional)
  loadFormSpriteUrl(c).then(url => {
    const img = document.querySelector('.hart');
    if (img) img.src = url;
  });

  fillAbilities(c);
  fillMatchups(types);
  fillMoves(c);
}

function statRow(label, val, fill, color) {
  const v = val ?? 0;
  return `<div class="stat-row">
    <div class="lbl">${label}</div><div class="num">${val ?? '—'}</div>
    <div class="stat-bar"><div class="fill" style="width:${fill(v)}%;background:${color(v)}"></div></div>
  </div>`;
}

async function fillAbilities(c) {
  const panel = document.getElementById('abilitiesPanel');
  try {
    const abilities = await getAbilities(c);
    if (!abilities.length) { panel.innerHTML = `<h3>Abilities</h3><div class="empty">No data.</div>`; return; }
    panel.innerHTML = `<h3>Abilities</h3>` + abilities.map(a => `
      <div class="ability">
        <span class="aname">${escapeHtml(a.name)}</span>${a.isHidden ? '<span class="ahidden">Hidden</span>' : ''}
        <div class="adesc">${escapeHtml(a.description || '')}</div>
      </div>`).join('');
  } catch { panel.innerHTML = `<h3>Abilities</h3><div class="empty">Failed to load.</div>`; }
}

async function fillMatchups(types) {
  const panel = document.getElementById('matchupPanel');
  try {
    const chart = await loadTypeChart();
    const defensive = {};
    ALL_TYPES.forEach(atk => {
      let mult = 1;
      types.forEach(def => {
        const e = chart[atk];
        if (!e) return;
        if (e.double_damage_to.includes(def)) mult *= 2;
        else if (e.half_damage_to.includes(def)) mult *= 0.5;
        else if (e.no_damage_to.includes(def)) mult *= 0;
      });
      if (mult !== 1) defensive[atk] = mult;
    });
    const groups = { '4×':[], '2×':[], '½×':[], '¼×':[], '0×':[] };
    Object.entries(defensive).forEach(([t,m]) => {
      if (m===4) groups['4×'].push(t);
      else if (m===2) groups['2×'].push(t);
      else if (m===0.5) groups['½×'].push(t);
      else if (m===0.25) groups['¼×'].push(t);
      else if (m===0) groups['0×'].push(t);
    });
    panel.innerHTML = `<h3>Type Matchups (damage taken)</h3><div class="matchup-grid">
      ${Object.entries(groups).map(([k,arr]) => arr.length ? `<div class="row"><span class="lab">${k}</span>${arr.map(typeBadge).join('')}</div>` : '').join('')}
    </div>`;
  } catch { panel.innerHTML = `<h3>Type Matchups</h3><div class="empty">Failed to load.</div>`; }
}

// Move description cache (persists across detail page visits in same session)
const moveDescCache = new Map();

function moveSlug(name) {
  return name.toLowerCase()
    .replace(/[''′]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchMoveDescs(names) {
  const BATCH = 12;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH).filter(n => !moveDescCache.has(n));
    if (!batch.length) continue;
    await Promise.all(batch.map(async name => {
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/move/${moveSlug(name)}/`);
        if (!res.ok) { moveDescCache.set(name, ''); return; }
        const data = await res.json();
        const entries = data.flavor_text_entries?.filter(e => e.language.name === 'en') || [];
        moveDescCache.set(name, entries[entries.length - 1]?.flavor_text?.replace(/\f/g, ' ') || '');
      } catch { moveDescCache.set(name, ''); }
    }));
    // Update visible cells after each batch
    batch.forEach(name => {
      const cell = document.querySelector(`.moves-table td[data-move="${CSS.escape(name)}"]`);
      if (cell) cell.textContent = moveDescCache.get(name) || '—';
    });
  }
}

const MOVE_COLS = [
  { key: 'move',     label: 'Move',        str: true },
  { key: 'type',     label: 'Type',        str: true },
  { key: 'category', label: 'Cat.',        str: true },
  { key: 'power',    label: 'Power',       str: false },
  { key: 'accuracy', label: 'Acc.',        str: false },
  { key: 'pp',       label: 'PP',          str: false },
  { key: 'target',   label: 'Target',      str: true },
  { key: 'desc',     label: 'Description', str: true },
];

let movesSort = { col: 'move', dir: 1 };

async function fillMoves(c) {
  const panel = document.getElementById('movesPanel');
  try {
    const moves = await loadMovesFor(c);
    if (!moves.length) { panel.innerHTML = `<h3>Learnable Moves</h3><div class="empty">No data.</div>`; return; }
    const seen = new Map();
    moves.forEach(m => { if (!seen.has(m.move)) seen.set(m.move, m); });
    movesSort = { col: 'move', dir: 1 };
    renderMovesTable(panel, [...seen.values()]);
    fetchMoveDescs([...seen.keys()]);
  } catch { panel.innerHTML = `<h3>Learnable Moves</h3><div class="empty">Failed to load.</div>`; }
}

function renderMovesTable(panel, rows) {
  const sortedRows = sortMoveRows(rows);

  panel.innerHTML = `<h3>Learnable Moves (${rows.length})</h3>
    <div class="moves-wrap">
      <table class="moves-table" id="movesTable">
        <thead><tr>
          ${MOVE_COLS.map(c => `<th data-col="${c.key}" class="${c.key === movesSort.col ? (movesSort.dir > 0 ? 'sort-asc':'sort-desc') : ''}">${c.label}</th>`).join('')}
        </tr></thead>
        <tbody>${sortedRows.map(m => {
          const numVal = v => (v && v !== '--') ? v : '—';
          return `<tr
            data-move="${escapeHtml(m.move)}"
            data-type="${escapeHtml(m.type||'')}"
            data-category="${escapeHtml(m.category||'')}"
            data-power="${m.power||''}"
            data-accuracy="${m.accuracy||''}"
            data-pp="${m.pp||''}"
            data-target="${escapeHtml(m.target||'')}">
            <td><strong>${escapeHtml(m.move)}</strong></td>
            <td>${typeBadge(m.type)}</td>
            <td class="cat-${(m.category||'').toLowerCase()}">${escapeHtml(m.category||'')}</td>
            <td>${numVal(m.power)}</td>
            <td>${numVal(m.accuracy)}</td>
            <td>${numVal(m.pp)}</td>
            <td>${escapeHtml(targetLabel(m.target))}</td>
            <td data-move="${escapeHtml(m.move)}" class="move-desc">${moveDescCache.get(m.move) ?? '<span class="desc-loading">…</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  // Sort on header click — re-sort existing rows in DOM
  panel.querySelector('thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    const col = th.dataset.col;
    if (movesSort.col === col) movesSort.dir *= -1;
    else { movesSort.col = col; movesSort.dir = col === 'move' || col === 'type' || col === 'category' || col === 'target' || col === 'desc' ? 1 : -1; }
    panel.querySelectorAll('thead th').forEach(t => t.className = '');
    th.className = movesSort.dir > 0 ? 'sort-asc' : 'sort-desc';
    const tbody = panel.querySelector('tbody');
    const trs = [...tbody.querySelectorAll('tr')];
    trs.sort((a, b) => {
      let av = a.dataset[movesSort.col] ?? a.querySelector('[data-move]')?.textContent ?? '';
      let bv = b.dataset[movesSort.col] ?? b.querySelector('[data-move]')?.textContent ?? '';
      if (movesSort.col === 'desc') {
        av = a.querySelector('td.move-desc')?.textContent || '';
        bv = b.querySelector('td.move-desc')?.textContent || '';
      }
      const isNum = !isNaN(Number(av)) && !isNaN(Number(bv)) && av !== '' && bv !== '';
      return isNum ? (Number(av) - Number(bv)) * movesSort.dir : av.localeCompare(bv) * movesSort.dir;
    });
    trs.forEach(tr => tbody.appendChild(tr));
  });
}

function sortMoveRows(rows) {
  return [...rows].sort((a, b) => {
    const col = movesSort.col;
    let av = col === 'desc' ? (moveDescCache.get(a.move) || '') : (a[col] || '');
    let bv = col === 'desc' ? (moveDescCache.get(b.move) || '') : (b[col] || '');
    const isNum = !isNaN(Number(av)) && !isNaN(Number(bv)) && av !== '' && bv !== '' && av !== '--' && bv !== '--';
    return isNum ? (Number(av) - Number(bv)) * movesSort.dir : String(av).localeCompare(String(bv)) * movesSort.dir;
  });
}

function typeTint(type) {
  const map = {
    normal:'rgba(168,167,122,.25)',fire:'rgba(238,129,48,.3)',water:'rgba(99,144,240,.3)',
    electric:'rgba(247,208,44,.3)',grass:'rgba(122,199,76,.3)',ice:'rgba(150,217,214,.3)',
    fighting:'rgba(194,46,40,.3)',poison:'rgba(163,62,161,.3)',ground:'rgba(226,191,101,.3)',
    flying:'rgba(169,143,243,.3)',psychic:'rgba(249,85,135,.3)',bug:'rgba(166,185,26,.3)',
    rock:'rgba(182,161,54,.3)',ghost:'rgba(115,87,151,.3)',dragon:'rgba(111,53,252,.3)',
    dark:'rgba(112,87,70,.3)',steel:'rgba(183,183,206,.3)',fairy:'rgba(214,133,173,.3)',
  };
  return map[type] || 'rgba(255,255,255,.08)';
}

// ---------- Router ----------
function route() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/pokemon\/(.+)$/);
  if (m) renderDetail(decodeURIComponent(m[1]));
  else renderList();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('load', route);
route();
