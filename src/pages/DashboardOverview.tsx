import { useMemo, useState } from 'react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey, formatDate, formatDateTime } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { format } from 'date-fns';
import {
  IconTool,
  IconAlertTriangle,
  IconArrowBack,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    mitarbeiter, werkzeuge, ausleihen, wartungen, schaeden,
    werkzeugeMap, mitarbeiterMap,
    setWerkzeuge,
    fetchAll,
  } = data;

  const clock = useClock();
  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const a = ausleihen.find(r => r.record_id === top.record.record_id);
        if (a && !a.fields.rueckgabe_erfolgt) {
          return {
            label: tx('Rückgabe buchen'),
            onClick: () => {
              crud.ausleihen.openEdit(top.record);
            },
          };
        }
      }
      if (top.type === 'wartungen') {
        const w = wartungen.find(r => r.record_id === top.record.record_id);
        if (w && !w.fields.erledigt) {
          return {
            label: tx('Als erledigt markieren'),
            onClick: () => {
              const prev = { ...w };
              setWerkzeuge(prev2 => prev2); // no-op to keep the pattern consistent
              void LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: true })
                .then(() => fetchAll())
                .catch(() => fetchAll());
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

  const today = format(clock, 'yyyy-MM-dd');

  // KPI counters
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar'), [werkzeuge]);
  const verliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen'), [werkzeuge]);
  const defekt = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'defekt'), [werkzeuge]);
  const inWartung = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.status) === 'in_wartung'), [werkzeuge]);

  // Hero: defekte Werkzeuge ohne offene Wartung
  const defektOhneWartung = useMemo(() => {
    const werkzeugIdsInWartung = new Set(
      wartungen
        .filter(w => !w.fields.erledigt)
        .map(w => {
          const url = w.fields.werkzeug;
          if (!url) return null;
          const m = String(url).match(/([a-f0-9]{24})$/i);
          return m ? m[1] : null;
        })
        .filter(Boolean) as string[]
    );
    return defekt.filter(w => !werkzeugIdsInWartung.has(w.record_id));
  }, [defekt, wartungen]);

  // Überfällige Ausleihen (geplante Rückgabe überschritten, keine Rückgabe erfolgt)
  const ueberfaelligeAusleihen = useMemo(() =>
    enrichedAusleihen.filter(a =>
      !a.fields.rueckgabe_erfolgt &&
      a.fields.rueckgabe_geplant &&
      a.fields.rueckgabe_geplant < today
    ),
    [enrichedAusleihen, today]
  );

  // Aktive Ausleihen (noch nicht zurückgegeben)
  const aktiveAusleihen = useMemo(() =>
    enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt),
    [enrichedAusleihen]
  );

  // Offene Schäden (ohne Wartungsmaßnahme)
  const offeneSchaeden = useMemo(() => enrichedSchaeden, [enrichedSchaeden]);

  // Filter state für KPI-Strip
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Kanban columns
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  function toneForStatus(status: string | undefined): KanbanTone {
    if (status === 'verfuegbar') return 'success';
    if (status === 'verliehen') return 'primary';
    if (status === 'defekt') return 'destructive';
    if (status === 'in_wartung') return 'warning';
    return 'default';
  }

  const allCards = useMemo<KanbanCard[]>(
    () => enrichedWerkzeuge.map(w => {
      const status = lookupKey(w.fields.status) ?? COLUMNS[0]?.key ?? '';
      const activeCount = aktiveAusleihen.filter(a => {
        const url = a.fields.werkzeug;
        if (!url) return false;
        const m = String(url).match(/([a-f0-9]{24})$/i);
        return m ? m[1] === w.record_id : false;
      }).length;
      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.bezeichnung ?? tx('Unbekannt'),
        subtitle: w.fields.inventarnummer
          ? `#${w.fields.inventarnummer}`
          : undefined,
        meta: activeCount > 0
          ? tx`bei ${aktiveAusleihen.find(a => {
            const url = a.fields.werkzeug;
            if (!url) return false;
            const m = String(url).match(/([a-f0-9]{24})$/i);
            return m ? m[1] === w.record_id : false;
          })?.mitarbeiterName ?? ''}`
          : undefined,
        tone: toneForStatus(status),
      };
    }),
    [enrichedWerkzeuge, aktiveAusleihen, COLUMNS],
  );

  const cards = useMemo(() => {
    if (!statusFilter) return allCards;
    return allCards.filter(c => c.column === statusFilter);
  }, [allCards, statusFilter]);

  // Werkzeug-Status per Karte wechseln (Drag)
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const w = werkzeuge.find(x => x.record_id === rid);
    if (!w) return;
    const prevStatus = w.fields.status;
    const newStatus = lookupOption('werkzeuge', 'status', newColumn);
    setWerkzeuge(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, status: newStatus } }
          : x,
      )
    );
    undoToast(
      tx`${w.fields.bezeichnung ?? ''} → ${newStatus.label}`,
      async () => {
        setWerkzeuge(prev =>
          prev.map(x =>
            x.record_id === rid
              ? { ...x, fields: { ...x.fields, status: prevStatus } }
              : x,
          )
        );
        await LivingAppsService.updateWerkzeugeEntry(rid, { status: lookupKey(prevStatus) });
      },
    );
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { status: newColumn });
    } catch {
      await fetchAll();
    }
  };

  // Rückgabe-Hilfsfunktion
  const buecheRueckgabe = async (ausleiheId: string) => {
    const a = ausleihen.find(x => x.record_id === ausleiheId);
    if (!a) return;
    const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");
    try {
      await LivingAppsService.updateAusleihenEntry(ausleiheId, {
        rueckgabe_erfolgt: nowStr,
      });
      undoToast(
        tx`Rückgabe gebucht`,
        async () => {
          await LivingAppsService.updateAusleihenEntry(ausleiheId, {
            rueckgabe_erfolgt: undefined,
          });
          fetchAll();
        },
      );
      fetchAll();
    } catch {
      fetchAll();
    }
  };

  // Kontext-Zeile
  const contextLine = useMemo(() => {
    if (ueberfaelligeAusleihen.length > 0) {
      const namen_ = namen(ueberfaelligeAusleihen.map(a => a.mitarbeiterName));
      return tx`${namen_} — Rückgabe überfällig.`;
    }
    if (aktiveAusleihen.length > 0) {
      const namen_ = namen(aktiveAusleihen.map(a => a.mitarbeiterName));
      return tx`${aktiveAusleihen.length} Geräte bei ${namen_}.`;
    }
    return tx`Alles verfügbar — keine aktiven Ausleihen.`;
  }, [ueberfaelligeAusleihen, aktiveAusleihen]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={() => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") })}
        >
          <IconTool size={16} className="shrink-0" />
          {tx('Werkzeug ausgeben')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={defektOhneWartung.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Wartung anlegen'),
              onClick: () => crud.wartungen.openCreate({
                datum: today,
                werkzeug: defektOhneWartung[0].record_id,
              }),
            }}
          >
            <b>{namen(defektOhneWartung.map(w => w.fields.bezeichnung ?? ''))}</b>
            {' '}{tx('defekt ohne Wartungsauftrag')} — {tx('bitte Wartung anlegen.')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} />}
              tone={verfuegbar.length > 0 ? 'success' : 'warning'}
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
              icon={<IconTool size={16} />}
              tone={inWartung.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_wartung' ? null : 'in_wartung')}
              active={statusFilter === 'in_wartung'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={statusFilter
              ? cards
              : allCards}
            columns={COLUMNS}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
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
              title={tx('Aktive Ausleihen — überfällig & heute')}
              items={[
                ...ueberfaelligeAusleihen.map(a => ({
                  id: a.record_id,
                  title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-destructive">{tx('Überfällig')}</span>
                      <span className="text-muted-foreground"> · {a.mitarbeiterName}</span>
                      {a.fields.rueckgabe_geplant && (
                        <span className="text-muted-foreground"> · {tx('geplant')}: {formatDate(a.fields.rueckgabe_geplant)}</span>
                      )}
                    </>
                  ),
                  action: {
                    label: tx('Zurücknehmen'),
                    onClick: () => buecheRueckgabe(a.record_id),
                  },
                })),
                ...aktiveAusleihen
                  .filter(a =>
                    !ueberfaelligeAusleihen.some(u => u.record_id === a.record_id) &&
                    a.fields.rueckgabe_geplant === today
                  )
                  .map(a => ({
                    id: a.record_id,
                    title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                    secondLine: (
                      <>
                        <span className="font-medium text-amber-600">{tx('Heute fällig')}</span>
                        <span className="text-muted-foreground"> · {a.mitarbeiterName}</span>
                      </>
                    ),
                    action: {
                      label: tx('Zurücknehmen'),
                      onClick: () => buecheRueckgabe(a.record_id),
                    },
                  })),
              ]}
              onItemClick={id => {
                const a = ausleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: aktiveAusleihen.length > 0
                  ? tx('Keine überfälligen Geräte — alle im Plan.')
                  : tx('Keine aktiven Ausleihen — alle Geräte im Lager.'),
                action: {
                  label: tx('Werkzeug ausgeben'),
                  onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }),
                },
              }}
            />

            <WorkList
              title={tx('Gemeldete Schäden')}
              items={offeneSchaeden.map(s => ({
                id: s.record_id,
                title: s.werkzeugName || tx('Unbekanntes Werkzeug'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tx('Schaden')}</span>
                    {s.fields.gemeldet_am && (
                      <span className="text-muted-foreground"> · {formatDate(s.fields.gemeldet_am)}</span>
                    )}
                    {s.fields.beschreibung && (
                      <span className="text-muted-foreground"> · {s.fields.beschreibung.split('\n')[0]}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Wartung anlegen'),
                  onClick: () => {
                    const wid = (() => {
                      const url = s.fields.werkzeug;
                      if (!url) return null;
                      const m = String(url).match(/([a-f0-9]{24})$/i);
                      return m ? m[1] : null;
                    })();
                    crud.wartungen.openCreate({
                      datum: today,
                      ...(wid ? { werkzeug: wid } : {}),
                    });
                  },
                },
              }))}
              onItemClick={id => {
                const s = schaeden.find(x => x.record_id === id);
                if (s) crud.schaeden.openDetail(s);
              }}
              empty={{
                text: tx('Keine gemeldeten Schäden.'),
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
