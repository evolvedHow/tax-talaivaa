import { writable } from 'svelte/store';
import type { TaxRules } from '../types/taxRules';

export const rulesStore = writable<TaxRules | null>(null);
export const rulesError = writable<string | null>(null);
export const rulesLoading = writable<boolean>(true);
