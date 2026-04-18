<script lang="ts">
  export let text: string;
  export let position: 'right' | 'left' | 'bottom' = 'right';

  let open = false;

  function toggle() { open = !open; }
  function close() { open = false; }
</script>

<svelte:window on:click={close} />

<span
  class="info-wrap"
  on:click|stopPropagation={toggle}
  on:mouseenter={() => open = true}
  on:mouseleave={() => open = false}
  role="button"
  tabindex="0"
  on:keydown={e => e.key === 'Enter' && toggle()}
  aria-label="More information"
>
  <span class="icon">ⓘ</span>
  {#if open}
    <span class="tooltip {position}" role="tooltip">{text}</span>
  {/if}
</span>

<style>
  .info-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .icon {
    font-size: 13px;
    color: #aaa;
    line-height: 1;
    transition: color 0.15s;
    user-select: none;
  }
  .info-wrap:hover .icon { color: #2563eb; }

  .tooltip {
    position: absolute;
    z-index: 100;
    background: #1A1A1A;
    color: #fff;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    padding: 10px 13px;
    border-radius: 8px;
    width: 220px;
    white-space: normal;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  }
  /* Arrow shared */
  .tooltip::before {
    content: '';
    position: absolute;
    border: 6px solid transparent;
  }
  /* right: tooltip appears to the right of icon */
  .tooltip.right {
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
  }
  .tooltip.right::before {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    border-right-color: #1A1A1A;
  }
  /* left: tooltip appears to the left */
  .tooltip.left {
    right: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
  }
  .tooltip.left::before {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    border-left-color: #1A1A1A;
  }
  /* bottom: tooltip appears below */
  .tooltip.bottom {
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
  }
  .tooltip.bottom::before {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-bottom-color: #1A1A1A;
  }
</style>
