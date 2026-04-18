<script lang="ts">
  import type { TaxRules, TaxResult, ScenarioInputs } from '../types/taxRules';
  import { generateSuggestions } from '../engine/interpreter';

  export let rules: TaxRules;
  export let result: TaxResult;
  export let scenario: ScenarioInputs;

  $: suggestions = generateSuggestions(rules, scenario, result);
  $: leversWithValues = rules.levers.map(l => ({
    label: l.label,
    value: scenario[l.id] ?? l.default,
  }));
  $: filingStatus = String(scenario['filing_status'] ?? 'single') as 'single' | 'married_filing_jointly' | 'head_of_household' | 'married_filing_separately';
  $: standardDed = rules.federal.standard_deduction[filingStatus] ?? 0;
  $: stateLabel = String(scenario['state'] ?? 'N/A').toUpperCase();

  function fmt(n: number) { return `$${Math.round(n).toLocaleString()}`; }
  function pct(n: number) { return `${(n * 100).toFixed(2)}%`; }

  function printReport() {
    window.print();
  }
</script>

<div class="report" id="print-report">
  <!-- Page 1: Summary -->
  <section class="page">
    <header class="report-header">
      <h1>Federal + State Tax Optimization Report</h1>
      <p class="subtitle">Tax Year {rules.meta.tax_year} · {rules.meta.label}</p>
    </header>

    <h2>Scenario Inputs</h2>
    <table class="data-table">
      <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
      <tbody>
        {#each leversWithValues as lv}
          <tr>
            <td>{lv.label}</td>
            <td>{typeof lv.value === 'number' && lv.value >= 1000 ? fmt(lv.value) : String(lv.value)}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <h2>Summary</h2>
    <div class="summary-box">
      <div class="summary-row"><span>Gross Income</span><strong>{fmt(result.grossIncome)}</strong></div>
      <div class="summary-row"><span>Total Deductions</span><strong>{fmt(result.deductionAmount)}</strong></div>
      <div class="summary-row"><span>Taxable Income</span><strong>{fmt(result.taxableIncome)}</strong></div>
      <div class="summary-row"><span>Federal Tax</span><strong>{fmt(result.federalTax)}</strong></div>
      <div class="summary-row"><span>State + Local Tax</span><strong>{fmt(result.stateTax + result.subJurisdictionTax)}</strong></div>
      <div class="summary-row total"><span>Total Tax</span><strong>{fmt(result.totalTax)}</strong></div>
      <div class="summary-row"><span>Effective Federal Rate</span><strong>{pct(result.effectiveFederalRate)}</strong></div>
      <div class="summary-row"><span>Effective Total Rate</span><strong>{pct(result.effectiveTotalRate)}</strong></div>
      <div class="summary-row"><span>Marginal Rate</span><strong>{pct(result.marginalRate)}</strong></div>
    </div>
  </section>

  <!-- Page 2: Federal Breakdown -->
  <section class="page break-before">
    <h2>Federal Tax Breakdown</h2>

    <h3>Ordinary Income Brackets</h3>
    <table class="data-table">
      <thead><tr><th>Bracket Range</th><th>Rate</th><th>Income in Bracket</th><th>Tax</th></tr></thead>
      <tbody>
        {#each result.federalBracketBreakdown as b}
          <tr>
            <td>{b.bracket}</td>
            <td>{pct(b.rate)}</td>
            <td>{fmt(b.income)}</td>
            <td>{fmt(b.tax)}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if result.capitalGainsBracketBreakdown.length > 0}
      <h3>Capital Gains Brackets</h3>
      <table class="data-table">
        <thead><tr><th>Bracket Range</th><th>Rate</th><th>Gains in Bracket</th><th>Tax</th></tr></thead>
        <tbody>
          {#each result.capitalGainsBracketBreakdown as b}
            <tr><td>{b.bracket}</td><td>{pct(b.rate)}</td><td>{fmt(b.income)}</td><td>{fmt(b.tax)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <h3>Deduction Decision</h3>
    <div class="deduction-box">
      <span class="badge" class:winner={result.deductionType === 'standard'}>
        Standard: {fmt(standardDed)}
      </span>
      <span class="vs">vs</span>
      <span class="badge" class:winner={result.deductionType === 'itemized'}>
        Itemized: {fmt(result.deductionBreakdown.total_itemized)}
      </span>
      <span class="chosen">→ {result.deductionType === 'standard' ? 'Standard' : 'Itemized'} chosen</span>
    </div>

    {#if Object.keys(result.credits).length > 0}
      <h3>Credits Applied</h3>
      <table class="data-table">
        <thead><tr><th>Credit</th><th>Amount</th></tr></thead>
        <tbody>
          {#each Object.entries(result.credits) as [name, amount]}
            <tr><td>{name.replace(/_/g, ' ')}</td><td>{fmt(amount)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if Object.keys(result.surtaxes).length > 0}
      <h3>Surtaxes</h3>
      <table class="data-table">
        <thead><tr><th>Surtax</th><th>Amount</th></tr></thead>
        <tbody>
          {#each Object.entries(result.surtaxes) as [name, amount]}
            <tr><td>{name.toUpperCase()}</td><td>{fmt(amount)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if result.warnings.length > 0}
      <h3>Warnings</h3>
      {#each result.warnings as w}
        <div class="warning-flag">⚠ {w}</div>
      {/each}
    {/if}
  </section>

  <!-- Page 3: State Breakdown -->
  <section class="page break-before">
    <h2>State & Local Tax Breakdown</h2>
    <div class="summary-box">
      <div class="summary-row"><span>State</span><strong>{stateLabel}</strong></div>
      <div class="summary-row"><span>State Tax</span><strong>{fmt(result.stateTax)}</strong></div>
      <div class="summary-row"><span>Local/Sub-Jurisdiction Tax</span><strong>{fmt(result.subJurisdictionTax)}</strong></div>
      <div class="summary-row total"><span>Total State + Local</span><strong>{fmt(result.stateTax + result.subJurisdictionTax)}</strong></div>
    </div>
  </section>

  <!-- Page 4: Optimization Suggestions -->
  <section class="page break-before">
    <h2>Optimization Suggestions</h2>
    {#if suggestions.length > 0}
      <ul class="suggestions">
        {#each suggestions as s}
          <li>{s.text}</li>
        {/each}
      </ul>
    {:else}
      <p class="no-suggestions">Your scenario appears well-optimized. No additional suggestions at this time.</p>
    {/if}
  </section>

  <footer class="report-footer">
    Generated {new Date().toLocaleDateString()} using tax-rules.yml version {rules.meta.last_updated}
  </footer>
</div>

<button class="print-btn no-print" on:click={printReport}>Print / Save PDF</button>

<style>
  .report {
    background: #fff;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
    color: #1A1A1A;
    font-family: Roboto, Arial, sans-serif;
  }
  .page { margin-bottom: 48px; }
  .break-before { page-break-before: always; }
  .report-header { margin-bottom: 32px; border-bottom: 2px solid #1A1A1A; padding-bottom: 16px; }
  h1 { font-size: 22px; font-weight: 700; }
  h2 { font-size: 17px; font-weight: 700; margin: 24px 0 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 14px; font-weight: 600; margin: 18px 0 8px; color: #444; }
  .subtitle { color: #666; font-size: 14px; margin-top: 4px; }

  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 6px 10px; background: #f5f5f5; font-weight: 600; }
  .data-table td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }

  .summary-box { background: #f9f9f9; border-radius: 8px; padding: 16px 20px; }
  .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
  .summary-row.total { border-top: 1px solid #ccc; margin-top: 6px; padding-top: 10px; font-weight: 700; }

  .deduction-box { display: flex; align-items: center; gap: 12px; font-size: 14px; flex-wrap: wrap; }
  .badge { padding: 4px 12px; border-radius: 20px; background: #e5e7eb; font-weight: 500; }
  .badge.winner { background: #dcfce7; color: #166534; }
  .vs { color: #888; }
  .chosen { color: #2563eb; font-weight: 600; }

  .warning-flag { background: #fee2e2; color: #991b1b; padding: 8px 14px; border-radius: 6px; font-size: 13px; margin: 6px 0; }

  .suggestions { padding-left: 20px; }
  .suggestions li { margin-bottom: 12px; font-size: 14px; line-height: 1.6; }
  .no-suggestions { color: #666; font-style: italic; }

  .report-footer { font-size: 11px; color: #aaa; border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 32px; }

  .print-btn {
    display: block;
    margin: 24px auto;
    padding: 12px 32px;
    background: #1A1A1A;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    cursor: pointer;
    font-family: inherit;
  }
  .print-btn:hover { background: #333; }

  @media print {
    .no-print { display: none !important; }
    .report { padding: 0; }
    @page { margin: 20mm; }
    .break-before { break-before: page; }
  }
</style>
