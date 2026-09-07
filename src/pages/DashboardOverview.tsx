import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { tx, appLabel } from '@/i18n';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format, parseISO, isToday, isBefore, isAfter } from 'date-fns';
import { lookupKey } from '@/lib/formatters';
import { LOOKUP_OPTIONS, lookupOption, APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import {
  IconTool,
  IconAlertTriangle,
  IconClockHour4,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    werkzeuge, ausleihen, schaeden,
    setWerkzeuge, setAusleihen,
    werkzeugeMap, mitarbeiterMap,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const a = top.record;
        if (!a.fields.rueckgabe_erfolgt) {
          return {
            label: tx('Rückgabe erfassen'),
            onClick: () => crud.ausleihen.openEdit(a),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedWerkzeuge = crud.enriched.werkzeuge;
  const enrichedAusleihen = crud.enriched.ausleihen;
  const enrichedSchaeden = crud.enriched.schaeden;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  // ── Derived counts ──────────────────────────────────────────────────
  const verfuegbar = werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar');
  const verliehen = werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen');
  const defektOderWartung = werkzeuge.filter(w => {
    const s = lookupKey(w.fields.status);
    return s === 'defekt' || s === 'in_wartung';
  });

  // Ausleihen die heute aktiv (ausgegeben, noch nicht zurück) sind
  const aktivAusleihen = enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt);

  // Überfällige Ausleihen (geplantes Rückgabedatum vor heute, noch nicht zurück)
  const ueberfaellig = aktivAusleihen.filter(a => {
    if (!a.fields.rueckgabe_geplant) return false;
    try {
      return isBefore(parseISO(a.fields.rueckgabe_geplant), parseISO(today));
    } catch { return false; }
  });

  // Heute ausgegebene Ausleihen
  const heuteAusgegeben = enrichedAusleihen.filter(a => {
    if (!a.fields.ausgabe) return false;
    try { return a.fields.ausgabe.startsWith(today); } catch { return false; }
  });

  // Neue Schäden (heute oder unbearbeitet = ohne Wartungsabschluss)
  const neueSchaeden = enrichedSchaeden.filter(s => s.fields.gemeldet_am === today);

  // Alle offenen Schäden (kein Rückbezug auf eine erledigte Wartung nötig — einfach alle)
  const offeneSchaeden = enrichedSchaeden;

  // ── Kanban: Werkzeuge nach Status ──────────────────────────────────
  const statusColumns: KanbanColumn[] = (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'verfuegbar' ? 'success'
      : o.key === 'verliehen' ? 'primary'
      : o.key === 'defekt' ? 'destructive'
      : 'warning',
  }));

  const kanbanCards: KanbanCard[] = enrichedWerkzeuge.map(w => {
    const s = lookupKey(w.fields.status);
    const tone = s === 'verfuegbar' ? 'success'
      : s === 'verliehen' ? 'primary'
      : s === 'defekt' ? 'destructive'
      : s === 'in_wartung' ? 'warning'
      : 'default';

    // Finde aktive Ausleihe für dieses Werkzeug
    const wId = w.record_id;
    const aktiveAusleihe = aktivAusleihen.find(a => {
      const aid = extractRecordId(a.fields.werkzeug);
      return aid === wId;
    });

    return {
      id: `werkzeug:${w.record_id}`,
      column: s ?? '',
      title: w.fields.bezeichnung ?? tx('Unbekannt'),
      subtitle: aktiveAusleihe
        ? tx`bei ${aktiveAusleihe.mitarbeiterName}`
        : w.fields.inventarnummer
        ? `#${w.fields.inventarnummer}` /* i18n-exempt */
        : undefined,
      tone,
    };
  });

  // ── Card-Move Handler (Status-Änderung) ────────────────────────────
  const handleCardMove = async (cardId: string, newColumn: string) => {
    const wId = cardId.split(':')[1] ?? '';
    const w = werkzeugeMap.get(wId);
    if (!w) return;

    const oldStatus = w.fields.status;
    // Optimistisch
    setWerkzeuge(prev => prev.map(x =>
      x.record_id === wId
        ? { ...x, fields: { ...x.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
        : x
    ));

    const newLabel = statusColumns.find(c => c.key === newColumn)?.label ?? newColumn;
    undoToast(
      tx`${w.fields.bezeichnung ?? ''} → ${newLabel}`,
      async () => {
        setWerkzeuge(prev => prev.map(x =>
          x.record_id === wId
            ? { ...x, fields: { ...x.fields, status: oldStatus } }
            : x
        ));
        await LivingAppsService.updateWerkzeugeEntry(wId, { status: oldStatus?.key ?? undefined });
      }
    );

    try {
      await LivingAppsService.updateWerkzeugeEntry(wId, { status: newColumn });
    } catch {
      await fetchAll();
    }
  };

  // ── Rückgabe erfassen ─────────────────────────────────────────────
  const handleRueckgabe = (ausleihe: typeof enrichedAusleihen[0]) => {
    crud.ausleihen.openEdit(ausleihe);
  };

  // ── Kontext-Zeile ──────────────────────────────────────────────────
  const ausleiherNamen = aktivAusleihen.slice(0, 3).map(a => a.mitarbeiterName).filter(Boolean);
  const contextLine = aktivAusleihen.length === 0
    ? tx('Alle Werkzeuge sind im Haus.')
    : ueberfaellig.length > 0
    ? tx`${namen(ueberfaellig.map(a => a.mitarbeiterName))} — Rückgabe überfällig.`
    : tx`Derzeit ausgeliehen an ${namen(ausleiherNamen)}.`;

  return (
    <div className="space-y-6">
      {/* Page-Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          onClick={() => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <IconTool size={16} className="shrink-0" />
          {tx('Werkzeug ausgeben')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaellig.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Rückgabe erfassen'),
              onClick: () => handleRueckgabe(ueberfaellig[0]),
            }}
          >
            <b>{namen(ueberfaellig.map(a => a.mitarbeiterName))}</b>{' '}
            {ueberfaellig.length === 1 ? tx('hat ein Werkzeug nicht zurückgegeben.') : tx('haben Werkzeuge nicht zurückgegeben.')}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} />}
              tone="success"
              onClick={() => crud.werkzeuge.openCreate({})}
            />
            <StatStripItem
              title={tx('Verliehen')}
              value={verliehen.length}
              icon={<IconTool size={16} />}
              tone={verliehen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Defekt / Wartung')}
              value={defektOderWartung.length}
              icon={<IconTool size={16} />}
              tone={defektOderWartung.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Neue Schäden heute')}
              value={neueSchaeden.length}
              icon={<IconAlertTriangle size={16} />}
              tone={neueSchaeden.length > 0 ? 'destructive' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={statusColumns}
            cards={kanbanCards}
            defaultCollapsed={[]}
            onCardClick={(card) => {
              const wId = card.id.split(':')[1] ?? '';
              const w = werkzeugeMap.get(wId);
              if (w) crud.werkzeuge.openDetail(w);
            }}
            onCardMove={handleCardMove}
            onAddCard={(column) => {
              crud.werkzeuge.openCreate({ status: column });
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={aktivAusleihen
                .sort((a, b) => {
                  const da = a.fields.rueckgabe_geplant ?? '';
                  const db = b.fields.rueckgabe_geplant ?? '';
                  return da.localeCompare(db);
                })
                .slice(0, 8)
                .map(a => {
                  const isUeberfaellig = a.fields.rueckgabe_geplant
                    ? isBefore(parseISO(a.fields.rueckgabe_geplant), parseISO(today))
                    : false;
                  return {
                    id: a.record_id,
                    title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                    secondLine: (
                      <span className="flex gap-1.5 flex-wrap">
                        <span className={isUeberfaellig ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                          {a.mitarbeiterName}
                        </span>
                        {a.fields.rueckgabe_geplant && (
                          <span className="text-muted-foreground">
                            {' · '}{isUeberfaellig ? tx('Überfällig') : tx('bis')}{' '}
                            {a.fields.rueckgabe_geplant}
                          </span>
                        )}
                      </span>
                    ),
                    action: {
                      label: tx('Rückgabe'),
                      onClick: () => handleRueckgabe(a),
                    },
                  };
                })}
              onItemClick={(id) => {
                const a = enrichedAusleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Keine Werkzeuge verliehen — alles im Haus.'),
                action: {
                  label: tx('Werkzeug ausgeben'),
                  onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }),
                },
              }}
            />
            <WorkList
              title={tx('Gemeldete Schäden')}
              items={offeneSchaeden
                .sort((a, b) => (b.fields.gemeldet_am ?? '').localeCompare(a.fields.gemeldet_am ?? ''))
                .slice(0, 6)
                .map(s => ({
                  id: s.record_id,
                  title: s.werkzeugName || tx('Unbekanntes Werkzeug'),
                  secondLine: (
                    <span className="flex gap-1.5 flex-wrap">
                      <span className="font-medium text-amber-600">{tx('Schaden')}</span>
                      {s.fields.gemeldet_am && (
                        <span className="text-muted-foreground"> · {s.fields.gemeldet_am}</span>
                      )}
                    </span>
                  ),
                  action: {
                    label: tx('Wartung'),
                    onClick: () => {
                      const wId = extractRecordId(s.fields.werkzeug);
                      crud.wartungen.openCreate(wId ? { werkzeug: wId } : {});
                    },
                  },
                }))}
              onItemClick={(id) => {
                const s = enrichedSchaeden.find(x => x.record_id === id);
                if (s) crud.schaeden.openDetail(s);
              }}
              empty={{
                text: tx('Keine Schäden gemeldet — alles in Ordnung.'),
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
