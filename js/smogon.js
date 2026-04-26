let _cache = null;

export async function loadSmogon() {
  if (_cache) return _cache;
  try {
    const res = await fetch('./smogon_vgc.json');
    if (!res.ok) throw new Error('no file');
    _cache = await res.json();
  } catch {
    _cache = { meta: {}, pokemon: {} };
  }
  return _cache;
}

/** Convert our champion name → Smogon lookup key */
export function smogonKey(champion) {
  if (champion.is_mega === 'Yes') return null; // Megas not in VGC
  return champion.name
    .replace(/\s+Alolan$/,  '-Alola')
    .replace(/\s+Galarian$/, '-Galar')
    .replace(/\s+Hisuian$/,  '-Hisui')
    .replace(/\s+Paldean$/,  '-Paldea');
}

/** Get the Smogon entry for a champion (or null if not in VGC meta) */
export function getSmogonEntry(champion) {
  if (!_cache) return null;
  const key = smogonKey(champion);
  if (!key) return null;
  return _cache.pokemon[key] || _cache.pokemon[champion.name] || null;
}

export function smogonMeta() {
  return _cache?.meta || {};
}

/** Format a human-readable source label for the tooltip */
export function smogonSourceLabel() {
  const m = smogonMeta();
  if (!m.source) return '';
  if (m.source === 'pikalytics') return `Pikalytics · ${m.format ?? ''} · ${m.updated ?? ''}`;
  return `Smogon · ${m.format ?? ''} · ${m.month ?? ''}`;
}
