<script lang="ts">
  import type { TaxRules, TaxResult, ScenarioInputs } from '../types/taxRules';
  import { generateSuggestions } from '../engine/interpreter';

  export let rules: TaxRules;
  export let result: TaxResult;
  export let scenario: ScenarioInputs;

  $: tips = generateSuggestions(rules, scenario, result);

  function savingColor(saving: number): string {
    if (saving >= 2000) return '#2E7D32';
    if (saving >= 500)  return '#388E3C';
    return '#5D4037';
  }
</script>

{#if tips.length > 0}
<div class="tips-wrap">
  <div class="tips-hdr">
    <span class="tips-title">Tax Saving Opportunities</span>
    <span class="tips-sub">sorted by estimated savings · adjust levers to see impact</span>
  </div>
  <div class="tips-row">
    {#each tips as tip}
      <div class="tip-card">
        <div class="tip-top">
          <span class="tip-action">{tip.action}</span>
          {#if tip.saving > 0}
            <span class="tip-saving" style="color:{savingColor(tip.saving)}">
              ~${tip.saving.toLocaleString()}
            </span>
          {/if}
        </div>
        <p class="tip-text">{tip.text}</p>
      </div>
    {/each}
  </div>
</div>
{/if}

<style>
  .tips-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .tips-hdr {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-shrink: 0;
  }
  .tips-title { font-size: 11px; font-weight: 700; color: #1A1A1A; text-transform: uppercase; letter-spacing: 0.05em; }
  .tips-sub   { font-size: 10px; color: #aaa; }

  .tips-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: #e0e0e0 transparent;
    padding-bottom: 4px;
  }

  .tip-card {
    flex: 0 0 220px;
    background: #F8FDF9;
    border: 1px solid #C8E6C9;
    border-left: 3px solid #4CAF50;
    border-radius: 7px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tip-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }
  .tip-action {
    font-size: 11px;
    font-weight: 700;
    color: #1A1A1A;
    white-space: nowrap;
  }
  .tip-saving {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tip-text {
    font-size: 10px;
    color: #555;
    line-height: 1.45;
    margin: 0;
  }
</style>
