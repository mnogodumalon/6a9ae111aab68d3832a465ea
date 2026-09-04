/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'mitarbeiter'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.mitarbeiter.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.mitarbeiter.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.mitarbeiter.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.mitarbeiter              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   mitarbeiter: vorname, nachname, personalnummer, abteilung, mobil, aktiv  ·  ← ausleihen (list + contextual +)
 *   werkzeuge: bezeichnung, inventarnummer, status, bestand, standort, anschaffungspreis, handbuch, kategorien, …  ·  → werkzeuge · ← ausleihen (list + contextual +) · ← wartungen (list + contextual +) · ← schaeden (list + contextual +)
 *   ausleihen: werkzeug, mitarbeiter, ausgabe, rueckgabe_geplant, rueckgabe_erfolgt, zustand_bei_rueckgabe  ·  → werkzeuge · → mitarbeiter
 *   wartungen: datum, beschreibung, kosten, erledigt, werkzeug  ·  → werkzeuge
 *   schaeden: werkzeug, gemeldet_am, beschreibung, foto  ·  → werkzeuge
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Mitarbeiter, Werkzeuge, Ausleihen, Wartungen, Schaeden } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichWerkzeuge, enrichAusleihen, enrichWartungen, enrichSchaeden } from '@/lib/enrich';
import type { EnrichedWerkzeuge, EnrichedAusleihen, EnrichedWartungen, EnrichedSchaeden } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { MitarbeiterDialog, type MitarbeiterDialogDefaults } from '@/components/dialogs/MitarbeiterDialog';
import { MitarbeiterDetails } from '@/components/details/MitarbeiterDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleihenDialog, type AusleihenDialogDefaults } from '@/components/dialogs/AusleihenDialog';
import { AusleihenDetails } from '@/components/details/AusleihenDetails';
import { WartungenDialog, type WartungenDialogDefaults } from '@/components/dialogs/WartungenDialog';
import { WartungenDetails } from '@/components/details/WartungenDetails';
import { SchaedenDialog, type SchaedenDialogDefaults } from '@/components/dialogs/SchaedenDialog';
import { SchaedenDetails } from '@/components/details/SchaedenDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'mitarbeiter'; record: Mitarbeiter }
  | { type: 'werkzeuge'; record: EnrichedWerkzeuge }
  | { type: 'ausleihen'; record: EnrichedAusleihen }
  | { type: 'wartungen'; record: EnrichedWartungen }
  | { type: 'schaeden'; record: EnrichedSchaeden };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  mitarbeiter: EntityCrudApi<Mitarbeiter, MitarbeiterDialogDefaults>;
  werkzeuge: EntityCrudApi<Werkzeuge, WerkzeugeDialogDefaults>;
  ausleihen: EntityCrudApi<Ausleihen, AusleihenDialogDefaults>;
  wartungen: EntityCrudApi<Wartungen, WartungenDialogDefaults>;
  schaeden: EntityCrudApi<Schaeden, SchaedenDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { mitarbeiter: Mitarbeiter[]; werkzeuge: EnrichedWerkzeuge[]; ausleihen: EnrichedAusleihen[]; wartungen: EnrichedWartungen[]; schaeden: EnrichedSchaeden[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  const [mitarbeiterDialog, setMitarbeiterDialog] = useState<{ defaults?: MitarbeiterDialogDefaults; editing?: Mitarbeiter } | null>(null);
  const [werkzeugeDialog, setWerkzeugeDialog] = useState<{ defaults?: WerkzeugeDialogDefaults; editing?: Werkzeuge } | null>(null);
  const [ausleihenDialog, setAusleihenDialog] = useState<{ defaults?: AusleihenDialogDefaults; editing?: Ausleihen } | null>(null);
  const [wartungenDialog, setWartungenDialog] = useState<{ defaults?: WartungenDialogDefaults; editing?: Wartungen } | null>(null);
  const [schaedenDialog, setSchaedenDialog] = useState<{ defaults?: SchaedenDialogDefaults; editing?: Schaeden } | null>(null);
  const enrichedWerkzeuge = useMemo(() => enrichWerkzeuge(data.werkzeuge, { werkzeugeMap: data.werkzeugeMap }), [data.werkzeuge, data.werkzeugeMap]);
  const enrichedAusleihen = useMemo(() => enrichAusleihen(data.ausleihen, { werkzeugeMap: data.werkzeugeMap, mitarbeiterMap: data.mitarbeiterMap }), [data.ausleihen, data.werkzeugeMap, data.mitarbeiterMap]);
  const enrichedWartungen = useMemo(() => enrichWartungen(data.wartungen, { werkzeugeMap: data.werkzeugeMap }), [data.wartungen, data.werkzeugeMap]);
  const enrichedSchaeden = useMemo(() => enrichSchaeden(data.schaeden, { werkzeugeMap: data.werkzeugeMap }), [data.schaeden, data.werkzeugeMap]);

  function detailMitarbeiter(record: Mitarbeiter, push = false) {
    const item: OverlayItem = { type: 'mitarbeiter', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitMitarbeiter(fields: Mitarbeiter['fields']) {
    const editing = mitarbeiterDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setMitarbeiter(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateMitarbeiterEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('mitarbeiter')} — ${t('crud_updated')}`, async () => {
        data.setMitarbeiter(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateMitarbeiterEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createMitarbeiterEntry(fields);
      undoToast(`${appLabel('mitarbeiter')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailWerkzeuge(record: Werkzeuge, push = false) {
    const rec = enrichedWerkzeuge.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'werkzeuge', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitWerkzeuge(fields: Werkzeuge['fields']) {
    const editing = werkzeugeDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setWerkzeuge(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateWerkzeugeEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('werkzeuge')} — ${t('crud_updated')}`, async () => {
        data.setWerkzeuge(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateWerkzeugeEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createWerkzeugeEntry(fields);
      undoToast(`${appLabel('werkzeuge')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailAusleihen(record: Ausleihen, push = false) {
    const rec = enrichedAusleihen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'ausleihen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitAusleihen(fields: Ausleihen['fields']) {
    const editing = ausleihenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setAusleihen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateAusleihenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('ausleihen')} — ${t('crud_updated')}`, async () => {
        data.setAusleihen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateAusleihenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createAusleihenEntry(fields);
      undoToast(`${appLabel('ausleihen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailWartungen(record: Wartungen, push = false) {
    const rec = enrichedWartungen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'wartungen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitWartungen(fields: Wartungen['fields']) {
    const editing = wartungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setWartungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateWartungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('wartungen')} — ${t('crud_updated')}`, async () => {
        data.setWartungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateWartungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createWartungenEntry(fields);
      undoToast(`${appLabel('wartungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailSchaeden(record: Schaeden, push = false) {
    const rec = enrichedSchaeden.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'schaeden', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitSchaeden(fields: Schaeden['fields']) {
    const editing = schaedenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setSchaeden(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateSchaedenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('schaeden')} — ${t('crud_updated')}`, async () => {
        data.setSchaeden(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateSchaedenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createSchaedenEntry(fields);
      undoToast(`${appLabel('schaeden')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <MitarbeiterDialog
        open={mitarbeiterDialog !== null}
        onClose={() => setMitarbeiterDialog(null)}
        onSubmit={submitMitarbeiter}
        defaultValues={mitarbeiterDialog?.defaults}
        recordId={mitarbeiterDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Mitarbeiter']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Mitarbeiter']}
      />
      <WerkzeugeDialog
        open={werkzeugeDialog !== null}
        onClose={() => setWerkzeugeDialog(null)}
        onSubmit={submitWerkzeuge}
        defaultValues={werkzeugeDialog?.defaults}
        recordId={werkzeugeDialog?.editing?.record_id}
        werkzeugeList={data.werkzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />
      <AusleihenDialog
        open={ausleihenDialog !== null}
        onClose={() => setAusleihenDialog(null)}
        onSubmit={submitAusleihen}
        defaultValues={ausleihenDialog?.defaults}
        recordId={ausleihenDialog?.editing?.record_id}
        werkzeugeList={data.werkzeuge}
        mitarbeiterList={data.mitarbeiter}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihen']}
      />
      <WartungenDialog
        open={wartungenDialog !== null}
        onClose={() => setWartungenDialog(null)}
        onSubmit={submitWartungen}
        defaultValues={wartungenDialog?.defaults}
        recordId={wartungenDialog?.editing?.record_id}
        werkzeugeList={data.werkzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['Wartungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Wartungen']}
      />
      <SchaedenDialog
        open={schaedenDialog !== null}
        onClose={() => setSchaedenDialog(null)}
        onSubmit={submitSchaeden}
        defaultValues={schaedenDialog?.defaults}
        recordId={schaedenDialog?.editing?.record_id}
        werkzeugeList={data.werkzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['Schaeden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Schaeden']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'mitarbeiter') {
            return (
              <>
                <RecordHeader title={top.record.fields.vorname ?? appLabel('mitarbeiter')} subtitle={undefined} />
                <MitarbeiterDetails
                  record={top.record}
                  ausleihenList={data.ausleihen}
                  onOpenAusleihen={(r) => detailAusleihen(r, true)}
                  onAddAusleihen={() => setAusleihenDialog({ defaults: { mitarbeiter: createRecordUrl(APP_IDS.MITARBEITER, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'werkzeuge') {
            return (
              <>
                <RecordHeader title={top.record.fields.bezeichnung ?? appLabel('werkzeuge')} subtitle={undefined} />
                <WerkzeugeDetails
                  record={top.record}
                  werkzeugeList={data.werkzeuge}
                  onOpenWerkzeuge={(r) => detailWerkzeuge(r, true)}
                  ausleihenList={data.ausleihen}
                  onOpenAusleihen={(r) => detailAusleihen(r, true)}
                  onAddAusleihen={() => setAusleihenDialog({ defaults: { werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, top.record.record_id) } })}
                  wartungenList={data.wartungen}
                  onOpenWartungen={(r) => detailWartungen(r, true)}
                  onAddWartungen={() => setWartungenDialog({ defaults: { werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, top.record.record_id) } })}
                  schaedenList={data.schaeden}
                  onOpenSchaeden={(r) => detailSchaeden(r, true)}
                  onAddSchaeden={() => setSchaedenDialog({ defaults: { werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'ausleihen') {
            return (
              <>
                <RecordHeader title={appLabel('ausleihen')} subtitle={top.record.fields.ausgabe ? formatDate(top.record.fields.ausgabe) : undefined} />
                <AusleihenDetails
                  record={top.record}
                  werkzeugeList={data.werkzeuge}
                  onOpenWerkzeuge={(r) => detailWerkzeuge(r, true)}
                  mitarbeiterList={data.mitarbeiter}
                  onOpenMitarbeiter={(r) => detailMitarbeiter(r, true)}
                />
              </>
            );
          }
          if (top.type === 'wartungen') {
            return (
              <>
                <RecordHeader title={appLabel('wartungen')} subtitle={top.record.fields.datum ? formatDate(top.record.fields.datum) : undefined} />
                <WartungenDetails
                  record={top.record}
                  werkzeugeList={data.werkzeuge}
                  onOpenWerkzeuge={(r) => detailWerkzeuge(r, true)}
                />
              </>
            );
          }
          if (top.type === 'schaeden') {
            return (
              <>
                <RecordHeader title={appLabel('schaeden')} subtitle={top.record.fields.gemeldet_am ? formatDate(top.record.fields.gemeldet_am) : undefined} />
                <SchaedenDetails
                  record={top.record}
                  werkzeugeList={data.werkzeuge}
                  onOpenWerkzeuge={(r) => detailWerkzeuge(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'mitarbeiter') setMitarbeiterDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'werkzeuge') setWerkzeugeDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'ausleihen') setAusleihenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'wartungen') setWartungenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'schaeden') setSchaedenDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    mitarbeiter: {
      openCreate: (defaults?: MitarbeiterDialogDefaults) => setMitarbeiterDialog({ defaults }),
      openEdit: (record: Mitarbeiter) => setMitarbeiterDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Mitarbeiter) => detailMitarbeiter(record, false),
    },
    werkzeuge: {
      openCreate: (defaults?: WerkzeugeDialogDefaults) => setWerkzeugeDialog({ defaults }),
      openEdit: (record: Werkzeuge) => setWerkzeugeDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Werkzeuge) => detailWerkzeuge(record, false),
    },
    ausleihen: {
      openCreate: (defaults?: AusleihenDialogDefaults) => setAusleihenDialog({ defaults }),
      openEdit: (record: Ausleihen) => setAusleihenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Ausleihen) => detailAusleihen(record, false),
    },
    wartungen: {
      openCreate: (defaults?: WartungenDialogDefaults) => setWartungenDialog({ defaults }),
      openEdit: (record: Wartungen) => setWartungenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Wartungen) => detailWartungen(record, false),
    },
    schaeden: {
      openCreate: (defaults?: SchaedenDialogDefaults) => setSchaedenDialog({ defaults }),
      openEdit: (record: Schaeden) => setSchaedenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Schaeden) => detailSchaeden(record, false),
    },
    enriched: { mitarbeiter: data.mitarbeiter, werkzeuge: enrichedWerkzeuge, ausleihen: enrichedAusleihen, wartungen: enrichedWartungen, schaeden: enrichedSchaeden },
  };
}
