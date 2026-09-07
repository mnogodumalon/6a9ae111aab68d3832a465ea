import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['werkzeug', 'gemeldet_am', 'beschreibung'],
  defaults: {
    'gemeldet_am': { kind: 'today' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
