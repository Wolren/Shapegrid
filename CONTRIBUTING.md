# Contributing to shapegrid

shapegrid is a personal project by Wolren. Issues and PRs are welcome but may be triaged at maintainer discretion.

## Getting started

```bash
pnpm install
pnpm build
pnpm dev:web     # interactive viewer
pnpm generate    # generate via CLI
```

## Project structure

```
packages/core/     — @shapegrid/core: boundary parsing, grid generation, GitHub API
packages/core/cli/ — @shapegrid/cli: CLI tool + SVG renderer
web/               — @shapegrid/web: Three.js interactive viewer
```

## Pull requests

- Keep changes focused
- Run `pnpm build` before committing
- Update the README if you add config options
- No em dashes in prose

## License

GPL-3.0 — see [LICENSE](LICENSE)
