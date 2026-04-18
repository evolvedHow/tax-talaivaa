<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import type { TaxResult, BracketBreakdown } from '../types/taxRules';

  export let result: TaxResult;

  // WCAG AA accessible palette for tax brackets (10%→37%)
  const BRACKET_COLORS = [
    '#4ade80', // 10% - green
    '#86efac', // 12% - light green
    '#fbbf24', // 22% - amber
    '#f97316', // 24% - orange
    '#ef4444', // 32% - red
    '#dc2626', // 35% - dark red
    '#7f1d1d', // 37% - very dark red
  ];
  const STATE_COLOR = '#60a5fa';
  const DEDUCTION_COLOR = '#e5e7eb';

  let svg: SVGSVGElement;
  let tooltip: HTMLDivElement;
  let tooltipContent = '';
  let tooltipX = 0;
  let tooltipY = 0;
  let tooltipVisible = false;

  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = 340;
  const height = 360;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  function draw() {
    if (!svg || !result) return;
    const root = d3.select(svg);
    root.selectAll('*').remove();

    const g = root.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const gross = result.grossIncome;
    if (gross <= 0) return;

    const yScale = d3.scaleLinear().domain([0, gross]).range([innerH, 0]);
    const barW = 80;

    // ── Federal bar ──────────────────────────────────────────────────────────
    const fedX = innerW / 4 - barW / 2;

    // Deduction segment (top of bar)
    const dedH = Math.max(0, yScale(gross - result.deductionAmount) - yScale(gross));
    g.append('rect')
      .attr('x', fedX)
      .attr('y', yScale(gross))
      .attr('width', barW)
      .attr('height', dedH < 0 ? 0 : dedH)
      .attr('fill', DEDUCTION_COLOR)
      .attr('stroke', '#ccc')
      .on('mouseover', (event) => showTip(event, `Deductions: $${Math.round(result.deductionAmount).toLocaleString()}`))
      .on('mouseout', hideTip);

    // Bracket segments
    let cursor = result.taxableIncome;
    const brackets = [...result.federalBracketBreakdown].reverse();
    brackets.forEach((b, i) => {
      const segH = (b.income / gross) * innerH;
      const y = yScale(cursor);
      g.append('rect')
        .attr('x', fedX)
        .attr('y', y)
        .attr('width', barW)
        .attr('height', Math.max(0, segH))
        .attr('fill', BRACKET_COLORS[i % BRACKET_COLORS.length])
        .attr('stroke', 'rgba(0,0,0,0.05)')
        .style('transition', 'height 0.3s ease')
        .on('mouseover', (event) =>
          showTip(event, `${b.bracket}\nRate: ${(b.rate * 100).toFixed(0)}%\nIncome: $${Math.round(b.income).toLocaleString()}\nTax: $${Math.round(b.tax).toLocaleString()}`)
        )
        .on('mouseout', hideTip);
      cursor -= b.income;
    });

    // Label
    g.append('text')
      .attr('x', fedX + barW / 2)
      .attr('y', innerH + 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#555')
      .text('Federal');

    // ── State bar ────────────────────────────────────────────────────────────
    const stateX = (3 * innerW) / 4 - barW / 2;
    const stateH = (result.stateTax / gross) * innerH;
    const stateTaxH = ((result.stateTax + result.subJurisdictionTax) / gross) * innerH;

    g.append('rect')
      .attr('x', stateX)
      .attr('y', yScale(result.stateTax + result.subJurisdictionTax))
      .attr('width', barW)
      .attr('height', Math.max(0, stateTaxH))
      .attr('fill', STATE_COLOR)
      .attr('stroke', 'rgba(0,0,0,0.05)')
      .on('mouseover', (event) =>
        showTip(event, `State Tax: $${Math.round(result.stateTax).toLocaleString()}\nLocal: $${Math.round(result.subJurisdictionTax).toLocaleString()}`)
      )
      .on('mouseout', hideTip);

    g.append('text')
      .attr('x', stateX + barW / 2)
      .attr('y', innerH + 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#555')
      .text('State/Local');

    // ── Y Axis ───────────────────────────────────────────────────────────────
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat(d => `$${(Number(d) / 1000).toFixed(0)}k`);
    g.append('g').call(yAxis).call(ax => ax.select('.domain').remove());
  }

  function showTip(event: MouseEvent, content: string) {
    tooltipContent = content;
    tooltipX = event.offsetX + 10;
    tooltipY = event.offsetY - 10;
    tooltipVisible = true;
  }

  function hideTip() {
    tooltipVisible = false;
  }

  onMount(draw);
  afterUpdate(draw);
</script>

<div class="chart-wrap">
  <h3 class="chart-title">Tax Stack</h3>
  <div style="position:relative">
    <svg bind:this={svg} width={width} height={height}></svg>
    {#if tooltipVisible}
      <div
        bind:this={tooltip}
        class="tooltip"
        style="left:{tooltipX}px;top:{tooltipY}px"
      >{tooltipContent}</div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="legend">
    {#each ['10%','12%','22%','24%','32%','35%','37%'] as rate, i}
      <span class="legend-item">
        <span class="swatch" style="background:{BRACKET_COLORS[i]}"></span>
        {rate}
      </span>
    {/each}
    <span class="legend-item">
      <span class="swatch" style="background:{DEDUCTION_COLOR};border:1px solid #ccc"></span>
      Deductions
    </span>
    <span class="legend-item">
      <span class="swatch" style="background:{STATE_COLOR}"></span>
      State
    </span>
  </div>
</div>

<style>
  .chart-wrap { display: flex; flex-direction: column; gap: 8px; }
  .chart-title { font-size: 15px; font-weight: 600; color: #1A1A1A; }
  .tooltip {
    position: absolute;
    background: rgba(26,26,26,0.9);
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    white-space: pre-line;
    pointer-events: none;
    z-index: 10;
    max-width: 200px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: #555;
  }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
</style>
