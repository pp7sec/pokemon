import { loadCSV } from './csv.js';

const cache = {};

export function slugify(s) {
  return s.toLowerCase()
    .replace(/[♀]/g, '-f')
    .replace(/[♂]/g, '-m')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function spriteUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}
export function shinyUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`;
}

const REGIONAL_SUFFIX = { alolan:'alola', galarian:'galar', hisuian:'hisui', paldean:'paldea' };
const SLUG_OVERRIDES = { 'tauros-paldea':'tauros-paldea-combat-breed' };

function champToPokeSlug({ name, is_mega, form }) {
  if (is_mega !== 'Yes' && !form) return null;
  const n = name.toLowerCase();
  if (is_mega === 'Yes') {
    const base = n.replace(/^mega /, '');
    if (/[xy]$/.test(base) && base.slice(-2, -1) === ' ') {
      const letter = base.slice(-1);
      return `${base.slice(0, -2).replace(/\s+/g, '-')}-mega-${letter}`;
    }
    return `${base.replace(/\s+/g, '-')}-mega`;
  }
  if (form) {
    const formSlug = REGIONAL_SUFFIX[form.toLowerCase()];
    if (!formSlug) return null;
    const baseName = n.replace(new RegExp(`\\s+${form.toLowerCase()}$`), '').replace(/\s+/g, '-');
    const slug = `${baseName}-${formSlug}`;
    return SLUG_OVERRIDES[slug] || slug;
  }
  return null;
}

const formSpriteCache = new Map(); // key → { normal, shiny }

export async function loadFormSpriteUrls(champion) {
  const key = champion.slug;
  if (formSpriteCache.has(key)) return formSpriteCache.get(key);
  const slug = champToPokeSlug(champion);
  const fallback = { normal: spriteUrl(champion.id), shiny: shinyUrl(champion.id) };
  if (!slug) { formSpriteCache.set(key, fallback); return fallback; }
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}/`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const aw = data.sprites?.other?.['official-artwork'];
    const urls = {
      normal: aw?.front_default || fallback.normal,
      shiny:  aw?.front_shiny  || fallback.shiny,
    };
    formSpriteCache.set(key, urls);
    return urls;
  } catch {
    formSpriteCache.set(key, fallback);
    return fallback;
  }
}

export async function loadFormSpriteUrl(champion) {
  return (await loadFormSpriteUrls(champion)).normal;
}

function matchStats(statsRows, champion) {
  const { id, name, is_mega, form } = champion;
  const sameId = statsRows.filter(r => r.ID === String(id));
  if (sameId.length === 0) return null;

  // base form (no mega, no regional)
  if (is_mega === 'No' && !form) {
    return sameId.find(r => r.Name === name) || sameId[0];
  }
  // Mega X / Y
  if (is_mega === 'Yes') {
    const needle = (form ? `Mega ${name.replace(/^Mega /, '').replace(/ [XY]$/, '')}` : name.replace(/^Mega /, ''));
    const megaRow = sameId.find(r =>
      r.Name.toLowerCase().includes('mega') &&
      (form ? r.Name.includes(`Mega ${form === 'X' || form === 'Y' ? '' : ''}`) && r.Name.endsWith(form) : true)
    );
    if (megaRow) return megaRow;
    return sameId.find(r => r.Name.toLowerCase().includes('mega')) || sameId[0];
  }
  // Regional forms (Alolan/Galarian/Hisuian/Paldean)
  if (form) {
    const regional = sameId.find(r => r.Name.toLowerCase().includes(form.toLowerCase()));
    if (regional) return regional;
  }
  return sameId[0];
}

export async function loadChampions() {
  if (cache.champions) return cache.champions;
  const [list, stats] = await Promise.all([
    loadCSV('./champion_list.csv'),
    loadCSV('./PokemonStats.csv'),   // includes former missing_pokemon_stats rows
  ]);
  // Name-based fallback covers rows with no ID (Megas, regional forms, etc.)
  const missingByName = new Map(stats.map(r => [r.Name.toLowerCase(), r]));

  const champions = list.map(row => {
    const champion = {
      id: Number(row.id),
      name: row.name,
      is_mega: row.is_mega,
      form: row.form || '',
    };
    // Try main stats first, then fall back to missing_pokemon_stats by name
    let s = matchStats(stats, champion);
    if (!s) s = missingByName.get(champion.name.toLowerCase()) || null;
    if (s) {
      champion.stats = {
        total: Number(s.Total),
        hp: Number(s.HP),
        attack: Number(s.Attack),
        defense: Number(s.Defense),
        spAtk: Number(s.SpAtk),
        spDef: Number(s.SpDef),
        speed: Number(s.Speed),
      };
      champion.type1 = s.Type1;
      champion.type2 = s.Type2 || '';
      champion.height = s.Height ? Number(s.Height) : null;
      champion.weight = s.Weight ? Number(s.Weight) : null;
    }
    champion.slug = slugify(champion.name);
    return champion;
  });
  cache.champions = champions;
  cache.bySlug = new Map(champions.map(c => [c.slug, c]));
  return champions;
}

export async function getChampion(slug) {
  await loadChampions();
  return cache.bySlug.get(slug);
}

export async function loadAbilities() {
  if (cache.abilities) return cache.abilities;
  const rows = await loadCSV('./pokemon_abilities.csv');
  const byPokemon = new Map();
  rows.forEach(r => {
    const key = r.pokemon.toLowerCase();
    if (!byPokemon.has(key)) byPokemon.set(key, []);
    byPokemon.get(key).push({
      name: r.ability,
      isHidden: r.is_hidden === 'Yes',
      slot: Number(r.slot),
      description: r.description,
    });
  });
  cache.abilities = byPokemon;
  return byPokemon;
}

export async function getAbilities(champion) {
  const all = await loadAbilities();
  // try full name slug first
  const pokeSlug = champToPokeSlug(champion);
  const candidates = [
    ...(pokeSlug ? [pokeSlug] : []),
    champion.name.toLowerCase().replace(/\s+/g, '-'),
    champion.name.toLowerCase().replace(/\s+/g, ''),
    champion.name.toLowerCase().split(' ').pop(),
  ];
  for (const key of candidates) {
    if (all.has(key)) return all.get(key);
  }
  // fallback: base name (strip Mega/regional prefix/suffix)
  const base = champion.name
    .replace(/^Mega\s+/, '')
    .replace(/\s+(Alolan|Galarian|Hisuian|Paldean|Partner|[XY])$/i, '')
    .toLowerCase();
  return all.get(base) || all.get(base.replace(/\s+/g, '-')) || [];
}

// Shared helper: strip mega/regional affixes → base lookup key
export function champBaseKey(champion) {
  return champion.name.toLowerCase()
    .replace(/^mega\s+/, '')
    .replace(/\s+(alolan|galarian|hisuian|paldean|partner|[xy])$/i, '')
    .trim();
}

async function loadAllMoveRows() {
  if (cache._moveRows) return cache._moveRows;
  if (!cache._movesText) {
    const res = await fetch('./all_moves.csv');
    cache._movesText = await res.text();
  }
  cache._moveRows = (await import('./csv.js')).parseCSV(cache._movesText);
  return cache._moveRows;
}

export async function loadMovesFor(champion) {
  const rows = await loadAllMoveRows();
  const base = champBaseKey(champion);
  const keys = new Set([
    champion.name.toLowerCase().replace(/\s+/g, '-'),
    champion.name.toLowerCase().replace(/\s+/g, ''),
    champion.name.toLowerCase().split(' ').pop(),
    base,
  ]);
  return rows.filter(r => keys.has(r.pokemon?.toLowerCase()));
}

export async function loadMoveIndex() {
  if (cache.moveIndex) return cache.moveIndex;
  const rows = await loadAllMoveRows();
  const index = new Map(); // moveName → Set<pokemonKey>
  rows.forEach(r => {
    if (!r.move) return;
    if (!index.has(r.move)) index.set(r.move, new Set());
    index.get(r.move).add(r.pokemon?.toLowerCase());
  });
  cache.moveIndex = index;
  cache.moveNames = [...index.keys()].sort((a, b) => a.localeCompare(b));
  return index;
}
export function getMoveNames() { return cache.moveNames || []; }

export async function loadAbilityIndex() {
  if (cache.abilityIndex) return cache.abilityIndex;
  const byPokemon = await loadAbilities();
  const index = new Map(); // abilityName → Set<pokemonKey>
  byPokemon.forEach((abilities, pokemonKey) => {
    abilities.forEach(a => {
      if (!index.has(a.name)) index.set(a.name, new Set());
      index.get(a.name).add(pokemonKey);
    });
  });
  cache.abilityIndex = index;
  cache.abilityNames = [...index.keys()].sort((a, b) => a.localeCompare(b));
  return index;
}
export function getAbilityNames() { return cache.abilityNames || []; }

export async function loadTypeChart() {
  if (cache.typeChart) return cache.typeChart;
  const rows = await loadCSV('./type_chart.csv');
  const chart = {};
  rows.forEach(r => {
    const t = r.type.toLowerCase();
    chart[t] ??= { double_damage_to: [], half_damage_to: [], no_damage_to: [], double_damage_from: [], half_damage_from: [], no_damage_from: [] };
    if (chart[t][r.relation]) chart[t][r.relation].push(r.target.toLowerCase());
  });
  cache.typeChart = chart;
  return chart;
}

export function computeMatchups(types, chart) {
  const allTypes = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
  const result = {};
  allTypes.forEach(atk => {
    let mult = 1;
    types.forEach(def => {
      const entry = chart[atk];
      if (!entry) return;
      if (entry.double_damage_to.includes(def)) mult *= 2;
      else if (entry.half_damage_to.includes(def)) mult *= 0.5;
      else if (entry.no_damage_to.includes(def)) mult *= 0;
    });
    if (mult !== 1) result[atk] = mult;
  });
  return result;
}
