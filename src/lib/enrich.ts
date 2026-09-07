import type { EnrichedAusleihen, EnrichedSchaeden, EnrichedWartungen, EnrichedWerkzeuge } from '@/types/enriched';
import type { Ausleihen, Mitarbeiter, Schaeden, Wartungen, Werkzeuge } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface WerkzeugeMaps {
  werkzeugeMap: Map<string, Werkzeuge>;
}

export function enrichWerkzeuge(
  werkzeuge: Werkzeuge[],
  maps: WerkzeugeMaps
): EnrichedWerkzeuge[] {
  return werkzeuge.map(r => ({
    ...r,
    ersatz_fuerName: resolveDisplay(r.fields.ersatz_fuer, maps.werkzeugeMap, 'bezeichnung'),
  }));
}

interface AusleihenMaps {
  werkzeugeMap: Map<string, Werkzeuge>;
  mitarbeiterMap: Map<string, Mitarbeiter>;
}

export function enrichAusleihen(
  ausleihen: Ausleihen[],
  maps: AusleihenMaps
): EnrichedAusleihen[] {
  return ausleihen.map(r => ({
    ...r,
    werkzeugName: resolveDisplay(r.fields.werkzeug, maps.werkzeugeMap, 'bezeichnung'),
    mitarbeiterName: resolveDisplay(r.fields.mitarbeiter, maps.mitarbeiterMap, 'vorname', 'nachname'),
  }));
}

interface WartungenMaps {
  werkzeugeMap: Map<string, Werkzeuge>;
}

export function enrichWartungen(
  wartungen: Wartungen[],
  maps: WartungenMaps
): EnrichedWartungen[] {
  return wartungen.map(r => ({
    ...r,
    werkzeugName: resolveDisplay(r.fields.werkzeug, maps.werkzeugeMap, 'bezeichnung'),
  }));
}

interface SchaedenMaps {
  werkzeugeMap: Map<string, Werkzeuge>;
}

export function enrichSchaeden(
  schaeden: Schaeden[],
  maps: SchaedenMaps
): EnrichedSchaeden[] {
  return schaeden.map(r => ({
    ...r,
    werkzeugName: resolveDisplay(r.fields.werkzeug, maps.werkzeugeMap, 'bezeichnung'),
  }));
}
