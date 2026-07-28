/**
 * countries.ts
 * Simplified country boundary polygons for popular countries.
 * Data derived from Natural Earth (public domain) at 110m resolution.
 * ISO 3166-1 alpha-2 country codes.
 */
import type { Polygon } from './boundary.js';
export interface CountryInfo {
    code: string;
    name: string;
    polygon: Polygon;
}
/**
 * Get all available countries as a list
 */
export declare function getCountryList(): {
    code: string;
    name: string;
}[];
/**
 * Get a country polygon by ISO alpha-2 code
 */
export declare function getCountryPolygon(code: string): Polygon | null;
/**
 * Get country info including name and polygon
 */
export declare function getCountryInfo(code: string): CountryInfo | null;
/**
 * Search countries by name (case-insensitive partial match)
 */
export declare function searchCountries(query: string): {
    code: string;
    name: string;
}[];
/**
 * Check if a country code is valid
 */
export declare function isValidCountryCode(code: string): boolean;
export declare const COUNTRY_CODES: string[];
//# sourceMappingURL=countries.d.ts.map