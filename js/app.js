import { loadChampions, getChampion, getAbilities, loadMovesFor, loadTypeChart, computeMatchups, spriteUrl } from './data.js';

const app = document.getElementById('app');

const ALL_TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

function typeBadge(type) {
  const t = (type || '').toLowerCase();
  if (!t) return '';
  return `<span class="type-badge type-${t}">${t}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- List view ----------
let listState = { query: '', type: '', champions: [] };

async function renderList() {
  app.innerHTML = `<div class="loading">Loading champions…</div>`;
  const champions = await loadChampions();
  listState.champions = champions;

  app.innerHTML = `
    <div class="toolbar">
      <input class="search" id="q" placeholder="Search Pokémon by name…" value="${escapeHtml(listState.query)}" />
    </div>
    <div class="type-filters" id="typeFilters">
      <span class="type-chip ${listState.type === '' ? 'active' : ''}" data-type="">All</span>
      ${ALL_TYPES.map(t => `<span class="type-chip type-${t} ${listState.type === t ? 'active' : ''}" data-type="${t}">${t}</span>`).join('')}
    </div>
    <div id="grid" class="grid"></div>
  `;

  document.getElementById('q').addEventListener('input', e => {
    listState.query = e.target.value;
    paintGrid();
  });
  document.getElementById('typeFilters').addEventListener('click', e => {
    const chip = e.target.closest('.type-chip');
    if (!chip) return;
    listState.type = chip.dataset.type;
    document.querySelectorAll('#typeFilters .type-chip').forEach(c => c.classList.toggle('active', c.dataset.type === listState.type));
    paintGrid();
  });

  paintGrid();
}

function paintGrid() {
  const q = listState.query.trim().toLowerCase();
  const filtered = listState.champions.filter(c => {
    if (q && !c.name.toLowerCase().includes(q) && !String(c.id).includes(q)) return false;
    if (listState.type) {
      const t = listState.type;
      if (c.type1?.toLowerCase() !== t && c.type2?.toLowerCase() !== t) return false;
    }
    return true;
  });

  const grid = document.getElementById('grid');
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty">No Pokémon match your search.</div>`;
    return;
  }
  grid.innerHTML = filtered.map(c => `
    <a class="card" href="#/pokemon/${encodeURIComponent(c.slug)}">
      ${c.is_mega === 'Yes' ? '<span class="mega-badge">MEGA</span>' : ''}
      <span class="id">#${String(c.id).padStart(4, '0')}</span>
      <div class="art"><img loading="lazy" src="${spriteUrl(c.id)}" alt="${escapeHtml(c.name)}" onerror="this.style.opacity=0.2" /></div>
      <div class="meta">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="types">${typeBadge(c.type1)}${typeBadge(c.type2)}</div>
      </div>
    </a>
  `).join('');
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
        <div class="hid">#${String(c.id).padStart(4, '0')}${c.is_mega === 'Yes' ? ' · MEGA' : (c.form ? ` · ${c.form}` : '')}</div>
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
        ${statRow('Total', s.total, v => Math.round((v / 800) * 100), () => '#6366f1')}
      </div>

      <div class="panel" id="abilitiesPanel">
        <h3>Abilities</h3>
        <div class="loading">Loading abilities…</div>
      </div>

      <div class="panel" id="matchupPanel">
        <h3>Type Matchups (damage taken)</h3>
        <div class="loading">Calculating…</div>
      </div>

      <div class="panel" id="movesPanel" style="grid-column: 1 / -1;">
        <h3>Learnable Moves</h3>
        <div class="loading">Loading moves…</div>
      </div>
    </div>
  `;

  // Lazy-load the extra panels
  fillAbilities(c);
  fillMatchups(types);
  fillMoves(c);
}

function statRow(label, val, fill, color) {
  const v = val ?? 0;
  return `
    <div class="stat-row">
      <div class="lbl">${label}</div>
      <div class="num">${val ?? '—'}</div>
      <div class="stat-bar"><div class="fill" style="width:${fill(v)}%; background:${color(v)}"></div></div>
    </div>
  `;
}

async function fillAbilities(c) {
  const panel = document.getElementById('abilitiesPanel');
  try {
    const abilities = await getAbilities(c);
    if (!abilities.length) {
      panel.innerHTML = `<h3>Abilities</h3><div class="empty">No ability data.</div>`;
      return;
    }
    panel.innerHTML = `<h3>Abilities</h3>` + abilities.map(a => `
      <div class="ability">
        <span class="aname">${escapeHtml(a.name)}</span>${a.isHidden ? '<span class="ahidden">Hidden</span>' : ''}
        <div class="adesc">${escapeHtml(a.description || '')}</div>
      </div>
    `).join('');
  } catch {
    panel.innerHTML = `<h3>Abilities</h3><div class="empty">Failed to load.</div>`;
  }
}

async function fillMatchups(types) {
  const panel = document.getElementById('matchupPanel');
  try {
    const chart = await loadTypeChart();
    // defensive: what's super effective / resisted AGAINST this pokemon
    const defensive = {};
    ALL_TYPES.forEach(atk => {
      let mult = 1;
      types.forEach(def => {
        const entry = chart[atk];
        if (!entry) return;
        if (entry.double_damage_to.includes(def)) mult *= 2;
        else if (entry.half_damage_to.includes(def)) mult *= 0.5;
        else if (entry.no_damage_to.includes(def)) mult *= 0;
      });
      if (mult !== 1) defensive[atk] = mult;
    });
    const groups = { '4×': [], '2×': [], '½×': [], '¼×': [], '0×': [] };
    Object.entries(defensive).forEach(([t, m]) => {
      if (m === 4) groups['4×'].push(t);
      else if (m === 2) groups['2×'].push(t);
      else if (m === 0.5) groups['½×'].push(t);
      else if (m === 0.25) groups['¼×'].push(t);
      else if (m === 0) groups['0×'].push(t);
    });
    panel.innerHTML = `<h3>Type Matchups (damage taken)</h3>
      <div class="matchup-grid">
        ${Object.entries(groups).map(([k, arr]) => arr.length ? `
          <div class="row"><span class="lab">${k}</span>${arr.map(typeBadge).join('')}</div>
        ` : '').join('')}
      </div>`;
  } catch {
    panel.innerHTML = `<h3>Type Matchups</h3><div class="empty">Failed to load.</div>`;
  }
}

async function fillMoves(c) {
  const panel = document.getElementById('movesPanel');
  try {
    const moves = await loadMovesFor(c);
    if (!moves.length) {
      panel.innerHTML = `<h3>Learnable Moves</h3><div class="empty">No move data.</div>`;
      return;
    }
    // dedupe by move name
    const seen = new Map();
    moves.forEach(m => { if (!seen.has(m.move)) seen.set(m.move, m); });
    const rows = [...seen.values()].sort((a, b) => a.move.localeCompare(b.move));

    panel.innerHTML = `<h3>Learnable Moves (${rows.length})</h3>
      <div class="moves-wrap">
        <table class="moves-table">
          <thead><tr><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr></thead>
          <tbody>
            ${rows.map(m => `<tr>
              <td><strong>${escapeHtml(m.move)}</strong></td>
              <td>${typeBadge(m.type)}</td>
              <td class="cat-${(m.category||'').toLowerCase()}">${escapeHtml(m.category || '')}</td>
              <td>${escapeHtml(m.power || '—')}</td>
              <td>${escapeHtml(m.accuracy || '—')}</td>
              <td>${escapeHtml(m.pp || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    panel.innerHTML = `<h3>Learnable Moves</h3><div class="empty">Failed to load.</div>`;
  }
}

function typeTint(type) {
  const map = {
    normal: 'rgba(168,167,122,.25)', fire: 'rgba(238,129,48,.3)', water: 'rgba(99,144,240,.3)',
    electric: 'rgba(247,208,44,.3)', grass: 'rgba(122,199,76,.3)', ice: 'rgba(150,217,214,.3)',
    fighting: 'rgba(194,46,40,.3)', poison: 'rgba(163,62,161,.3)', ground: 'rgba(226,191,101,.3)',
    flying: 'rgba(169,143,243,.3)', psychic: 'rgba(249,85,135,.3)', bug: 'rgba(166,185,26,.3)',
    rock: 'rgba(182,161,54,.3)', ghost: 'rgba(115,87,151,.3)', dragon: 'rgba(111,53,252,.3)',
    dark: 'rgba(112,87,70,.3)', steel: 'rgba(183,183,206,.3)', fairy: 'rgba(214,133,173,.3)',
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
