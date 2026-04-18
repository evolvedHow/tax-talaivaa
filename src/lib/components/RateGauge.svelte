<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';
  import InfoIcon from './InfoIcon.svelte';

  export let label: string;
  export let rate: number; // 0–1
  export let help: string = '';
  export let compact: boolean = false;

  let svg: SVGSVGElement;
  const size = compact ? 90 : 130;
  const cx = size / 2;
  const cy = size / 2 + (compact ? 6 : 10);
  const r = compact ? 32 : 48;

  function rateColor(r: number): string {
    if (r < 0.15) return '#4ade80';
    if (r < 0.25) return '#fbbf24';
    return '#ef4444';
  }

  function draw() {
    if (!svg) return;
    const root = d3.select(svg);
    root.selectAll('*').remove();

    const angle = (v: number) => Math.PI * (v - 0.5); // -π/2..π/2 mapped 0..1 → left..right

    const arcBg = d3.arc<unknown, unknown>()
      .innerRadius(r - 10)
      .outerRadius(r)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);

    const arcFg = d3.arc<unknown, unknown>()
      .innerRadius(r - 10)
      .outerRadius(r)
      .startAngle(-Math.PI / 2)
      .endAngle(angle(Math.min(rate, 1)));

    const g = root.append('g').attr('transform', `translate(${cx},${cy})`);

    g.append('path')
      .attr('d', arcBg as any)
      .attr('fill', '#e5e7eb');

    g.append('path')
      .attr('d', arcFg as any)
      .attr('fill', rateColor(rate))
      .style('transition', 'd 0.3s ease');

    // Needle
    const needleAngle = -Math.PI / 2 + Math.PI * Math.min(rate, 1);
    const nx = (r - 5) * Math.cos(needleAngle);
    const ny = (r - 5) * Math.sin(needleAngle);
    g.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', nx).attr('y2', ny)
      .attr('stroke', '#1A1A1A')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');

    g.append('circle').attr('r', 4).attr('fill', '#1A1A1A');

    // Rate label
    g.append('text')
      .attr('y', compact ? 13 : 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', compact ? 14 : 20)
      .attr('font-weight', 700)
      .attr('fill', '#1A1A1A')
      .text(`${(rate * 100).toFixed(1)}%`);

    // Min/Max labels
    g.append('text').attr('x', -r).attr('y', compact ? 10 : 16).attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', '#888').text('0%');
    g.append('text').attr('x', r).attr('y', compact ? 10 : 16).attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', '#888').text('50%+');
  }

  onMount(draw);
  afterUpdate(draw);
</script>

<div class="gauge-card">
  <svg bind:this={svg} width={size} height={size}></svg>
  <div class="gauge-label-row">
    <p class="gauge-label">{label}</p>
    {#if help}
      <InfoIcon text={help} position="bottom" />
    {/if}
  </div>
</div>

<style>
  .gauge-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #fff;
    border-radius: 10px;
    padding: 10px 10px 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
    min-width: 100px;
  }
  .gauge-label-row {
    display: flex;
    align-items: center;
    gap: 3px;
    justify-content: center;
  }
  .gauge-label {
    font-size: 11px;
    color: #666;
    text-align: center;
    margin-top: 2px;
    font-weight: 500;
    line-height: 1.2;
  }
</style>
