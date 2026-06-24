<script lang="ts">
  import { onMount } from 'svelte';
  import yaml from 'js-yaml';
  import type { TaxRules } from './lib/types/taxRules';
  import { rulesStore, rulesError, rulesLoading } from './lib/stores/rules';
  import { scenarioStore, initScenario, updateLever } from './lib/stores/scenario';
  import { resultStore } from './lib/stores/result';
  import Controls from './lib/components/Controls.svelte';
  import Overlays from './lib/components/Overlays.svelte';
  import ReportView from './lib/components/ReportView.svelte';
  import Sankey from './lib/components/Sankey.svelte';
  import BudgetBar from './lib/components/BudgetBar.svelte';
  import TaxTips from './lib/components/TaxTips.svelte';

  const CONFIGS = [
    { id: 'tax-2025', label: '2025' },
    { id: 'tax-2024', label: '2024' },
  ];

  let selectedConfig = 'tax-2025';
  let showReport = false;
  let activeTab: 'simulate' | 'charts' = 'simulate';

  // ── Input panel section definitions (by tax treatment) ────────────────────
  const S_ORDINARY     = ['wages_income','bonus','investment_income','short_term_capital_gains','business_income'];
  const S_PREFERENTIAL = ['capital_gains','qualified_dividends'];
  const S_PASSIVE      = ['rental_income'];
  const S_ABOVE_LINE   = ['ira_contribution','has_workplace_plan'];
  const S_ITEMIZED     = ['state_local_tax','mortgage_interest','charitable_contributions'];
  const S_CREDITS      = ['num_children','age'];
  const S_SETTINGS     = ['filing_status','state','federal_withheld','state_withheld'];

  function taxFreedomDate(totalTax: number, grossIncome: number, taxYear: number): string {
    if (grossIncome <= 0) return '—';
    const rate = Math.min(1, totalTax / grossIncome);
    const dayOfYear = Math.max(1, Math.round(rate * 365));
    return new Date(taxYear, 0, dayOfYear)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function validateRules(raw: unknown): TaxRules {
    const r = raw as Record<string, unknown>;
    const missing = ['meta', 'federal', 'levers', 'states'].filter(k => !(k in r));
    if (missing.length > 0) throw new Error(`tax rules YAML missing: ${missing.join(', ')}`);
    const federal = r['federal'] as Record<string, unknown>;
    const fedMissing = ['standard_deduction', 'brackets', 'capital_gains', 'ira', 'credits', 'surtaxes', 'warnings'].filter(k => !(k in federal));
    if (fedMissing.length > 0) throw new Error(`federal section missing: ${fedMissing.join(', ')}`);
    return raw as TaxRules;
  }

  async function loadConfig(configId: string) {
    rulesLoading.set(true);
    rulesError.set(null);
    rulesStore.set(null);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}tax-configs/${configId}.yml`);
      if (!resp.ok) throw new Error(`Failed to load ${configId}.yml: HTTP ${resp.status}`);
      const text = await resp.text();
      const rules = validateRules(yaml.load(text));
      rulesStore.set(rules);
      initScenario(rules);
    } catch (e: unknown) {
      rulesError.set(e instanceof Error ? e.message : String(e));
    } finally {
      rulesLoading.set(false);
    }
  }

  function onConfigChange(e: Event) {
    selectedConfig = (e.target as HTMLSelectElement).value;
    loadConfig(selectedConfig);
  }

  function fmtDollars(n: number) { return `$${Math.round(n).toLocaleString()}`; }

  onMount(() => loadConfig(selectedConfig));
</script>

<main>
  {#if $rulesLoading}
    <div class="loading">Loading tax rules…</div>

  {:else if $rulesError}
    <div class="err"><h2>Failed to load tax rules</h2><pre>{$rulesError}</pre></div>

  {:else if $rulesStore}
    {@const rules = $rulesStore}
    {@const scenario = $scenarioStore}
    {@const result = $resultStore}

    {#if showReport && result}
      <div class="report-overlay">
        <button class="back-btn" on:click={() => showReport = false}>← Back to Simulator</button>
        <ReportView {rules} {result} {scenario} />
      </div>
    {:else}
      <div class="page">

        <!-- ── Header (top bar) ─────────────────────────────────────────────── -->
        <header class="hdr">
          <div class="hdr-brand">
            <span class="app-title">TAX TALAIVAA</span>
            <div class="hdr-field">
              <label class="hdr-lbl" for="cfg">Year</label>
              <select id="cfg" class="hdr-select" value={selectedConfig} on:change={onConfigChange}>
                {#each CONFIGS as c}<option value={c.id}>{c.label}</option>{/each}
              </select>
            </div>
          </div>
          {#if result}
            <button class="report-btn" on:click={() => showReport = true}>
              <span class="report-btn-full">Full Report →</span>
              <span class="report-btn-short">Report</span>
            </button>
          {/if}
        </header>

        <!-- ── Sticky results card ──────────────────────────────────────────── -->
        {#if result}
          {@const niit = result.surtaxes['niit'] ?? 0}
          {@const itemizedAmt = result.deductionBreakdown.total_itemized ?? 0}
          {@const dedDiff = itemizedAmt - result.standardDeduction}
          {@const stateTotal = result.stateTax + result.subJurisdictionTax}

          <div class="results-card">
            <div class="stats-grid">
              <!-- Tier 1: always shown -->
              <div class="stat stat-primary">
                <span class="s-lbl">Total Tax</span>
                <span class="s-val s-red">{fmtDollars(result.totalTax)}</span>
              </div>
              <div class="stat stat-primary">
                <span class="s-lbl">Take-home</span>
                <span class="s-val s-green">{fmtDollars(result.grossIncome - result.totalTax)}</span>
              </div>
              <div class="stat stat-primary">
                <span class="s-lbl">Eff. Rate</span>
                <span class="s-val">{(result.effectiveTotalRate * 100).toFixed(1)}%</span>
              </div>
              <div class="stat stat-primary">
                <span class="s-lbl">Marginal</span>
                <span class="s-val">{(result.marginalRate * 100).toFixed(0)}%</span>
              </div>

              <!-- Tier 2: shown when space allows -->
              <div class="stat stat-secondary">
                <span class="s-lbl">Gross</span>
                <span class="s-val">{fmtDollars(result.grossIncome)}</span>
              </div>
              <div class="stat stat-secondary">
                <span class="s-lbl">Federal</span>
                <span class="s-val">{fmtDollars(result.federalTax)}</span>
              </div>
              {#if stateTotal > 0}
                <div class="stat stat-secondary">
                  <span class="s-lbl">State</span>
                  <span class="s-val">{fmtDollars(stateTotal)}</span>
                </div>
              {/if}
              <div class="stat stat-secondary">
                <span class="s-lbl">Tax Free Day</span>
                <span class="s-val">{taxFreedomDate(result.totalTax, result.grossIncome, rules.meta.tax_year)}</span>
              </div>
              <div class="stat stat-secondary">
                <span class="s-lbl">{result.deductionType === 'itemized' ? 'Itemizing' : 'Std. Ded.'}</span>
                <span class="s-val" class:s-green={result.deductionType === 'itemized'}>
                  {fmtDollars(result.deductionType === 'itemized' ? itemizedAmt : result.standardDeduction)}
                </span>
                {#if dedDiff > 0}
                  <span class="s-diff s-green">+{fmtDollars(dedDiff)} vs std.</span>
                {:else if dedDiff < 0}
                  <span class="s-diff s-muted">{fmtDollars(-dedDiff)} below std.</span>
                {/if}
              </div>
              {#if niit > 0}
                <div class="stat stat-secondary">
                  <span class="s-lbl">NIIT</span>
                  <span class="s-val s-red">{fmtDollars(niit)}</span>
                </div>
              {/if}
              {#if result.seTax > 0}
                <div class="stat stat-secondary">
                  <span class="s-lbl">SE Tax (est.)</span>
                  <span class="s-val s-red">~{fmtDollars(result.seTax)}</span>
                </div>
              {/if}
              {#if result.federalWithheld > 0}
                {@const fo = result.federalOwed}
                <div class="stat stat-secondary">
                  <span class="s-lbl">Fed {fo >= 0 ? 'Owed' : 'Refund'}</span>
                  <span class="s-val" class:s-red={fo > 0} class:s-green={fo < 0}>
                    {fo === 0 ? 'Even' : `$${Math.abs(Math.round(fo)).toLocaleString()}`}
                  </span>
                </div>
              {/if}
              {#if result.stateWithheld > 0}
                {@const so = result.stateOwed}
                <div class="stat stat-secondary">
                  <span class="s-lbl">State {so >= 0 ? 'Owed' : 'Refund'}</span>
                  <span class="s-val" class:s-red={so > 0} class:s-green={so < 0}>
                    {so === 0 ? 'Even' : `$${Math.abs(Math.round(so)).toLocaleString()}`}
                  </span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- ── Tabs (mobile only) ───────────────────────────────────────────── -->
        <div class="tab-bar">
          <button
            class="tab-btn"
            class:active={activeTab === 'simulate'}
            on:click={() => activeTab = 'simulate'}
          >Simulate</button>
          <button
            class="tab-btn"
            class:active={activeTab === 'charts'}
            on:click={() => activeTab = 'charts'}
          >Charts</button>
        </div>

        <!-- ── Main content area ────────────────────────────────────────────── -->
        <div class="content">

          <!-- Controls / Simulate panel -->
          <section class="panel panel-controls" class:hidden-mobile={activeTab !== 'simulate'}>
            <!-- ORDINARY INCOME -->
            <div class="sec" style="--c:#3b82f6">
              <div class="sec-hdr">
                <span class="sec-title">Ordinary Income</span>
                <span class="sec-tag">brackets 10–37%</span>
              </div>
              <Controls levers={rules.levers.filter(l => S_ORDINARY.includes(l.id))} {scenario} compact={true} />
            </div>

            <!-- CAPITAL & PREFERENTIAL -->
            <div class="sec" style="--c:#8b5cf6">
              <div class="sec-hdr">
                <span class="sec-title">Capital &amp; Preferential</span>
                <span class="sec-tag">0 / 15 / 20%</span>
              </div>
              <Controls levers={rules.levers.filter(l => S_PREFERENTIAL.includes(l.id))} {scenario} compact={true} />
            </div>

            <!-- PASSIVE / INVESTMENT -->
            <div class="sec" style="--c:#0d9488">
              <div class="sec-hdr">
                <span class="sec-title">Passive / Rental</span>
                <span class="sec-tag">ordinary + NIIT</span>
              </div>
              <Controls levers={rules.levers.filter(l => S_PASSIVE.includes(l.id))} {scenario} compact={true} />
            </div>

            <!-- DEDUCTIONS -->
            <div class="sec" style="--c:#16a34a">
              <div class="sec-hdr">
                <span class="sec-title">Deductions</span>
              </div>
              <p class="sub-hdr">Above the line</p>
              <Controls levers={rules.levers.filter(l => S_ABOVE_LINE.includes(l.id))} {scenario} compact={true} />
              <p class="sub-hdr">Itemized</p>
              <Controls levers={rules.levers.filter(l => S_ITEMIZED.includes(l.id))} {scenario} compact={true} />
            </div>

            <!-- CREDITS & PERSONAL -->
            <div class="sec" style="--c:#f59e0b">
              <div class="sec-hdr">
                <span class="sec-title">Credits &amp; Personal</span>
              </div>
              <Controls levers={rules.levers.filter(l => S_CREDITS.includes(l.id))} {scenario} compact={true} />
            </div>

            <!-- TAX SETTINGS -->
            <div class="sec" style="--c:#64748b">
              <div class="sec-hdr">
                <span class="sec-title">Tax Settings</span>
              </div>
              <Controls levers={rules.levers.filter(l => S_SETTINGS.includes(l.id))} {scenario} compact={true} />
              {#if rules.states[String(scenario.state ?? 'none')]?.sub_jurisdictions}
                <div class="inline-lever">
                  <label class="lever-label" for="sub-j">Sub-Jurisdiction</label>
                  <select id="sub-j"
                    value={String(scenario.sub_jurisdiction ?? 'none')}
                    on:change={(e) => updateLever('sub_jurisdiction', e.currentTarget.value)}
                  >
                    <option value="none">None</option>
                    {#each Object.keys(rules.states[String(scenario.state ?? 'none')]?.sub_jurisdictions ?? {}) as key}
                      <option value={key}>{key}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
          </section>

          <!-- Charts panel -->
          <section class="panel panel-charts" class:hidden-mobile={activeTab !== 'charts'}>
            {#if result}
              {#if result.warnings.length > 0}
                <div class="warnings-row"><Overlays warnings={result.warnings} /></div>
              {/if}

              <div class="chart-card sankey-card">
                <Sankey {result} {scenario} />
              </div>

              <div class="chart-card tips-card">
                <TaxTips {rules} {result} {scenario} />
              </div>

              <div class="chart-card budget-card">
                <BudgetBar federalTax={result.federalTax} taxYear={rules.meta.tax_year} />
              </div>

              <div class="chart-footer">
                ⚠ Estimates only — not tax advice. Numbers are approximations for scenario planning; consult a tax professional for filing.
              </div>
            {:else}
              <div class="loading">Computing…</div>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  {/if}
</main>

<style>
  :global(html, body) {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  :global(body) {
    overscroll-behavior: none;
    -webkit-text-size-adjust: 100%;
  }

  main {
    height: 100vh;
    height: 100dvh;
    background: #f1f5f9;
    font-family: inherit;
    overflow: hidden;
  }

  .loading {
    display: flex; align-items: center; justify-content: center;
    height: 100%; font-size: 15px; color: #666;
  }
  .err {
    max-width: 560px; margin: 60px auto; padding: 24px; background: #fff;
    border-radius: 10px; border: 2px solid #ef4444;
  }
  .err h2 { color: #dc2626; margin-bottom: 12px; font-size: 16px; }
  .err pre {
    background: #fef2f2; padding: 10px; border-radius: 6px;
    font-size: 12px; white-space: pre-wrap; color: #7f1d1d;
  }

  /* ── Page shell ─────────────────────────────────────────────────────────── */
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    height: 46px;
    flex-shrink: 0;
    background: #EFEFEF;
    color: #1A1A1A;
    border-bottom: 1px solid #D8D8D8;
    z-index: 10;
  }
  .hdr-brand {
    display: flex; align-items: center; gap: 12px;
    min-width: 0; flex-shrink: 1;
  }
  .app-title {
    font-size: 15px; font-weight: 700; letter-spacing: 0.04em;
    white-space: nowrap; color: #1565C0;
  }
  .hdr-field { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .hdr-lbl {
    font-size: 10px; font-weight: 600; color: #757575;
    text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
  }
  .hdr-select {
    padding: 3px 7px; border: 1px solid #C0C4CC; border-radius: 5px;
    font-size: 12px; font-family: inherit;
    background: #fff; color: #1A1A1A; cursor: pointer;
  }
  .report-btn {
    padding: 5px 12px; background: #1976D2; color: #fff;
    border: none; border-radius: 5px; font-size: 12px;
    font-family: inherit; font-weight: 500; cursor: pointer;
    white-space: nowrap; flex-shrink: 0;
    transition: background 0.15s;
  }
  .report-btn:hover { background: #1565C0; }
  .report-btn-short { display: none; }

  /* ── Results card ───────────────────────────────────────────────────────── */
  .results-card {
    flex-shrink: 0;
    background: #fff;
    border-bottom: 1px solid #E5E7EB;
    padding: 8px 14px;
    z-index: 9;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 10px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 2px 0;
    min-width: 0;
  }
  .s-lbl {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    color: #757575; letter-spacing: 0.05em; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }
  .s-val {
    font-size: 14px; font-weight: 700; color: #1A1A1A;
    white-space: nowrap; line-height: 1.2;
    overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }
  .s-diff {
    font-size: 9px; white-space: nowrap; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }
  .s-red   { color: #C62828; }
  .s-green { color: #2E7D32; }
  .s-muted { color: #9E9E9E; }

  /* ── Tab bar (mobile) ───────────────────────────────────────────────────── */
  .tab-bar {
    display: flex;
    flex-shrink: 0;
    background: #fff;
    border-bottom: 1px solid #E5E7EB;
    z-index: 8;
  }
  .tab-btn {
    flex: 1;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #757575;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-btn.active {
    color: #1565C0;
    border-bottom-color: #1565C0;
  }

  /* ── Content area ───────────────────────────────────────────────────────── */
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .panel {
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: #e0e0e0 transparent;
    min-height: 0;
  }

  /* Controls panel (mobile: full width when active) */
  .panel-controls {
    flex: 1;
    background: #fff;
    display: flex;
    flex-direction: column;
  }

  /* Charts panel (mobile: full width when active) */
  .panel-charts {
    flex: 1;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
  }

  /* On mobile, only the active panel is shown */
  .hidden-mobile { display: none; }

  /* ── Sections within controls panel ─────────────────────────────────────── */
  .sec {
    padding: 10px 14px;
    border-bottom: 1px solid #f0f0f0;
    border-left: 3px solid var(--c, #e5e7eb);
    box-sizing: border-box;
  }
  .sec:last-child { border-bottom: none; }

  .sec-hdr {
    display: flex; align-items: baseline; gap: 6px;
    margin-bottom: 8px; flex-wrap: wrap;
  }
  .sec-title {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--c, #1A1A1A);
  }
  .sec-tag {
    font-size: 9px; color: #aaa;
    background: #f1f5f9; border-radius: 3px;
    padding: 1px 5px;
  }

  .sub-hdr {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: #aaa;
    margin: 8px 0 4px; padding: 0;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 3px;
  }

  .inline-lever { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; }
  .lever-label { font-size: 11px; font-weight: 500; color: #1A1A1A; }
  .inline-lever select {
    width: 100%; padding: 5px 8px; border: 1px solid #d1d5db;
    border-radius: 5px; font-size: 12px; font-family: inherit;
    background: #fff; cursor: pointer;
  }

  /* ── Chart cards ────────────────────────────────────────────────────────── */
  .warnings-row { flex-shrink: 0; }
  .chart-card {
    background: #fff;
    border-radius: 10px;
    padding: 12px 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .sankey-card {
    flex: 1;
    min-height: 320px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .sankey-card :global(.flow-wrap) { flex: 1; min-height: 0; }
  .tips-card, .budget-card { flex-shrink: 0; }
  .chart-footer {
    flex-shrink: 0;
    font-size: 10px;
    color: #9CA3AF;
    text-align: center;
    padding: 4px 2px 8px;
    line-height: 1.4;
  }

  /* ── Report overlay ─────────────────────────────────────────────────────── */
  .report-overlay {
    height: 100%;
    overflow-y: auto;
    background: #F5F5F5;
    padding: 16px;
    box-sizing: border-box;
  }
  .back-btn {
    display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px;
    padding: 6px 14px; background: #fff; border: 1px solid #ccc;
    border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px;
  }
  .back-btn:hover { background: #f5f5f5; }

  /* ── Responsive: small screens ──────────────────────────────────────────── */
  @media (max-width: 599px) {
    .app-title { font-size: 13px; }
    .hdr { padding: 0 10px; gap: 8px; }
    .hdr-lbl { display: none; }
    .report-btn { padding: 5px 10px; }
    .report-btn-full { display: none; }
    .report-btn-short { display: inline; }

    .results-card { padding: 6px 10px; }
    .stats-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 4px 8px;
    }
    .s-lbl { font-size: 8px; }
    .s-val { font-size: 12px; }
    .s-diff { display: none; }

    /* Hide tier-2 stats on tiny screens to keep card compact */
    .stat-secondary { display: none; }

    .panel-charts { padding: 8px 10px; gap: 8px; }
    .chart-card { padding: 10px 12px; border-radius: 8px; }
    .sankey-card { min-height: 280px; }

    .sec { padding: 10px 12px; }
  }

  /* ── Responsive: medium (tablet-ish, still mobile layout) ───────────────── */
  @media (min-width: 600px) and (max-width: 899px) {
    .stats-grid {
      grid-template-columns: repeat(6, 1fr);
    }
  }

  /* ── Responsive: desktop (≥900px) — two-column layout ───────────────────── */
  @media (min-width: 900px) {
    .tab-bar { display: none; }

    .content {
      flex-direction: row;
    }

    .panel-controls {
      flex: 0 0 300px;
      max-width: 320px;
      border-right: 1px solid #E5E7EB;
      box-shadow: 2px 0 8px rgba(0,0,0,0.04);
    }

    .panel-charts {
      flex: 1;
      padding: 12px 16px;
    }

    /* Show both panels regardless of which tab is "active" */
    .hidden-mobile { display: flex; }
    .panel-controls.hidden-mobile { display: flex; flex-direction: column; }

    .stats-grid {
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: 4px 16px;
    }
    .s-val { font-size: 13px; }
    .results-card { padding: 8px 16px; }

    .hdr { padding: 0 16px; height: 50px; }
  }

  /* ── Responsive: large desktop ──────────────────────────────────────────── */
  @media (min-width: 1280px) {
    .stats-grid {
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    }
  }
</style>
