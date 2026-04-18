<script lang="ts">
  export let warnings: string[];
</script>

{#if warnings.length > 0}
  <div class="overlays">
    {#each warnings as w}
      <div class="warning-banner" class:niit={w.includes('NIIT')} class:amt={w.includes('AMT')}>
        <span class="icon">{w.includes('AMT') ? '⚠' : '●'}</span>
        {w}
      </div>
    {/each}
  </div>
{/if}

<style>
  .overlays { display: flex; flex-direction: column; gap: 8px; }
  .warning-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }
  .niit { background: #fef3c7; color: #92400e; border: 1px solid #fbbf24; }
  .amt { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
  .icon { font-size: 16px; }
</style>
