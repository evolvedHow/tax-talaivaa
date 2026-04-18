<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';

  export let federalTax: number;
  export let taxYear: number = 2025;

  let svgEl: SVGSVGElement;
  let tip = { visible: false, x: 0, y: 0, html: '' };

  // Approximate FY2024/25 federal spending allocation (CBO/OMB estimates)
  const SLICES = [
    { label: 'Social Security',  pct: 0.227, color: '#3b82f6' },
    { label: 'Medicare',         pct: 0.136, color: '#06b6d4' },
    { label: 'Medicaid',         pct: 0.096, color: '#67e8f9' },
    { label: 'Defense',          pct: 0.136, color: '#ef4444' },
    { label: 'Interest on Debt', pct: 0.139, color: '#f97316' },
    { label: 'Income Security',  pct: 0.122, color: '#8b5cf6' },
    { label: 'Veterans',         pct: 0.050, color: '#10b981' },
    { label: 'Education',        pct: 0.022, color: '#fbbf24' },
    { label: 'Transportation',   pct: 0.020, color: '#a78bfa' },
    { label: 'Other Programs',   pct: 0.052, color: '#94a3b8' },
  ];

  const SIZE = 200;
  const outerR = 76, innerR = 46;

  function draw() {
    if (!svgEl || federalTax <= 0) return;
    const root = d3.select(svgEl);
    root.selectAll('*').remove();

    const pie = d3.pie<typeof SLICES[0]>().value(d => d.pct).sort(null);
    const arc    = d3.arc<d3.PieArcDatum<typeof SLICES[0]>>().innerRadius(innerR).outerRadius(outerR);
    const arcHov = d3.arc<d3.PieArcDatum<typeof SLICES[0]>>().innerRadius(innerR).outerRadius(outerR + 7);

    const g = root.append('g').attr('transform', `translate(${SIZE / 2},${SIZE / 2})`);

    g.selectAll('path')
      .data(pie(SLICES))
      .enter().append('path')
        .attr('d', arc as any)
        .attr('fill', d => d.data.color)
        .attr('stroke', '#F5F5F5')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseover', function(event: MouseEvent, d) {
          d3.select(this).attr('d', arcHov(d) as any);
          const amt = Math.round(federalTax * d.data.pct);
          tip = {
            visible: true, x: event.offsetX + 12, y: event.offsetY - 10,
            html: `<strong>${d.data.label}</strong><br/>~$${amt.toLocaleString()} of your federal tax`,
          };
        })
        .on('mousemove', (event: MouseEvent) => { tip = { ...tip, x: event.offsetX + 12, y: event.offsetY - 10 }; })
        .on('mouseout', function(_: MouseEvent, d) {
          d3.select(this).attr('d', arc(d) as any);
          tip = { ...tip, visible: false };
        });

    // Center label
    g.append('text').attr('text-anchor', 'middle').attr('y', -7)
      .attr('font-size', 9).attr('fill', '#aaa').text('your federal tax');
    g.append('text').attr('text-anchor', 'middle').attr('y', 11)
      .attr('font-size', 15).attr('font-weight', 700).attr('fill', '#1A1A1A')
      .text(`$${Math.round(federalTax).toLocaleString()}`);
  }

  onMount(draw);
  afterUpdate(draw);
</script>

<div class="budget-wrap">
  <div class="bud-header">
    <span class="bud-title">Where Your Federal Tax Goes</span>
    <span class="bud-sub">≈ FY{taxYear} federal budget allocation</span>
  </div>

  <div class="donut-area" style="position:relative">
    <svg bind:this={svgEl} width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}"
         style="display:block; margin:0 auto; max-width:100%"></svg>
    {#if tip.visible}
      <div class="bud-tip" style="left:{tip.x}px; top:{tip.y}px">{@html tip.html}</div>
    {/if}
  </div>

  <div class="legend">
    {#each SLICES as s}
      <div class="legend-item">
        <span class="l-dot" style="background:{s.color}"></span>
        <span class="l-label">{s.label}</span>
        <span class="l-amt">${Math.round(federalTax * s.pct).toLocaleString()}</span>
      </div>
    {/each}
  </div>

  <p class="bud-note">Based on overall federal spending; proportions are approximate.</p>
</div>

<style>
  .budget-wrap { display: flex; flex-direction: column; gap: 6px; height: 100%; }

  .bud-header  { flex-shrink: 0; }
  .bud-title   { display: block; font-size: 12px; font-weight: 600; color: #1A1A1A; }
  .bud-sub     { font-size: 10px; color: #bbb; }

  .donut-area  { flex-shrink: 0; }

  .legend {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 10px;
    flex-shrink: 0;
  }
  .legend-item { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .l-dot       { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .l-label     { font-size: 10px; color: #555; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .l-amt       { font-size: 10px; font-weight: 600; color: #1A1A1A; white-space: nowrap; }

  .bud-tip {
    position: absolute;
    background: rgba(26,26,26,0.93);
    color: #fff;
    padding: 7px 11px;
    border-radius: 7px;
    font-size: 11px;
    line-height: 1.6;
    pointer-events: none;
    z-index: 20;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }

  .bud-note { font-size: 9px; color: #ccc; margin: 2px 0 0; line-height: 1.3; }
</style>
