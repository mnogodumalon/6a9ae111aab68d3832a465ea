// Auto-generated. Per-entity form-enhancements config for "Ausleihen".
// Refined by Form-Polish Sub-Agent — Ausleihverwaltung mit Datumspaar (Ausgabe/Rückgabe).

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['werkzeug', 'mitarbeiter', 'ausgabe', 'rueckgabe_geplant', 'rueckgabe_erfolgt', 'zustand_bei_rueckgabe'],
  defaults: {
    'ausgabe': { kind: 'today', withTime: true },
    'rueckgabe_geplant': { kind: 'todayOffset', days: 7 },
  },
  computed: {
    '_ausleihe_dauer_stunden': { kind: 'dateDiff', from: 'ausgabe', to: 'rueckgabe_erfolgt', unit: 'hours' },
  },
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
