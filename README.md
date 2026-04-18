# Tax Optimizer — Interactive Tax Simulation

A static single-page app that loads tax rules from a YAML file at runtime and
computes Federal + State (NY/GA) tax liability interactively.

**Stack:** Svelte · Vite · TypeScript · D3.js · js-yaml
**Deploy target:** GitHub Pages (no backend)

## Development

```bash
npm install
npm run dev        # → http://localhost:5173
```

## Build & Deploy

```bash
npm run build                          # outputs to /dist
VITE_BASE=/tax-talaivaa/ npm run build # for GitHub Pages subdirectory
npm run deploy                         # build + gh-pages -d dist
```

## Updating Tax Rules

Edit `public/tax-rules.yml` and redeploy — no code change needed.

The YAML is fetched at runtime, so for local dev you can edit the file and
hard-refresh the browser.

## Two-Prompt Workflow

1. **Prompt A** (this app) — renders and computes from `tax-rules.yml`
2. **Prompt B** — paste `src/lib/types/taxRules.ts` + IRS source text → Claude
   outputs a conforming `tax-rules.yml`

New tax law drops → paste source into Prompt B → drop output into `/public` → redeploy.
