import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['bezeichnung', 'inventarnummer', 'status', 'bestand', 'anschaffungspreis', 'kategorien', 'ersatz_fuer', 'handbuch'],
  defaults: {
    'status': { kind: 'lookup', key: 'verfuegbar', label: 'Verfügbar' },
    'bestand': { kind: 'literal', value: 1 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
