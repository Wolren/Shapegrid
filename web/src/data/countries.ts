// ══════════════════════════════════════════════════════════════════════════════
// Country boundary data — loaded from Natural Earth via world-atlas
// ══════════════════════════════════════════════════════════════════════════════

import type { CountryData } from '../types';
import { loadCountries, getLoadedCountries } from './country-loader';

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

export function getCountryList(): Array<{ code: string; name: string }> {
  const data = getLoadedCountries();
  if (!data) return FEATURED_COUNTRIES.map(c => ({ code: c, name: c }));
  return Object.entries(data)
    .map(([code, d]) => ({ code, name: d.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function searchCountries(query: string): Array<{ code: string; name: string }> {
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
