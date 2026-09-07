import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [{ row: ['vorname', 'nachname'] }, 'personalnummer', 'abteilung', 'mobil', 'aktiv'],
  defaults: {
    'aktiv': { kind: 'literal', value: true },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
