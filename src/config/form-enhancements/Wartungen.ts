import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['werkzeug', 'datum', 'beschreibung', 'kosten', 'erledigt'],
  defaults: {
    'datum': { kind: 'today' },
    'erledigt': { kind: 'literal', value: false },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
