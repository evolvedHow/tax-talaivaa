<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import type { TaxResult } from '../types/taxRules';

  export let result: TaxResult;

  let svg: SVGSVGElement;

  const margin = { top: 16, right: 20, bottom: 60, left: 120 };
  const width = 400;
  const height = 260;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  function draw() {
    if (!svg || !result) return;
    const root = d3.select(svg);
    root.selectAll('*').remove();

    const g = root.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const steps: { label: string; value: number; cumulative: number; isDeduction: boolean }[] = [];
    let running = result.grossIncome;

    steps.push({ label: 'Gross Income', value: result.grossIncome, cumulative: result.grossIncome, isDeduction: false });

    // IRA deduction
    if (result.deductionBreakdown.ira && result.deductionBreakdown.ira > 0) {
      running -= result.deductionBreakdown.ira;
      steps.push({ label: 'IRA Deduction', value: -result.deductionBreakdown.ira, cumulative: running, isDeduction: true });
    }

    if (result.deductionType === 'itemized') {
      const bd = result.deductionBreakdown;
      if ((bd.salt_cap_applied ?? 0) > 0) {
        running -= bd.salt_cap_applied!;
        steps.push({ label: 'SALT (capped)', value: -(bd.salt_cap_applied!), cumulative: running, isDeduction: true });
      }
      if ((bd.mortgage_interest ?? 0) > 0) {
        running -= bd.mortgage_interest!;
        steps.push({ label: 'Mortgage Int.', value: -(bd.mortgage_interest!), cumulative: running, isDeduction: true });
      }
      if ((bd.charity ?? 0) > 0) {
        running -= bd.charity!;
        steps.push({ label: 'Charity', value: -(bd.charity!), cumulative: running, isDeduction: true });
      }
    } else {
      running = result.grossIncome - (result.deductionBreakdown.ira ?? 0) - (result.deductionAmount - (result.deductionBreakdown.ira ?? 0));
      steps.push({ label: 'Standard Ded.', value: -(result.deductionAmount - (result.deductionBreakdown.ira ?? 0)), cumulative: running, isDeduction: true });
    }

    steps.push({ label: 'Taxable Income', value: result.taxableIncome, cumulative: result.taxableIncome, isDeduction: false });

    const maxVal = result.grossIncome;
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, innerW]);
    const yScale = d3.scaleBand()
      .domain(steps.map(s => s.label))
      .range([0, innerH])
      .padding(0.3);

    const barH = yScale.bandwidth();

    steps.forEach((step, i) => {
      const isFirst = i === 0;
      const isLast = step.label === 'Taxable Income';
      const x = isFirst || isLast ? 0 : xScale(Math.min(step.cumulative, step.cumulative - step.value));
      const w = isFirst || isLast ? xScale(step.value) : xScale(Math.abs(step.value));
      const y = yScale(step.label) ?? 0;

      g.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', Math.max(0, w))
        .attr('height', barH)
        .attr('fill', isLast ? '#1A1A1A' : step.isDeduction ? '#86efac' : '#60a5fa')
        .attr('rx', 3);

      g.append('text')
        .attr('x', x + Math.max(0, w) + 6)
        .attr('y', y + barH / 2 + 4)
        .attr('font-size', 11)
        .attr('fill', '#555')
        .text(`$${Math.abs(Math.round(step.value)).toLocaleString()}`);
    });

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(ax => ax.select('.domain').remove())
      .selectAll('text')
      .attr('font-size', 12)
      .attr('fill', '#333');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(4).tickFormat(d => `$${(Number(d) / 1000).toFixed(0)}k`))
      .call(ax => ax.select('.domain').remove());
  }

  onMount(draw);
  afterUpdate(draw);
</script>

<div class="chart-wrap">
  <h3 class="chart-title">Deduction Waterfall</h3>
  <svg bind:this={svg} {width} {height}></svg>
</div>

<style>
  .chart-wrap { display: flex; flex-direction: column; gap: 8px; }
  .chart-title { font-size: 15px; font-weight: 600; color: #1A1A1A; }
  svg { overflow: visible; }
</style>
