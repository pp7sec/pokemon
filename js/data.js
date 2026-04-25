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
  const [list, stats, missing] = await Promise.all([
    loadCSV('./champion_list.csv'),
    loadCSV('./PokemonStats.csv'),
    loadCSV('./missing_pokemon_stats.csv'),
  ]);
  // Build name-based lookup for missing stats
  const missingByName = new Map(missing.map(r => [r.Name.toLowerCase(), r]));

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
  const candidates = [
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

export async function loadMovesFor(champion) {
  if (!cache._movesText) {
    const res = await fetch('./all_moves.csv');
    cache._movesText = await res.text();
  }
  const rows = (await import('./csv.js')).parseCSV(cache._movesText);
  const keys = new Set([
    champion.name.toLowerCase().replace(/\s+/g, '-'),
    champion.name.toLowerCase().replace(/\s+/g, ''),
    champion.name.toLowerCase().split(' ').pop(),
    champion.name.toLowerCase()
      .replace(/^mega\s+/, '')
      .replace(/\s+(alolan|galarian|hisuian|paldean|partner|[xy])$/i, ''),
  ]);
  return rows.filter(r => keys.has(r.pokemon?.toLowerCase()));
}

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
