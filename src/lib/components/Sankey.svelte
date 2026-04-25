<script lang="ts">
  import type { TaxResult, ScenarioInputs } from '../types/taxRules';

  export let result: TaxResult;
  export let scenario: ScenarioInputs;

  // ── Colors ───────────────────────────────────────────────────────────────────
  const SRC: Record<string, string> = {
    wages: '#3b82f6', bonus: '#818cf8', investment: '#06b6d4',
    stcg: '#f59e0b', business: '#f43f5e', rental: '#0d9488',
    ltcg: '#8b5cf6', qdiv: '#7c3aed',
  };
  const BRACKET: Record<number, string> = {
    0.10: '#4ade80', 0.12: '#22c55e',
    0.22: '#fbbf24', 0.24: '#f97316',
    0.32: '#ef4444', 0.35: '#dc2626', 0.37: '#7f1d1d',
  };
  const LTCG_CLR: Record<number, string> = {
    0.00: '#c4b5fd', 0.15: '#8b5cf6', 0.20: '#5b21b6',
  };
  const DED_CLR = '#94a3b8';

  // ── Data ─────────────────────────────────────────────────────────────────────
  interface Seg {
    id: string; label: string; amount: number; pct: number;
    x1: number; color: string; taxAmount: number;
  }
  interface Ribbon {
    srcId: string; dstId: string; amount: number; color: string;
    sx1: number; sx2: number; dx1: number; dx2: number;
  }

  function hexToRgba(hex: string, a: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function buildSources(r: TaxResult, sc: ScenarioInputs): Seg[] {
    if (!r || r.grossIncome <= 0) return [];
    const g = r.grossIncome;
    const wages   = Math.max(0, Number(sc.wages_income ?? 0));
    const bonus   = Math.max(0, Number(sc.bonus ?? 0));
    const inv     = Math.max(0, Number(sc.investment_income ?? 0));
    const stcg    = Math.max(0, Number(sc.short_term_capital_gains ?? 0));
    const biz     = Math.max(0, Number(sc.business_income ?? 0));
    const rental  = Math.max(0, Number(sc.rental_income ?? 0));
    const ltcg    = Math.max(0, Number(sc.capital_gains ?? 0));
    const qdiv    = Math.max(0, Number(sc.qualified_dividends ?? 0));
    const raw = [
      wages  > 0 && { id: 'wages',      label: 'W-2 Wages',           amount: wages,  color: SRC.wages },
      bonus  > 0 && { id: 'bonus',      label: 'Bonus / Other',        amount: bonus,  color: SRC.bonus },
      inv    > 0 && { id: 'investment', label: 'Interest / Non-Qual.', amount: inv,    color: SRC.investment },
      stcg   > 0 && { id: 'stcg',       label: 'ST Cap Gains',         amount: stcg,   color: SRC.stcg },
      biz    > 0 && { id: 'business',   label: 'Business / SE',        amount: biz,    color: SRC.business },
      rental > 0 && { id: 'rental',     label: 'Rental / Passive',     amount: rental, color: SRC.rental },
      ltcg   > 0 && { id: 'ltcg',       label: 'LT Cap Gains',         amount: ltcg,   color: SRC.ltcg },
      qdiv   > 0 && { id: 'qdiv',       label: 'Qual. Dividends',      amount: qdiv,   color: SRC.qdiv },
    ].filter(Boolean) as { id: string; label: string; amount: number; color: string }[];
    let cursor = 0;
    return raw.map(s => {
      const pct = s.amount / g;
      const seg = { ...s, pct, x1: cursor, taxAmount: 0 };
      cursor += pct;
      return seg;
    });
  }

  function buildDests(r: TaxResult): Seg[] {
    if (!r || r.grossIncome <= 0) return [];
    const g = r.grossIncome;
    const raw: { id: string; label: string; amount: number; taxAmount: number; color: string }[] = [];
    if (r.deductionAmount > 0) {
      raw.push({ id: 'ded', label: r.deductionType === 'itemized' ? 'Itemized' : 'Std Ded.',
        amount: r.deductionAmount, taxAmount: 0, color: DED_CLR });
    }
    for (const b of r.federalBracketBreakdown) {
      if (b.income <= 0) continue;
      raw.push({ id: `ord_${b.rate}`, label: `${(b.rate * 100).toFixed(0)}% Fed`,
        amount: b.income, taxAmount: b.tax, color: BRACKET[b.rate] ?? '#999' });
    }
    for (const b of r.capitalGainsBracketBreakdown) {
      if (b.income <= 0) continue;
      raw.push({ id: `ltcg_${b.rate}`, label: `${(b.rate * 100).toFixed(0)}% CG`,
        amount: b.income, taxAmount: b.tax, color: LTCG_CLR[b.rate] ?? '#a78bfa' });
    }
    let cursor = 0;
    return raw.map(d => {
      const pct = d.amount / g;
      const seg = { ...d, pct, x1: cursor };
      cursor += pct;
      return seg;
    });
  }

  function buildRibbons(srcs: Seg[], dsts: Seg[], gross: number): Ribbon[] {
    const S = 10000;
    // preferential sources (LTCG rates): ltcg + qualified dividends
    const prefSrcs = srcs.filter(s => s.id === 'ltcg' || s.id === 'qdiv');
    const prefTotal = prefSrcs.reduce((sum, s) => sum + s.amount, 0);
    // ordinary sources: everything else
    const ordSrcs = srcs.filter(s => s.id !== 'ltcg' && s.id !== 'qdiv');
    const ordTotal = ordSrcs.reduce((sum, s) => sum + s.amount, 0);
    const srcCur: Record<string, number> = {};
    const dstCur: Record<string, number> = {};
    for (const s of srcs) srcCur[s.id] = s.x1 * S;
    for (const d of dsts) dstCur[d.id] = d.x1 * S;
    const out: Ribbon[] = [];
    for (const dst of dsts) {
      if (dst.id.startsWith('ltcg_')) {
        // allocate from preferential sources proportionally
        if (prefTotal <= 0) continue;
        for (const src of prefSrcs) {
          const contrib = dst.amount * (src.amount / prefTotal);
          if (contrib <= 0) continue;
          const w = (contrib / gross) * S;
          out.push({ srcId: src.id, dstId: dst.id, amount: contrib, color: src.color,
            sx1: srcCur[src.id], sx2: srcCur[src.id] + w,
            dx1: dstCur[dst.id], dx2: dstCur[dst.id] + w });
          srcCur[src.id] += w;
          dstCur[dst.id] += w;
        }
      } else {
        if (ordTotal <= 0) continue;
        for (const src of ordSrcs) {
          const contrib = dst.amount * (src.amount / ordTotal);
          if (contrib <= 0) continue;
          const w = (contrib / gross) * S;
          out.push({ srcId: src.id, dstId: dst.id, amount: contrib, color: src.color,
            sx1: srcCur[src.id], sx2: srcCur[src.id] + w,
            dx1: dstCur[dst.id], dx2: dstCur[dst.id] + w });
          srcCur[src.id] += w;
          dstCur[dst.id] += w;
        }
      }
    }
    return out;
  }

  function rPath(r: Ribbon): string {
    const mid = 50;
    return `M${r.sx1},0 C${r.sx1},${mid} ${r.dx1},${mid} ${r.dx1},100 L${r.dx2},100 C${r.dx2},${mid} ${r.sx2},${mid} ${r.sx2},0 Z`;
  }

  // ── Reactive data — explicit deps so Svelte always re-runs ──────────────────
  $: srcs = buildSources(result, scenario);
  $: dsts = buildDests(result);
  $: ribbons = srcs.length > 0 && dsts.length > 0
      ? buildRibbons(srcs, dsts, result.grossIncome)
      : [];
  $: gross    = result?.grossIncome ?? 0;
  $: stateTax = (result?.stateTax ?? 0) + (result?.subJurisdictionTax ?? 0);
  $: niit     = result?.surtaxes?.['niit'] ?? 0;
  $: takeHome = gross - (result?.totalTax ?? 0);

  // ── Hover ────────────────────────────────────────────────────────────────────
  let hovSrc: string | null = null;
  let hovDst: string | null = null;
  let tip = { visible: false, x: 0, y: 0, html: '' };
  let wrapEl: HTMLDivElement;

  function ribbonOpacity(r: Ribbon): number {
    if (hovSrc) return r.srcId === hovSrc ? 0.65 : 0.1;
    if (hovDst) return r.dstId === hovDst ? 0.65 : 0.1;
    return 0.38;
  }

  function showTip(e: MouseEvent, html: string) {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    tip = { visible: true, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 60, html };
  }
  function moveTip(e: MouseEvent) {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    tip = { ...tip, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 60 };
  }
  function hideTip() { tip = { ...tip, visible: false }; }

  function srcTip(s: Seg): string {
    return `<strong>${s.label}</strong><br/>$${Math.round(s.amount).toLocaleString()} (${(s.pct * 100).toFixed(1)}% of gross)`;
  }
  function dstTip(d: Seg): string {
    let h = `<strong>${d.label}</strong><br/>$${Math.round(d.amount).toLocaleString()} of income`;
    if (d.taxAmount > 0)
      h += `<br/>Tax: $${Math.round(d.taxAmount).toLocaleString()} (${(d.taxAmount / d.amount * 100).toFixed(1)}% eff.)`;
    else
      h += `<br/>Sheltered — $0 tax`;
    return h;
  }

  function fmt(n: number) { return '$' + Math.round(n).toLocaleString(); }
</script>

<div class="flow-wrap" bind:this={wrapEl}>
  <div class="flow-header">
    <span class="flow-title">Income Flow</span>
    <span class="flow-sub">Sources (top) → tax buckets (bottom) · dark band = tax paid · hover for detail</span>
  </div>

  {#if srcs.length > 0}

    <!-- ── Source bar ──────────────────────────────────────────────────────── -->
    <div class="bar-row">
      {#each srcs as s}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="seg"
          style="width:{s.pct*100}%; background:{s.color};
                 opacity:{hovSrc && hovSrc !== s.id ? 0.35 : 1}"
          on:mouseover={(e) => { hovSrc = s.id; hovDst = null; showTip(e, srcTip(s)); }}
          on:focus={() => { hovSrc = s.id; hovDst = null; }}
          on:mousemove={moveTip}
          on:mouseout={() => { hovSrc = null; hideTip(); }}
          on:blur={() => { hovSrc = null; }}
        >
          {#if s.pct >= 0.14}
            <span class="lbl">{s.label}</span>
            <span class="amt">{fmt(s.amount)}</span>
          {:else if s.pct >= 0.07}
            <span class="lbl">{fmt(s.amount)}</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- ── Ribbon SVG — grows to fill available space ────────────────────── -->
    <div class="ribbon-wrap">
    <svg viewBox="0 0 10000 100" preserveAspectRatio="none"
         style="width:100%; height:100%; display:block; overflow:visible">
      {#each ribbons as r}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <path
          d={rPath(r)}
          fill={r.color}
          opacity={ribbonOpacity(r)}
          style="cursor:default; transition:opacity 0.15s"
          on:mouseover={(e) => { hovSrc = r.srcId; hovDst = null; showTip(e, `<strong>${srcs.find(s=>s.id===r.srcId)?.label ?? r.srcId} → ${dsts.find(d=>d.id===r.dstId)?.label ?? r.dstId}</strong><br/>$${Math.round(r.amount).toLocaleString()}`); }}
          on:focus={() => { hovSrc = r.srcId; }}
          on:mousemove={moveTip}
          on:mouseout={() => { hovSrc = null; hideTip(); }}
          on:blur={() => { hovSrc = null; }}
        />
      {/each}
    </svg>
    </div>

    <!-- ── Destination bar ────────────────────────────────────────────────── -->
    <div class="bar-row">
      {#each dsts as d}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="seg dst-seg"
          style="width:{d.pct*100}%;
                 background:{hexToRgba(d.color, 0.22)};
                 border-top: 2px solid {d.color};
                 opacity:{hovDst && hovDst !== d.id ? 0.35 : 1}"
          on:mouseover={(e) => { hovDst = d.id; hovSrc = null; showTip(e, dstTip(d)); }}
          on:focus={() => { hovDst = d.id; hovSrc = null; }}
          on:mousemove={moveTip}
          on:mouseout={() => { hovDst = null; hideTip(); }}
          on:blur={() => { hovDst = null; }}
        >
          {#if d.taxAmount > 0}
            <div class="tax-band"
              style="height:{d.taxAmount/d.amount*100}%; background:{hexToRgba(d.color, 0.85)}">
            </div>
          {/if}
          {#if d.pct >= 0.09}
            <span class="dst-lbl">{d.label}</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- ── Summary ──────────────────────────────────────────────────────────── -->
    <div class="summary-row">
      <span class="s-item s-fed">Federal {fmt(result.federalTax)}</span>
      {#if stateTax > 0}
        <span class="s-sep">+</span>
        <span class="s-item s-state">State/Local {fmt(stateTax)}</span>
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

  {#if tip.visible}
    <div class="tip" style="left:{tip.x}px; top:{tip.y}px">{@html tip.html}</div>
  {/if}
</div>

<style>
  .flow-wrap {
    display: flex; flex-direction: column; width: 100%; position: relative;
    height: 100%; min-height: 0;
  }

  .flow-header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
                 margin-bottom: 6px; flex-shrink: 0; }
  .flow-title  { font-size: 12px; font-weight: 600; color: #1A1A1A; }
  .flow-sub    { font-size: 10px; color: #bbb; }

  .bar-row {
    display: flex;
    width: 100%;
    height: 52px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .ribbon-wrap {
    flex: 1;
    min-height: 60px;
    overflow: hidden;
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
    box-sizing: border-box;
    position: relative;
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

  .dst-seg { border-radius: 0; }
  .dst-lbl {
    position: relative; z-index: 2;
    font-size: 10px; font-weight: 600; color: #222;
    pointer-events: none; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    max-width: 100%; padding: 0 4px;
  }

  .tax-band {
    position: absolute; bottom: 0; left: 0;
    width: 100%; pointer-events: none; z-index: 1;
  }

  .summary-row {
    display: flex; align-items: center; gap: 6px;
    flex-wrap: wrap; font-size: 11px; margin-top: 6px; flex-shrink: 0;
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
    pointer-events: none; z-index: 30;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }

  .empty { font-size: 12px; color: #bbb; margin: 8px 0; }
</style>
