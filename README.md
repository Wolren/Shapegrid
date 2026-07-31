[![License](https://img.shields.io/github/license/Wolren/Shapegrid)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/Wolren/Shapegrid)](https://github.com/Wolren/Shapegrid/commits)
[![Issues](https://img.shields.io/github/issues/Wolren/Shapegrid)](https://github.com/Wolren/Shapegrid/issues)
[![Repo size](https://img.shields.io/github/repo-size/Wolren/Shapegrid)](https://github.com/Wolren/Shapegrid)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue?logo=typescript)](tsconfig.base.json)
[![Three.js](https://img.shields.io/badge/Three.js-0.185-lightgrey?logo=three.js)](web/package.json)

# shapegrid

**Fit exact-count square or hexagonal grids inside any boundary, rendered as 3D isometric activity maps with a GIS-style dashboard**

Shapegrid takes your GitHub contribution data and maps it onto a grid that conforms to any polygon boundary: country outlines, SVG shapes, preset icons, or your own GeoJSON. Each cell is a 3D isometric column with height and color reflecting contribution intensity. The interactive web viewer provides a GIS dashboard with draggable widgets for exploring the data.

---

## Features

- **Any boundary**: country polygons (ISO codes), SVG paths, GeoJSON files, 9 preset shapes (shield, circle, star, heart, diamond, hexagon, arrow, cross)
- **Square or hexagonal** grid packing: binary-search cell sizing for exact cell counts
- **3D isometric SVG output**: extruded columns with depth sorting, floor and side faces, configurable camera angle
- **12 color palettes**: GitHub, warm, cool, mono, neon, forest, sunset, ocean, fire, pastel, arctic, gold (or custom)
- **Coordinate axes**: longitude/latitude labels on geographic maps
- **GIS dashboard**: 10 draggable overlay widgets (legend, statistics, distribution histogram, timeline sparkline, activity heatmap, overview mini-map, language breakdown, cell info, scale bar, coordinates)
- **WebGL viewer**: interactive 3D preview with Three.js (orbit controls, real-time palette switching, config export)
- **GitHub Actions CI**: auto-regenerate on schedule or config change, deploy to GitHub Pages
- **Day border support**: empty days render as outline-only on light backgrounds
- **2-year query range**: splits API requests into yearly chunks to work around the GitHub API 365-day limit

---

## Tech stack

| Component | Tool | Version |
|-----------|------|---------|
| Language | TypeScript | 7.0 |
| 3D rendering | Three.js | 0.185 |
| Build tool | Vite | 8.2 |
| Package manager | pnpm | 10 |
| CLI rendering | Puppeteer (headless Chrome) | 25.4 |
| Config format | YAML (js-yaml) | 5.2 |
| GIS data | TopoJSON (topojson-client) | 3.1 |

---

## Quick start

### 1. Install

```bash
npm install -g pnpm
pnpm install
pnpm build
```

### 2. Configure

Copy the example config and edit it:

```bash
cp shapegrid.config.yml.example shapegrid.config.yml
```

Key settings:

```yaml
github:
  username: your-username
  token: SHAPEGRID_TOKEN       # env var name (recommended) or literal token

grid:
  type: square                 # square or hex
  count: 730                   # number of cells (match your date range)

boundary:
  type: preset
  name: shield                 # or country | polygon | svgPath | geojson | file
```

### 3. Generate

```bash
pnpm generate --config shapegrid.config.yml
```

Or with CLI flags:

```bash
node packages/core/cli/dist/index.js generate \
  --user your-username \
  --token ghp_xxx \
  --count 365
```

Output goes to `dist/`: SVG, PNG, and JSON data files.

### 4. View in browser

```bash
pnpm dev:web
```

Opens the interactive WebGL viewer at `http://localhost:3000`.

---

## Boundary types

| Type | Description | Example |
|------|-------------|---------|
| `preset` | Built-in shapes | `shield, circle, star, heart, diamond, rectangle, hexagon, arrow, cross` |
| `country` | ISO 3166-1 alpha-2 country code | `US, GB, FR, DE, JP, PL, AU` |
| `polygon` | Raw normalized coordinates | `[[0,0], [1,0], [1,1], [0,1]]` |
| `svgPath` | SVG path string (M/L/Z) | `"M 50 0 L 100 25 L 100 75 L 50 100 Z"` |
| `geojson` | GeoJSON polygon ring | Standard GeoJSON coordinates |
| `file` | External GeoJSON or SVG file | `./poland.json` |

For geographic boundaries (countries, GeoJSON), shapegrid auto-detects coordinate systems and applies WGS84 cosine-latitude correction or Mercator projection.

---

## GitHub Actions CI

Shapegrid includes a workflow (`.github/workflows/shapegrid.yml`) that:

1. **Triggers** on config changes, lockfile updates, or manual dispatch
2. **Fetches** contributions via GitHub GraphQL API
3. **Generates** the SVG grid and JSON data
4. **Copies** assets to `docs/` for GitHub Pages
5. **Deploys** to GitHub Pages automatically

### Setup

1. Create a GitHub PAT with `read:user` scope
2. Add it as a repository secret named `SHAPEGRID_TOKEN`
3. Enable GitHub Pages (Settings > Pages > Branch: `master`, Folder: `/docs`)
4. Push a change to `shapegrid.config.yml`

---

## Web viewer UI

The interactive web app provides a full GIS-style interface with:

- **Data tab**: GitHub credentials, date range picker (last N days, year selector, explicit range)
- **Boundary tab**: preset shapes, country search, file upload (GeoJSON/SVG)
- **Grid tab**: cell type, count, gap, coverage, camera controls
- **Render tab**: 12 color palettes, custom palette editor, height scale, background, export settings
- **GIS dashboard**: 10 overlay widgets (legend, statistics, distribution histogram, timeline, activity heatmap, overview mini-map, language breakdown, cell info, scale bar, coordinates) that can be toggled, dragged, and repositioned
- **Toolbar**: export PNG, toggle widgets, reset camera, screenshot

The viewer renders in real-time via Three.js WebGL. Dashboard widget layout can be exported as a JSON config.

---

## Configuration

Full reference at [`shapegrid.config.yml`](./shapegrid.config.yml) in the repo root. Every option is documented inline with examples.

Key sections:

- **github**: username and token
- **boundary**: shape definition
- **grid**: type (square/hex), count, coverage threshold
- **camera**: yaw, pitch, zoom for isometric SVG rendering
- **theme**: palette, day border color, custom palettes
- **axes**: coordinate axes for geographic maps
- **render**: height scale, gap, background, boundary outline
- **dateRange**: last N days or explicit start/end
- **output**: filenames, dimensions, output directory

---

## Limitations

- **GitHub API rate limit**: unauthenticated requests are limited to 60/hour. A `SHAPEGRID_TOKEN` with `read:user` scope raises this to 5,000/hour.
- **2-year query window**: the GitHub GraphQL API caps contribution queries at 365 days. Shapegrid handles longer ranges by splitting into yearly chunks, but very long ranges (5+ years) require multiple API calls.
- **SVG rendering is single-threaded**: large grids (2000+ cells) may take several seconds to generate server-side.
- **WebGL viewer requires a GPU**: the Three.js preview needs WebGL support. Falls back gracefully on software renderers but performance degrades.
- **Country polygon data is approximate**: built-in country boundaries are simplified for rendering speed and may not match official borders.

---

## License

GNU General Public License v3.0: see [LICENSE](./LICENSE).

---

*shapegrid by [Wolren](https://github.com/Wolren)*
