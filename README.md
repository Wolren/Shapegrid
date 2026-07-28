# shapegrid

**Fit exact-count square or hexagonal grids inside any boundary — rendered as 3D isometric activity maps**

shapegrid takes your GitHub contribution data and maps it onto a grid that conforms to any polygon boundary: country outlines, SVG shapes, preset icons, or your own GeoJSON. Each cell is a 3D isometric column whose height and color reflect contribution intensity.

---

## Features

- **Any boundary** — country polygons (ISO codes), SVG paths, GeoJSON files, 10+ preset shapes (shield, circle, star, heart, diamond, hexagon, arrow, cross)
- **Square or hexagonal** grid packing — binary-search cell sizing for exact cell counts
- **3D isometric SVG output** — extruded columns with proper depth sorting, floor and side faces, configurable camera angle
- **12 colour palettes** — GitHub, warm, cool, mono, neon, forest, sunset, ocean, fire, pastel, arctic, gold (or define your own)
- **Coordinate axes** — longitude/latitude labels on geographic maps
- **WebGL viewer** — interactive browser preview with Three.js (drag to rotate, scroll to zoom)
- **GitHub Actions CI** — auto-regenerate on schedule or config change, deploy to GitHub Pages
- **Day border support** — empty days render as outline-only on light backgrounds
- **2-year range** — splits queries into yearly chunks to work around the GitHub API 365-day limit

---

## Quick start

### 1. Install

```bash
npm install -g pnpm   # if not already installed
pnpm install
pnpm build
```

### 2. Configure

Copy the example config and edit it:

```bash
cp shapegrid.config.yml shapegrid.config.yml
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
pnpm generate -- --config shapegrid.config.yml
```

Or with CLI flags:

```bash
node packages/core/cli/dist/index.js generate \
  --user your-username \
  --token ghp_xxx \
  --count 365
```

Output goes to `dist/` — SVG, PNG, and JSON data files.

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

shapegrid includes a workflow (`.github/workflows/shapegrid.yml`) that:

1. **Triggers** on config changes, lockfile updates, or manual dispatch
2. **Fetches** contributions via GitHub GraphQL API
3. **Generates** the SVG grid + JSON data
4. **Copies** assets to `docs/` for GitHub Pages
5. **Deploys** to GitHub Pages automatically

### Setup

1. Create a GitHub PAT with `read:user` scope
2. Add it as a repository secret named `SHAPEGRID_TOKEN`
3. Enable GitHub Pages (Settings > Pages > Branch: `master`, Folder: `/docs`)
4. Push a change to `shapegrid.config.yml`

The workflow uses Node 22, pnpm 9, and the `actions/upload-pages-artifact` action.

---

## Project structure

```
shapegrid/
├── packages/
│   ├── core/              # Core library (@shapegrid/core)
│   │   ├── src/           #   - boundary.ts: polygon parsing, normalisation
│   │   │                  #   - grid.ts: binary-search grid generation
│   │   │                  #   - github.ts: GraphQL fetch, colour mapping
│   │   │                  #   - countries.ts: 40+ country polygons
│   │   └── cli/           # CLI tool (@shapegrid/cli)
│   │       └── src/       #   - index.ts: config loading, SVG generation
│   └── ...                #
├── web/                   # WebGL viewer (@shapegrid/web)
│   ├── src/               # Three.js interactive preview
│   ├── index.html         # App shell with sidebar controls
│   ├── styles.css         # Dark theme styles
│   └── vite.config.ts     # Vite build config
├── docs/                  # GitHub Pages output
├── dist/                  # Generated assets
├── shapegrid.config.yml   # Configuration file
└── pnpm-workspace.yaml    # Pnpm workspace definition
```

---

## Configuration

Full reference at [`shapegrid.config.yml`](./shapegrid.config.yml) in the repo root. Every option is documented inline with examples.

Key sections:

- **github** — username and token
- **boundary** — shape definition
- **grid** — type (square/hex), count, coverage threshold
- **camera** — yaw, pitch, zoom for isometric SVG rendering
- **theme** — palette, day border color, custom palettes
- **axes** — coordinate axes for geographic maps
- **render** — height scale, gap, background, boundary outline
- **dateRange** — last N days or explicit start/end
- **output** — filenames, dimensions, output directory

---

## Web viewer UI

The interactive web app at `web/index.html` provides:

- **Data tab** — GitHub credentials, date range picker (last N days, year selector, explicit range)
- **Boundary tab** — preset shapes, country search, file upload (GeoJSON/SVG)
- **Grid tab** — cell type, count, gap, coverage, camera controls
- **Render tab** — 12 colour palettes, custom palette editor, height scale, background, export settings

The viewer renders in real-time via Three.js WebGL. Export to PNG from the toolbar.

---

## License

GNU General Public License v3.0 — see [LICENSE](./LICENSE).

---

*shapegrid by [Wolren](https://github.com/Wolren)*
