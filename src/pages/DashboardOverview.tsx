import { useMemo, useState, useRef } from 'react';
import { format, parseISO, isBefore, isToday } from 'date-fns';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import type { EnrichedAusleihen } from '@/types/enriched';
import { LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey, formatDate, formatDateTime } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  IconTool,
  IconAlertTriangle,
  IconCheck,
  IconArrowBack,
  IconPlus,
} from '@tabler/icons-react';

function toneForWerkzeugStatus(status: string | undefined): KanbanTone {
  if (status === 'verfuegbar') return 'success';
  if (status === 'verliehen') return 'primary';
  if (status === 'defekt') return 'destructive';
  if (status === 'in_wartung') return 'warning';
  return 'default';
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    mitarbeiter, werkzeuge, ausleihen, wartungen, schaeden,
    mitarbeiterMap, werkzeugeMap,
    setWerkzeuge, setAusleihen,
    fetchAll,
  } = data;

  // Footer handler ref — allows the footer callback to call handleRueckgabe
  // which is defined below (after enriched data is available).
  const rueckgabeHandlerRef = useRef<((a: EnrichedAusleihen) => void) | null>(null);
  const enrichedAusleihenRef = useRef<EnrichedAusleihen[]>([]);

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const ea = enrichedAusleihenRef.current.find(x => x.record_id === top.record.record_id);
        if (ea && !ea.fields.rueckgabe_erfolgt && rueckgabeHandlerRef.current) {
          const handler = rueckgabeHandlerRef.current;
          const captured = ea;
          return {
            label: tx('Rückgabe eintragen'),
            onClick: () => handler(captured),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedAusleihen = crud.enriched.ausleihen;
  enrichedAusleihenRef.current = enrichedAusleihen;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  // Aktive Ausleihen (noch nicht zurückgegeben)
  const aktiveAusleihen = useMemo(
    () => enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt),
    [enrichedAusleihen],
  );

  // Überfällige Ausleihen: geplantes Rückgabedatum in der Vergangenheit
  const ueberfaellige = useMemo(
    () =>
      aktiveAusleihen.filter(a => {
        if (!a.fields.rueckgabe_geplant) return false;
        try {
          return isBefore(parseISO(a.fields.rueckgabe_geplant), parseISO(today));
        } catch {
          return false;
        }
      }),
    [aktiveAusleihen, today],
  );

  // Unerledigte Schäden
  const offeneSchaeden = useMemo(
    () => crud.enriched.schaeden.filter(s => {
      // Schaden ist offen, wenn kein Werkzeug in Wartung ist (vereinfacht: alle unbearbeiteten)
      const wId = s.fields.werkzeug
        ? s.fields.werkzeug.split('/').pop() ?? ''
        : '';
      const w = werkzeugeMap.get(wId);
      return w?.fields.status?.key !== 'in_wartung';
    }),
    [crud.enriched.schaeden, werkzeugeMap],
  );

  // Ausleihen heute ausgegeben
  const heuteAusgegeben = useMemo(
    () =>
      aktiveAusleihen.filter(a => a.fields.ausgabe?.startsWith(today)),
    [aktiveAusleihen, today],
  );

  // Wartungen offen (nicht erledigt)
  const offeneWartungen = useMemo(
    () => crud.enriched.wartungen.filter(w => !w.fields.erledigt),
    [crud.enriched.wartungen],
  );

  // Rückgabe eintragen (optimistisch)
  const handleRueckgabe = async (a: EnrichedAusleihen) => {
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    const snapshot = ausleihen.map(x => ({ ...x }));
    setAusleihen(prev =>
      prev.map(x =>
        x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, rueckgabe_erfolgt: now } }
          : x,
      ),
    );
    const werkzeugId = a.fields.werkzeug
      ? a.fields.werkzeug.split('/').pop() ?? ''
      : '';
    const w = werkzeugId ? werkzeugeMap.get(werkzeugId) : undefined;
    const snapshotWerkzeuge = werkzeuge.map(x => ({ ...x }));
    if (w) {
      setWerkzeuge(prev =>
        prev.map(x =>
          x.record_id === werkzeugId
            ? { ...x, fields: { ...x.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
            : x,
        ),
      );
    }
    undoToast(
      tx`${a.werkzeugName || a.record_id} — zurückgegeben`,
      async () => {
        setAusleihen(snapshot);
        setWerkzeuge(snapshotWerkzeuge);
        await LivingAppsService.updateAusleihenEntry(a.record_id, { rueckgabe_erfolgt: undefined });
        if (werkzeugId && w) {
          await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: lookupKey(w.fields.status) });
        }
      },
    );
    try {
      await LivingAppsService.updateAusleihenEntry(a.record_id, { rueckgabe_erfolgt: now });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'verfuegbar' });
      }
    } catch {
      await fetchAll();
    }
  };

  // Wire the ref so the footer callback can call handleRueckgabe
  rueckgabeHandlerRef.current = handleRueckgabe;

  // Wartung als erledigt markieren (optimistisch)
  const handleWartungErledigt = async (w: (typeof offeneWartungen)[0]) => {
    const snapshotWartungen = wartungen.map(x => ({ ...x }));
    data.setWartungen(prev =>
      prev.map(x =>
        x.record_id === w.record_id
          ? { ...x, fields: { ...x.fields, erledigt: true } }
          : x,
      ),
    );
    undoToast(
      tx`${w.werkzeugName || w.record_id} — Wartung erledigt`,
      async () => {
        data.setWartungen(snapshotWartungen);
        await LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: false });
      },
    );
    try {
      await LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: true });
    } catch {
      await fetchAll();
    }
  };

  // Kanban: Werkzeuge nach Status
  const COLUMNS = useMemo<KanbanColumn[]>(
    () =>
      (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({
        key: o.key,
        label: o.label,
        tone:
          o.key === 'verfuegbar'
            ? ('success' as KanbanTone)
            : o.key === 'verliehen'
            ? ('primary' as KanbanTone)
            : o.key === 'defekt'
            ? ('destructive' as KanbanTone)
            : ('warning' as KanbanTone),
      })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      werkzeuge.map(w => {
        const status = lookupKey(w.fields.status) ?? 'verfuegbar';
        // Wie viele aktive Ausleihen für dieses Werkzeug?
        const laufend = aktiveAusleihen.filter(a => {
          const wId = a.fields.werkzeug?.split('/').pop() ?? '';
          return wId === w.record_id;
        }).length;
        return {
          id: `werkzeug:${w.record_id}`,
          column: status,
          title: w.fields.bezeichnung ?? tx('Ohne Bezeichnung'),
          subtitle:
            status === 'verliehen' && laufend > 0
              ? tx`${laufend}× ausgeliehen`
              : w.fields.inventarnummer
              ? `#${w.fields.inventarnummer}` /* i18n-exempt */
              : undefined,
          tone: toneForWerkzeugStatus(status),
        };
      }),
    [werkzeuge, aktiveAusleihen],
  );

  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const w = werkzeugeMap.get(rid);
    if (!w) return;

    // Nicht ausgeben wenn kein Mitarbeiter/Ausleihe erstellt
    if (newColumn === 'verliehen') {
      return tx('Bitte Ausleihe über "+ Ausleihe" anlegen — direkt ausgeben geht hier nicht.');
    }

    const snapshotWerkzeuge = werkzeuge.map(x => ({ ...x }));
    setWerkzeuge(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
          : x,
      ),
    );
    undoToast(
      tx`${w.fields.bezeichnung ?? rid} — Status geändert`,
      async () => {
        setWerkzeuge(snapshotWerkzeuge);
        await LivingAppsService.updateWerkzeugeEntry(rid, { status: lookupKey(w.fields.status) });
      },
    );
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { status: newColumn });
    } catch {
      await fetchAll();
    }
  };

  // Kontext-Satz
  const mitarbeiterNamen = useMemo(
    () =>
      heuteAusgegeben
        .map(a => a.mitarbeiterName || '')
        .filter(Boolean),
    [heuteAusgegeben],
  );

  const verfuegbarCount = werkzeuge.filter(
    w => lookupKey(w.fields.status) === 'verfuegbar',
  ).length;
  const verliehenCount = aktiveAusleihen.length;
  const defektCount = werkzeuge.filter(
    w => lookupKey(w.fields.status) === 'defekt',
  ).length;
  const inWartungCount = werkzeuge.filter(
    w => lookupKey(w.fields.status) === 'in_wartung',
  ).length;

  return (
    <div>
      {/* Seitenheader */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {gruss(clock)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {heuteAusgegeben.length > 0
            ? mitarbeiterNamen.length > 0
              ? tx`Heute ausgegeben an ${namen(mitarbeiterNamen)} — ${verfuegbarCount} Werkzeuge verfügbar.`
              : tx`${heuteAusgegeben.length} Werkzeuge heute ausgegeben — ${verfuegbarCount} noch verfügbar.`
            : verliehenCount > 0
            ? tx`${verliehenCount} Werkzeuge ausgeliehen — ${verfuegbarCount} verfügbar.`
            : tx`Keine aktiven Ausleihen — ${verfuegbarCount} Werkzeuge verfügbar.`}
        </p>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaellige.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Rückgabe eintragen'),
                onClick: () => handleRueckgabe(ueberfaellige[0]),
              }}
            >
              <b>{namen(ueberfaellige.map(a => a.werkzeugName || a.record_id))}</b>{' '}
              {ueberfaellige.length === 1
                ? tx`überfällig — Rückgabe war geplant am ${formatDate(ueberfaellige[0].fields.rueckgabe_geplant)}.`
                : tx`— ${ueberfaellige.length} Ausleihen überfällig.`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbarCount}
              icon={<IconTool size={14} className="shrink-0" />}
              tone={verfuegbarCount > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={verliehenCount}
              icon={<IconArrowBack size={14} className="shrink-0" />}
              tone={verliehenCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defektCount}
              icon={<IconAlertTriangle size={14} className="shrink-0" />}
              tone={defektCount > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tx('In Wartung')}
              value={inWartungCount}
              icon={<IconTool size={14} className="shrink-0" />}
              tone={inWartungCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={appLabel('mitarbeiter')}
              value={mitarbeiter.filter(m => m.fields.aktiv !== false).length}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['defekt', 'in_wartung']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === rid);
              if (w) crud.werkzeuge.openDetail(w);
            }}
            onCardMove={moveCard}
            onAddCard={column =>
              crud.werkzeuge.openCreate({ status: column })
            }
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={aktiveAusleihen
                .sort((a, b) => {
                  const aOver = ueberfaellige.some(x => x.record_id === a.record_id);
                  const bOver = ueberfaellige.some(x => x.record_id === b.record_id);
                  if (aOver && !bOver) return -1;
                  if (!aOver && bOver) return 1;
                  return (a.fields.rueckgabe_geplant ?? '').localeCompare(
                    b.fields.rueckgabe_geplant ?? '',
                  );
                })
                .map(a => {
                  const ueberfaellig = ueberfaellige.some(x => x.record_id === a.record_id);
                  return {
                    id: a.record_id,
                    title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                    secondLine: (
                      <>
                        <span
                          className={
                            ueberfaellig
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {ueberfaellig ? tx('Überfällig') : a.mitarbeiterName || tx('Unbekannt')}
                        </span>
                        {a.fields.rueckgabe_geplant && (
                          <span className="text-muted-foreground">
                            {' · '}{tx('geplant')}: {formatDate(a.fields.rueckgabe_geplant)}
                          </span>
                        )}
                      </>
                    ),
                    action: {
                      label: tx('Zurück'),
                      onClick: () => handleRueckgabe(a),
                    },
                  };
                })}
              onItemClick={id => {
                const a = ausleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Alle Werkzeuge sind zurückgegeben — keine aktiven Ausleihen.'),
                action: {
                  label: tx('Neue Ausleihe'),
                  onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }),
                },
              }}
              max={8}
            />
            <WorkList
              title={tx('Offene Wartungen & Schäden')}
              items={[
                ...offeneWartungen.map(w => ({
                  id: `wartung:${w.record_id}`,
                  title: w.werkzeugName || tx('Unbekanntes Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-amber-600">{tx('Wartung')}</span>
                      {w.fields.datum && (
                        <span className="text-muted-foreground">
                          {' · '}{formatDate(w.fields.datum)}
                        </span>
                      )}
                    </>
                  ),
                  action: {
                    label: tx('Erledigt'),
                    onClick: () => handleWartungErledigt(w),
                  },
                })),
                ...crud.enriched.schaeden.map(s => ({
                  id: `schaden:${s.record_id}`,
                  title: s.werkzeugName || tx('Unbekanntes Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-destructive">{tx('Schaden')}</span>
                      {s.fields.gemeldet_am && (
                        <span className="text-muted-foreground">
                          {' · '}{formatDate(s.fields.gemeldet_am)}
                        </span>
                      )}
                    </>
                  ),
                  action: {
                    label: tx('Zur Wartung'),
                    onClick: () => crud.wartungen.openCreate({ werkzeug: s.fields.werkzeug }),
                  },
                })),
              ]}
              onItemClick={id => {
                if (id.startsWith('wartung:')) {
                  const rid = id.slice('wartung:'.length);
                  const w = wartungen.find(x => x.record_id === rid);
                  if (w) crud.wartungen.openDetail(w);
                } else {
                  const rid = id.slice('schaden:'.length);
                  const s = schaeden.find(x => x.record_id === rid);
                  if (s) crud.schaeden.openDetail(s);
                }
              }}
              empty={{
                text: tx('Keine offenen Wartungen oder Schäden — alles in Ordnung.'),
                action: {
                  label: tx('Schaden melden'),
                  onClick: () => crud.schaeden.openCreate({ gemeldet_am: today }),
                },
              }}
              max={6}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
