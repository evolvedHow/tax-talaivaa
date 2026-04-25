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

  const CONFIGS = [
    { id: 'tax-2025', label: '2025' },
    { id: 'tax-2024', label: '2024' },
  ];

  let selectedConfig = 'tax-2025';
  let showReport = false;
  let userName = 'Vish';

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
  const S_CREDITS      = ['num_children','age','over_65','iso_options_exercised','has_amt_preference_items'];
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
            <div class="hdr-field">
              <label class="hdr-lbl" for="uname">Name</label>
              <input id="uname" class="hdr-input" type="text" bind:value={userName}
                     placeholder="Your name" maxlength="30" />
            </div>
          </div>
          <div class="hdr-stats">
            {#if result}
              <div class="hs"><span class="hs-lbl">Gross</span><span class="hs-val">${Math.round(result.grossIncome).toLocaleString()}</span></div>
              <div class="hs-sep"></div>
              <div class="hs"><span class="hs-lbl">Total Tax</span><span class="hs-val hs-red">${Math.round(result.totalTax).toLocaleString()}</span></div>
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
            {/if}
          </div>
          <div class="hdr-right">
            <span class="disclaimer">⚠ Estimates only — not tax advice</span>
            {#if result}
              <button class="report-btn" on:click={() => showReport = true}>Report →</button>
            {/if}
          </div>
        </header>

        <!-- ── Chart area ──────────────────────────────────────────────────── -->
        <div class="chart-area">
          {#if result}
            {#if result.warnings.length > 0}
              <div class="warnings-row"><Overlays warnings={result.warnings} /></div>
            {/if}

            <div class="banner">
              <span class="b-name">{userName || 'Hey'}</span>, your taxes are
              <strong class="b-tax">${Math.round(result.totalTax).toLocaleString()}</strong>
              — you worked until
              <strong class="b-date">{taxFreedomDate(result.totalTax, result.grossIncome, rules.meta.tax_year)}</strong>
              to pay them.
              <span class="b-ded">
                {result.deductionType === 'itemized' ? 'Itemized deductions' : 'Standard deduction'}:
                ${Math.round(result.deductionAmount).toLocaleString()}
              </span>
            </div>

            <div class="chart-card">
              <Sankey {result} {scenario} />
            </div>

            <div class="chart-card">
              <BudgetBar federalTax={result.federalTax} taxYear={rules.meta.tax_year} />
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
            <Controls levers={rules.levers.filter(l => S_ORDINARY.includes(l.id))} {scenario} />
          </div>

          <!-- CAPITAL & PREFERENTIAL -->
          <div class="sec" style="--c:#8b5cf6">
            <div class="sec-hdr">
              <span class="sec-title">Capital &amp; Preferential</span>
              <span class="sec-tag">0 / 15 / 20%</span>
            </div>
            <Controls levers={rules.levers.filter(l => S_PREFERENTIAL.includes(l.id))} {scenario} />
          </div>

          <!-- PASSIVE / INVESTMENT -->
          <div class="sec sec-narrow" style="--c:#0d9488">
            <div class="sec-hdr">
              <span class="sec-title">Passive / Rental</span>
              <span class="sec-tag">ordinary + NIIT</span>
            </div>
            <Controls levers={rules.levers.filter(l => S_PASSIVE.includes(l.id))} {scenario} />
          </div>

          <!-- DEDUCTIONS -->
          <div class="sec" style="--c:#16a34a">
            <div class="sec-hdr">
              <span class="sec-title">Deductions</span>
            </div>
            <p class="sub-hdr">Above the line</p>
            <Controls levers={rules.levers.filter(l => S_ABOVE_LINE.includes(l.id))} {scenario} />
            <p class="sub-hdr">Itemized</p>
            <Controls levers={rules.levers.filter(l => S_ITEMIZED.includes(l.id))} {scenario} />
          </div>

          <!-- CREDITS & PERSONAL -->
          <div class="sec" style="--c:#f59e0b">
            <div class="sec-hdr">
              <span class="sec-title">Credits &amp; Personal</span>
            </div>
            <Controls levers={rules.levers.filter(l => S_CREDITS.includes(l.id))} {scenario} />
          </div>

          <!-- TAX SETTINGS -->
          <div class="sec" style="--c:#64748b">
            <div class="sec-hdr">
              <span class="sec-title">Tax Settings</span>
            </div>
            <Controls levers={rules.levers.filter(l => S_SETTINGS.includes(l.id))} {scenario} />
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

  /* ── Page layout: header / chart / panel ─────────────────────────────────── */
  .page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .hdr {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    height: 46px;
    background: #1A1A1A;
    color: #fff;
  }
  .hdr-left { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .app-title { font-size: 15px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; }

  .hdr-field { display: flex; align-items: center; gap: 5px; }
  .hdr-lbl { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;
             letter-spacing: 0.06em; white-space: nowrap; }
  .hdr-select, .hdr-input {
    padding: 3px 7px; border: 1px solid #444; border-radius: 5px;
    font-size: 12px; font-family: inherit; background: #2a2a2a; color: #fff;
  }
  .hdr-select { cursor: pointer; }
  .hdr-input { width: 90px; }
  .hdr-input:focus { outline: none; border-color: #3b82f6; }

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
  .hs-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; color: #888;
            letter-spacing: 0.05em; white-space: nowrap; }
  .hs-val { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; }
  .hs-red   { color: #f87171; }
  .hs-green { color: #4ade80; }
  .hs-sep { width: 1px; height: 22px; background: #333; flex-shrink: 0; }

  .hdr-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .disclaimer { font-size: 10px; color: #666; white-space: nowrap; }
  .report-btn {
    padding: 5px 14px; background: #2563eb; color: #fff;
    border: none; border-radius: 5px; font-size: 12px;
    font-family: inherit; cursor: pointer; font-weight: 500;
    white-space: nowrap; transition: background 0.15s;
  }
  .report-btn:hover { background: #1d4ed8; }

  /* ── Chart area ──────────────────────────────────────────────────────────── */
  .chart-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .warnings-row { flex-shrink: 0; }

  .banner {
    flex-shrink: 0;
    background: #fff;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 14px;
    color: #333;
    line-height: 1.5;
    border-left: 4px solid #2563eb;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .b-name { font-weight: 700; color: #1A1A1A; }
  .b-tax  { color: #dc2626; }
  .b-date { color: #2563eb; }
  .b-ded  { margin-left: 8px; font-size: 12px; color: #666; border-left: 1px solid #e5e7eb;
            padding-left: 8px; }

  .chart-card {
    background: #fff;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  /* ── Input panel ─────────────────────────────────────────────────────────── */
  .input-panel {
    flex-shrink: 0;
    display: flex;
    height: clamp(220px, 38vh, 340px);
    border-top: 2px solid #e2e8f0;
    background: #fff;
    overflow: hidden;
  }

  .sec {
    flex: 1;
    min-width: 160px;
    padding: 10px 12px;
    border-right: 1px solid #e5e7eb;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: #e5e7eb transparent;
    box-sizing: border-box;
    border-top: 3px solid var(--c, #e5e7eb);
  }
  .sec:last-child { border-right: none; }
  .sec-narrow { flex: 0.6; min-width: 130px; }

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
