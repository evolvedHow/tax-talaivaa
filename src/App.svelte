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

  // ── Input panel section definitions (by tax treatment) ────────────────────
  // Ordinary: taxed at regular brackets
  const S_ORDINARY    = ['wages_income','bonus','investment_income','short_term_capital_gains','business_income'];
  // Preferential: 0/15/20% LTCG rates
  const S_PREFERENTIAL = ['capital_gains','qualified_dividends'];
  // Passive/investment: ordinary rate, triggers NIIT
  const S_PASSIVE      = ['rental_income'];
  // Above-the-line adjustments (reduce gross → AGI)
  const S_ABOVE_LINE   = ['ira_contribution','has_workplace_plan'];
  // Itemized deductions (below-the-line, reduce AGI → taxable)
  const S_ITEMIZED     = ['state_local_tax','mortgage_interest','charitable_contributions'];
  // Credits & personal
  const S_CREDITS      = ['num_children','age'];
  // Tax settings
  const S_SETTINGS     = ['filing_status','state','federal_withheld','state_withheld'];

  function taxFreedomDate(totalTax: number, grossIncome: number, taxYear: number): string {
    if (grossIncome <= 0) return '—';
    const rate = Math.min(1, totalTax / grossIncome);
    const dayOfYear = Math.max(1, Math.round(rate * 365));
    return new Date(taxYear, 0, dayOfYear)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
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

  onMount(() => loadConfig(selectedConfig));
</script>

<svelte:head>
  <style>html, body { height: 100%; overflow: hidden; margin: 0; padding: 0; }</style>
</svelte:head>

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

        <!-- ── Header ──────────────────────────────────────────────────────── -->
        <header class="hdr">
          <div class="hdr-left">
            <span class="app-title">TAX TALAIVAA</span>
            <div class="hdr-field">
              <label class="hdr-lbl" for="cfg">Year</label>
              <select id="cfg" class="hdr-select" value={selectedConfig} on:change={onConfigChange}>
                {#each CONFIGS as c}<option value={c.id}>{c.label}</option>{/each}
              </select>
            </div>
          </div>
          <div class="hdr-stats">
            {#if result}
              {@const niit = result.surtaxes['niit'] ?? 0}
              {@const itemizedAmt = result.deductionBreakdown.total_itemized ?? 0}
              {@const dedDiff = itemizedAmt - result.standardDeduction}

              <div class="hs"><span class="hs-lbl">Gross</span><span class="hs-val">${Math.round(result.grossIncome).toLocaleString()}</span></div>
              <div class="hs-sep"></div>
              <div class="hs"><span class="hs-lbl">Total Tax</span><span class="hs-val hs-red">${Math.round(result.totalTax).toLocaleString()}</span></div>
              <div class="hs-sep"></div>
              <div class="hs">
                <span class="hs-lbl">Tax Free Day</span>
                <span class="hs-val">{taxFreedomDate(result.totalTax, result.grossIncome, rules.meta.tax_year)}</span>
              </div>
              <div class="hs-sep"></div>
              <div class="hs"><span class="hs-lbl">Federal</span><span class="hs-val">${Math.round(result.federalTax).toLocaleString()}</span></div>
              {#if result.stateTax + result.subJurisdictionTax > 0}
                <div class="hs-sep"></div>
                <div class="hs"><span class="hs-lbl">State</span><span class="hs-val">${Math.round(result.stateTax + result.subJurisdictionTax).toLocaleString()}</span></div>
              {/if}
              <div class="hs-sep"></div>
              <div class="hs"><span class="hs-lbl">Eff. Rate</span><span class="hs-val">{(result.effectiveTotalRate * 100).toFixed(1)}%</span></div>
              <div class="hs-sep"></div>
              <div class="hs"><span class="hs-lbl">Marginal</span><span class="hs-val">{(result.marginalRate * 100).toFixed(0)}%</span></div>
              <div class="hs-sep"></div>
              <div class="hs"><span class="hs-lbl">Take-home</span><span class="hs-val hs-green">${Math.round(result.grossIncome - result.totalTax).toLocaleString()}</span></div>
              <div class="hs-sep"></div>
              <!-- Deduction type + diff -->
              <div class="hs">
                <span class="hs-lbl">{result.deductionType === 'itemized' ? 'Itemizing' : 'Std. Ded.'}</span>
                <span class="hs-val" class:hs-green={result.deductionType === 'itemized'}>
                  ${Math.round(result.deductionType === 'itemized' ? itemizedAmt : result.standardDeduction).toLocaleString()}
                </span>
                {#if dedDiff > 0}
                  <span class="hs-diff hs-green">+${Math.round(dedDiff).toLocaleString()} vs std.</span>
                {:else if dedDiff < 0}
                  <span class="hs-diff hs-muted">${Math.round(-dedDiff).toLocaleString()} below std.</span>
                {/if}
              </div>
              <!-- NIIT -->
              {#if niit > 0}
                <div class="hs-sep"></div>
                <div class="hs">
                  <span class="hs-lbl">NIIT</span>
                  <span class="hs-val hs-red">${Math.round(niit).toLocaleString()}</span>
                  <span class="hs-diff hs-muted">{(rules.federal.surtaxes.niit.rate * 100).toFixed(1)}% on invest.</span>
                </div>
              {/if}
              <!-- SE Tax -->
              {#if result.seTax > 0}
                <div class="hs-sep"></div>
                <div class="hs">
                  <span class="hs-lbl">SE Tax (est.)</span>
                  <span class="hs-val hs-red">~${Math.round(result.seTax).toLocaleString()}</span>
                  <span class="hs-diff hs-muted">not in totals</span>
                </div>
              {/if}
              {#if result.federalWithheld > 0}
                {@const fo = result.federalOwed}
                <div class="hs-sep"></div>
                <div class="hs">
                  <span class="hs-lbl">Fed {fo >= 0 ? 'Owed' : 'Refund'}</span>
                  <span class="hs-val" class:hs-red={fo > 0} class:hs-green={fo < 0}>
                    {fo === 0 ? 'Even' : `$${Math.abs(Math.round(fo)).toLocaleString()}`}
                  </span>
                </div>
              {/if}
              {#if result.stateWithheld > 0}
                {@const so = result.stateOwed}
                <div class="hs-sep"></div>
                <div class="hs">
                  <span class="hs-lbl">State {so >= 0 ? 'Owed' : 'Refund'}</span>
                  <span class="hs-val" class:hs-red={so > 0} class:hs-green={so < 0}>
                    {so === 0 ? 'Even' : `$${Math.abs(Math.round(so)).toLocaleString()}`}
                  </span>
                </div>
              {/if}
            {/if}
          </div>
          <div class="hdr-right">
            {#if result}
              <button class="report-btn" on:click={() => showReport = true}>Full Report →</button>
            {/if}
          </div>
        </header>

        <!-- ── Chart area ──────────────────────────────────────────────────── -->
        <div class="chart-area">
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
        </div>

        <!-- ── Input panel ─────────────────────────────────────────────────── -->
        <div class="input-panel">

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

        </div>
      </div>
    {/if}
  {/if}
</main>

<style>
  :global(html, body) { height: 100%; overflow: hidden; margin: 0; padding: 0; }

  main { height: 100vh; overflow: hidden; background: #f1f5f9; font-family: inherit; }

  .loading { display: flex; align-items: center; justify-content: center;
             height: 100vh; font-size: 15px; color: #666; }
  .err { max-width: 560px; margin: 60px auto; padding: 24px; background: #fff;
         border-radius: 10px; border: 2px solid #ef4444; }
  .err h2 { color: #dc2626; margin-bottom: 12px; font-size: 16px; }
  .err pre { background: #fef2f2; padding: 10px; border-radius: 6px;
             font-size: 12px; white-space: pre-wrap; color: #7f1d1d; }

  /* ── Page layout: grid ───────────────────────────────────────────────────── */
  .page {
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: 50px 1fr;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .hdr {
    grid-column: 1 / -1;
    grid-row: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    height: 50px;
    padding-top: 2px;
    background: #EFEFEF;
    color: #1A1A1A;
    border-bottom: 1px solid #D8D8D8;
    z-index: 10;
  }
  .hdr-left { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .app-title { font-size: 15px; font-weight: 700; letter-spacing: 0.04em;
               white-space: nowrap; color: #1565C0; }

  .hdr-field { display: flex; align-items: center; gap: 5px; }
  .hdr-lbl { font-size: 10px; font-weight: 600; color: #757575;
             text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
  .hdr-select {
    padding: 3px 7px; border: 1px solid #C0C4CC; border-radius: 5px;
    font-size: 12px; font-family: inherit;
    background: #fff; color: #1A1A1A; cursor: pointer;
  }

  .hdr-stats {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }
  .hs { display: flex; flex-direction: column; align-items: center; padding: 0 10px; flex-shrink: 0; }
  .hs-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase;
            color: #757575; letter-spacing: 0.05em; white-space: nowrap; }
  .hs-val { font-size: 13px; font-weight: 700; color: #1A1A1A; white-space: nowrap; }
  .hs-diff { font-size: 9px; white-space: nowrap; font-weight: 500; }
  .hs-red   { color: #C62828; }
  .hs-green { color: #2E7D32; }
  .hs-muted { color: #9E9E9E; }
  .hs-sep { width: 1px; height: 26px; background: #D0D0D0; flex-shrink: 0; }

  .hdr-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .report-btn {
    padding: 4px 12px; background: #1976D2; color: #fff;
    border: none; border-radius: 4px; font-size: 12px;
    font-family: inherit; cursor: pointer; font-weight: 500;
    white-space: nowrap; transition: background 0.15s;
  }
  .report-btn:hover { background: #1565C0; }

  /* ── Chart area ──────────────────────────────────────────────────────────── */
  .chart-area {
    grid-column: 2;
    grid-row: 2;
    overflow: hidden;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .warnings-row { flex-shrink: 0; }

  .chart-card {
    background: #fff;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    flex-shrink: 0;
  }

  .sankey-card {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .sankey-card > :global(.flow-wrap) {
    flex: 1;
    min-height: 0;
  }

  .tips-card { flex-shrink: 0; }
  .budget-card { flex-shrink: 0; }

  .chart-footer {
    flex-shrink: 0;
    font-size: 10px;
    color: #BDBDBD;
    text-align: right;
    padding: 2px 2px 4px;
  }

  /* ── Sidebar (input panel) ───────────────────────────────────────────────── */
  .input-panel {
    grid-column: 1;
    grid-row: 2;
    background: #fff;
    box-shadow: 2px 0 8px rgba(0,0,0,0.08);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: #e0e0e0 transparent;
    display: flex;
    flex-direction: column;
    z-index: 5;
  }

  .sec {
    padding: 10px 14px;
    border-bottom: 1px solid #f0f0f0;
    border-left: 3px solid var(--c, #e5e7eb);
    box-sizing: border-box;
  }
  .sec:last-child { border-bottom: none; }

  .sec-hdr {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
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

  /* Report overlay */
  .report-overlay {
    height: 100vh; overflow-y: auto; background: #F5F5F5;
    padding: 20px; box-sizing: border-box;
  }
  .back-btn {
    display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px;
    padding: 6px 14px; background: #fff; border: 1px solid #ccc;
    border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px;
  }
  .back-btn:hover { background: #f5f5f5; }
</style>
