<script lang="ts">
  export let federalTax: number;
  export let taxYear: number = 2025;

  // Approximate FY2024/25 federal budget allocation (CBO/OMB estimates)
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

  let hoveredSlice: typeof SLICES[0] | null = null;
  let tipX = 0;
  let tipY = 0;
  let barEl: HTMLDivElement;

  function onOver(e: MouseEvent, s: typeof SLICES[0]) {
    hoveredSlice = s;
    reposition(e);
  }
  function onMove(e: MouseEvent) { reposition(e); }
  function onOut() { hoveredSlice = null; }

  function reposition(e: MouseEvent) {
    if (!barEl) return;
    const r = barEl.getBoundingClientRect();
    tipX = e.clientX - r.left + 12;
    tipY = e.clientY - r.top - 56;
  }
</script>

<div class="budget-wrap">
  <div class="bar-header">
    <span class="bar-title">Where Your Federal Tax Goes</span>
    <span class="bar-sub">≈ FY{taxYear} federal budget allocation · hover to see your dollars</span>
  </div>

  <!-- Stacked bar -->
  <div class="bar-container" bind:this={barEl}>
    <div class="stacked-bar">
      {#each SLICES as s}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="seg"
          style="width:{s.pct * 100}%; background:{s.color}; opacity:{hoveredSlice && hoveredSlice !== s ? 0.55 : 1}"
          on:mouseover={(e) => onOver(e, s)}
          on:mousemove={onMove}
          on:mouseout={onOut}
        ></div>
      {/each}
    </div>

    {#if hoveredSlice}
      <div class="tip" style="left:{tipX}px; top:{tipY}px">
        <strong>{hoveredSlice.label}</strong><br/>
        {(hoveredSlice.pct * 100).toFixed(1)}% of federal budget<br/>
        ~${Math.round(federalTax * hoveredSlice.pct).toLocaleString()} of your tax
      </div>
    {/if}
  </div>

  <!-- Legend: 5-across, 2 rows -->
  <div class="legend">
    {#each SLICES as s}
      <div class="l-item">
        <span class="l-dot" style="background:{s.color}"></span>
        <span class="l-label">{s.label}</span>
        <span class="l-amt">${Math.round(federalTax * s.pct).toLocaleString()}</span>
      </div>
    {/each}
  </div>

  <p class="note">Proportions are approximate; based on overall federal spending, not income tax specifically.</p>
</div>

<style>
  .budget-wrap { display: flex; flex-direction: column; gap: 8px; }

  .bar-header  { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .bar-title   { font-size: 13px; font-weight: 600; color: #1A1A1A; }
  .bar-sub     { font-size: 11px; color: #777; }

  .bar-container { position: relative; }

  .stacked-bar {
    display: flex;
    height: 34px;
    border-radius: 6px;
    overflow: hidden;
    width: 100%;
    cursor: pointer;
  }
  .seg { height: 100%; transition: opacity 0.15s; }

  .tip {
    position: absolute;
    background: rgba(26,26,26,0.93);
    color: #fff;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.6;
    pointer-events: none;
    z-index: 30;
    white-space: nowrap;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  }

  .legend {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px 12px;
  }
  .l-item  { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .l-dot   { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .l-label { font-size: 11px; color: #444; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .l-amt   { font-size: 11px; font-weight: 700; color: #1A1A1A; white-space: nowrap; }

  .note { font-size: 10px; color: #999; margin: 0; }
</style>
