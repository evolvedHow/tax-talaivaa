# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # local dev server → http://localhost:5173
npm run build        # production build → /dist
npm run check        # svelte-check type checking
VITE_BASE=/tax-talaivaa/ npm run build   # GitHub Pages subdirectory build
npm run deploy       # build + push to gh-pages branch
```

## Architecture

This is a **static Svelte + Vite + TypeScript** app — no backend. All tax values live in `public/tax-rules.yml`, fetched at runtime via `js-yaml`.

### Data flow

```
/public/tax-rules.yml
  → fetched + validated in App.svelte onMount
  → rulesStore (writable)
  → initScenario() seeds scenarioStore from levers[].default
  → resultStore (derived) re-runs interpreter on any change
  → components read resultStore reactively
```

### Key invariant: zero hardcoded tax values

`src/lib/engine/interpreter.ts` is a **pure interpreter** — every number it uses comes from the parsed `TaxRules` object. Adding a bracket, changing a rate, or adding a state only requires editing the YAML.

### YAML ↔ TypeScript contract

`src/lib/types/taxRules.ts` defines `TaxRules` and `TaxResult`. This is the schema contract for both the app (consumer) and the YAML generator (Prompt B workflow). When you change the interface, update the YAML and the interpreter together.

### Store architecture

| Store | Type | Purpose |
|---|---|---|
| `rulesStore` | `writable<TaxRules\|null>` | Populated once on YAML fetch |
| `scenarioStore` | `writable<ScenarioInputs>` | Lever values keyed by `lever.id` |
| `resultStore` | `derived` | Re-runs `interpret()` on any change |

### Controls are fully dynamic

`Controls.svelte` renders lever inputs purely from `rules.levers[]`. Adding a lever to the YAML automatically adds it to the UI. Lever types: `slider`, `integer`, `toggle`, `dropdown`.

### D3 usage pattern

D3 handles **math and scales only** — Svelte owns all DOM mutations. D3 selections operate on the `<svg>` element via `bind:this`, called from `onMount` + `afterUpdate`. Never use D3 to manage component lifecycle.

### Visualizations

- **TaxStack** — vertical stacked bar: deductions + bracket segments (federal) vs state bar
- **Waterfall** — horizontal waterfall: gross income → deductions → taxable income
- **RateGauge** — D3 arc gauge (speedometer) for effective/marginal rates

### Print report

`ReportView.svelte` produces a 4-page print layout. Triggered by "Generate Report" button in App.svelte. Optimization suggestions in Page 4 are computed from `TaxResult` deltas via `generateSuggestions()` in `interpreter.ts` — not AI-generated.

### State tax

State rules live under `states.[STATE_CODE]` in the YAML. Supports:
- `brackets` (by filing status)
- `flat_rate`
- `sub_jurisdictions` (e.g. NYC, gated on a lever toggle)

### GitHub Pages deploy

Set `VITE_BASE` env var to the repo subdirectory path (e.g. `/tax-talaivaa/`) before building. The `public/` directory copies into `dist/` automatically — `tax-rules.yml` is always available at `/tax-rules.yml` relative to the base.
