import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['werkzeug', 'mitarbeiter', 'ausgabe', { row: ['rueckgabe_geplant', 'rueckgabe_erfolgt'] }, 'zustand_bei_rueckgabe'],
  defaults: {
    'ausgabe': { kind: 'today', withTime: true },
    'rueckgabe_geplant': { kind: 'todayOffset', days: 3 },
    'zustand_bei_rueckgabe': { kind: 'lookup', key: 'einwandfrei', label: 'Einwandfrei' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
