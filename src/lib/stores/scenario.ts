import { writable } from 'svelte/store';
import type { ScenarioInputs, TaxRules } from '../types/taxRules';

export const scenarioStore = writable<ScenarioInputs>({});

export function initScenario(rules: TaxRules): void {
  const defaults: ScenarioInputs = {};
  for (const lever of rules.levers) {
    defaults[lever.id] = lever.default;
  }
  scenarioStore.set(defaults);
}

export function updateLever(id: string, value: number | string | boolean): void {
  scenarioStore.update(s => ({ ...s, [id]: value }));
}
