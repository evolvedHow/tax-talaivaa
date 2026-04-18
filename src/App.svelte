<script lang="ts">
  import { onMount } from 'svelte';
  import yaml from 'js-yaml';
  import type { TaxRules } from './lib/types/taxRules';
  import { rulesStore, rulesError, rulesLoading } from './lib/stores/rules';
  import { scenarioStore, initScenario } from './lib/stores/scenario';
  import { resultStore } from './lib/stores/result';
  import Controls from './lib/components/Controls.svelte';
  import Overlays from './lib/components/Overlays.svelte';
  import ReportView from './lib/components/ReportView.svelte';
  import Sankey from './lib/components/Sankey.svelte';
  import BudgetBar from './lib/components/BudgetBar.svelte';

  // ── Tax config registry ────────────────────────────────────────────────────
  const CONFIGS = [
    { id: 'tax-2025', label: '2025 Tax Rules' },
    { id: 'tax-2024', label: '2024 Tax Rules' },
  ];

  let selectedConfig = 'tax-2025';
  let showReport = false;
  let userName = 'Vish';

  function taxFreedomDate(totalTax: number, grossIncome: number, taxYear: number): string {
    if (grossIncome <= 0) return '—';
    const rate = Math.min(1, totalTax / grossIncome);
    const dayOfYear = Math.max(1, Math.round(rate * 365));
    return new Date(taxYear, 0, dayOfYear)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  const LEFT_LEVERS  = ['filing_status','wages_income','investment_income','short_term_capital_gains','capital_gains','age','over_65','state','nyc_resident'];
  const RIGHT_LEVERS = ['ira_contribution','has_workplace_plan','num_children','state_local_tax','mortgage_interest','charitable_contributions','iso_options_exercised','has_amt_preference_items','federal_withheld','state_withheld'];

  const CARD_HELP = {
    totalTax: 'Sum of federal income tax (including capital gains tax and credits), NIIT surtax, and state/local taxes. Does not include FICA/payroll taxes.',
    federalTax: 'Federal income tax after applying credits such as the Child Tax Credit. Includes tax on long-term capital gains at preferential rates.',
    deductionType: 'The app automatically picks whichever is higher: Standard Deduction or Itemized Deductions (SALT + mortgage interest + charity + IRA). "Itemized" means you benefit from listing individual deductions.',
    federalOwed: 'Federal tax liability minus what was already withheld from your W-2(s). Positive = you owe at filing. Negative = the IRS owes you a refund.',
    stateOwed: 'State + local tax liability minus what was withheld. Positive = owe at filing. Negative = state refund.',
  } as const;

  // ── YAML Fetch + Validation ────────────────────────────────────────────────
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
  <style>
    html, body { height: 100%; overflow: hidden; margin: 0; padding: 0; }
  </style>
</svelte:head>

<main>
  {#if $rulesLoading}
    <div class="loading">Loading tax rules…</div>

  {:else if $rulesError}
    <div class="error-screen">
      <h2>Failed to load tax rules</h2>
      <pre class="error-detail">{$rulesError}</pre>
    </div>

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
      <div class="layout">

        <!-- LEFT: Income & Personal -->
        <aside class="sidebar sidebar-left">
          <div class="sidebar-header">
            <div class="title-row">
              <h1 class="app-title">TAX TALAIVAA</h1>
            </div>
            <div class="config-row">
              <label for="config-select" class="config-label">Tax Year</label>
              <select
                id="config-select"
                class="config-select"
                value={selectedConfig}
                on:change={onConfigChange}
              >
                {#each CONFIGS as cfg}
                  <option value={cfg.id}>{cfg.label}</option>
                {/each}
              </select>
            </div>
            <div class="name-row">
              <label for="user-name" class="config-label">Your Name</label>
              <input
                id="user-name"
                type="text"
                bind:value={userName}
                class="name-input"
                placeholder="Your name"
                maxlength="30"
              />
            </div>
          </div>
          <div class="disclaimer">
            <span class="disclaimer-icon">⚠</span>
            Estimates only — not official tax advice. No data is stored; all inputs are lost when you leave this page.
          </div>
          <p class="sidebar-section-label">INCOME</p>
          <Controls levers={rules.levers.filter(l => LEFT_LEVERS.includes(l.id))} {scenario} />
        </aside>

        <!-- CENTER: Dashboard -->
        <section class="dashboard">
          {#if result}

            {#if result.warnings.length > 0}
              <div class="warnings-row">
                <Overlays warnings={result.warnings} />
              </div>
            {/if}

            <!-- Personalized banner -->
            <div class="personal-banner">
              <span class="hello-name">{userName || 'Hey'}</span>,
              your taxes are <strong class="banner-tax">${Math.round(result.totalTax).toLocaleString()}</strong>
              — you worked until
              <strong class="banner-date">{taxFreedomDate(result.totalTax, result.grossIncome, rules.meta.tax_year)}</strong>
              to pay them.
            </div>

            <!-- Compact stats strip -->
            <div class="stats-strip">
              <div class="stat">
                <span class="stat-lbl">Total Tax</span>
                <span class="stat-val">${Math.round(result.totalTax).toLocaleString()}</span>
              </div>
              <div class="stat-sep"></div>
              <div class="stat">
                <span class="stat-lbl">Federal</span>
                <span class="stat-val">${Math.round(result.federalTax).toLocaleString()}</span>
              </div>
              <div class="stat-sep"></div>
              <div class="stat">
                <span class="stat-lbl">Deduction</span>
                <span class="stat-val" class:blue={result.deductionType === 'itemized'}>
                  {result.deductionType === 'itemized' ? 'Itemized' : 'Standard'}
                </span>
              </div>
              <div class="stat-sep"></div>
              <div class="stat">
                <span class="stat-lbl">Eff. Federal</span>
                <span class="stat-val">{(result.effectiveFederalRate * 100).toFixed(1)}%</span>
              </div>
              <div class="stat-sep"></div>
              <div class="stat">
                <span class="stat-lbl">Eff. Total</span>
                <span class="stat-val">{(result.effectiveTotalRate * 100).toFixed(1)}%</span>
              </div>
              <div class="stat-sep"></div>
              <div class="stat">
                <span class="stat-lbl">Marginal</span>
                <span class="stat-val">{(result.marginalRate * 100).toFixed(0)}%</span>
              </div>
              {#if result.federalWithheld > 0}
                {@const fedOwe = result.federalOwed}
                <div class="stat-sep"></div>
                <div class="stat">
                  <span class="stat-lbl">Fed {fedOwe >= 0 ? 'Owed' : 'Refund'}</span>
                  <span class="stat-val" class:red={fedOwe > 0} class:green={fedOwe < 0}>
                    {Math.abs(Math.round(fedOwe)) === 0 ? 'Even' : `$${Math.abs(Math.round(fedOwe)).toLocaleString()}`}
                  </span>
                </div>
              {/if}
              {#if result.stateWithheld > 0}
                {@const stOwe = result.stateOwed}
                <div class="stat-sep"></div>
                <div class="stat">
                  <span class="stat-lbl">State {stOwe >= 0 ? 'Owed' : 'Refund'}</span>
                  <span class="stat-val" class:red={stOwe > 0} class:green={stOwe < 0}>
                    {Math.abs(Math.round(stOwe)) === 0 ? 'Even' : `$${Math.abs(Math.round(stOwe)).toLocaleString()}`}
                  </span>
                </div>
              {/if}
            </div>

            <!-- Ribbon chart — full width -->
            <div class="sankey-area">
              <Sankey {result} {scenario} />
            </div>

            <!-- Budget bar — full width, below ribbon -->
            <div class="budget-bar-row">
              <BudgetBar federalTax={result.federalTax} taxYear={rules.meta.tax_year} />
            </div>

            <!-- Report button + disclaimer -->
            <div class="report-row">
              <button class="report-btn" on:click={() => showReport = true}>
                Generate Tax Optimization Report →
              </button>
              <p class="report-disclaimer">
                This is not an official tax report and should not be used for filing.
                No data is saved — print or download your report before leaving.
              </p>
            </div>

          {:else}
            <div class="loading">Computing…</div>
          {/if}
        </section>

        <!-- RIGHT: Deductions & Withholding -->
        <aside class="sidebar sidebar-right">
          <p class="sidebar-section-label">DEDUCTIONS</p>
          <Controls levers={rules.levers.filter(l => RIGHT_LEVERS.includes(l.id))} {scenario} />
        </aside>

      </div>
    {/if}
  {/if}
</main>

<style>
  :global(html, body) {
    height: 100%;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  main {
    height: 100vh;
    overflow: hidden;
    background: #F5F5F5;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 16px;
    color: #666;
  }

  .error-screen {
    max-width: 560px;
    margin: 60px auto;
    padding: 24px;
    background: #fff;
    border-radius: 10px;
    border: 2px solid #ef4444;
  }
  .error-screen h2 { color: #dc2626; margin-bottom: 12px; font-size: 16px; }
  .error-detail {
    background: #fef2f2;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
    white-space: pre-wrap;
    color: #7f1d1d;
  }

  /* Three-column layout filling viewport */
  .layout {
    display: grid;
    grid-template-columns: 200px 1fr 200px;
    height: 100vh;
    overflow: hidden;
  }

  .sidebar {
    background: #fff;
    padding: 16px 14px;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
    scrollbar-width: thin;
    scrollbar-color: #e5e7eb transparent;
    box-sizing: border-box;
  }
  .sidebar-left  { border-right: 1px solid #e5e7eb; }
  .sidebar-right { border-left: 1px solid #e5e7eb; }

  .sidebar-header { margin-bottom: 12px; }
  .title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .app-title { font-size: 17px; font-weight: 700; margin: 0; }

  .config-row, .name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
  }
  .config-label {
    font-size: 10px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    min-width: 56px;
  }
  .config-select, .name-input {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    background: #fff;
  }
  .config-select { cursor: pointer; }
  .name-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.12); }

  .disclaimer {
    font-size: 10px;
    color: #666;
    line-height: 1.4;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 6px 8px;
    margin-bottom: 12px;
  }
  .disclaimer-icon { color: #f59e0b; margin-right: 2px; }

  .sidebar-section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #888;
    margin-bottom: 12px;
    margin-top: 0;
  }

  /* Center dashboard */
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    height: 100%;
    overflow: hidden;
    box-sizing: border-box;
  }

  .warnings-row { flex-shrink: 0; }

  /* Personalized banner */
  .personal-banner {
    flex-shrink: 0;
    background: #fff;
    border-radius: 8px;
    padding: 11px 18px;
    font-size: 15px;
    color: #333;
    line-height: 1.4;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    border-left: 4px solid #2563eb;
  }
  .hello-name  { font-weight: 700; color: #1A1A1A; }
  .banner-tax  { color: #dc2626; }
  .banner-date { color: #2563eb; }

  /* Compact stats strip */
  .stats-strip {
    display: flex;
    align-items: center;
    background: #fff;
    border-radius: 8px;
    padding: 6px 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 14px;
    gap: 1px;
  }
  .stat-lbl {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #777;
    white-space: nowrap;
  }
  .stat-val {
    font-size: 18px;
    font-weight: 700;
    color: #1A1A1A;
    white-space: nowrap;
    line-height: 1.2;
  }
  .stat-val.blue  { color: #2563eb; }
  .stat-val.red   { color: #dc2626; }
  .stat-val.green { color: #16a34a; }
  .stat-sep {
    width: 1px;
    height: 30px;
    background: #e5e7eb;
    flex-shrink: 0;
  }

  .sankey-area {
    flex: none;
    overflow: visible;
  }

  /* Budget bar — fixed height at bottom */
  .budget-bar-row {
    flex-shrink: 0;
    background: #fff;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  .report-row {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .report-disclaimer {
    font-size: 11px;
    color: #777;
    line-height: 1.4;
    margin: 0;
    max-width: 460px;
  }
  .report-btn {
    padding: 8px 20px;
    background: #1A1A1A;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s;
  }
  .report-btn:hover { background: #333; }

  .report-overlay {
    height: 100vh;
    overflow-y: auto;
    background: #F5F5F5;
    padding: 20px;
    box-sizing: border-box;
  }
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
    padding: 6px 14px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
  }
  .back-btn:hover { background: #f5f5f5; }

  @media (max-width: 1100px) {
    .layout { grid-template-columns: 1fr; height: auto; }
    .sidebar { height: auto; overflow-y: visible; }
    .sidebar-right { border-left: none; border-top: 1px solid #e5e7eb; }
    .dashboard { height: auto; overflow: visible; }
    .stats-strip { flex-wrap: wrap; }
    .sankey-area { flex: none; }
  }
</style>
