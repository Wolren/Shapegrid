// ══════════════════════════════════════════════════════════════════════════════
// Build-time script: download and process world-atlas country boundaries
// Run with: node scripts/process-countries.mjs
// Outputs: web/src/data/countries-data.json
// ══════════════════════════════════════════════════════════════════════════════

import { feature } from 'topojson-client';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'web', 'src', 'data', 'countries-data.json');

// ISO numeric → alpha-2 mapping for known countries
const ISO_NUM_TO_ALPHA2 = {
  '004': 'AF', '008': 'AL', '012': 'DZ', '020': 'AD', '024': 'AO',
  '032': 'AR', '036': 'AU', '040': 'AT', '050': 'BD', '051': 'AM',
  '056': 'BE', '064': 'BT', '068': 'BO', '076': 'BR', '100': 'BG',
  '104': 'MM', '116': 'KH', '120': 'CM', '124': 'CA', '144': 'LK',
  '148': 'TD', '152': 'CL', '156': 'CN', '158': 'TW', '170': 'CO',
  '178': 'CG', '180': 'CD', '188': 'CR', '191': 'HR', '192': 'CU', '196': 'CY',
  '203': 'CZ', '204': 'BJ', '208': 'DK', '214': 'DO', '218': 'EC',
  '222': 'SV', '231': 'ET', '233': 'EE', '246': 'FI', '250': 'FR',
  '266': 'GA', '268': 'GE', '276': 'DE', '300': 'GR', '320': 'GT',
  '324': 'GN', '328': 'GY', '332': 'HT', '340': 'HN', '348': 'HU',
  '352': 'IS', '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ',
  '372': 'IE', '376': 'IL', '380': 'IT', '384': 'CI', '388': 'JM',
  '392': 'JP', '398': 'KZ', '400': 'JO', '404': 'KE', '408': 'KP',
  '410': 'KR', '414': 'KW', '417': 'KG', '418': 'LA', '422': 'LB',
  '426': 'LS', '428': 'LV', '434': 'LY', '440': 'LT', '442': 'LU',
  '450': 'MG', '454': 'MW', '458': 'MY', '466': 'ML', '478': 'MR',
  '484': 'MX', '496': 'MN', '504': 'MA', '508': 'MZ', '512': 'OM',
  '516': 'NA', '524': 'NP', '528': 'NL', '540': 'NC', '554': 'NZ',
  '558': 'NI', '562': 'NE', '566': 'NG', '578': 'NO', '586': 'PK',
  '591': 'PA', '598': 'PG', '600': 'PY', '604': 'PE', '608': 'PH',
  '616': 'PL', '620': 'PT', '624': 'GW', '626': 'TL', '634': 'QA', '642': 'RO',
  '643': 'RU', '646': 'RW', '682': 'SA', '686': 'SN', '694': 'SL',
  '702': 'SG', '703': 'SK', '704': 'VN', '705': 'SI', '710': 'ZA',
  '716': 'ZW', '724': 'ES', '728': 'SS', '729': 'SD', '732': 'EH',
  '740': 'SR', '748': 'SZ', '752': 'SE', '756': 'CH', '760': 'SY',
  '762': 'TJ', '764': 'TH', '768': 'TG', '780': 'TT', '784': 'AE',
  '788': 'TN', '792': 'TR', '795': 'TM', '800': 'UG', '804': 'UA',
  '807': 'MK', '818': 'EG', '826': 'GB', '834': 'TZ', '840': 'US',
  '854': 'BF', '858': 'UY', '860': 'UZ', '862': 'VE', '887': 'YE',
  '894': 'ZM',
};

// Country name overrides (world-atlas has English names)
const COUNTRY_NAMES = {
  'US': 'United States', 'GB': 'United Kingdom', 'CZ': 'Czech Republic',
  'KR': 'South Korea', 'KP': 'North Korea', 'RU': 'Russia',
  'IR': 'Iran', 'SY': 'Syria', 'VN': 'Vietnam', 'TW': 'Taiwan',
  'CD': 'DR Congo', 'CG': 'Congo', 'CI': 'Côte d\'Ivoire',
  'MM': 'Myanmar', 'MK': 'North Macedonia', 'TL': 'East Timor',
};

async function main() {
  // Fetch TopoJSON from jsdelivr CDN
  const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
  console.log(`Fetching ${url}...`);
  const resp = await fetch(url);
  const topology = await resp.json();

  // Convert to GeoJSON FeatureCollection
  const countries = feature(topology, topology.objects.countries);
  console.log(`Got ${countries.features.length} countries`);

  // Build output: map alpha2 → { name, coords }
  const result = {};
  let skipped = 0;

  for (const feat of countries.features) {
    const numId = String(feat.id).padStart(3, '0');
    const alpha2 = ISO_NUM_TO_ALPHA2[numId];
    if (!alpha2) {
      skipped++;
      continue;
    }

    let name = COUNTRY_NAMES[alpha2] || feat.properties?.name || alpha2;

    // Extract coordinates — handle Polygon and MultiPolygon
    let coords = null;
    if (feat.geometry.type === 'Polygon') {
      coords = feat.geometry.coordinates[0];
    } else if (feat.geometry.type === 'MultiPolygon') {
      // Take the largest polygon by bounding box
      let largest = null, maxSpan = 0;
      for (const poly of feat.geometry.coordinates) {
        const ring = poly[0];
        const xs = ring.map(([x]) => x);
        const ys = ring.map(([, y]) => y);
        const span = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        if (span > maxSpan) { maxSpan = span; largest = ring; }
      }
      coords = largest;
    }

    if (!coords || coords.length < 4) { skipped++; continue; }

    // Simplify: reduce vertex count for 110m resolution
    // The 110m data is already simplified, but some countries have many points
    // Decimate to max ~200 points for performance
    if (coords.length > 200) {
      const step = Math.ceil(coords.length / 200);
      coords = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
    }

    result[alpha2] = { name, coords };
  }

  console.log(`Processed ${Object.keys(result).length} countries, skipped ${skipped}`);

  // Write output
  writeFileSync(OUT, JSON.stringify(result));
  console.log(`Written to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
