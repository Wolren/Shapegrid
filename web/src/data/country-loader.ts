// ══════════════════════════════════════════════════════════════════════════════
// Country boundary loader — fetches real boundaries from Natural Earth via
// world-atlas TopoJSON and converts to normalized coordinate arrays.
// ══════════════════════════════════════════════════════════════════════════════

import { feature } from 'topojson-client';
import type { Point2D, CountryData, GeoBounds } from '../types';
import { normWithCoordSystem } from '../geometry/projection';

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO numeric → alpha-2 mapping
const NUM2A2: Record<string, string> = {
  '004':'AF','008':'AL','012':'DZ','020':'AD','024':'AO','031':'AZ','032':'AR','036':'AU',
  '040':'AT','050':'BD','051':'AM','056':'BE','064':'BT','068':'BO','070':'BA','072':'BW',
  '076':'BR','090':'SB','100':'BG','104':'MM','108':'BI','112':'BY','116':'KH','120':'CM',
  '124':'CA','140':'CF','144':'LK','148':'TD','152':'CL','156':'CN','158':'TW','170':'CO',
  '178':'CG','180':'CD','188':'CR','191':'HR','192':'CU','196':'CY','203':'CZ','204':'BJ',
  '208':'DK','214':'DO','218':'EC','222':'SV','226':'GQ','231':'ET','232':'ER','233':'EE',
  '242':'FJ','246':'FI','250':'FR','266':'GA','268':'GE','270':'GM','276':'DE','288':'GH',
  '296':'KI','300':'GR','320':'GT','324':'GN','328':'GY','332':'HT','340':'HN','348':'HU',
  '352':'IS','356':'IN','360':'ID','364':'IR','368':'IQ','372':'IE','376':'IL','380':'IT',
  '384':'CI','388':'JM','392':'JP','398':'KZ','400':'JO','404':'KE','408':'KP','410':'KR',
  '414':'KW','417':'KG','418':'LA','422':'LB','426':'LS','428':'LV','430':'LR','434':'LY',
  '440':'LT','442':'LU','450':'MG','454':'MW','458':'MY','466':'ML','470':'MT','478':'MR',
  '484':'MX','496':'MN','498':'MD','499':'ME','504':'MA','508':'MZ','512':'OM','516':'NA',
  '524':'NP','528':'NL','540':'NC','548':'VU','554':'NZ','558':'NI','562':'NE','566':'NG',
  '578':'NO','583':'FM','584':'MH','586':'PK','591':'PA','598':'PG','600':'PY','604':'PE',
  '608':'PH','616':'PL','620':'PT','624':'GW','626':'TL','634':'QA','642':'RO','643':'RU',
  '646':'RW','682':'SA','686':'SN','688':'RS','694':'SL','702':'SG','703':'SK','704':'VN',
  '705':'SI','706':'SO','710':'ZA','716':'ZW','724':'ES','728':'SS','729':'SD','732':'EH',
  '740':'SR','748':'SZ','752':'SE','756':'CH','760':'SY','762':'TJ','764':'TH','768':'TG',
  '776':'TO','780':'TT','784':'AE','788':'TN','792':'TR','795':'TM','800':'UG','804':'UA',
  '807':'MK','818':'EG','826':'GB','834':'TZ','840':'US','854':'BF','858':'UY','860':'UZ',
  '862':'VE','882':'WS','887':'YE','894':'ZM',
};

const NAME_OVERRIDES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CZ: 'Czech Republic',
  KR: 'South Korea', RU: 'Russia', IR: 'Iran', SY: 'Syria',
  VN: 'Vietnam', TW: 'Taiwan', CD: 'DR Congo', CI: "C\u00f4te d'Ivoire",
  MM: 'Myanmar', MK: 'North Macedonia',
};

// Continent per ISO alpha-2 code (UN M49-style grouping). Covers every code
// in NUM2A2 so the Region tab can filter countries by continent.
const CONTINENT_BY_CODE: Record<string, string> = {
  // Africa
  DZ: 'Africa', AO: 'Africa', BJ: 'Africa', BW: 'Africa', BF: 'Africa', BI: 'Africa',
  CM: 'Africa', CF: 'Africa', TD: 'Africa', CG: 'Africa', CD: 'Africa', CI: 'Africa',
  EG: 'Africa', GQ: 'Africa', ER: 'Africa', ET: 'Africa', GA: 'Africa', GM: 'Africa',
  GH: 'Africa', GN: 'Africa', GW: 'Africa', KE: 'Africa', LS: 'Africa', LR: 'Africa',
  LY: 'Africa', MG: 'Africa', MW: 'Africa', ML: 'Africa', MR: 'Africa', MA: 'Africa',
  MZ: 'Africa', NA: 'Africa', NE: 'Africa', NG: 'Africa', RW: 'Africa', SN: 'Africa',
  SL: 'Africa', SO: 'Africa', ZA: 'Africa', SS: 'Africa', SD: 'Africa', EH: 'Africa',
  SZ: 'Africa', TZ: 'Africa', TG: 'Africa', TN: 'Africa', UG: 'Africa', ZM: 'Africa',
  ZW: 'Africa',
  // Asia
  AM: 'Asia', AZ: 'Asia', BD: 'Asia', BT: 'Asia', KH: 'Asia', CN: 'Asia', TW: 'Asia',
  GE: 'Asia', IN: 'Asia', ID: 'Asia', IR: 'Asia', IQ: 'Asia', IL: 'Asia', JP: 'Asia',
  JO: 'Asia', KZ: 'Asia', KW: 'Asia', KG: 'Asia', LA: 'Asia', LB: 'Asia', MY: 'Asia',
  MN: 'Asia', MM: 'Asia', NP: 'Asia', KP: 'Asia', OM: 'Asia', PK: 'Asia', PH: 'Asia',
  QA: 'Asia', SA: 'Asia', SG: 'Asia', KR: 'Asia', LK: 'Asia', SY: 'Asia', TJ: 'Asia',
  TH: 'Asia', TL: 'Asia', TR: 'Asia', TM: 'Asia', AE: 'Asia', UZ: 'Asia', VN: 'Asia',
  YE: 'Asia', CY: 'Asia',
  // Europe
  AL: 'Europe', AD: 'Europe', AT: 'Europe', BY: 'Europe', BE: 'Europe', BA: 'Europe',
  BG: 'Europe', HR: 'Europe', CZ: 'Europe', DK: 'Europe', EE: 'Europe', FI: 'Europe',
  FR: 'Europe', DE: 'Europe', GR: 'Europe', HU: 'Europe', IS: 'Europe', IE: 'Europe',
  IT: 'Europe', LV: 'Europe', LT: 'Europe', LU: 'Europe', MT: 'Europe', MD: 'Europe',
  ME: 'Europe', MK: 'Europe', NL: 'Europe', NO: 'Europe', PL: 'Europe', PT: 'Europe',
  RO: 'Europe', RU: 'Europe', RS: 'Europe', SK: 'Europe', SI: 'Europe', ES: 'Europe',
  SE: 'Europe', CH: 'Europe', UA: 'Europe', GB: 'Europe',
  // North America
  CA: 'North America', CR: 'North America', CU: 'North America', DO: 'North America',
  SV: 'North America', GT: 'North America', HT: 'North America', HN: 'North America',
  JM: 'North America', MX: 'North America', NI: 'North America', PA: 'North America',
  TT: 'North America', US: 'North America',
  // Oceania
  AU: 'Oceania', FJ: 'Oceania', KI: 'Oceania', MH: 'Oceania', FM: 'Oceania', NC: 'Oceania',
  NZ: 'Oceania', PG: 'Oceania', WS: 'Oceania', SB: 'Oceania', TO: 'Oceania', VU: 'Oceania',
  // South America
  AR: 'South America', BO: 'South America', BR: 'South America', CL: 'South America',
  CO: 'South America', EC: 'South America', GY: 'South America', PY: 'South America',
  PE: 'South America', SR: 'South America', UY: 'South America', VE: 'South America',
};

let cache: Record<string, CountryData> | null = null;
let boundsCache: Record<string, GeoBounds> | null = null;
let loading: Promise<Record<string, CountryData>> | null = null;

export async function loadCountries(): Promise<Record<string, CountryData>> {
  if (cache) return cache;
  if (loading) return loading;

  loading = (async () => {
    try {
      const resp = await fetch(TOPO_URL);
      if (!resp.ok) {
        throw new Error(`Failed to fetch country boundaries: HTTP ${resp.status} ${resp.statusText}`);
      }
      const contentLength = Number(resp.headers.get('content-length') || 0);
      if (contentLength > 30_000_000) {
        throw new Error('Country boundary data exceeds the 30 MB size limit');
      }
      const topology = await resp.json();
      if (!topology?.objects?.countries) {
        throw new Error('Invalid TopoJSON: missing objects.countries');
      }
      const countries = feature(topology, topology.objects.countries) as any;

      const result: Record<string, CountryData> = {};
      const bounds: Record<string, GeoBounds> = {};

      for (const feat of countries.features) {
        if (!feat?.geometry) continue;
        const numId = String(feat.id).padStart(3, '0');
        const alpha2 = NUM2A2[numId];
        if (!alpha2) continue;

        const name = NAME_OVERRIDES[alpha2] || feat.properties?.name || alpha2;

        // Extract coordinates from Polygon or MultiPolygon
        let coords: Point2D[] | null = null;
        if (feat.geometry.type === 'Polygon') {
          coords = feat.geometry.coordinates[0].map((c: number[]) => [c[0], c[1]] as Point2D);
        } else if (feat.geometry.type === 'MultiPolygon') {
          let largest: Point2D[] | null = null;
          let maxSpan = 0;
          for (const poly of feat.geometry.coordinates) {
            const ring = poly[0].map((c: number[]) => [c[0], c[1]] as Point2D);
            const xs = ring.map((p: Point2D) => p[0]);
            const ys = ring.map((p: Point2D) => p[1]);
            const span = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
            if (span > maxSpan) { maxSpan = span; largest = ring; }
          }
          coords = largest;
        }

        if (!coords || coords.length < 4) continue;

        const finalCoords = coords;

        // Keep the raw lon/lat bounds BEFORE projection/decimation so the
        // viewer can report real-world units (km / km²) for countries.
        const rawXs = finalCoords.map((p: Point2D) => p[0]);
        const rawYs = finalCoords.map((p: Point2D) => p[1]);
        bounds[alpha2] = {
          minLon: Math.min(...rawXs),
          maxLon: Math.max(...rawXs),
          minLat: Math.min(...rawYs),
          maxLat: Math.max(...rawYs),
        };

        // Decimate to ~150 points max for performance
        if (finalCoords.length > 150) {
          const step = Math.ceil(finalCoords.length / 150);
          coords = finalCoords.filter((_, i) => i % step === 0 || i === finalCoords.length - 1) as Point2D[];
        }

        // Project to normalized coordinates using WGS84 correction
        const projected = normWithCoordSystem(coords!, 'wgs84');
        result[alpha2] = { name, coords: projected, continent: CONTINENT_BY_CODE[alpha2] ?? 'Other' };
      }

      cache = result;
      boundsCache = bounds;
      console.log(`[countries] Loaded ${Object.keys(result).length} countries`);
      return result;
    } catch (e) {
      console.error('[countries] Failed to load:', e);
      // Clear the in-flight marker so a later call retries instead of being
      // stuck on a permanently-failed promise.
      loading = null;
      return {};
    }
  })();

  return loading;
}

export function getLoadedCountries(): Record<string, CountryData> | null {
  return cache;
}

/** Raw lon/lat bounds for a country, or null when unavailable. */
export function getCountryBounds(code: string): GeoBounds | null {
  return boundsCache?.[code] ?? null;
}
