/**
 * Occupancy semantics — DECIDED BY THE BUILD AGENT, never by a heuristic.
 *
 * The Phase-2 orchestrator writes its decision to `.intents-staging/occupancy.json`
 * (stay pair, booked resource, statuses that do not occupy); the integration
 * step validates it against the app metadata and renders it into the block
 * below. Scaffold updates keep the block. Do not edit outside the markers.
 *
 * Both doors read this and nothing else: `occupancyFor` (internal flows AND
 * public pages) and the owner service (the public grant's occupancy read).
 * No rule for an entity = no availability calendar, no occupancy claim —
 * a plain date field pair is shown instead.
 *
 * Facts from the metadata — candidates, NOT decisions:
 *   - mitarbeiter: lookups abteilung[strassenbau|gruenpflege|hochbau|elektrik|fuhrpark|reinigung|verwaltung|winterdienst]
 *   - werkzeuge: applookups ersatz_fuer→werkzeuge · lookups status[verfuegbar|verliehen|defekt|in_wartung]
 *   - ausleihen: applookups werkzeug→werkzeuge, mitarbeiter→mitarbeiter · lookups zustand_bei_rueckgabe[einwandfrei|gebrauchsspuren|beschaedigt|verloren]
 *   - wartungen: applookups werkzeug→werkzeuge
 *   - schaeden: applookups werkzeug→werkzeuge
 */
import type { EntityKey } from '@/lib/journey/rules';

export interface OccupancyRule {
  /** Arrival / departure fields (the departure day is exclusive). */
  from: string;
  to: string;
  /** applookup field naming the booked RESOURCE (room, vehicle, court).
   *  Omit when the entity itself is the one resource (a single holiday flat). */
  resource?: string;
  /** lookup field + the keys that mean "does NOT occupy" (cancelled, no-show). */
  statusField?: string;
  freeKeys?: string[];
}

export const OCCUPANCY: Partial<Record<EntityKey, OccupancyRule>> = {
  // <custom:occupancy>
  ausleihen: { from: 'ausgabe', to: 'rueckgabe_geplant', resource: 'werkzeug', statusField: 'zustand_bei_rueckgabe', freeKeys: ['verloren'] },
  // </custom:occupancy>
};
