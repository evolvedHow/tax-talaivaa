import { derived } from 'svelte/store';
import { rulesStore } from './rules';
import { scenarioStore } from './scenario';
import { interpret } from '../engine/interpreter';
import type { TaxResult } from '../types/taxRules';

export const resultStore = derived<[typeof rulesStore, typeof scenarioStore], TaxResult | null>(
  [rulesStore, scenarioStore],
  ([$rules, $scenario]) => {
    if (!$rules) return null;
    try {
      return interpret($rules, $scenario);
    } catch (e) {
      console.error('Tax engine error:', e);
      return null;
    }
  }
);
