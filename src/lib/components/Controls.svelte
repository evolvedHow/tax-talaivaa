<script lang="ts">
  import type { Lever } from '../types/taxRules';
  import { updateLever } from '../stores/scenario';
  import type { ScenarioInputs } from '../types/taxRules';
  import InfoIcon from './InfoIcon.svelte';

  export let levers: Lever[];
  export let scenario: ScenarioInputs;

  function handleChange(lever: Lever, raw: string | boolean) {
    if (lever.type === 'toggle') {
      updateLever(lever.id, raw as boolean);
    } else if (lever.type === 'slider' || lever.type === 'integer') {
      updateLever(lever.id, Number(raw));
    } else {
      updateLever(lever.id, raw as string);
    }
  }

  // Slider fires on:input for live dragging; number input fires on:change on blur/enter
  function onSliderInput(lever: Lever, e: Event) {
    handleChange(lever, (e.target as HTMLInputElement).value);
  }
  function onDirectInput(lever: Lever, e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    const v = Number(raw);
    if (!isNaN(v)) handleChange(lever, String(v));
  }
  function onNumberChange(lever: Lever, e: Event) {
    handleChange(lever, (e.target as HTMLInputElement).value);
  }
  function onCheckboxChange(lever: Lever, e: Event) {
    handleChange(lever, (e.target as HTMLInputElement).checked);
  }
  function onSelectChange(lever: Lever, e: Event) {
    handleChange(lever, (e.target as HTMLSelectElement).value);
  }
</script>

<div class="controls">
  {#each levers as lever (lever.id)}
    <div class="lever">
      <!-- Label row -->
      <div class="lever-header">
        <label for={lever.id} class="lever-label">{lever.label}</label>
        {#if lever.help}
          <InfoIcon text={lever.help} position="left" />
        {/if}
      </div>

      {#if lever.type === 'slider'}
        <!-- Slider + direct number input side by side -->
        <div class="slider-row">
          <input
            id={lever.id}
            type="range"
            min={lever.min ?? 0}
            max={lever.max ?? 100}
            step={lever.step ?? 1}
            value={Number(scenario[lever.id] ?? lever.default)}
            on:input={e => onSliderInput(lever, e)}
            class="slider"
          />
          <input
            type="number"
            min={lever.min ?? 0}
            max={lever.max}
            step={lever.step ?? 1}
            value={Number(scenario[lever.id] ?? lever.default)}
            on:change={e => onDirectInput(lever, e)}
            class="direct-input"
            aria-label="{lever.label} value"
          />
        </div>
        <div class="slider-bounds">
          <span>${(lever.min ?? 0).toLocaleString()}</span>
          <span>${(lever.max ?? 0).toLocaleString()}</span>
        </div>

      {:else if lever.type === 'integer'}
        <input
          id={lever.id}
          type="number"
          min={lever.min}
          max={lever.max}
          step={lever.step ?? 1}
          value={Number(scenario[lever.id] ?? lever.default)}
          on:change={e => onNumberChange(lever, e)}
          class="number-input"
        />

      {:else if lever.type === 'toggle'}
        <label class="toggle-wrap">
          <input
            id={lever.id}
            type="checkbox"
            checked={Boolean(scenario[lever.id] ?? lever.default)}
            on:change={e => onCheckboxChange(lever, e)}
          />
          <span class="toggle-slider"></span>
          <span class="toggle-text">{Boolean(scenario[lever.id] ?? lever.default) ? 'Yes' : 'No'}</span>
        </label>

      {:else if lever.type === 'dropdown'}
        <select
          id={lever.id}
          value={String(scenario[lever.id] ?? lever.default)}
          on:change={e => onSelectChange(lever, e)}
        >
          {#each lever.options ?? [] as opt}
            <option value={opt}>{opt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/each}
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lever {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lever-header {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .lever-label {
    font-size: 11px;
    font-weight: 500;
    color: #1A1A1A;
    flex: 1;
    line-height: 1.2;
  }

  /* Slider + direct input row */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slider {
    flex: 1;
    accent-color: #2563eb;
    cursor: pointer;
    min-width: 0;
  }
  .direct-input {
    width: 76px;
    flex-shrink: 0;
    padding: 3px 6px;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    background: #fff;
    color: #1A1A1A;
    text-align: right;
    /* hide spinner arrows */
    -moz-appearance: textfield;
  }
  .direct-input::-webkit-outer-spin-button,
  .direct-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .direct-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
  }

  .slider-bounds {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #bbb;
    padding-right: 78px;
  }

  .number-input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    background: #fff;
  }
  select {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    background: #fff;
    cursor: pointer;
  }

  /* Toggle switch */
  .toggle-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }
  .toggle-wrap input[type="checkbox"] { display: none; }
  .toggle-slider {
    width: 38px;
    height: 21px;
    background: #ccc;
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 15px;
    height: 15px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  input[type="checkbox"]:checked ~ .toggle-slider { background: #2563eb; }
  input[type="checkbox"]:checked ~ .toggle-slider::after { transform: translateX(17px); }
  .toggle-text { font-size: 13px; color: #555; }
</style>
