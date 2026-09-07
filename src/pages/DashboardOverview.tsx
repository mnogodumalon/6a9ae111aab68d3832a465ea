import { useMemo, useState } from 'react';
import { format } from 'date-fns';
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
import {
  IconAlertTriangle,
  IconTool,
  IconCheck,
  IconPackage,
  IconCircleX,
  IconClockHour4,
  IconPlus,
} from '@tabler/icons-react';

function statusTone(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'verliehen') return 'primary';
  if (key === 'defekt') return 'destructive';
  if (key === 'in_wartung') return 'warning';
  return 'default';
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    mitarbeiter,
    werkzeuge,
    setWerkzeuge,
    ausleihen,
    schaeden,
    mitarbeiterMap,
    fetchAll,
  } = data;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  const crud = useEntityCrud(data);
  const enrichedAusleihen = crud.enriched.ausleihen;
  const enrichedSchaeden = crud.enriched.schaeden;

  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Ausleihen-Analyse
  const offeneAusleihen = useMemo(
    () => enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt),
    [enrichedAusleihen],
  );

  const ueberfaellige = useMemo(
    () =>
      offeneAusleihen.filter(
        a => a.fields.rueckgabe_geplant && a.fields.rueckgabe_geplant < today,
      ),
    [offeneAusleihen, today],
  );

  const heuteFaellig = useMemo(
    () =>
      offeneAusleihen.filter(
        a => a.fields.rueckgabe_geplant === today,
      ),
    [offeneAusleihen, today],
  );

  const offeneSchaeden = useMemo(
    () => enrichedSchaeden.filter(s => !!s.fields.beschreibung),
    [enrichedSchaeden],
  );

  // Werkzeug-Status-Zähler
  const verfuegbar = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar').length,
    [werkzeuge],
  );
  const verliehen = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen').length,
    [werkzeuge],
  );
  const defekt = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.status) === 'defekt').length,
    [werkzeuge],
  );

  // Kontextzeile
  const kontextzeile = useMemo(() => {
    if (offeneAusleihen.length === 0) {
      return tx('Alle Werkzeuge sind im Depot.');
    }
    const names = namen(offeneAusleihen.map(a => a.mitarbeiterName).filter(Boolean));
    if (ueberfaellige.length > 0) {
      return tx`${names} — ${ueberfaellige.length} Rückgabe(n) überfällig.`;
    }
    return tx`${names} hat/haben aktuell Werkzeuge ausgeliehen.`;
  }, [offeneAusleihen, ueberfaellige]);

  // Werkzeug-Status-Karten für Kanban
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const kanbanCards = useMemo<KanbanCard[]>(() => {
    const basis = statusFilter
      ? werkzeuge.filter(w => lookupKey(w.fields.status) === statusFilter)
      : werkzeuge;
    return basis.map(w => {
      const sk = lookupKey(w.fields.status);
      return {
        id: `werkzeug:${w.record_id}`,
        column: sk ?? 'verfuegbar',
        title: w.fields.bezeichnung ?? tx('Ohne Bezeichnung'),
        subtitle: w.fields.inventarnummer ? `#${w.fields.inventarnummer}` : undefined,
        tone: statusTone(sk),
      };
    });
  }, [werkzeuge, statusFilter]);

  // Rückgabe-Handler (shared) — akzeptiert EnrichedAusleihen für den Namen
  const handleRueckgabe = async (ausleihe: (typeof enrichedAusleihen)[number]) => {
    const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");
    const rid = ausleihe.record_id;
    const wId = ausleihe.fields.werkzeug
      ? (ausleihe.fields.werkzeug as string).match(/([a-f0-9]{24})$/i)?.[1]
      : null;

    const snapshot = [...ausleihen];
    data.setAusleihen(prev =>
      prev.map(a =>
        a.record_id === rid
          ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: nowStr } }
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

    const name = ausleihe.werkzeugName || tx('Werkzeug');
    undoToast(tx`${name} — zurückgegeben`, async () => {
      data.setAusleihen(snapshot);
      if (wId) {
        setWerkzeuge(prev =>
          prev.map(w =>
            w.record_id === wId
              ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verliehen') } }
              : w,
          ),
        );
      }
      await LivingAppsService.updateAusleihenEntry(rid, { rueckgabe_erfolgt: undefined });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verliehen' });
    });

    try {
      await LivingAppsService.updateAusleihenEntry(rid, { rueckgabe_erfolgt: nowStr });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { status: 'verfuegbar' });
    } catch {
      data.setAusleihen(snapshot);
      await fetchAll();
    }
  };

  // Kanban-Karte: Status-Drag
  const handleCardMove = async (cardId: string, newColumn: string) => {
    const wId = cardId.split(':')[1];
    if (!wId) return;
    // Verhindere doppelte Ausgabe: Werkzeug kann nur ausgegeben werden, wenn es verfügbar ist
    if (newColumn === 'verliehen') {
      const w = werkzeuge.find(x => x.record_id === wId);
      if (w && lookupKey(w.fields.status) !== 'verfuegbar') {
        return tx('Nur verfügbare Werkzeuge können verliehen werden.');
      }
    }

    const snapshot = [...werkzeuge];
    setWerkzeuge(prev =>
      prev.map(w =>
        w.record_id === wId
          ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', newColumn) } }
          : w,
      ),
    );

    const col = COLUMNS.find(c => c.key === newColumn);
    undoToast(tx`Status auf ${col?.label ?? newColumn} geändert`, async () => {
      setWerkzeuge(snapshot);
      const prev = snapshot.find(w => w.record_id === wId);
      const prevKey = lookupKey(prev?.fields.status);
      if (prevKey) await LivingAppsService.updateWerkzeugeEntry(wId, { status: prevKey });
    });

    try {
      await LivingAppsService.updateWerkzeugeEntry(wId, { status: newColumn });
    } catch {
      setWerkzeuge(snapshot);
      await fetchAll();
    }
  };

  const heroAusleihe = ueberfaellige[0];
  const heroBanner = heroAusleihe ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: tx('Jetzt zurücknehmen'),
        onClick: () => handleRueckgabe(heroAusleihe),
      }}
    >
      {ueberfaellige.length === 1 ? (
        tx`${heroAusleihe.werkzeugName} bei ${heroAusleihe.mitarbeiterName} — Rückgabe überfällig seit ${formatDate(heroAusleihe.fields.rueckgabe_geplant)}.`
      ) : (
        tx`${ueberfaellige.length} Werkzeuge überfällig — zuletzt erwartet von ${namen(ueberfaellige.map(a => a.mitarbeiterName))}.`
      )}
    </HeroBanner>
  ) : undefined;

  return (
    <div className="space-y-6">
      {/* Seitenheader */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{kontextzeile}</p>
        </div>
        <button
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={() => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") })}
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Werkzeug ausgeben')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBanner}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar}
              icon={<IconCheck size={16} />}
              tone="success"
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatStripItem
              title={tx('Verliehen')}
              value={verliehen}
              icon={<IconPackage size={16} />}
              tone="primary"
              onClick={() => setStatusFilter(f => f === 'verliehen' ? null : 'verliehen')}
              active={statusFilter === 'verliehen'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt}
              icon={<IconCircleX size={16} />}
              tone={defekt > 0 ? 'destructive' : 'default'}
              onClick={() => setStatusFilter(f => f === 'defekt' ? null : 'defekt')}
              active={statusFilter === 'defekt'}
            />
            <StatStripItem
              title={tx('In Wartung')}
              value={werkzeuge.filter(w => lookupKey(w.fields.status) === 'in_wartung').length}
              icon={<IconTool size={16} />}
              tone="warning"
              onClick={() => setStatusFilter(f => f === 'in_wartung' ? null : 'in_wartung')}
              active={statusFilter === 'in_wartung'}
            />
            <StatStripItem
              title={tx('Gesamt')}
              value={werkzeuge.length}
              icon={<IconTool size={16} />}
              tone="default"
              onClick={() => setStatusFilter(null)}
              active={statusFilter === null}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={kanbanCards}
            columns={COLUMNS}
            defaultCollapsed={['in_wartung']}
            onCardClick={card => {
              const wId = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === wId);
              if (w) crud.werkzeuge.openDetail(w);
            }}
            onCardMove={handleCardMove}
            onAddCard={column =>
              crud.werkzeuge.openCreate({ status: column })
            }
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute fällig & überfällig')}
              items={[...ueberfaellige, ...heuteFaellig].map(a => ({
                id: a.record_id,
                title: a.werkzeugName || appLabel('werkzeuge'),
                secondLine: (
                  <>
                    <span className={ueberfaellige.some(u => u.record_id === a.record_id) ? 'font-medium text-destructive' : 'font-medium text-amber-600'}>
                      {ueberfaellige.some(u => u.record_id === a.record_id)
                        ? tx('Überfällig')
                        : tx('Heute fällig')}
                    </span>
                    <span className="text-muted-foreground">
                      {' · '}{a.mitarbeiterName || '—'}
                      {a.fields.rueckgabe_geplant
                        ? ` · ${formatDate(a.fields.rueckgabe_geplant)}`
                        : ''}
                    </span>
                  </>
                ),
                action: {
                  label: tx('Zurücknehmen'),
                  onClick: () => handleRueckgabe(a),
                },
              }))}
              onItemClick={id => {
                const a = ausleihen.find(x => x.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Keine Rückgaben heute fällig — alles im Plan.'),
                action: {
                  label: tx('Ausleihe erfassen'),
                  onClick: () => crud.ausleihen.openCreate({ ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm") }),
                },
              }}
              max={6}
            />
            <WorkList
              title={tx('Offene Schäden')}
              items={offeneSchaeden.map(s => ({
                id: s.record_id,
                title: s.werkzeugName || appLabel('werkzeuge'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tx('Schaden')}</span>
                    <span className="text-muted-foreground">
                      {' · '}{s.fields.beschreibung?.split('\n')[0]?.slice(0, 40) ?? ''}
                      {s.fields.gemeldet_am ? ` · ${formatDate(s.fields.gemeldet_am)}` : ''}
                    </span>
                  </>
                ),
                action: {
                  label: tx('Wartung erstellen'),
                  onClick: () => {
                    const wId = s.fields.werkzeug?.match(/([a-f0-9]{24})$/i)?.[1];
                    crud.wartungen.openCreate(wId ? { werkzeug: wId, datum: today } : { datum: today });
                  },
                },
              }))}
              onItemClick={id => {
                const s = schaeden.find(x => x.record_id === id);
                if (s) crud.schaeden.openDetail(s);
              }}
              empty={{
                text: tx('Keine offenen Schäden gemeldet.'),
                action: {
                  label: tx('Schaden melden'),
                  onClick: () => crud.schaeden.openCreate({ gemeldet_am: today }),
                },
              }}
              max={5}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
