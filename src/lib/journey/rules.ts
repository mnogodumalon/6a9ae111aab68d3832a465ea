/**
 * Field rules — GENERATED from the app metadata. Do not edit.
 *
 * The mechanical truth about every field: what kind it is, whether the
 * platform's base view marks it required, which lookup keys exist, where an
 * applookup points, what the label is. `useStepForm` validates against these
 * rules and phrases its messages with the real labels; `toWirePayload` uses
 * them to shape the create payload; `SHAPES` tells a page which input FORM
 * fits the data (a date pair wants a calendar, not two fields) — it is a
 * signal, not a gate.
 */
import { appLabel, fieldLabel, lookupLabel } from '@/i18n';
import { LOOKUP_OPTIONS } from '@/types/app';

export type EntityKey = 'mitarbeiter' | 'werkzeuge' | 'ausleihen' | 'wartungen' | 'schaeden';

/** The text fields of each entity — what a search may run over (generated;
 *  `never` for an entity without text of its own, e.g. a link table). */
export interface StringFields {
  "mitarbeiter": "vorname" | "nachname" | "personalnummer" | "mobil";
  "werkzeuge": "bezeichnung" | "inventarnummer" | "handbuch";
  "ausleihen": never;
  "wartungen": "beschreibung";
  "schaeden": "beschreibung";
}
export type StringFieldKey<E extends EntityKey> = E extends keyof StringFields ? StringFields[E] : never;

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'bool'
  | 'date'
  | 'datetime'
  | 'lookup'
  | 'multilookup'
  | 'record'
  | 'multirecord'
  | 'file'
  | 'geo';

export interface FieldRule {
  key: string;
  fulltype: string;
  kind: FieldKind;
  /** From the app's base view. A public page may override this per field. */
  required: boolean;
  /** Build-time label — `labelOf()` prefers the runtime i18n bundle. */
  label: string;
  /** Whether a journey may write it (`file` is upload-only, never via a journey). */
  writable: boolean;
  maxLength?: number;
  /** lookup / multilookup: the ONLY valid write values. */
  options?: string[];
  /** record / multirecord: the target app (always) and its entity key (when inside this appgroup). */
  targetAppId?: string;
  targetEntity?: EntityKey;
  format?: 'currency';
  /** HTML autocomplete token derived from the field name (given-name, email, tel, …). */
  autoComplete?: string;
}

export interface EntityInfo {
  key: EntityKey;
  appId: string;
  label: string;
  /** PascalCase plural — `get<pascal>()` on the service. */
  pascal: string;
  /** The single-record suffix — `create<single>()` on the service. */
  single: string;
}

/** Input-form signals per entity: which data shape each field (pair) has.
 *  `range`  — two date fields that form a stay/period → AvailabilityRangePicker
 *  `choice` — a lookup with few options → ChoiceGroup pills instead of a select
 *  `record` — an applookup → EntitySelectStep with search, never a raw id field
 *  `stock`  — a quantity that has a stock/capacity counterpart → show it, warn on overshoot */
export type Shape =
  | { kind: 'range'; from: string; to: string }
  | { kind: 'choice'; field: string; count: number }
  | { kind: 'record'; field: string; targetEntity?: EntityKey }
  | { kind: 'stock'; field: string };

export const ENTITIES: Record<EntityKey, EntityInfo> = {
  "mitarbeiter": {
    "key": "mitarbeiter",
    "appId": "6a9ae0d3ea58e12f04d058b8",
    "label": "Mitarbeiter",
    "pascal": "Mitarbeiter",
    "single": "MitarbeiterEntry"
  },
  "werkzeuge": {
    "key": "werkzeuge",
    "appId": "6a9ae0d7cbcbecdbd87197b3",
    "label": "Werkzeuge",
    "pascal": "Werkzeuge",
    "single": "WerkzeugeEntry"
  },
  "ausleihen": {
    "key": "ausleihen",
    "appId": "6a9ae0d8b513fc8850fabef9",
    "label": "Ausleihen",
    "pascal": "Ausleihen",
    "single": "AusleihenEntry"
  },
  "wartungen": {
    "key": "wartungen",
    "appId": "6a9ae0d8ab5b3398be0528bd",
    "label": "Wartungen",
    "pascal": "Wartungen",
    "single": "WartungenEntry"
  },
  "schaeden": {
    "key": "schaeden",
    "appId": "6a9ae0d99c85cb9fa5a168ca",
    "label": "Schäden",
    "pascal": "Schaeden",
    "single": "SchaedenEntry"
  }
};

export const FIELD_RULES: Record<EntityKey, Record<string, FieldRule>> = {
  "mitarbeiter": {
    "vorname": {
      "key": "vorname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Vorname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "given-name"
    },
    "nachname": {
      "key": "nachname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Nachname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "family-name"
    },
    "personalnummer": {
      "key": "personalnummer",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Personalnummer",
      "writable": true,
      "maxLength": 4000
    },
    "abteilung": {
      "key": "abteilung",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": false,
      "label": "Abteilung",
      "writable": true,
      "options": [
        "strassenbau",
        "gruenpflege",
        "hochbau",
        "elektrik",
        "fuhrpark",
        "reinigung",
        "verwaltung",
        "winterdienst"
      ]
    },
    "mobil": {
      "key": "mobil",
      "fulltype": "string/tel",
      "kind": "tel",
      "required": false,
      "label": "Mobil",
      "writable": true,
      "autoComplete": "tel"
    },
    "aktiv": {
      "key": "aktiv",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Aktiv",
      "writable": true
    }
  },
  "werkzeuge": {
    "bezeichnung": {
      "key": "bezeichnung",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Bezeichnung",
      "writable": true,
      "maxLength": 4000
    },
    "inventarnummer": {
      "key": "inventarnummer",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Inventarnummer",
      "writable": true,
      "maxLength": 4000
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "verfuegbar",
        "verliehen",
        "defekt",
        "in_wartung"
      ]
    },
    "bestand": {
      "key": "bestand",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Bestand",
      "writable": true
    },
    "standort": {
      "key": "standort",
      "fulltype": "geo",
      "kind": "geo",
      "required": false,
      "label": "Standort",
      "writable": true
    },
    "anschaffungspreis": {
      "key": "anschaffungspreis",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Anschaffungspreis (Euro)",
      "writable": true,
      "format": "currency"
    },
    "handbuch": {
      "key": "handbuch",
      "fulltype": "string/url",
      "kind": "url",
      "required": false,
      "label": "Handbuch",
      "writable": true,
      "autoComplete": "url"
    },
    "kategorien": {
      "key": "kategorien",
      "fulltype": "multiplelookup/checkbox",
      "kind": "multilookup",
      "required": false,
      "label": "Kategorien",
      "writable": true,
      "options": [
        "elektrowerkzeug",
        "handwerkzeug",
        "messgeraet",
        "sicherheitsausruestung"
      ]
    },
    "ersatz_fuer": {
      "key": "ersatz_fuer",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": false,
      "label": "Ersatz für",
      "writable": true,
      "targetAppId": "6a9ae0d7cbcbecdbd87197b3",
      "targetEntity": "werkzeuge"
    }
  },
  "ausleihen": {
    "werkzeug": {
      "key": "werkzeug",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Werkzeug",
      "writable": true,
      "targetAppId": "6a9ae0d7cbcbecdbd87197b3",
      "targetEntity": "werkzeuge"
    },
    "mitarbeiter": {
      "key": "mitarbeiter",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Mitarbeiter",
      "writable": true,
      "targetAppId": "6a9ae0d3ea58e12f04d058b8",
      "targetEntity": "mitarbeiter"
    },
    "ausgabe": {
      "key": "ausgabe",
      "fulltype": "date/datetimeminute",
      "kind": "datetime",
      "required": true,
      "label": "Ausgabe",
      "writable": true
    },
    "rueckgabe_geplant": {
      "key": "rueckgabe_geplant",
      "fulltype": "date/date",
      "kind": "date",
      "required": false,
      "label": "Rückgabe geplant",
      "writable": true
    },
    "rueckgabe_erfolgt": {
      "key": "rueckgabe_erfolgt",
      "fulltype": "date/datetimeminute",
      "kind": "datetime",
      "required": false,
      "label": "Rückgabe erfolgt",
      "writable": true
    },
    "zustand_bei_rueckgabe": {
      "key": "zustand_bei_rueckgabe",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": false,
      "label": "Zustand bei Rückgabe",
      "writable": true,
      "options": [
        "einwandfrei",
        "gebrauchsspuren",
        "beschaedigt",
        "verloren"
      ]
    }
  },
  "wartungen": {
    "datum": {
      "key": "datum",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Datum",
      "writable": true
    },
    "beschreibung": {
      "key": "beschreibung",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Beschreibung",
      "writable": true
    },
    "kosten": {
      "key": "kosten",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Kosten (Euro)",
      "writable": true,
      "format": "currency"
    },
    "erledigt": {
      "key": "erledigt",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Erledigt",
      "writable": true
    },
    "werkzeug": {
      "key": "werkzeug",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Werkzeug",
      "writable": true,
      "targetAppId": "6a9ae0d7cbcbecdbd87197b3",
      "targetEntity": "werkzeuge"
    }
  },
  "schaeden": {
    "werkzeug": {
      "key": "werkzeug",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Werkzeug",
      "writable": true,
      "targetAppId": "6a9ae0d7cbcbecdbd87197b3",
      "targetEntity": "werkzeuge"
    },
    "gemeldet_am": {
      "key": "gemeldet_am",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Gemeldet am",
      "writable": true
    },
    "beschreibung": {
      "key": "beschreibung",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Beschreibung",
      "writable": true
    },
    "foto": {
      "key": "foto",
      "fulltype": "file",
      "kind": "file",
      "required": false,
      "label": "Foto",
      "writable": false
    }
  }
};

export const SHAPES: Record<EntityKey, Shape[]> = {
  "mitarbeiter": [],
  "werkzeuge": [
    {
      "kind": "choice",
      "field": "status",
      "count": 4
    },
    {
      "kind": "record",
      "field": "ersatz_fuer",
      "targetEntity": "werkzeuge"
    },
    {
      "kind": "stock",
      "field": "bestand"
    }
  ],
  "ausleihen": [
    {
      "kind": "choice",
      "field": "zustand_bei_rueckgabe",
      "count": 4
    },
    {
      "kind": "record",
      "field": "werkzeug",
      "targetEntity": "werkzeuge"
    },
    {
      "kind": "record",
      "field": "mitarbeiter",
      "targetEntity": "mitarbeiter"
    }
  ],
  "wartungen": [
    {
      "kind": "record",
      "field": "werkzeug",
      "targetEntity": "werkzeuge"
    }
  ],
  "schaeden": [
    {
      "kind": "record",
      "field": "werkzeug",
      "targetEntity": "werkzeuge"
    }
  ]
};

/** The fields a record of this entity is recognised by (a person: first and
 *  last name; else its title-like text field) — the same choice the dashboard's
 *  enrichment makes for `<key>Name`. `useRecordSearch` resolves an applookup to
 *  this name (`ctx.ref('gast')` in `toItem`). */
export const DISPLAY_FIELDS: Record<EntityKey, string[]> = {
  "mitarbeiter": [
    "vorname",
    "nachname"
  ],
  "werkzeuge": [
    "bezeichnung"
  ],
  "ausleihen": [
    "werkzeug"
  ],
  "wartungen": [
    "beschreibung"
  ],
  "schaeden": [
    "beschreibung"
  ]
};

/** The display name of a record: its display fields joined, else the first
 *  non-empty text value, else ''. */
export function displayNameOf(entity: EntityKey, fields: Record<string, unknown>): string {
  const parts = (DISPLAY_FIELDS[entity] ?? [])
    .map(k => fields[k])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map(v => v.trim());
  if (parts.length > 0) return parts.join(' ');
  for (const [k, rule] of Object.entries(FIELD_RULES[entity] ?? {})) {
    if (rule.kind !== 'text' && rule.kind !== 'email') continue;
    const v = fields[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

export function ruleOf(entity: EntityKey, key: string): FieldRule | undefined {
  return FIELD_RULES[entity]?.[key];
}

/** The field label as the user sees it — runtime bundle first, generated label second. */
export function labelOf(entity: EntityKey, key: string): string {
  const fromBundle = fieldLabel(entity, key);
  if (fromBundle !== key) return fromBundle;
  return ruleOf(entity, key)?.label ?? key;
}

export function entityLabel(entity: EntityKey): string {
  const fromBundle = appLabel(entity);
  if (fromBundle !== entity) return fromBundle;
  return ENTITIES[entity]?.label ?? entity;
}

/** Lookup options with runtime labels — the only legitimate source of `{key,label}` pairs. */
export function optionsOf(entity: EntityKey, key: string): Array<{ key: string; label: string }> {
  const generated = (LOOKUP_OPTIONS as Record<string, Record<string, Array<{ key: string; label: string }>>>)[entity]?.[key];
  if (generated && generated.length) return generated.map(o => ({ key: o.key, label: o.label }));
  const keys = ruleOf(entity, key)?.options ?? [];
  return keys.map(k => ({ key: k, label: lookupLabel(entity, key, k) ?? k }));
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && 'from' in (v as object) && 'to' in (v as object)) {
    const r = v as { from: unknown; to: unknown };
    return isEmptyValue(r.from) && isEmptyValue(r.to);
  }
  return false;
}
