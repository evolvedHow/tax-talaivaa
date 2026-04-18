<script lang="ts">
  import type { TaxResult, ScenarioInputs } from '../types/taxRules';

  export let result: TaxResult;
  export let scenario: ScenarioInputs;

  const SRC_COLORS: Record<string, string> = {
    wages:      '#3b82f6',
    investment: '#06b6d4',
    stcg:       '#f59e0b',
    ltcg:       '#8b5cf6',
  };
  const BRACKET_COLORS: Record<number, string> = {
    0.10: '#4ade80', 0.12: '#22c55e',
    0.22: '#fbbf24', 0.24: '#f97316',
    0.32: '#ef4444', 0.35: '#dc2626', 0.37: '#7f1d1d',
  };
  const LTCG_COLORS: Record<number, string> = {
    0.00: '#c4b5fd', 0.15: '#8b5cf6', 0.20: '#5b21b6',
  };
  const DED_COLOR = '#94a3b8';

  interface Seg {
    id: string; label: string; amount: number; pct: number;
    taxAmount: number; color: string;
  }

  $: srcs = buildSources();
  $: dsts = buildDestinations();
  $: gross    = result?.grossIncome ?? 0;
  $: stateTax = (result?.stateTax ?? 0) + (result?.subJurisdictionTax ?? 0);
  $: niit     = result?.surtaxes?.['niit'] ?? 0;
  $: takeHome = gross - (result?.totalTax ?? 0);

  function buildSources(): Seg[] {
    if (!result || result.grossIncome <= 0) return [];
    const g = result.grossIncome;
    const wages = Math.max(0, Number(scenario.wages_income ?? 0));
    const inv   = Math.max(0, Number(scenario.investment_income ?? 0));
    const stcg  = Math.max(0, Number(scenario.short_term_capital_gains ?? 0));
    const ltcg  = Math.max(0, Number(scenario.capital_gains ?? 0));
    const out: Seg[] = [];
    if (wages > 0) out.push({ id: 'wages',      label: 'W-2 / Ordinary',      amount: wages, pct: wages/g, taxAmount: 0, color: SRC_COLORS.wages });
    if (inv   > 0) out.push({ id: 'investment', label: 'Dividends / Interest', amount: inv,   pct: inv/g,   taxAmount: 0, color: SRC_COLORS.investment });
    if (stcg  > 0) out.push({ id: 'stcg',       label: 'Short-Term Gains',     amount: stcg,  pct: stcg/g,  taxAmount: 0, color: SRC_COLORS.stcg });
    if (ltcg  > 0) out.push({ id: 'ltcg',       label: 'Long-Term Gains',      amount: ltcg,  pct: ltcg/g,  taxAmount: 0, color: SRC_COLORS.ltcg });
    return out;
  }

  function buildDestinations(): Seg[] {
    if (!result || result.grossIncome <= 0) return [];
    const g = result.grossIncome;
    const out: Seg[] = [];
    if (result.deductionAmount > 0) {
      out.push({
        id: 'ded',
        label: result.deductionType === 'itemized' ? 'Itemized' : 'Std Ded.',
        amount: result.deductionAmount, pct: result.deductionAmount / g,
        taxAmount: 0, color: DED_COLOR,
      });
    }
    for (const b of result.federalBracketBreakdown) {
      if (b.income <= 0) continue;
      out.push({
        id: `ord_${b.rate}`, label: `${(b.rate * 100).toFixed(0)}% Fed`,
        amount: b.income, pct: b.income / g, taxAmount: b.tax,
        color: BRACKET_COLORS[b.rate] ?? '#999',
      });
    }
    for (const b of result.capitalGainsBracketBreakdown) {
      if (b.income <= 0) continue;
      out.push({
        id: `ltcg_${b.rate}`, label: `${(b.rate * 100).toFixed(0)}% CG`,
        amount: b.income, pct: b.income / g, taxAmount: b.tax,
        color: LTCG_COLORS[b.rate] ?? '#a78bfa',
      });
    }
    return out;
  }

  // Hover state
  let hovSrc: string | null = null;
  let hovDst: string | null = null;
  let tip = { visible: false, x: 0, y: 0, html: '' };
  let bar2El: HTMLDivElement;

  function srcOver(id: string) { hovSrc = id; }
  function srcOut()            { hovSrc = null; }

  function dstOver(e: MouseEvent, seg: Seg) {
    hovDst = seg.id;
    if (!bar2El) return;
    const r = bar2El.getBoundingClientRect();
    let html = `<strong>${seg.label}</strong><br/>$${Math.round(seg.amount).toLocaleString()} of income`;
    if (seg.taxAmount > 0)
      html += `<br/>Tax: $${Math.round(seg.taxAmount).toLocaleString()} (${(seg.taxAmount / seg.amount * 100).toFixed(1)}% eff.)`;
    else
      html += `<br/>Sheltered — $0 tax`;
    tip = { visible: true, x: e.clientX - r.left + 12, y: e.clientY - r.top - 70, html };
  }
  function dstMove(e: MouseEvent) {
    if (!bar2El) return;
    const r = bar2El.getBoundingClientRect();
    tip = { ...tip, x: e.clientX - r.left + 12, y: e.clientY - r.top - 70 };
  }
  function dstOut() { hovDst = null; tip = { ...tip, visible: false }; }

  function fmt(n: number) { return '$' + Math.round(n).toLocaleString(); }
</script>

<div class="flow-wrap">
  <div class="flow-header">
    <span class="flow-title">Income Flow</span>
    <span class="flow-sub">Sources (top) → tax buckets (bottom) · dark band = tax paid · hover for detail</span>
  </div>

  {#if srcs.length > 0}
    <!-- Bar 1: income sources -->
    <div class="bar-row">
      {#each srcs as s}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="seg"
          style="width:{s.pct*100}%; background:{s.color}; opacity:{hovSrc && hovSrc !== s.id ? 0.4 : 1}"
          on:mouseover={() => srcOver(s.id)}
          on:focus={() => srcOver(s.id)}
          on:mouseout={srcOut}
          on:blur={srcOut}
          title="{s.label}: {fmt(s.amount)}"
        >
          {#if s.pct >= 0.13}
            <span class="lbl">{s.label}</span>
            <span class="amt">{fmt(s.amount)}</span>
          {:else if s.pct >= 0.07}
            <span class="lbl">{fmt(s.amount)}</span>
          {/if}
        </div>
      {/each}
    </div>

    <div class="connector">
      <span class="conn-line"></span>
      <span class="conn-label">allocates to</span>
      <span class="conn-line"></span>
    </div>

    <!-- Bar 2: tax buckets -->
    <div class="bar-row dst-bar" bind:this={bar2El}>
      {#each dsts as d}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="seg dst-seg"
          style="width:{d.pct*100}%; background:{d.color}; opacity:{hovDst && hovDst !== d.id ? 0.4 : 1}"
          on:mouseover={(e) => dstOver(e, d)}
          on:focus={() => { hovDst = d.id; }}
          on:mousemove={dstMove}
          on:mouseout={dstOut}
          on:blur={dstOut}
        >
          <!-- white wash to lighten the background -->
          <div class="wash"></div>
          <!-- dark band at bottom = tax paid -->
          {#if d.taxAmount > 0}
            <div class="tax-band" style="height:{d.taxAmount/d.amount*100}%; background:{d.color}"></div>
          {/if}
          {#if d.pct >= 0.09}
            <span class="dst-lbl">{d.label}</span>
          {/if}
        </div>
      {/each}

      {#if tip.visible}
        <div class="tip" style="left:{tip.x}px; top:{tip.y}px">{@html tip.html}</div>
      {/if}
    </div>

    <!-- Summary row -->
    <div class="summary-row">
      <span class="s-item s-fed">Federal {fmt(result.federalTax)}</span>
      {#if stateTax > 0}
        <span class="s-sep">+</span>
        <span class="s-item s-state">State {fmt(stateTax)}</span>
      {/if}
      {#if niit > 0}
        <span class="s-sep">+</span>
        <span class="s-item s-niit">NIIT {fmt(niit)}</span>
      {/if}
      <span class="s-sep">=</span>
      <span class="s-item s-total">Total {fmt(result.totalTax)}</span>
      <span class="s-sep">·</span>
      <span class="s-item s-home">Take-home {fmt(takeHome)} ({(takeHome/gross*100).toFixed(1)}%)</span>
    </div>

  {:else}
    <p class="empty">Enter income to see your tax flow.</p>
  {/if}
</div>

<style>
  .flow-wrap { display: flex; flex-direction: column; width: 100%; gap: 6px; }

  .flow-header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .flow-title  { font-size: 12px; font-weight: 600; color: #1A1A1A; }
  .flow-sub    { font-size: 10px; color: #bbb; }

  .bar-row {
    display: flex;
    width: 100%;
    height: 52px;
    border-radius: 6px;
    overflow: hidden;
    position: relative;
  }

  .seg {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: default;
    transition: opacity 0.15s;
    position: relative;
    box-sizing: border-box;
  }

  .lbl {
    font-size: 10px; font-weight: 600;
    color: rgba(255,255,255,0.95);
    pointer-events: none; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    max-width: 100%; padding: 0 4px; line-height: 1.3; z-index: 1;
  }
  .amt {
    font-size: 9px; color: rgba(255,255,255,0.8);
    pointer-events: none; white-space: nowrap; z-index: 1;
  }

  .wash {
    position: absolute; inset: 0;
    background: rgba(255,255,255,0.68);
    pointer-events: none;
  }

  .tax-band {
    position: absolute; bottom: 0; left: 0;
    width: 100%; opacity: 0.9;
    pointer-events: none;
  }

  .dst-lbl {
    position: relative; z-index: 1;
    font-size: 10px; font-weight: 600; color: #222;
    pointer-events: none; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    max-width: 100%; padding: 0 4px;
  }

  .connector {
    display: flex; align-items: center; gap: 6px; margin: 0 2px;
  }
  .conn-line  { flex: 1; height: 1px; background: #e5e7eb; }
  .conn-label { font-size: 9px; color: #ccc; white-space: nowrap; }

  .summary-row {
    display: flex; align-items: center; gap: 6px;
    flex-wrap: wrap; font-size: 11px;
  }
  .s-sep  { color: #bbb; }
  .s-item { font-weight: 600; }
  .s-fed   { color: #ef4444; }
  .s-state { color: #3b82f6; }
  .s-niit  { color: #f97316; }
  .s-total { color: #1A1A1A; }
  .s-home  { color: #16a34a; }

  .tip {
    position: absolute;
    background: rgba(26,26,26,0.93); color: #fff;
    padding: 8px 12px; border-radius: 8px;
    font-size: 11px; line-height: 1.6;
    pointer-events: none; z-index: 20;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }

  .empty { font-size: 12px; color: #bbb; margin: 0; }
</style>
