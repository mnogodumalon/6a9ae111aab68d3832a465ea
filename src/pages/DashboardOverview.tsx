import { useMemo, useState } from 'react';
import { format, parseISO, isBefore, isToday, startOfDay } from 'date-fns';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey, formatDate } from '@/lib/formatters';
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
  IconPackage,
  IconTools,
  IconClockHour4,
  IconPlus,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    werkzeuge, ausleihen, schaeden,
    setWerkzeuge,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const a = ausleihen.find(x => x.record_id === top.record.record_id);
        if (a && !a.fields.rueckgabe_erfolgt) {
          return {
            label: tx('Rückgabe eintragen'),
            onClick: () => {
              const now = format(new Date(), "yyyy-MM-dd'T'HH:mm");
              const prev = { ...a };
              setWerkzeuge(ws =>
                ws.map(w =>
                  w.record_id === (a.fields.werkzeug?.split('/').pop() ?? '')
                    ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
                    : w
                )
              );
              LivingAppsService.updateAusleihenEntry(a.record_id, {
                rueckgabe_erfolgt: now,
                zustand_bei_rueckgabe: 'einwandfrei',
              }).then(() => fetchAll()).catch(() => fetchAll());
              undoToast(tx`${a.record_id} — zurückgegeben`);
            },
          };
        }
      }
      return undefined;
    },
  });

  const enrichedWerkzeuge = crud.enriched.werkzeuge;
  const enrichedAusleihen = crud.enriched.ausleihen;
  const enrichedSchaeden = crud.enriched.schaeden;
  const enrichedWartungen = crud.enriched.wartungen;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  // Werkzeug status filter for KPI strip
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Counts per status
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar'), [werkzeuge]);
  const verliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen'), [werkzeuge]);
  const defekt = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'defekt'), [werkzeuge]);
  const inWartung = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'in_wartung'), [werkzeuge]);

  // Active loans (no return yet)
  const aktiveLeihen = useMemo(
    () => enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt),
    [enrichedAusleihen]
  );

  // Overdue: rueckgabe_geplant < today AND no rueckgabe_erfolgt
  const ueberfaellig = useMemo(
    () => aktiveLeihen.filter(a => {
      if (!a.fields.rueckgabe_geplant) return false;
      return isBefore(startOfDay(parseISO(a.fields.rueckgabe_geplant)), startOfDay(clock));
    }),
    [aktiveLeihen, clock]
  );

  // Unbearbeitete Schäden (today)
  const neueSchaeden = useMemo(
    () => enrichedSchaeden.filter(s => s.fields.gemeldet_am === today),
    [enrichedSchaeden, today]
  );

  // Context line
  const contextLine = useMemo(() => {
    const parts: string[] = [];
    if (ueberfaellig.length > 0) {
      const names = namen(ueberfaellig.map(a => a.mitarbeiterName));
      parts.push(`${names} ${ueberfaellig.length === 1 ? tx('hat ein Werkzeug überfällig') : tx('haben Werkzeuge überfällig')}`);
    }
    if (verfuegbar.length > 0) {
      parts.push(tx`${verfuegbar.length} Werkzeuge verfügbar`);
    }
    if (aktiveLeihen.length > 0) {
      parts.push(tx`${aktiveLeihen.length} aktuell verliehen`);
    }
    if (parts.length === 0) return tx('Lager bereit — noch keine Werkzeuge erfasst.');
    return parts.join(' · ');
  }, [ueberfaellig, verfuegbar, aktiveLeihen]);

  // Kanban columns from schema — inside component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => {
      let tone: KanbanTone = 'default';
      if (o.key === 'verfuegbar') tone = 'success';
      else if (o.key === 'verliehen') tone = 'primary';
      else if (o.key === 'defekt') tone = 'destructive';
      else if (o.key === 'in_wartung') tone = 'warning';
      return { key: o.key, label: o.label, tone };
    }),
    []
  );

  // Werkzeuge → KanbanCards (optionally filtered for the aside overlay on click)
  const allCards = useMemo<KanbanCard[]>(
    () => enrichedWerkzeuge.map(w => {
      const status = lookupKey(w.fields.status) ?? 'verfuegbar';
      let tone: KanbanTone = 'default';
      if (status === 'verfuegbar') tone = 'success';
      else if (status === 'verliehen') tone = 'primary';
      else if (status === 'defekt') tone = 'destructive';
      else if (status === 'in_wartung') tone = 'warning';

      // Count active loans for this tool
      const activeLoanCount = ausleihen.filter(
        a => !a.fields.rueckgabe_erfolgt && a.fields.werkzeug?.endsWith(w.record_id)
      ).length;

      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.bezeichnung ?? '—',
        subtitle: w.fields.inventarnummer
          ? tx`Nr. ${w.fields.inventarnummer}${activeLoanCount > 0 ? tx` · ${activeLoanCount}× ausgeliehen` : ''}`
          : undefined,
        tone,
      };
    }),
    [enrichedWerkzeuge, ausleihen]
  );

  const cards = useMemo(
    () => statusFilter ? allCards.filter(c => c.column === statusFilter) : allCards,
    [allCards, statusFilter]
  );

  // Optimistic card move (status change)
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;

    // No double-lending: can't set verfuegbar on a tool that has active loans
    if (newColumn === 'verfuegbar') {
      const hasActiveLoan = ausleihen.some(
        a => !a.fields.rueckgabe_erfolgt && a.fields.werkzeug?.endsWith(rid)
      );
      if (hasActiveLoan) {
        return tx('Werkzeug hat noch offene Ausleihen — erst zurücknehmen.');
      }
    }

    const w = werkzeuge.find(x => x.record_id === rid);
    const prevStatus = lookupKey(w?.fields.status);

    setWerkzeuge(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
          : x
      )
    );

    const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    const wName = w?.fields.bezeichnung ?? rid;

    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { status: newColumn });
      undoToast(
        tx`${wName} → ${colLabel}`,
        prevStatus
          ? () => {
              setWerkzeuge(prev =>
                prev.map(x =>
                  x.record_id === rid
                    ? { ...x, fields: { ...x.fields, status: lookupOption('werkzeuge', 'status', prevStatus) } }
                    : x
                )
              );
              LivingAppsService.updateWerkzeugeEntry(rid, { status: prevStatus }).catch(() => fetchAll());
            }
          : undefined
      );
    } catch {
      fetchAll();
    }
  };

  // Return a loan (quick action)
  const returnLoan = (a: typeof enrichedAusleihen[0]) => {
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    const prevLoan = { ...a, fields: { ...a.fields } };
    // Optimistic: mark returned
    data.setAusleihen(prev =>
      prev.map(x =>
        x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, rueckgabe_erfolgt: now } }
          : x
      )
    );
    // Also mark tool as verfuegbar optimistically
    const wid = a.fields.werkzeug?.split('/').pop() ?? '';
    if (wid) {
      setWerkzeuge(prev =>
        prev.map(w =>
          w.record_id === wid
            ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
            : w
        )
      );
    }
    LivingAppsService.updateAusleihenEntry(a.record_id, {
      rueckgabe_erfolgt: now,
      zustand_bei_rueckgabe: 'einwandfrei',
    }).then(() => fetchAll()).catch(() => {
      fetchAll();
    });
    undoToast(
      tx`${a.werkzeugName} — zurückgegeben`,
      () => {
        data.setAusleihen(prev =>
          prev.map(x =>
            x.record_id === a.record_id
              ? { ...x, fields: { ...x.fields, rueckgabe_erfolgt: undefined } }
              : x
          )
        );
        if (wid) {
          setWerkzeuge(prev =>
            prev.map(w =>
              w.record_id === wid
                ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verliehen') } }
                : w
            )
          );
        }
        LivingAppsService.updateAusleihenEntry(a.record_id, { rueckgabe_erfolgt: undefined }).catch(() => fetchAll());
      }
    );
  };

  // Hero: overdue returns
  const hero = ueberfaellig.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: tx('Rückgabe jetzt eintragen'),
        onClick: () => returnLoan(ueberfaellig[0]),
      }}
    >
      <b>{namen(ueberfaellig.map(a => a.mitarbeiterName))}</b>
      {ueberfaellig.length === 1
        ? tx` — Werkzeug seit ${formatDate(ueberfaellig[0].fields.rueckgabe_geplant)} überfällig`
        : tx` — ${ueberfaellig.length} Werkzeuge überfällig`}
    </HeroBanner>
  ) : undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {gruss(clock)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        <div className="mt-3">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            onClick={() => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") })}
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Werkzeug ausgeben')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} />}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatStripItem
              title={tx('Verliehen')}
              value={verliehen.length}
              icon={<IconTool size={16} />}
              tone={verliehen.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'verliehen' ? null : 'verliehen')}
              active={statusFilter === 'verliehen'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt.length}
              icon={<IconAlertTriangle size={16} />}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
              onClick={() => setStatusFilter(f => f === 'defekt' ? null : 'defekt')}
              active={statusFilter === 'defekt'}
            />
            <StatStripItem
              title={tx('In Wartung')}
              value={inWartung.length}
              icon={<IconTools size={16} />}
              tone={inWartung.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_wartung' ? null : 'in_wartung')}
              active={statusFilter === 'in_wartung'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            onCardClick={card => {
              const rid = card.id.split(':')[1] ?? '';
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
              items={aktiveLeihen
                .sort((a, b) => {
                  // overdue first
                  const aOver = a.fields.rueckgabe_geplant && isBefore(parseISO(a.fields.rueckgabe_geplant), clock);
                  const bOver = b.fields.rueckgabe_geplant && isBefore(parseISO(b.fields.rueckgabe_geplant), clock);
                  if (aOver && !bOver) return -1;
                  if (!aOver && bOver) return 1;
                  return 0;
                })
                .slice(0, 8)
                .map(a => {
                  const isOver = a.fields.rueckgabe_geplant
                    ? isBefore(startOfDay(parseISO(a.fields.rueckgabe_geplant)), startOfDay(clock))
                    : false;
                  const isDueToday = a.fields.rueckgabe_geplant
                    ? isToday(parseISO(a.fields.rueckgabe_geplant))
                    : false;
                  return {
                    id: a.record_id,
                    title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                    secondLine: (
                      <>
                        <span className="text-muted-foreground">{a.mitarbeiterName}</span>
                        {a.fields.rueckgabe_geplant && (
                          <span className={`ml-1 ${isOver ? 'text-destructive font-medium' : isDueToday ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                            {' · '}{isOver ? tx('überfällig') : isDueToday ? tx('heute fällig') : formatDate(a.fields.rueckgabe_geplant)}
                          </span>
                        )}
                      </>
                    ),
                    action: {
                      label: tx('✓ Zurück'),
                      onClick: () => returnLoan(a),
                    },
                  };
                })}
              onItemClick={id => {
                const a = ausleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Keine aktiven Ausleihen — alle Werkzeuge im Lager.'),
                action: {
                  label: tx('Werkzeug ausgeben'),
                  onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }),
                },
              }}
            />

            <WorkList
              title={tx('Schäden & Wartungen')}
              items={[
                ...neueSchaeden.map(s => ({
                  id: `schaden:${s.record_id}`,
                  title: s.werkzeugName || tx('Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-destructive">{tx('Schaden')}</span>
                      {s.fields.beschreibung && (
                        <span className="text-muted-foreground ml-1">· {s.fields.beschreibung.slice(0, 40)}</span>
                      )}
                    </>
                  ),
                  action: {
                    label: tx('In Wartung'),
                    onClick: () => {
                      const wid = s.fields.werkzeug?.split('/').pop() ?? '';
                      if (wid) {
                        const prev = werkzeuge.find(w => w.record_id === wid);
                        const prevStatus = lookupKey(prev?.fields.status);
                        setWerkzeuge(ws =>
                          ws.map(w =>
                            w.record_id === wid
                              ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'in_wartung') } }
                              : w
                          )
                        );
                        LivingAppsService.updateWerkzeugeEntry(wid, { status: 'in_wartung' }).then(() => fetchAll()).catch(() => fetchAll());
                        undoToast(
                          tx`${s.werkzeugName} — in Wartung`,
                          prevStatus ? () => {
                            setWerkzeuge(ws =>
                              ws.map(w =>
                                w.record_id === wid
                                  ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', prevStatus) } }
                                  : w
                              )
                            );
                            LivingAppsService.updateWerkzeugeEntry(wid, { status: prevStatus }).catch(() => fetchAll());
                          } : undefined
                        );
                      }
                    },
                  },
                })),
                ...enrichedWartungen
                  .filter(w => !w.fields.erledigt)
                  .slice(0, 5 - neueSchaeden.length)
                  .map(w => ({
                    id: `wartung:${w.record_id}`,
                    title: w.werkzeugName || tx('Werkzeug'),
                    secondLine: (
                      <>
                        <span className="font-medium text-amber-600">{tx('Wartung ausstehend')}</span>
                        {w.fields.datum && (
                          <span className="text-muted-foreground ml-1">· {formatDate(w.fields.datum)}</span>
                        )}
                      </>
                    ),
                    action: {
                      label: tx('✓ Erledigt'),
                      onClick: () => {
                        const prev = { ...w, fields: { ...w.fields } };
                        data.setWartungen(ws =>
                          ws.map(x =>
                            x.record_id === w.record_id
                              ? { ...x, fields: { ...x.fields, erledigt: true } }
                              : x
                          )
                        );
                        LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: true })
                          .then(() => fetchAll())
                          .catch(() => fetchAll());
                        undoToast(
                          tx`${w.werkzeugName} — Wartung erledigt`,
                          () => {
                            data.setWartungen(ws =>
                              ws.map(x =>
                                x.record_id === prev.record_id
                                  ? { ...x, fields: { ...x.fields, erledigt: false } }
                                  : x
                              )
                            );
                            LivingAppsService.updateWartungenEntry(prev.record_id, { erledigt: false }).catch(() => fetchAll());
                          }
                        );
                      },
                    },
                  })),
              ]}
              onItemClick={id => {
                const [type, rid] = id.split(':');
                if (type === 'schaden') {
                  const s = schaeden.find(x => x.record_id === rid);
                  if (s) crud.schaeden.openDetail(s);
                } else {
                  const w = data.wartungen.find(x => x.record_id === rid);
                  if (w) crud.wartungen.openDetail(w);
                }
              }}
              empty={{
                text: tx('Keine neuen Schäden oder offenen Wartungen.'),
                action: {
                  label: tx('Schaden melden'),
                  onClick: () => crud.schaeden.openCreate({ gemeldet_am: today }),
                },
              }}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
