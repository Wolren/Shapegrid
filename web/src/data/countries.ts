// ══════════════════════════════════════════════════════════════════════════════
// Country boundary data — loaded from Natural Earth via world-atlas
// ══════════════════════════════════════════════════════════════════════════════

import type { CountryData } from '../types';
import { loadCountries, getLoadedCountries, getCountryBounds } from './country-loader';

export const FEATURED_COUNTRIES = [
  'US','CA','GB','FR','DE','IT','ES','JP','CN','KR','IN','AU','BR','MX','NL','SE','PL','NO','CH','AR',
];

let initPromise: Promise<void> | null = null;

/** Call once at startup to preload country boundaries */
export function initCountries(): Promise<void> {
  if (!initPromise) {
    initPromise = loadCountries().then(() => {});
  }
  return initPromise;
}

/** Get the countries map (may be empty before load completes) */
export function getCountries(): Record<string, CountryData> {
  return getLoadedCountries() || {};
}

export function getCountryList(): Array<{ code: string; name: string; continent: string }> {
  const data = getLoadedCountries();
  if (!data) return FEATURED_COUNTRIES.map(c => ({ code: c, name: c, continent: '' }));
  return Object.entries(data)
    .map(([code, c]) => ({ code, name: c.name, continent: c.continent }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct continents present in the loaded country data, sorted. */
export function getContinents(): string[] {
  const data = getLoadedCountries();
  if (!data) return [];
  const set = new Set<string>();
  for (const c of Object.values(data)) {
    if (c.continent && c.continent !== 'Other') set.add(c.continent);
  }
  return [...set].sort();
}

/** Raw lon/lat bounds for a country (for real-world unit conversion). */
export { getCountryBounds };

export function searchCountries(query: string): Array<{ code: string; name: string; continent: string }> {
  const lq = query.toLowerCase();
  return getCountryList().filter(c =>
    c.name.toLowerCase().includes(lq) || c.code.toLowerCase().includes(lq)
  );
}

/** Legacy constant for backward compat — prefer getCountries() */
export const COUNTRIES: Record<string, CountryData> = new Proxy({} as Record<string, CountryData>, {
  get(_target, prop: string) {
    return getLoadedCountries()?.[prop] ?? null;
  },
  has(_target, prop: string) {
    return getLoadedCountries()?.[prop] !== undefined;
  },
  ownKeys() {
    return Object.keys(getLoadedCountries() || {});
  },
});
