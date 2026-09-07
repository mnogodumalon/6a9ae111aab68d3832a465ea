import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { useMemo, useState } from 'react';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { lookupOption, LOOKUP_OPTIONS, APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { format, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  IconAlertTriangle,
  IconTool,
  IconArrowBack,
  IconPlus,
  IconCheck,
} from '@tabler/icons-react';

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'verfuegbar') return 'success';
  if (status === 'verliehen') return 'primary';
  if (status === 'defekt') return 'destructive';
  if (status === 'in_wartung') return 'warning';
  return 'default';
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    werkzeuge, setWerkzeuge,
    ausleihen, setAusleihen,
    schaeden,
    wartungen,
    mitarbeiterMap,
    werkzeugeMap,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const r = top.record;
        if (!r.fields.rueckgabe_erfolgt) {
          return {
            label: tx('Rückgabe buchen'),
            onClick: () => {
              const now = format(new Date(), "yyyy-MM-dd'T'HH:mm");
              const prev = { ...r };
              const wId = extractRecordId(r.fields.werkzeug);
              setAusleihen(prevA =>
                prevA.map(a =>
                  a.record_id === r.record_id
                    ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: now } }
                    : a,
                ),
              );
              if (wId) {
                setWerkzeuge(prevW =>
                  prevW.map(w =>
                    w.record_id === wId
                      ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
                      : w,
                  ),
                );
              }
              LivingAppsService.updateAusleihenEntry(r.record_id, {
                rueckgabe_erfolgt: now,
                zustand_bei_rueckgabe: 'einwandfrei',
              }).then(() => {
                if (wId) {
                  return LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verfuegbar' });
                }
              }).catch(() => {
                void fetchAll();
              });
              undoToast(tx`${r.record_id} — zurückgegeben`, () => {
                setAusleihen(prevA =>
                  prevA.map(a =>
                    a.record_id === r.record_id ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: undefined } } : a,
                  ),
                );
                void LivingAppsService.updateAusleihenEntry(r.record_id, {
                  rueckgabe_erfolgt: undefined,
                });
              });
            },
          };
        }
      }
      if (top.type === 'wartungen') {
        const r = top.record;
        if (!r.fields.erledigt) {
          return {
            label: tx('Als erledigt markieren'),
            onClick: () => {
              const wId = extractRecordId(r.fields.werkzeug);
              setWerkzeuge(prev =>
                prev.map(w =>
                  w.record_id === wId
                    ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
                    : w,
                ),
              );
              LivingAppsService.updateWartungenEntry(r.record_id, { erledigt: true }).then(() => {
                if (wId) return LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verfuegbar' });
              }).catch(() => void fetchAll());
              undoToast(tx('Wartung als erledigt markiert'), () => {
                void LivingAppsService.updateWartungenEntry(r.record_id, { erledigt: false });
                void fetchAll();
              });
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
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // KPI counts
  const verfuegbar = werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar');
  const verliehen = werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen');
  const defekt = werkzeuge.filter(w => lookupKey(w.fields.status) === 'defekt');
  const inWartung = werkzeuge.filter(w => lookupKey(w.fields.status) === 'in_wartung');

  // Active (not returned) loans
  const aktiveAusleihen = enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt);

  // Overdue: planned return date in the past, not yet returned
  const ueberfaellig = aktiveAusleihen.filter(a => {
    if (!a.fields.rueckgabe_geplant) return false;
    return isBefore(parseISO(a.fields.rueckgabe_geplant), startOfDay(clock));
  });

  // Due today
  const heuteFaellig = aktiveAusleihen.filter(a => {
    if (!a.fields.rueckgabe_geplant) return false;
    return a.fields.rueckgabe_geplant.slice(0, 10) === today;
  });

  // Unresolved damage reports without a maintenance entry
  const offeneSchaeden = enrichedSchaeden.filter(s => {
    const wId = extractRecordId(s.fields.werkzeug);
    if (!wId) return false;
    const hasWartung = wartungen.some(w => extractRecordId(w.fields.werkzeug) === wId && !w.fields.erledigt);
    return !hasWartung;
  });

  // Pending maintenance
  const offeneWartungen = enrichedWartungen.filter(w => !w.fields.erledigt);

  // Hero: defective tools with unresolved damage reports
  const heroSchaeden = offeneSchaeden.slice(0, 3);
  const heroNames = heroSchaeden.map(s => s.werkzeugName || tx('Unbekannt'));

  // Kanban columns - INSIDE component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: toneForStatus(o.key) as KanbanTone,
    })),
    [],
  );

  // Filter for Kanban
  const filteredWerkzeuge = statusFilter
    ? werkzeuge.filter(w => lookupKey(w.fields.status) === statusFilter)
    : werkzeuge;

  const cards = useMemo<KanbanCard[]>(
    () =>
      (statusFilter ? filteredWerkzeuge : werkzeuge).map(w => {
        const statusK = lookupKey(w.fields.status);
        const activeLoan = enrichedAusleihen.find(
          a => !a.fields.rueckgabe_erfolgt && extractRecordId(a.fields.werkzeug) === w.record_id,
        );
        const subtitle = activeLoan
          ? activeLoan.mitarbeiterName || tx('Mitarbeiter unbekannt')
          : w.fields.inventarnummer || undefined;
        return {
          id: `werkzeug:${w.record_id}`,
          column: statusK ?? COLUMNS[0]?.key ?? '',
          title: w.fields.bezeichnung ?? tx('Unbenannt'),
          subtitle,
          tone: toneForStatus(statusK),
        };
      }),
    [werkzeuge, filteredWerkzeuge, enrichedAusleihen, COLUMNS, statusFilter],
  );

  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    // Cannot move a lent tool to "verfuegbar" directly
    const w = werkzeugeMap.get(rid);
    if (!w) return;
    const currentStatus = lookupKey(w.fields.status);
    if (newColumn === 'verfuegbar' && currentStatus === 'verliehen') {
      return tx('Werkzeug ist noch verliehen — erst zurücknehmen.');
    }
    const prevStatus = currentStatus;
    setWerkzeuge(prev =>
      prev.map(item =>
        item.record_id === rid
          ? { ...item, fields: { ...item.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
          : item,
      ),
    );
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { status: newColumn });
    } catch {
      setWerkzeuge(prev =>
        prev.map(item =>
          item.record_id === rid
            ? { ...item, fields: { ...item.fields, status: lookupOption('werkzeuge', 'status', prevStatus ?? 'verfuegbar') } }
            : item,
        ),
      );
      await fetchAll();
    }
    const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    undoToast(tx`${w.fields.bezeichnung ?? ''} — ${colLabel}`, () => {
      setWerkzeuge(prev =>
        prev.map(item =>
          item.record_id === rid
            ? { ...item, fields: { ...item.fields, status: lookupOption('werkzeuge', 'status', prevStatus ?? 'verfuegbar') } }
            : item,
        ),
      );
      void LivingAppsService.updateWerkzeugeEntry(rid, { status: prevStatus ?? 'verfuegbar' });
    });
  };

  // Quick return helper (shared: hero, worklist, overlay footer)
  const handleRueckgabe = (ausleihe: typeof enrichedAusleihen[0]) => {
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    const wId = extractRecordId(ausleihe.fields.werkzeug);
    setAusleihen(prev =>
      prev.map(a =>
        a.record_id === ausleihe.record_id
          ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: now } }
          : a,
      ),
    );
    if (wId) {
      setWerkzeuge(prev =>
        prev.map(w =>
          w.record_id === wId
            ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
            : w,
        ),
      );
    }
    LivingAppsService.updateAusleihenEntry(ausleihe.record_id, {
      rueckgabe_erfolgt: now,
      zustand_bei_rueckgabe: 'einwandfrei',
    }).then(() => {
      if (wId) return LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verfuegbar' });
    }).catch(() => void fetchAll());
    undoToast(tx`${ausleihe.werkzeugName || ''} — zurückgegeben`, () => {
      setAusleihen(prev =>
        prev.map(a =>
          a.record_id === ausleihe.record_id
            ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: undefined } }
            : a,
        ),
      );
      if (wId) {
        setWerkzeuge(prev =>
          prev.map(w =>
            w.record_id === wId
              ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verliehen') } }
              : w,
          ),
        );
      }
      void LivingAppsService.updateAusleihenEntry(ausleihe.record_id, { rueckgabe_erfolgt: undefined });
      if (wId) void LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verliehen' });
    });
  };

  // Context line
  const contextLine = useMemo(() => {
    if (ueberfaellig.length > 0) {
      const names = namen(ueberfaellig.map(a => a.mitarbeiterName));
      return tx`${names} hat überfällige Ausleihen.`;
    }
    if (aktiveAusleihen.length > 0) {
      const names = namen(aktiveAusleihen.slice(0, 3).map(a => a.werkzeugName));
      return tx`Aktuell verliehen: ${names}.`;
    }
    if (verfuegbar.length > 0) {
      return tx`Alle Werkzeuge verfügbar — bereit für den Einsatz.`;
    }
    return tx('Lege dein erstes Werkzeug an.');
  }, [ueberfaellig, aktiveAusleihen, verfuegbar]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          type="button"
          onClick={() => crud.werkzeuge.openCreate({})}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Werkzeug')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          offeneSchaeden.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Wartung anlegen'),
                onClick: () => {
                  const s = heroSchaeden[0];
                  if (s) {
                    crud.wartungen.openCreate({ werkzeug: extractRecordId(s.fields.werkzeug) ?? undefined });
                  }
                },
              }}
            >
              <b>{namen(heroNames)}</b> — {tx('Schaden gemeldet, noch keine Wartung eingetragen.')}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatStripItem
              title={tx('Verliehen')}
              value={verliehen.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={verliehen.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'verliehen' ? null : 'verliehen')}
              active={statusFilter === 'verliehen'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
              onClick={() => setStatusFilter(f => f === 'defekt' ? null : 'defekt')}
              active={statusFilter === 'defekt'}
            />
            <StatStripItem
              title={tx('In Wartung')}
              value={inWartung.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={inWartung.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_wartung' ? null : 'in_wartung')}
              active={statusFilter === 'in_wartung'}
            />
            <StatStripItem
              title={tx('Überfällig')}
              value={ueberfaellig.length}
              icon={<IconArrowBack size={16} className="shrink-0" />}
              tone={ueberfaellig.length > 0 ? 'destructive' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={statusFilter ? cards.filter(c => c.column === statusFilter) : cards}
            columns={COLUMNS}
            defaultCollapsed={[]}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              if (!rid) return;
              const w = werkzeuge.find(x => x.record_id === rid);
              if (w) crud.werkzeuge.openDetail(w);
            }}
            onCardMove={moveCard}
            onAddCard={column => crud.werkzeuge.openCreate({ status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige & heute fällige Ausleihen')}
              items={[...ueberfaellig, ...heuteFaellig.filter(a => !ueberfaellig.find(u => u.record_id === a.record_id))].slice(0, 8).map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={ueberfaellig.find(u => u.record_id === a.record_id) ? 'font-medium text-destructive' : 'font-medium text-amber-600'}>
                      {ueberfaellig.find(u => u.record_id === a.record_id) ? tx('Überfällig') : tx('Heute fällig')}
                    </span>
                    <span className="text-muted-foreground"> · {a.mitarbeiterName}</span>
                    {a.fields.rueckgabe_geplant && (
                      <span className="text-muted-foreground"> · {formatDate(a.fields.rueckgabe_geplant)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Zurück'),
                  onClick: () => handleRueckgabe(a),
                },
              }))}
              onItemClick={id => {
                const a = ausleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: heuteFaellig.length === 0 && ueberfaellig.length === 0
                  ? tx('Alles pünktlich zurück — keine Fälligkeiten.')
                  : tx('Keine weiteren Fälligkeiten.'),
                action: { label: tx('Neue Ausleihe'), onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }) },
              }}
            />
            <WorkList
              title={tx('Offene Schäden & Wartungen')}
              items={[
                ...offeneSchaeden.slice(0, 4).map(s => ({
                  id: `schaden:${s.record_id}`,
                  title: s.werkzeugName || tx('Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-destructive">{tx('Schaden')}</span>
                      <span className="text-muted-foreground"> · {s.fields.beschreibung?.split('\n')[0] ?? ''}</span>
                    </>
                  ),
                  action: {
                    label: tx('Wartung'),
                    onClick: () => {
                      crud.wartungen.openCreate({
                        werkzeug: extractRecordId(s.fields.werkzeug) ?? undefined,
                        datum: today,
                      });
                    },
                  },
                })),
                ...offeneWartungen.slice(0, 4).map(w => ({
                  id: `wartung:${w.record_id}`,
                  title: w.werkzeugName || tx('Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-amber-600">{tx('In Wartung')}</span>
                      {w.fields.datum && <span className="text-muted-foreground"> · {formatDate(w.fields.datum)}</span>}
                    </>
                  ),
                  action: {
                    label: tx('Erledigt'),
                    onClick: () => {
                      const wId = extractRecordId(w.fields.werkzeug);
                      LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: true }).then(() => {
                        if (wId) return LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verfuegbar' });
                      }).then(() => fetchAll()).catch(() => void fetchAll());
                      undoToast(tx('Wartung erledigt'), () => {
                        void LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: false });
                        void fetchAll();
                      });
                    },
                  },
                })),
              ].slice(0, 8)}
              onItemClick={id => {
                const [type, rid] = id.split(':');
                if (type === 'schaden') {
                  const s = schaeden.find(x => x.record_id === rid);
                  if (s) crud.schaeden.openDetail(s);
                } else {
                  const w = wartungen.find(x => x.record_id === rid);
                  if (w) crud.wartungen.openDetail(w);
                }
              }}
              empty={{
                text: tx('Keine offenen Schäden oder Wartungen — alles in Ordnung.'),
                action: { label: tx('Schaden melden'), onClick: () => crud.schaeden.openCreate({ gemeldet_am: today }) },
              }}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
