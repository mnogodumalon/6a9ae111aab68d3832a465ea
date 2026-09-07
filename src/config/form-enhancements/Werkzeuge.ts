// Auto-generated. Per-entity form-enhancements config for "Werkzeuge".
// Refined by Form-Polish Sub-Agent — Bestandsverwaltung, keine Berechnung.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['bezeichnung', 'inventarnummer', 'status', 'bestand', 'anschaffungspreis', 'kategorien', 'handbuch', 'ersatz_fuer'],
  defaults: {
    'status': { kind: 'lookup', key: 'verfuegbar', label: 'Verfügbar' },
    'bestand': { kind: 'literal', value: 1 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
