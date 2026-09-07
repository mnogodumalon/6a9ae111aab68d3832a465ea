import { useMemo, useState } from 'react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import {
  IconTool,
  IconAlertTriangle,
  IconArrowBackUp,
  IconPackage,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    mitarbeiter, werkzeuge, ausleihen, wartungen, schaeden,
    mitarbeiterMap, werkzeugeMap,
    setWerkzeuge,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen') {
        const a = ausleihen.find(x => x.record_id === top.record.record_id);
        if (a && !a.fields.rueckgabe_erfolgt) {
          return {
            label: tx('Werkzeug zurücknehmen'),
            onClick: () => handleReturn(top.record.record_id),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedWerkzeuge = crud.enriched.werkzeuge;
  const enrichedAusleihen = crud.enriched.ausleihen;
  const enrichedWartungen = crud.enriched.wartungen;
  const enrichedSchaeden = crud.enriched.schaeden;

  const clock = useClock();

  // --- Status-Filterung ---
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // --- KPI-Zahlen ---
  const verfuegbar = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar'),
    [werkzeuge],
  );
  const verliehen = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen'),
    [werkzeuge],
  );
  const defekt = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'defekt'),
    [werkzeuge],
  );
  const inWartung = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'in_wartung'),
    [werkzeuge],
  );

  // Aktive Ausleihen (noch nicht zurückgegeben)
  const aktivAusleihen = useMemo(
    () => enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt),
    [enrichedAusleihen],
  );

  // Überfällige Rückgaben (geplantes Rückgabedatum vor heute, noch nicht zurück)
  const todayStr = clock.toLocaleDateString('sv'); // yyyy-MM-dd lokal
  const ueberfaellig = useMemo(
    () =>
      aktivAusleihen.filter(
        a => a.fields.rueckgabe_geplant && a.fields.rueckgabe_geplant < todayStr,
      ),
    [aktivAusleihen, todayStr],
  );

  // Offene Schäden
  const offeneSchaeden = useMemo(
    () => enrichedSchaeden.filter(s => {
      const w = werkzeugeMap.get(s.fields.werkzeug?.split('/').pop() ?? '');
      return w && lookupKey(w.fields.status) !== 'in_wartung';
    }),
    [enrichedSchaeden, werkzeugeMap],
  );

  // --- Kanban-Daten ---
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const filteredWerkzeuge = useMemo(
    () =>
      statusFilter
        ? enrichedWerkzeuge.filter(w => lookupKey(w.fields.status) === statusFilter)
        : enrichedWerkzeuge,
    [enrichedWerkzeuge, statusFilter],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      filteredWerkzeuge.map(w => {
        const status = lookupKey(w.fields.status) ?? 'verfuegbar';
        const aktiveAusleihe = aktivAusleihen.find(a => {
          const id = a.fields.werkzeug?.split('/').pop();
          return id === w.record_id;
        });
        const schadenCount = enrichedSchaeden.filter(s => {
          const id = s.fields.werkzeug?.split('/').pop();
          return id === w.record_id;
        }).length;
        return {
          id: `werkzeug:${w.record_id}`,
          column: status,
          title: w.fields.bezeichnung ?? tx('Unbekannt'),
          subtitle: aktiveAusleihe
            ? tx`Ausgeliehen von ${aktiveAusleihe.mitarbeiterName || tx('unbekannt')}`
            : schadenCount > 0
            ? tx`${schadenCount} Schaden gemeldet`
            : (w.fields.inventarnummer ?? undefined),
          tone:
            status === 'verfuegbar'
              ? 'success'
              : status === 'verliehen'
              ? 'primary'
              : status === 'defekt'
              ? 'destructive'
              : 'warning',
        };
      }),
    [filteredWerkzeuge, aktivAusleihen, enrichedSchaeden],
  );

  // --- Kanban-Drag ---
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    // Regel: Nur verfügbare Werkzeuge dürfen als 'verliehen' markiert werden
    if (newColumn === 'verliehen') {
      const w = werkzeugeMap.get(rid);
      if (w && lookupKey(w.fields.status) === 'defekt') {
        return tx('Defekte Werkzeuge können nicht direkt verliehen werden — bitte zuerst reparieren.');
      }
    }
    const before = werkzeuge.map(w => ({ ...w }));
    setWerkzeuge(prev =>
      prev.map(w =>
        w.record_id === rid
          ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
          : w,
      ),
    );
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { status: newColumn });
      const wName = werkzeugeMap.get(rid)?.fields.bezeichnung ?? rid;
      const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
      undoToast(tx`${wName} → ${colLabel}`, () => {
        const prev = before.find(w => w.record_id === rid);
        if (!prev) return;
        const prevKey = lookupKey(prev.fields.status) ?? 'verfuegbar';
        setWerkzeuge(cur =>
          cur.map(w =>
            w.record_id === rid
              ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', prevKey) } }
              : w,
          ),
        );
        void LivingAppsService.updateWerkzeugeEntry(rid, { status: prevKey }).catch(() => fetchAll());
      });
    } catch {
      await fetchAll();
    }
  };

  // --- Werkzeug zurücknehmen ---
  const handleReturn = async (ausleiheId: string) => {
    const a = ausleihen.find(x => x.record_id === ausleiheId);
    if (!a) return;
    const wId = a.fields.werkzeug?.split('/').pop();
    const now = `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, '0')}-${String(clock.getDate()).padStart(2, '0')}T${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
    try {
      await LivingAppsService.updateAusleihenEntry(ausleiheId, {
        rueckgabe_erfolgt: now,
        zustand_bei_rueckgabe: 'einwandfrei',
      });
      if (wId) {
        await LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verfuegbar' });
      }
      const enrichedA = enrichedAusleihen.find(x => x.record_id === ausleiheId);
      const wName = enrichedA?.werkzeugName ?? tx('Werkzeug');
      undoToast(tx`${wName} — zurückgegeben`);
      await fetchAll();
    } catch {
      await fetchAll();
    }
  };

  // --- Kontext-Satz ---
  const contextLine = useMemo(() => {
    if (ueberfaellig.length > 0) {
      const names = namen(ueberfaellig.map(a => a.mitarbeiterName));
      return tx`${names} hat überfällige Werkzeuge — bitte Rückgabe klären.`;
    }
    if (aktivAusleihen.length > 0) {
      const names = namen(aktivAusleihen.slice(0, 3).map(a => a.mitarbeiterName));
      return tx`${names} hat gerade Werkzeuge ausgeliehen.`;
    }
    if (verfuegbar.length > 0) {
      return tx`Alle Werkzeuge verfügbar — bereit für den nächsten Einsatz.`;
    }
    return tx`Noch keine Werkzeuge erfasst.`;
  }, [ueberfaellig, aktivAusleihen, verfuegbar]);

  // --- Hero-Banner (überfällige Rückgaben) ---
  const heroBanner =
    ueberfaellig.length > 0 ? (
      <HeroBanner
        icon={<IconAlertTriangle size={18} />}
        action={{
          label: tx('Rückgabe erfassen'),
          onClick: () => crud.ausleihen.openDetail(ueberfaellig[0]),
        }}
      >
        <b>{namen(ueberfaellig.map(a => a.mitarbeiterName))}</b>{' '}
        {ueberfaellig.length === 1
          ? tx`hat ein Werkzeug nicht rechtzeitig zurückgebracht`
          : tx`haben Werkzeuge nicht rechtzeitig zurückgebracht`}{' '}
        — {tx('fällig war')} {formatDate(ueberfaellig[0].fields.rueckgabe_geplant)}.
      </HeroBanner>
    ) : null;

  // --- Aside: Aktive Ausleihen ---
  const aktivItems = aktivAusleihen
    .sort((a, b) => {
      // Überfällige zuerst
      const aOver = a.fields.rueckgabe_geplant && a.fields.rueckgabe_geplant < todayStr;
      const bOver = b.fields.rueckgabe_geplant && b.fields.rueckgabe_geplant < todayStr;
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return 1;
      return (a.fields.rueckgabe_geplant ?? '').localeCompare(b.fields.rueckgabe_geplant ?? '');
    })
    .map(a => {
      const isOverdue = a.fields.rueckgabe_geplant && a.fields.rueckgabe_geplant < todayStr;
      return {
        id: a.record_id,
        title: a.werkzeugName || appLabel('werkzeuge'),
        secondLine: (
          <>
            <span className={isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>
              {isOverdue ? tx('Überfällig') : tx('Ausgeliehen')}
            </span>
            <span className="text-muted-foreground">
              {' '}·{' '}{a.mitarbeiterName}
            </span>
            {a.fields.rueckgabe_geplant && (
              <span className="text-muted-foreground">
                {' '}·{' '}{tx('Rückgabe')}: {formatDate(a.fields.rueckgabe_geplant)}
              </span>
            )}
          </>
        ),
        action: {
          label: tx('Zurücknehmen'),
          onClick: () => handleReturn(a.record_id),
        },
      };
    });

  // --- Aside: Offene Wartungen ---
  const offeneWartungen = useMemo(
    () => enrichedWartungen.filter(w => !w.fields.erledigt).sort((a, b) =>
      (a.fields.datum ?? '').localeCompare(b.fields.datum ?? ''),
    ),
    [enrichedWartungen],
  );
  const wartungenItems = offeneWartungen.map(w => ({
    id: w.record_id,
    title: w.werkzeugName || appLabel('werkzeuge'),
    secondLine: (
      <>
        <span className="font-medium text-amber-600">{tx('Wartung offen')}</span>
        {w.fields.datum && (
          <span className="text-muted-foreground"> · {formatDate(w.fields.datum)}</span>
        )}
      </>
    ),
    action: {
      label: tx('Erledigt'),
      onClick: async () => {
        const before = { ...w.fields };
        await LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: true });
        undoToast(tx`${w.werkzeugName} — Wartung erledigt`, async () => {
          await LivingAppsService.updateWartungenEntry(w.record_id, { erledigt: false }).catch(() => fetchAll());
        });
        await fetchAll();
      },
    },
  }));

  return (
    <div className="space-y-6">
      {/* Seiten-Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          onClick={() => crud.ausleihen.openCreate({ ausgabe: `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, '0')}-${String(clock.getDate()).padStart(2, '0')}T${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}` })}
        >
          <span className="flex items-center gap-1.5">
            <IconPackage size={16} className="shrink-0" />
            {tx('Werkzeug ausgeben')}
          </span>
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBanner}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone="success"
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={verliehen.length}
              icon={<IconPackage size={16} className="shrink-0" />}
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
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['in_wartung']}
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
              items={aktivItems}
              onItemClick={id => {
                const a = ausleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Alle Werkzeuge sind zurück — nichts offen.'),
                action: {
                  label: tx('Werkzeug ausgeben'),
                  onClick: () => crud.ausleihen.openCreate({}),
                },
              }}
            />
            <WorkList
              title={tx('Offene Wartungen')}
              items={wartungenItems}
              onItemClick={id => {
                const w = wartungen.find(x => x.record_id === id);
                if (w) crud.wartungen.openDetail(w);
              }}
              empty={{
                text: tx('Keine offenen Wartungen — alles in Ordnung.'),
                action: {
                  label: tx('Wartung erfassen'),
                  onClick: () => crud.wartungen.openCreate({}),
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
