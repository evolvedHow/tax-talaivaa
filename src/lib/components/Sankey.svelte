<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import type { TaxResult, ScenarioInputs } from '../types/taxRules';

  export let result: TaxResult;
  export let scenario: ScenarioInputs;

  let container: HTMLDivElement;
  let svg: SVGSVGElement;
  let tip = { visible: false, x: 0, y: 0, html: '' };

  // ── Layout ────────────────────────────────────────────────────────────────
  // SVG coordinate space — fills its CSS container via position:absolute.
  // Increase these for a more spacious internal canvas; CSS handles scaling.
  const W    = 960;
  const H    = 600;
  const ML   = 210;   // left margin (room for source labels)
  const MR   = 270;   // right margin (room for bucket labels)
  const MT   = 24;
  const MB   = 70;    // bottom margin for annotations
  const NW   = 16;    // node bar width
  const GAP  = 7;     // gap between right destination bars
  const innerW = W - ML - MR;
  const innerH = H - MT - MB;

  // ── Colors ────────────────────────────────────────────────────────────────
  const SRC: Record<string, string> = {
    wages:      '#3b82f6',  // blue
    investment: '#06b6d4',  // cyan
    stcg:       '#f59e0b',  // amber
    ltcg:       '#8b5cf6',  // violet
  };
  const BRACKET: Record<number, string> = {
    0.10: '#4ade80', 0.12: '#86efac',
    0.22: '#fbbf24', 0.24: '#f97316',
    0.32: '#ef4444', 0.35: '#dc2626', 0.37: '#7f1d1d',
  };
  const LTCG_CLR: Record<number, string> = {
    0.00: '#c4b5fd', 0.15: '#8b5cf6', 0.20: '#5b21b6',
  };
  const DED_CLR = '#d1d5db';

  // ── Data model ────────────────────────────────────────────────────────────
  interface LeftNode  { id: string; label: string; amount: number; color: string; }
  interface RightNode { id: string; label: string; amount: number;
                        taxRate: number; taxAmount: number; color: string; }
  interface Ribbon    { srcId: string; dstId: string; amount: number; color: string; }

  function buildData() {
    if (!result || result.grossIncome <= 0) return null;

    const gross      = result.grossIncome;
    const wages      = Math.max(0, Number(scenario.wages_income               ?? 0));
    const investment = Math.max(0, Number(scenario.investment_income          ?? 0));
    const stcg       = Math.max(0, Number(scenario.short_term_capital_gains   ?? 0));
    const ltcg       = Math.max(0, Number(scenario.capital_gains              ?? 0));
    const ordTotal   = wages + investment + stcg;

    // ── Left nodes (income sources) ──────────────────────────────────────
    const lefts: LeftNode[] = [];
    if (wages      > 0) lefts.push({ id: 'wages',      label: 'W-2 / Ordinary',      amount: wages,      color: SRC.wages      });
    if (investment > 0) lefts.push({ id: 'investment', label: 'Dividends / Interest', amount: investment, color: SRC.investment });
    if (stcg       > 0) lefts.push({ id: 'stcg',       label: 'Short-Term Gains',     amount: stcg,       color: SRC.stcg       });
    if (ltcg       > 0) lefts.push({ id: 'ltcg',       label: 'Long-Term Gains',      amount: ltcg,       color: SRC.ltcg       });

    // ── Right nodes (income buckets) ─────────────────────────────────────
    const rights: RightNode[] = [];

    // Deductions (sheltered income)
    if (result.deductionAmount > 0) {
      rights.push({
        id: 'ded', label: result.deductionType === 'itemized' ? 'Itemized Ded.' : 'Standard Ded.',
        amount: result.deductionAmount, taxRate: 0, taxAmount: 0, color: DED_CLR,
      });
    }

    // Ordinary income federal brackets
    for (const b of result.federalBracketBreakdown) {
      if (b.income <= 0) continue;
      rights.push({
        id: `ord_${b.rate}`, label: `${(b.rate * 100).toFixed(0)}% Federal`,
        amount: b.income, taxRate: b.rate, taxAmount: b.tax,
        color: BRACKET[b.rate] ?? '#999',
      });
    }

    // Long-term capital gains brackets
    for (const b of result.capitalGainsBracketBreakdown) {
      if (b.income <= 0) continue;
      rights.push({
        id: `ltcg_${b.rate}`, label: `${(b.rate * 100).toFixed(0)}% Cap Gains`,
        amount: b.income, taxRate: b.rate, taxAmount: b.tax,
        color: LTCG_CLR[b.rate] ?? '#a78bfa',
      });
    }

    // ── Ribbons ───────────────────────────────────────────────────────────
    // Deductions and ordinary brackets come from ordinary income sources
    // proportionally. LTCG brackets come entirely from the LTCG source.
    const ribbons: Ribbon[] = [];
    const ordSrcs = lefts.filter(l => l.id !== 'ltcg');

    for (const right of rights) {
      if (right.id.startsWith('ltcg_')) {
        if (ltcg > 0 && right.amount > 0) {
          ribbons.push({ srcId: 'ltcg', dstId: right.id, amount: right.amount, color: SRC.ltcg });
        }
      } else {
        // Allocate from ordinary sources by share
        if (ordTotal > 0) {
          for (const src of ordSrcs) {
            const amt = right.amount * (src.amount / ordTotal);
            if (amt > 0) ribbons.push({ srcId: src.id, dstId: right.id, amount: amt, color: src.color });
          }
        }
      }
    }

    return { lefts, rights, ribbons, gross, ltcg };
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  function draw() {
    if (!svg || !result) return;
    const root = d3.select(svg);
    root.selectAll('*').remove();

    const data = buildData();
    if (!data) return;
    const { lefts, rights, ribbons, gross } = data;

    const g = root.append('g').attr('transform', `translate(${ML},${MT})`);
    const destX = innerW - NW;

    // Right bar scaling (gaps eat into height)
    const N = rights.length;
    const rightUsableH = innerH - (N - 1) * GAP;

    // Pre-compute right bar positions
    const rightPos: Record<string, { y1: number; y2: number }> = {};
    let rc = 0;
    for (const rn of rights) {
      const h = Math.max(2, (rn.amount / gross) * rightUsableH);
      rightPos[rn.id] = { y1: rc, y2: rc + h };
      rc += h + GAP;
    }

    // Pre-compute left bar positions (no gaps — all income sources stack flush)
    const leftPos: Record<string, { y1: number; y2: number }> = {};
    let lc = 0;
    for (const ln of lefts) {
      const h = Math.max(2, (ln.amount / gross) * innerH);
      leftPos[ln.id] = { y1: lc, y2: lc + h };
      lc += h;
    }

    // Ribbon draw cursors
    const srcCur: Record<string, number> = {};
    const dstCur: Record<string, number> = {};
    for (const ln of lefts)  srcCur[ln.id] = leftPos[ln.id].y1;
    for (const rn of rights) dstCur[rn.id] = rightPos[rn.id].y1;

    // ── Draw ribbons ─────────────────────────────────────────────────────
    const mx = innerW * 0.42; // bezier control point x
    for (const ribbon of ribbons) {
      const srcH = Math.max(0.5, (ribbon.amount / gross) * innerH);
      const dstH = Math.max(0.5, (ribbon.amount / gross) * rightUsableH);
      const sy1 = srcCur[ribbon.srcId] ?? 0, sy2 = sy1 + srcH;
      const dy1 = dstCur[ribbon.dstId] ?? 0, dy2 = dy1 + dstH;
      srcCur[ribbon.srcId] = sy2;
      dstCur[ribbon.dstId] = dy2;

      const path = [
        `M ${NW} ${sy1}`,
        `C ${mx} ${sy1}, ${mx} ${dy1}, ${destX} ${dy1}`,
        `L ${destX} ${dy2}`,
        `C ${mx} ${dy2}, ${mx} ${sy2}, ${NW} ${sy2}`,
        'Z',
      ].join(' ');

      const cls = `ribbon ribbon-${ribbon.srcId}`;
      g.append('path')
        .attr('d', path).attr('fill', ribbon.color).attr('opacity', 0.4)
        .attr('class', cls).style('cursor', 'pointer')
        .on('mouseover', (event: MouseEvent) => {
          g.selectAll(`.ribbon-${ribbon.srcId}`).attr('opacity', 0.72);
          const src = lefts.find(l => l.id === ribbon.srcId)!;
          const dst = rights.find(r => r.id === ribbon.dstId)!;
          let html = `<strong>${src.label} → ${dst.label}</strong><br/>`;
          html += `$${Math.round(ribbon.amount).toLocaleString()} of income`;
          if (dst.taxRate > 0) {
            const taxOnRibbon = ribbon.amount * dst.taxRate;
            html += `<br/>Est. tax on this slice: $${Math.round(taxOnRibbon).toLocaleString()}`;
          }
          tip = { visible: true, x: event.offsetX + 14, y: event.offsetY - 10, html };
        })
        .on('mousemove', (event: MouseEvent) => { tip = { ...tip, x: event.offsetX + 14, y: event.offsetY - 10 }; })
        .on('mouseout', () => { g.selectAll(`.ribbon-${ribbon.srcId}`).attr('opacity', 0.4); tip = { ...tip, visible: false }; });
    }

    // ── Draw left source bars + labels ───────────────────────────────────
    for (const ln of lefts) {
      const { y1, y2 } = leftPos[ln.id];
      const h = y2 - y1;
      g.append('rect')
        .attr('x', 0).attr('y', y1).attr('width', NW).attr('height', Math.max(2, h))
        .attr('fill', ln.color).attr('rx', 2);

      const midY = y1 + h / 2;
      g.append('text')
        .attr('x', -10).attr('y', midY - (h > 32 ? 9 : 0))
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('font-size', 14).attr('font-weight', 600).attr('fill', '#1A1A1A')
        .text(ln.label);
      if (h > 24) {
        g.append('text')
          .attr('x', -10).attr('y', midY + (h > 32 ? 11 : 0))
          .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
          .attr('font-size', 12).attr('fill', '#555')
          .text(`$${Math.round(ln.amount).toLocaleString()}`);
      }
    }

    // Gross income label
    g.append('text')
      .attr('x', NW / 2).attr('y', innerH + 16)
      .attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', '#333').attr('font-weight', 600)
      .text(`Gross: $${Math.round(gross).toLocaleString()}`);

    // ── Draw right destination bars + labels ─────────────────────────────
    for (const rn of rights) {
      const { y1, y2 } = rightPos[rn.id];
      const h = y2 - y1;

      // Full income bar (light)
      g.append('rect')
        .attr('x', destX).attr('y', y1).attr('width', NW).attr('height', Math.max(2, h))
        .attr('fill', rn.color).attr('opacity', 0.35).attr('rx', 2);

      // Tax-paid overlay (darker band at bottom of bar)
      if (rn.taxAmount > 0 && h > 1) {
        const taxH = Math.min(h, Math.max(1, (rn.taxAmount / gross) * rightUsableH));
        g.append('rect')
          .attr('x', destX).attr('y', y2 - taxH).attr('width', NW).attr('height', taxH)
          .attr('fill', rn.color).attr('opacity', 0.9).attr('rx', 2);
      }

      const midY = y1 + h / 2;
      // Label — primary
      g.append('text')
        .attr('x', destX + NW + 10).attr('y', midY - (h > 32 ? 9 : 0))
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 13).attr('font-weight', 600).attr('fill', '#1A1A1A')
        .text(rn.label);
      // Label — secondary (income → tax)
      if (h > 22) {
        const detail = rn.taxAmount > 0
          ? `$${Math.round(rn.amount).toLocaleString()} → $${Math.round(rn.taxAmount).toLocaleString()} tax`
          : `$${Math.round(rn.amount).toLocaleString()} sheltered`;
        g.append('text')
          .attr('x', destX + NW + 10).attr('y', midY + (h > 32 ? 11 : 0))
          .attr('dominant-baseline', 'middle')
          .attr('font-size', 11).attr('fill', '#555')
          .text(detail);
      }
    }

    // ── Bottom annotations ────────────────────────────────────────────────
    const stateTax  = result.stateTax + result.subJurisdictionTax;
    const niit      = result.surtaxes['niit'] ?? 0;
    const stateCode = String(scenario.state ?? '').toUpperCase();
    const takeHome  = gross - result.totalTax;

    let ay = innerH + 20;

    if (stateTax > 0) {
      g.append('text')
        .attr('x', innerW / 2).attr('y', ay)
        .attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', '#3b82f6').attr('font-weight', 600)
        .text(`+ ${stateCode} state/local tax: $${Math.round(stateTax).toLocaleString()}`);
      ay += 18;
    }
    if (niit > 0) {
      g.append('text')
        .attr('x', innerW / 2).attr('y', ay)
        .attr('text-anchor', 'middle').attr('font-size', 13).attr('fill', '#f97316').attr('font-weight', 600)
        .text(`+ NIIT 3.8% surtax: $${Math.round(niit).toLocaleString()}`);
      ay += 18;
    }
    g.append('text')
      .attr('x', innerW / 2).attr('y', ay)
      .attr('text-anchor', 'middle').attr('font-size', 14).attr('fill', '#16a34a').attr('font-weight', 700)
      .text(`Take-home: $${Math.round(takeHome).toLocaleString()} (${(takeHome / gross * 100).toFixed(1)}%)`);
  }

  onMount(draw);
  afterUpdate(draw);
</script>

<div class="sankey-wrap" bind:this={container}>
  <div class="chart-header">
    <span class="chart-title">Income Flow</span>
    <span class="chart-subtitle">Sources (left) → tax buckets (right) · ribbon width = dollars · dark band = tax paid · hover for detail</span>
  </div>

  <div class="chart-body">
    <svg bind:this={svg} viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet"></svg>

    {#if tip.visible}
      <div class="sankey-tip" style="left:{tip.x}px; top:{tip.y}px">{@html tip.html}</div>
    {/if}
  </div>
</div>

<style>
  .sankey-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 4px;
  }
  .chart-header {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .chart-title  { font-size: 12px; font-weight: 600; color: #1A1A1A; }
  .chart-subtitle { font-size: 10px; color: #bbb; line-height: 1.4; }

  .chart-body {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .chart-body svg {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
  }

  .sankey-tip {
    position: absolute;
    background: rgba(26,26,26,0.93);
    color: #fff;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.6;
    pointer-events: none;
    z-index: 20;
    max-width: 240px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }
</style>
