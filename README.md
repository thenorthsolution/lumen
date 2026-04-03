# Lumen

**Open tools for the Dutch housing crisis — built by [North Solution](https://thenorthsolution.com)**

Three free, open-source spatial tools that address the visibility and coordination failures at the core of the Netherlands housing shortage. No account required. No paywall. MIT licensed.

---

## Tools

| Tool                    | URL                    | What it does                                                                       |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| **leegstandsradar**     | leegstandsradar.nl     | Maps vacant and underused buildings with a viability filter for housing conversion |
| **ruimtevinden**        | ruimtevinden.nl        | Identifies underused and buildable land for new housing                            |
| **bouwcapaciteitcheck** | bouwcapaciteitcheck.nl | Shows regional construction pipeline activity and capacity bottlenecks             |

All tools default to Deventer (our proof-of-concept municipality) and are switchable to any Dutch gemeente.

---

## Background

These tools accompany a research paper by North Solution:  
**"De Woningcrisis is Geen Schaarsteprobleem — Het is een Zichtbaarheidsprobleem"**

The thesis: the Dutch housing crisis is primarily a visibility and coordination failure, not a pure scarcity problem. Space exists but is invisible. Vacancy is undercounted. Construction capacity is unconfident. These tools make those failures legible.

Read the full paper at [thenorthsolution.com](https://thenorthsolution.com).

---

## Getting started

**Requirements:** Node.js ≥ 20, npm ≥ 10

```bash
# Clone the repo
git clone https://github.com/thenorthsolution/lumen.git
cd lumen

# Install dependencies
npm install

# Start all tools in development mode
npm run dev
```

Individual tools run on:

- Lumen Vacancy: http://localhost:3001
- Lumen Space: http://localhost:3002
- Lumen Pipeline: http://localhost:3003

---

## Architecture

```
lumen/
├── apps/
│   ├── vacancy/         # Next.js 15 + MapLibre GL
│   ├── space/           # Next.js 15 + MapLibre GL
│   └── pipeline/        # Next.js 15 + D3/Chart.js
├── packages/
│   ├── pdok-client/            # Typed PDOK WFS + tile helpers
│   └── bag-utils/              # BAG status codes + viability model
└── pipeline/                   # Python + DuckDB data pipeline
```

**Stack:**

- Frontend: Next.js 15 (App Router), TypeScript, CSS Modules
- Maps: MapLibre GL JS (WebGL vector tiles, zero licensing cost)
- Geodata: PDOK WFS/WMS (public, no key), CBS Statline, TenderNed
- Shared packages: Turborepo monorepo
- Data pipeline: Python + DuckDB (reproducible, single-command)
- Deployment: Vercel (apps) + Cloudflare (tiles)

All data sources are free and open. The full stack runs without any API keys or paid services.

---

## Data sources

| Source                     | Used by                       | License |
| -------------------------- | ----------------------------- | ------- |
| BAG (PDOK)                 | leegstandsradar, ruimtevinden | CC0     |
| Bestemmingsplan (RO)       | ruimtevinden                  | Open    |
| Kadastrale percelen (PDOK) | ruimtevinden                  | Open    |
| TenderNed                  | bouwcapaciteitcheck           | Open    |
| CBS Statline               | bouwcapaciteitcheck           | CC0     |
| Omgevingsloket             | bouwcapaciteitcheck           | Open    |

---

## Contributing

Contributions are welcome and genuinely needed. The highest-value areas:

**Data quality**

- Reporting misclassified objects via the in-app flag button
- Expanding the gemeente registry (`packages/pdok-client/src/gemeente.ts`)
- Improving the viability scoring model (`packages/bag-utils/src/viability.ts`)

**Code**

- Adding WOZ data integration for improved scoring accuracy
- Building the `ruimtevinden` and `bouwcapaciteitcheck` apps
- Improving mobile responsiveness

**Research**

- Validating viability scores against real conversion projects
- Extending methodology to include nitrogen proximity signals
- Adding doorstroming (housing flow) analysis

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, code standards, and the PR process.

---

## Methodology

Each tool has a `TOOL.md` file with:

- Full data source documentation
- Scoring model rationale and limitations
- Known data quality gaps
- How to report errors

The viability scoring model (`packages/bag-utils`) is intentionally exported as a standalone, unit-tested module so it can be critiqued, forked, and improved independently.

---

## License

MIT — see [LICENSE](LICENSE)

Data used: BAG (CC0), CBS (CC0), TenderNed (open), PDOK (open).

---

_Built by [North Solution](https://thenorthsolution.com) — Deventer, Netherlands_
