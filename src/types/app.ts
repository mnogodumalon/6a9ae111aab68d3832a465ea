import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Mitarbeiter {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    personalnummer?: string;
    abteilung?: LookupValue;
    mobil?: string;
    aktiv?: boolean;
  };
}

export interface Werkzeuge {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    bezeichnung?: string;
    inventarnummer?: string;
    status?: LookupValue;
    bestand?: number;
    standort?: GeoLocation; // { lat, long, info }
    anschaffungspreis?: number;
    handbuch?: string;
    kategorien?: LookupValue[];
    ersatz_fuer?: RecordUrl; // applookup -> URL zu 'Werkzeuge' Record
  };
}

export interface Ausleihen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    werkzeug?: RecordUrl; // applookup -> URL zu 'Werkzeuge' Record
    mitarbeiter?: RecordUrl; // applookup -> URL zu 'Mitarbeiter' Record
    ausgabe?: string; // Format: YYYY-MM-DD oder ISO String
    rueckgabe_geplant?: string; // Format: YYYY-MM-DD oder ISO String
    rueckgabe_erfolgt?: string; // Format: YYYY-MM-DD oder ISO String
    zustand_bei_rueckgabe?: LookupValue;
  };
}

export interface Wartungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    beschreibung?: string;
    kosten?: number;
    erledigt?: boolean;
    werkzeug?: RecordUrl; // applookup -> URL zu 'Werkzeuge' Record
  };
}

export interface Schaeden {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    werkzeug?: RecordUrl; // applookup -> URL zu 'Werkzeuge' Record
    gemeldet_am?: string; // Format: YYYY-MM-DD oder ISO String
    beschreibung?: string;
    foto?: string;
  };
}

export const APP_IDS = {
  MITARBEITER: '6a9ae0d3ea58e12f04d058b8',
  WERKZEUGE: '6a9ae0d7cbcbecdbd87197b3',
  AUSLEIHEN: '6a9ae0d8b513fc8850fabef9',
  WARTUNGEN: '6a9ae0d8ab5b3398be0528bd',
  SCHAEDEN: '6a9ae0d99c85cb9fa5a168ca',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'mitarbeiter': {
    abteilung: [{ key: "strassenbau", get label() { return lookupLabel('mitarbeiter', 'abteilung', "strassenbau") ?? "Straßenbau"; } }, { key: "gruenpflege", get label() { return lookupLabel('mitarbeiter', 'abteilung', "gruenpflege") ?? "Grünpflege"; } }, { key: "hochbau", get label() { return lookupLabel('mitarbeiter', 'abteilung', "hochbau") ?? "Hochbau"; } }, { key: "elektrik", get label() { return lookupLabel('mitarbeiter', 'abteilung', "elektrik") ?? "Elektrik"; } }, { key: "fuhrpark", get label() { return lookupLabel('mitarbeiter', 'abteilung', "fuhrpark") ?? "Fuhrpark"; } }, { key: "reinigung", get label() { return lookupLabel('mitarbeiter', 'abteilung', "reinigung") ?? "Reinigung"; } }, { key: "verwaltung", get label() { return lookupLabel('mitarbeiter', 'abteilung', "verwaltung") ?? "Verwaltung"; } }, { key: "winterdienst", get label() { return lookupLabel('mitarbeiter', 'abteilung', "winterdienst") ?? "Winterdienst"; } }],
  },
  'werkzeuge': {
    status: [{ key: "verfuegbar", get label() { return lookupLabel('werkzeuge', 'status', "verfuegbar") ?? "Verfügbar"; } }, { key: "verliehen", get label() { return lookupLabel('werkzeuge', 'status', "verliehen") ?? "Verliehen"; } }, { key: "defekt", get label() { return lookupLabel('werkzeuge', 'status', "defekt") ?? "Defekt"; } }, { key: "in_wartung", get label() { return lookupLabel('werkzeuge', 'status', "in_wartung") ?? "In Wartung"; } }],
    kategorien: [{ key: "elektrowerkzeug", get label() { return lookupLabel('werkzeuge', 'kategorien', "elektrowerkzeug") ?? "Elektrowerkzeug"; } }, { key: "handwerkzeug", get label() { return lookupLabel('werkzeuge', 'kategorien', "handwerkzeug") ?? "Handwerkzeug"; } }, { key: "messgeraet", get label() { return lookupLabel('werkzeuge', 'kategorien', "messgeraet") ?? "Messgerät"; } }, { key: "sicherheitsausruestung", get label() { return lookupLabel('werkzeuge', 'kategorien', "sicherheitsausruestung") ?? "Sicherheitsausrüstung"; } }],
  },
  'ausleihen': {
    zustand_bei_rueckgabe: [{ key: "einwandfrei", get label() { return lookupLabel('ausleihen', 'zustand_bei_rueckgabe', "einwandfrei") ?? "Einwandfrei"; } }, { key: "gebrauchsspuren", get label() { return lookupLabel('ausleihen', 'zustand_bei_rueckgabe', "gebrauchsspuren") ?? "Gebrauchsspuren"; } }, { key: "beschaedigt", get label() { return lookupLabel('ausleihen', 'zustand_bei_rueckgabe', "beschaedigt") ?? "Beschädigt"; } }, { key: "verloren", get label() { return lookupLabel('ausleihen', 'zustand_bei_rueckgabe', "verloren") ?? "Verloren"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'mitarbeiter': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'personalnummer': 'string/text',
    'abteilung': 'lookup/select',
    'mobil': 'string/tel',
    'aktiv': 'bool',
  },
  'werkzeuge': {
    'bezeichnung': 'string/text',
    'inventarnummer': 'string/text',
    'status': 'lookup/select',
    'bestand': 'number',
    'standort': 'geo',
    'anschaffungspreis': 'number',
    'handbuch': 'string/url',
    'kategorien': 'multiplelookup/checkbox',
    'ersatz_fuer': 'applookup/select',
  },
  'ausleihen': {
    'werkzeug': 'applookup/select',
    'mitarbeiter': 'applookup/select',
    'ausgabe': 'date/datetimeminute',
    'rueckgabe_geplant': 'date/date',
    'rueckgabe_erfolgt': 'date/datetimeminute',
    'zustand_bei_rueckgabe': 'lookup/select',
  },
  'wartungen': {
    'datum': 'date/date',
    'beschreibung': 'string/textarea',
    'kosten': 'number',
    'erledigt': 'bool',
    'werkzeug': 'applookup/select',
  },
  'schaeden': {
    'werkzeug': 'applookup/select',
    'gemeldet_am': 'date/date',
    'beschreibung': 'string/textarea',
    'foto': 'file',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
  'werkzeuge': [
    { field: 'werkzeug', entity: 'ausleihen' },
    { field: 'werkzeug', entity: 'wartungen' },
    { field: 'werkzeug', entity: 'schaeden' },
  ],
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateMitarbeiter = StripLookup<Mitarbeiter['fields']>;
export type CreateWerkzeuge = StripLookup<Werkzeuge['fields']>;
export type CreateAusleihen = StripLookup<Ausleihen['fields']>;
export type CreateWartungen = StripLookup<Wartungen['fields']>;
export type CreateSchaeden = StripLookup<Schaeden['fields']>;