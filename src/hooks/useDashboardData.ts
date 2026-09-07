import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Mitarbeiter, Werkzeuge, Ausleihen, Wartungen, Schaeden } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { t } from '@/i18n';

/** Dashboard data + the OPTIMISTIC-WRITE API.
 *
 *  The per-entity setters (`set<Entity>`) are exported for exactly one job:
 *  optimistic updates on drag writes (onEventDrop / onEventResize /
 *  onCardMove). Call the setter FIRST — the bar/card lands instantly — then
 *  fire the PATCH in the background and call `fetchAll()` ONLY in the catch.
 *  Never await the PATCH before updating state (the UI freezes for the full
 *  round-trip on every drag) and never refetch after a successful write.
 *  There is no other mechanism (no `__optimistic`, no `mutate`).
 */
/** Entities this hook can load — the same keys the journey layer uses. */
export type DashboardEntity = 'mitarbeiter' | 'werkzeuge' | 'ausleihen' | 'wartungen' | 'schaeden';

export interface DashboardDataOptions {
  /** Entities this page does NOT need (picked through useRecordSearch instead).
   *  Every flow page mounts this hook on its own route, so without `omit` a
   *  page that searches 3.000 guests server-side would still pull all 3.000
   *  through the side door. */
  omit?: DashboardEntity[];
}

export function useDashboardData(options: DashboardDataOptions = {}) {
  // A string key, not the array: an inline `omit={['gaeste']}` is a new array
  // on every render and would restart the fetch forever.
  const omitKey = (options.omit ?? []).slice().sort().join('|');
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [werkzeuge, setWerkzeuge] = useState<Werkzeuge[]>([]);
  const [ausleihen, setAusleihen] = useState<Ausleihen[]>([]);
  const [wartungen, setWartungen] = useState<Wartungen[]>([]);
  const [schaeden, setSchaeden] = useState<Schaeden[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    const omit = new Set(omitKey ? omitKey.split('|') : []);
    try {
      const [mitarbeiterData, werkzeugeData, ausleihenData, wartungenData, schaedenData] = await Promise.all([
        omit.has('mitarbeiter') ? Promise.resolve([] as Mitarbeiter[]) : LivingAppsService.getMitarbeiter(),
        omit.has('werkzeuge') ? Promise.resolve([] as Werkzeuge[]) : LivingAppsService.getWerkzeuge(),
        omit.has('ausleihen') ? Promise.resolve([] as Ausleihen[]) : LivingAppsService.getAusleihen(),
        omit.has('wartungen') ? Promise.resolve([] as Wartungen[]) : LivingAppsService.getWartungen(),
        omit.has('schaeden') ? Promise.resolve([] as Schaeden[]) : LivingAppsService.getSchaeden(),
      ]);
      setMitarbeiter(mitarbeiterData);
      setWerkzeuge(werkzeugeData);
      setAusleihen(ausleihenData);
      setWartungen(wartungenData);
      setSchaeden(schaedenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t('data_load_failed')));
    } finally {
      setLoading(false);
    }
  }, [omitKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    const omit = new Set(omitKey ? omitKey.split('|') : []);
    async function silentRefresh() {
      try {
        const [mitarbeiterData, werkzeugeData, ausleihenData, wartungenData, schaedenData] = await Promise.all([
          omit.has('mitarbeiter') ? Promise.resolve([] as Mitarbeiter[]) : LivingAppsService.getMitarbeiter(),
          omit.has('werkzeuge') ? Promise.resolve([] as Werkzeuge[]) : LivingAppsService.getWerkzeuge(),
          omit.has('ausleihen') ? Promise.resolve([] as Ausleihen[]) : LivingAppsService.getAusleihen(),
          omit.has('wartungen') ? Promise.resolve([] as Wartungen[]) : LivingAppsService.getWartungen(),
          omit.has('schaeden') ? Promise.resolve([] as Schaeden[]) : LivingAppsService.getSchaeden(),
        ]);
        setMitarbeiter(mitarbeiterData);
        setWerkzeuge(werkzeugeData);
        setAusleihen(ausleihenData);
        setWartungen(wartungenData);
        setSchaeden(schaedenData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    // assistant:data-changed comes from the assistant (<la-klar-assistant>)
    // after every mutation. The element additionally fires the legacy
    // dashboard-refresh event for OLD deployed bundles — do NOT subscribe to
    // both here, or every mutation fetches twice.
    window.addEventListener('assistant:data-changed', handleRefresh);
    return () => window.removeEventListener('assistant:data-changed', handleRefresh);
  }, [omitKey]);

  const mitarbeiterMap = useMemo(() => {
    const m = new Map<string, Mitarbeiter>();
    mitarbeiter.forEach(r => m.set(r.record_id, r));
    return m;
  }, [mitarbeiter]);

  const werkzeugeMap = useMemo(() => {
    const m = new Map<string, Werkzeuge>();
    werkzeuge.forEach(r => m.set(r.record_id, r));
    return m;
  }, [werkzeuge]);

  return { mitarbeiter, setMitarbeiter, werkzeuge, setWerkzeuge, ausleihen, setAusleihen, wartungen, setWartungen, schaeden, setSchaeden, loading, error, fetchAll, mitarbeiterMap, werkzeugeMap };
}

/** The hook's return — the `data` prop of DashboardOverview in the Ready-Wrapper form. */
export type DashboardData = ReturnType<typeof useDashboardData>;