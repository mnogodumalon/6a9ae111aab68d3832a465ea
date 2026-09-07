import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { LOOKUP_OPTIONS, lookupOption, APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard } from '@/components/widgets/KanbanWidget';
import {
  IconAlertTriangle,
  IconTool,
  IconCheck,
  IconArrowBackUp,
  IconClipboardList,
  IconPlus,
} from '@tabler/icons-react';
import { format } from 'date-fns';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    werkzeuge,
    ausleihen,
    schaeden,
    setWerkzeuge,
    fetchAll,
  } = data;

  const clock = useClock();
  const todayKey = format(clock, 'yyyy-MM-dd');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'ausleihen' && !top.record.fields.rueckgabe_erfolgt) {
        return {
          label: tx('Jetzt zurücknehmen'),
          onClick: () => handleRueckgabe(top.record.record_id, top.record),
        };
      }
      return undefined;
    },
  });

  const enrichedWerkzeuge = crud.enriched.werkzeuge;
  const enrichedAusleihen = crud.enriched.ausleihen;
  const enrichedSchaeden = crud.enriched.schaeden;

  // --- Derived counts ---
  const verfuegbar = werkzeuge.filter(w => lookupKey(w.fields.status) === 'verfuegbar');
  const verliehen = werkzeuge.filter(w => lookupKey(w.fields.status) === 'verliehen');
  const defekt = werkzeuge.filter(w => lookupKey(w.fields.status) === 'defekt');
  const inWartung = werkzeuge.filter(w => lookupKey(w.fields.status) === 'in_wartung');

  // Ausleihen that are currently active (no return yet)
  const aktiveAusleihen = enrichedAusleihen.filter(a => !a.fields.rueckgabe_erfolgt);

  // Überfällig: planned return date is before today and no actual return yet
  const ueberfaelligeAusleihen = aktiveAusleihen.filter(a => {
    if (!a.fields.rueckgabe_geplant) return false;
    return a.fields.rueckgabe_geplant < todayKey;
  });

  // Heute fällig
  const heuteFaellig = aktiveAusleihen.filter(a => {
    return a.fields.rueckgabe_geplant === todayKey;
  });

  // Defekte Werkzeuge ohne offene Wartung
  const defektOhneWartung = defekt.filter(w => {
    const hatOffeneWartung = data.wartungen.some(wt =>
      extractRecordId(wt.fields.werkzeug) === w.record_id && !wt.fields.erledigt
    );
    return !hatOffeneWartung;
  });

  // Offene Schäden (from today or recent)
  const offeneSchaeden = enrichedSchaeden.filter(s => s.fields.gemeldet_am);

  // --- Context line ---
  const contextLine = (() => {
    if (ueberfaelligeAusleihen.length > 0) {
      const namen_ = namen(ueberfaelligeAusleihen.map(a => a.mitarbeiterName || ''));
      return ueberfaelligeAusleihen.length === 1
        ? tx`${namen_} hat ein Werkzeug noch nicht zurückgebracht.`
        : tx`${namen_} haben Werkzeuge noch nicht zurückgebracht.`;
    }
    if (verliehen.length > 0) {
      const n = String(verliehen.length);
      return tx`${n} Werkzeuge sind aktuell verliehen, ${String(verfuegbar.length)} verfügbar.`;
    }
    if (verfuegbar.length > 0) {
      const n = String(verfuegbar.length);
      return tx`Alle ${n} Werkzeuge sind verfügbar und einsatzbereit.`;
    }
    return tx('Lege dein erstes Werkzeug an und starte den Verleih.');
  })();

  // --- Optimistic status change (Kanban drag) ---
  const handleCardMove = async (cardId: string, newColumn: string): Promise<void | string> => {
    const id = cardId.split(':')[1];
    if (!id) return;

    // Can't move a tool to "verfuegbar" if it has an active loan
    if (newColumn === 'verfuegbar') {
      const hatAktiveLeihe = ausleihen.some(a =>
        extractRecordId(a.fields.werkzeug) === id && !a.fields.rueckgabe_erfolgt
      );
      if (hatAktiveLeihe) {
        return tx('Werkzeug ist noch verliehen — erst zurücknehmen.');
      }
    }

    const w = werkzeuge.find(w => w.record_id === id);
    if (!w) return;
    const prevStatus = w.fields.status;
    const newLookup = lookupOption('werkzeuge', 'status', newColumn);

    // Optimistic update
    setWerkzeuge(prev => prev.map(item =>
      item.record_id === id
        ? { ...item, fields: { ...item.fields, status: newLookup } }
        : item
    ));

    try {
      await LivingAppsService.updateWerkzeugeEntry(id, { status: newColumn });
      undoToast(
        tx`Status auf „${newLookup.label}" gesetzt.`,
        async () => {
          setWerkzeuge(prev => prev.map(item =>
            item.record_id === id
              ? { ...item, fields: { ...item.fields, status: prevStatus } }
              : item
          ));
          await LivingAppsService.updateWerkzeugeEntry(id, { status: lookupKey(prevStatus) });
        }
      );
    } catch {
      await fetchAll();
    }
  };

  // --- Return handler ---
  const handleRueckgabe = async (ausleihenId: string, record: typeof enrichedAusleihen[0]) => {
    const jetzt = format(clock, "yyyy-MM-dd'T'HH:mm");
    const werkzeugId = extractRecordId(record.fields.werkzeug);

    // Optimistic: mark loan as returned
    data.setAusleihen(prev => prev.map(a =>
      a.record_id === ausleihenId
        ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: jetzt } }
        : a
    ));

    // Optimistic: set tool status to verfuegbar
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(w =>
        w.record_id === werkzeugId
          ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verfuegbar') } }
          : w
      ));
    }

    try {
      await LivingAppsService.updateAusleihenEntry(ausleihenId, {
        rueckgabe_erfolgt: jetzt,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'verfuegbar' });
      }
      undoToast(
        tx`${record.werkzeugName || tx('Werkzeug')} — zurückgegeben.`,
        async () => {
          data.setAusleihen(prev => prev.map(a =>
            a.record_id === ausleihenId
              ? { ...a, fields: { ...a.fields, rueckgabe_erfolgt: undefined } }
              : a
          ));
          if (werkzeugId) {
            setWerkzeuge(prev => prev.map(w =>
              w.record_id === werkzeugId
                ? { ...w, fields: { ...w.fields, status: lookupOption('werkzeuge', 'status', 'verliehen') } }
                : w
            ));
          }
          await LivingAppsService.updateAusleihenEntry(ausleihenId, { rueckgabe_erfolgt: undefined });
          if (werkzeugId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'verliehen' });
          }
        }
      );
    } catch {
      await fetchAll();
    }
  };

  // --- Kanban columns (inside component body — locale-aware) ---
  const columns = (LOOKUP_OPTIONS['werkzeuge']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'verfuegbar' ? 'success' as const
      : o.key === 'verliehen' ? 'primary' as const
      : o.key === 'defekt' ? 'destructive' as const
      : 'warning' as const,
  }));

  const cards: KanbanCard[] = enrichedWerkzeuge.map(w => ({
    id: `werkzeug:${w.record_id}`,
    column: lookupKey(w.fields.status) ?? 'verfuegbar',
    title: w.fields.bezeichnung ?? tx('Unbenannt'),
    subtitle: w.fields.inventarnummer
      ? tx`Nr. ${w.fields.inventarnummer}`
      : (w.fields.kategorien && w.fields.kategorien.length > 0
        ? w.fields.kategorien.map(k => k.label).join(', ')
        : undefined),
    tone: lookupKey(w.fields.status) === 'defekt' ? 'destructive' as const
      : lookupKey(w.fields.status) === 'in_wartung' ? 'warning' as const
      : undefined,
  }));

  // Hero: defekte Werkzeuge ohne Wartungseintrag
  const heroContent = defektOhneWartung.length > 0 ? (() => {
    const namen_ = namen(defektOhneWartung.map(w => w.fields.bezeichnung || ''));
    return {
      text: defektOhneWartung.length === 1
        ? tx`${namen_} ist defekt — noch keine Wartung geplant.`
        : tx`${namen_} sind defekt — noch keine Wartung geplant.`,
    };
  })() : null;

  // --- Empty state ---
  if (werkzeuge.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{tx('Lege dein erstes Werkzeug an und starte den Verleih.')}</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <IconTool size={48} className="text-muted-foreground" stroke={1.5} />
          <p className="text-center text-muted-foreground max-w-xs">
            {tx('Noch keine Werkzeuge angelegt. Füge dein erstes Gerät hinzu.')}
          </p>
          <button
            onClick={() => crud.werkzeuge.openCreate({ status: 'verfuegbar' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={16} />
            {tx('Erstes Werkzeug anlegen')}
          </button>
        </div>
        {crud.surfaces}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
        <p className="text-muted-foreground mt-1">{contextLine}</p>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroContent && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Wartung anlegen'),
              onClick: () => crud.wartungen.openCreate({
                werkzeug: defektOhneWartung[0]
                  ? createRecordUrl(APP_IDS.WERKZEUGE, defektOhneWartung[0].record_id)
                  : undefined,
              }),
            }}
          >
            {heroContent.text}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} />}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Verliehen')}
              value={verliehen.length}
              icon={<IconClipboardList size={16} />}
              tone={verliehen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt.length}
              icon={<IconAlertTriangle size={16} />}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tx('In Wartung')}
              value={inWartung.length}
              icon={<IconTool size={16} />}
              tone={inWartung.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={columns}
            cards={cards}
            onCardClick={(card) => {
              const id = card.id.split(':')[1];
              const w = werkzeuge.find(w => w.record_id === id);
              if (w) crud.werkzeuge.openDetail(w);
            }}
            onCardMove={handleCardMove}
            onAddCard={(column) => crud.werkzeuge.openCreate({ status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={ueberfaelligeAusleihen.length > 0 ? tx('Überfällige Rückgaben') : tx('Heute fällig')}
              items={[...ueberfaelligeAusleihen, ...heuteFaellig.filter(a =>
                !ueberfaelligeAusleihen.find(u => u.record_id === a.record_id)
              )].map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Unbekannt'),
                secondLine: (
                  <span>
                    <span className={ueberfaelligeAusleihen.find(u => u.record_id === a.record_id)
                      ? 'font-medium text-destructive'
                      : 'font-medium text-amber-600'
                    }>
                      {a.mitarbeiterName || tx('Mitarbeiter')}
                    </span>
                    <span className="text-muted-foreground">
                      {' · '}{a.fields.rueckgabe_geplant
                        ? formatDate(a.fields.rueckgabe_geplant)
                        : tx('kein Datum')}
                    </span>
                  </span>
                ),
                action: {
                  label: tx('Zurücknehmen'),
                  onClick: () => handleRueckgabe(a.record_id, a),
                },
              }))}
              onItemClick={(id) => {
                const a = ausleihen.find(a => a.record_id === id);
                if (a) crud.ausleihen.openDetail(a);
              }}
              empty={{
                text: tx('Keine Rückgaben heute fällig — alles im Zeitplan.'),
                action: {
                  label: tx('Werkzeug ausgeben'),
                  onClick: () => crud.ausleihen.openCreate({
                    ausgabe: format(clock, "yyyy-MM-dd'T'HH:mm"),
                  }),
                },
              }}
            />
            <WorkList
              title={tx('Gemeldete Schäden')}
              items={offeneSchaeden.slice(0, 8).map(s => ({
                id: s.record_id,
                title: s.werkzeugName || tx('Unbekannt'),
                secondLine: (
                  <span>
                    <span className="font-medium text-destructive">
                      {tx('Schaden')}
                    </span>
                    <span className="text-muted-foreground">
                      {' · '}{formatDate(s.fields.gemeldet_am)}
                    </span>
                    {s.fields.beschreibung && (
                      <span className="text-muted-foreground truncate block max-w-[160px]">
                        {s.fields.beschreibung.split('\n')[0]}
                      </span>
                    )}
                  </span>
                ),
                action: {
                  label: tx('Wartung anlegen'),
                  onClick: () => {
                    const werkzeugId = extractRecordId(s.fields.werkzeug);
                    crud.wartungen.openCreate({
                      werkzeug: werkzeugId
                        ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId)
                        : undefined,
                    });
                  },
                },
              }))}
              onItemClick={(id) => {
                const s = schaeden.find(s => s.record_id === id);
                if (s) crud.schaeden.openDetail(s);
              }}
              empty={{
                text: tx('Keine Schäden gemeldet — super!'),
                action: {
                  label: tx('Schaden melden'),
                  onClick: () => crud.schaeden.openCreate({
                    gemeldet_am: todayKey,
                  }),
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
