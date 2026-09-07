import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { useState, useMemo } from 'react';
import { format, isToday, isPast, parseISO, isBefore, startOfDay } from 'date-fns';
import { tx, appLabel } from '@/i18n';
import { lookupKey } from '@/lib/formatters';
import { lookupOption, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  IconAlertTriangle,
  IconTool,
  IconUserCheck,
  IconBuildingWarehouse,
  IconArrowBack,
  IconPlus,
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
    werkzeuge, ausleihen, schaeden, wartungen,
    werkzeugeMap, mitarbeiterMap,
    setWerkzeuge, fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const record = top.record;
        if (!record.fields.rueckgabe_erfolgt) {
          return {
            label: tx('Rückgabe eintragen'),
            onClick: () => {
              crud.ausleihen.openEdit(record);
            },
          };
        }
      }
      return undefined;
    },
  });

  const enrichedAusleihen = crud.enriched.ausleihen;
  const enrichedWerkzeuge = crud.enriched.werkzeuge;
  const enrichedSchaeden = crud.enriched.schaeden;
  const enrichedWartungen = crud.enriched.wartungen;

  const clock = useClock();
  const todayKey = format(clock, 'yyyy-MM-dd');

  // Computed state
  const verfuegbar = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar'),
    [werkzeuge],
  );
  const verliehen = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen'),
    [werkzeuge],
  );
  const defektOderWartung = useMemo(
    () => werkzeuge.filter(w => {
      const k = lookupKey(w.fields.status);
      return k === 'defekt' || k === 'in_wartung';
    }),
    [werkzeuge],
  );

  // Active (not yet returned) loans
  const aktivAusleihen = useMemo(
    () => enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt),
    [enrichedAusleihen],
  );

  // Overdue loans (planned return date in the past, not yet returned)
  const ueberfaellig = useMemo(
    () => aktivAusleihen.filter(a => {
      if (!a.fields.rueckgabe_geplant) return false;
      return isBefore(startOfDay(parseISO(a.fields.rueckgabe_geplant)), startOfDay(clock));
    }),
    [aktivAusleihen, clock],
  );

  // Open (unacknowledged) damages
  const offeneSchaeden = useMemo(
    () => enrichedSchaeden.filter(s => {
      const wz = werkzeugeMap.get(
        s.fields.werkzeug?.match(/([a-f0-9]{24})$/i)?.[1] ?? ''
      );
      const k = lookupKey(wz?.fields.status);
      return k === 'defekt' || k === 'in_wartung';
    }),
    [enrichedSchaeden, werkzeugeMap],
  );

  // Loans due/returned today
  const heuteFaellig = useMemo(
    () => aktivAusleihen.filter(a =>
      a.fields.rueckgabe_geplant === todayKey,
    ),
    [aktivAusleihen, todayKey],
  );

  // Context line for greeting
  const contextLine = useMemo(() => {
    const names = aktivAusleihen.slice(0, 3).map(a => a.mitarbeiterName).filter(Boolean);
    if (aktivAusleihen.length === 0) {
      return tx('Aktuell sind alle Werkzeuge verfügbar.');
    }
    if (ueberfaellig.length > 0) {
      return tx`${namen(ueberfaellig.map(a => a.mitarbeiterName))} — Rückgabe überfällig.`;
    }
    return tx`${namen(names)} haben Werkzeuge ausgeliehen.`;
  }, [aktivAusleihen, ueberfaellig]);

  // Kanban columns from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Werkzeug cards for Kanban
  const cards = useMemo<KanbanCard[]>(
    () => enrichedWerkzeuge.map(w => {
      const status = lookupKey(w.fields.status) ?? 'verfuegbar';
      // Find active loan for this tool
      const loan = aktivAusleihen.find(a => {
        const id = a.fields.werkzeug?.match(/([a-f0-9]{24})$/i)?.[1] ?? '';
        return id === w.record_id;
      });
      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.bezeichnung ?? tx('Unbekannt'),
        subtitle: loan
          ? tx`${loan.mitarbeiterName}`
          : w.fields.inventarnummer
            ? `#${w.fields.inventarnummer}`
            : undefined,
        tone: toneForStatus(status),
      };
    }),
    [enrichedWerkzeuge, aktivAusleihen],
  );

  // Card move = status change
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const prev = werkzeuge.find(w => w.record_id === rid);
    if (!prev) return;

    // Business rule: cannot move directly to 'verliehen' from the board
    // (loan must be created via the Ausleihen flow)
    if (newColumn === 'verliehen') {
      return tx('Verleih über Ausleihe-Eintrag anlegen — nicht per Drag.');
    }

    const prevStatus = lookupKey(prev.fields.status);
    setWerkzeuge(prevList =>
      prevList.map(w =>
        w.record_id === rid
          ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
          : w,
      ),
    );
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { status: newColumn });
      undoToast(
        tx`${prev.fields.bezeichnung ?? ''} — Status auf ${lookupOption('werkzeuge', 'status', newColumn).label} gesetzt`,
        async () => {
          setWerkzeuge(prevList =>
            prevList.map(w =>
              w.record_id === rid
                ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', prevStatus ?? 'verfuegbar') } }
                : w,
            ),
          );
          await LivingAppsService.updateWerkzeugeEntry(rid, { status: prevStatus ?? 'verfuegbar' });
        },
      );
    } catch {
      await fetchAll();
    }
  };

  // Quick-return action for a loan
  const handleRueckgabe = async (ausleihe: typeof enrichedAusleihen[number]) => {
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    const prev = { ...ausleihe };
    // Optimistic
    const wid = ausleihe.fields.werkzeug?.match(/([a-f0-9]{24})$/i)?.[1] ?? '';
    if (wid) {
      setWerkzeuge(prevList =>
        prevList.map(w =>
          w.record_id === wid
            ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
            : w,
        ),
      );
    }
    try {
      await LivingAppsService.updateAusleihenEntry(ausleihe.record_id, {
        rueckgabe_erfolgt: now,
        zustand_bei_rueckgabe: 'einwandfrei',
      });
      if (wid) {
        await LivingAppsService.updateWerkzeugeEntry(wid, { status: 'verfuegbar' });
      }
      undoToast(
        tx`${ausleihe.werkzeugName} — zurückgegeben`,
        async () => {
          if (wid) {
            setWerkzeuge(prevList =>
              prevList.map(w =>
                w.record_id === wid
                  ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verliehen') } }
                  : w,
              ),
            );
            await LivingAppsService.updateWerkzeugeEntry(wid, { status: 'verliehen' });
          }
          await LivingAppsService.updateAusleihenEntry(prev.record_id, {
            rueckgabe_erfolgt: undefined,
            zustand_bei_rueckgabe: undefined,
          });
        },
      );
      await fetchAll();
    } catch {
      await fetchAll();
    }
  };

  const heroTarget = ueberfaellig[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
        </div>
        <button
          onClick={() => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Werkzeug ausgeben')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          heroTarget && (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Rückgabe erfassen'),
                onClick: () => crud.ausleihen.openDetail(heroTarget),
              }}
            >
              <b>{namen(ueberfaellig.map(a => a.mitarbeiterName))}</b>
              {ueberfaellig.length === 1
                ? tx` hat ein Werkzeug nicht zurückgebracht — Rückgabe überfällig.`
                : tx` haben Werkzeuge nicht zurückgebracht — Rückgabe überfällig.`}
            </HeroBanner>
          )
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconBuildingWarehouse size={16} className="shrink-0" />}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Verliehen')}
              value={verliehen.length}
              icon={<IconUserCheck size={16} className="shrink-0" />}
              tone={verliehen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Defekt / Wartung')}
              value={defektOderWartung.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={defektOderWartung.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tx('Schäden offen')}
              value={offeneSchaeden.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={offeneSchaeden.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          werkzeuge.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <IconBuildingWarehouse size={48} className="text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">{tx('Noch keine Werkzeuge erfasst')}</p>
                <p className="text-sm text-muted-foreground mt-1">{tx('Lege dein erstes Werkzeug an, um zu starten.')}</p>
              </div>
              <button
                onClick={() => crud.werkzeuge.openCreate({})}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <IconPlus size={16} className="shrink-0" />
                {tx('Erstes Werkzeug anlegen')}
              </button>
            </div>
          ) : (
            <KanbanWidget
              cards={cards}
              columns={COLUMNS}
              defaultCollapsed={['in_wartung']}
              onCardClick={card => {
                const rid = card.id.split(':')[1];
                const wz = werkzeuge.find(w => w.record_id === rid);
                if (wz) crud.werkzeuge.openDetail(wz);
              }}
              onCardMove={moveCard}
              onAddCard={column => {
                crud.werkzeuge.openCreate({ status: column });
              }}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={aktivAusleihen.slice(0, 8).map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                secondLine: (
                  <span className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium text-foreground">{a.mitarbeiterName}</span>
                    {a.fields.rueckgabe_geplant && (
                      <span className={
                        isBefore(startOfDay(parseISO(a.fields.rueckgabe_geplant)), startOfDay(clock))
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }>
                        {' '}· {tx('fällig')} {a.fields.rueckgabe_geplant}
                      </span>
                    )}
                  </span>
                ),
                action: {
                  label: tx('Zurück'),
                  onClick: () => {
                    void handleRueckgabe(a);
                  },
                },
              }))}
              onItemClick={id => {
                const a = enrichedAusleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Alle Werkzeuge sind zurückgegeben.'),
                action: {
                  label: tx('Werkzeug ausgeben'),
                  onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }),
                },
              }}
            />

            <WorkList
              title={tx('Neue Schäden')}
              items={enrichedSchaeden
                .filter(s => s.fields.gemeldet_am === todayKey || !s.fields.gemeldet_am)
                .concat(
                  offeneSchaeden.filter(s => s.fields.gemeldet_am !== todayKey)
                )
                .slice(0, 5)
                .map(s => ({
                  id: s.record_id,
                  title: s.werkzeugName || tx('Unbekanntes Werkzeug'),
                  secondLine: (
                    <span className="text-muted-foreground text-xs truncate">
                      {s.fields.beschreibung || tx('Kein Kommentar')}
                    </span>
                  ),
                  action: {
                    label: tx('Wartung'),
                    onClick: () => {
                      const wid = s.fields.werkzeug?.match(/([a-f0-9]{24})$/i)?.[1] ?? '';
                      crud.wartungen.openCreate({ werkzeug: wid, datum: todayKey });
                    },
                  },
                }))}
              onItemClick={id => {
                const s = enrichedSchaeden.find(x => x.record_id === id);
                if (s) crud.schaeden.openDetail(s);
              }}
              empty={{
                text: tx('Keine neuen Schäden gemeldet.'),
                action: {
                  label: tx('Schaden melden'),
                  onClick: () => crud.schaeden.openCreate({ gemeldet_am: todayKey }),
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
