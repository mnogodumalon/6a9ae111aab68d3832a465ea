import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { tx } from '@/i18n';
import { format } from 'date-fns';

const SLUG = 'werkzeug-anfrage';

export default function WerkzeugAnfrage() {
  const STEPS = [
  { label: tx('Werkzeug'), key: 'werkzeug', description: tx('Wähle ein verfügbares Werkzeug aus.') },
  { label: tx('Datum'), key: 'datum', description: tx('Wann möchtest du das Werkzeug abholen?') },
  { label: tx('Prüfen'), key: 'pruefen' },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    }).catch(e => {
      if (e instanceof PageUnavailableError) {
        setLoading(false);
      }
    });
  }, []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  const f = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 2, rueckgabe_geplant: 2 },
    initial: { ausgabe: `${todayIso()}T08:00` },
    autoComplete: true,
  });

  // Load active Ausleihen to filter werkzeuge that are already booked on the chosen day
  const ausleihenSearch = useRecordSearch(port!, 'ausleihen', {
    searchFields: [],
    where: r => !r.fields.rueckgabe_erfolgt,
  });

  const werkzeugSearch = useRecordSearch(port!, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: r => ({
      id: r.id,
      title: (r.fields.bezeichnung as string) ?? '',
      subtitle: (r.fields.inventarnummer as string) ?? undefined,
      stats: r.fields.kategorien
        ? undefined
        : undefined,
    }),
    where: r => (r.fields.status as string) === 'verfuegbar',
  });

  const submit = useJourneySubmit(
    port!,
    [{ key: 'anfrage', entity: 'ausleihen', form: f, primary: true }],
    { draftKey: 'werkzeug-anfrage' },
  );

  const restart = () => {
    f.reset({ ausgabe: `${todayIso()}T08:00` });
    submit.reset();
    setStep(1);
  };

  // Derive the chosen ausgabe date (YYYY-MM-DD) for belegung check
  const ausgabeDateStr = useMemo(() => {
    const v = f.get('ausgabe') as string | undefined;
    if (!v) return null;
    return v.slice(0, 10);
  }, [f]);

  // werkzeuge IDs that are already booked on the chosen day
  const bookedWerkzeugIds = useMemo(() => {
    if (!ausgabeDateStr) return new Set<string>();
    const booked = new Set<string>();
    for (const r of ausleihenSearch.records) {
      const ausgabe = String(r.fields.ausgabe ?? '').slice(0, 10);
      const rueckgabe = r.fields.rueckgabe_geplant
        ? String(r.fields.rueckgabe_geplant).slice(0, 10)
        : ausgabe;
      if (ausgabeDateStr >= ausgabe && ausgabeDateStr <= rueckgabe) {
        const werkzeugRef = String(r.fields.werkzeug ?? '');
        if (werkzeugRef) {
          const id = werkzeugRef.split('/').pop();
          if (id) booked.add(id);
        }
      }
    }
    return booked;
  }, [ausleihenSearch.records, ausgabeDateStr]);

  // Available items: werkzeuge with status=verfuegbar AND not booked on that day
  const verfuegbareItems = useMemo(() => {
    return werkzeugSearch.select.items.filter(item => !bookedWerkzeugIds.has(item.id));
  }, [werkzeugSearch.select.items, bookedWerkzeugIds]);

  // Sync rueckgabe_geplant whenever ausgabe changes (eintägige Ausleihe)
  useEffect(() => {
    const v = f.get('ausgabe') as string | undefined;
    const day = v ? v.slice(0, 10) : null;
    const current = f.get('rueckgabe_geplant') as string | undefined;
    if (day !== (current ?? null)) {
      f.set('rueckgabe_geplant', day);
    }
  });

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  const createEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'ausleihen');

  const handleWerkzeugSelect = (id: string) => {
    f.set('werkzeug', id, werkzeugSearch.labelOf(id));
    if (createEp) {
      prepareChallenge(cfg, page, 'POST', `/apps/${createEp.app_id}/records`);
    }
  };

  const selectedWerkzeugId = f.get('werkzeug') as string | undefined;
  const selectedWerkzeug = selectedWerkzeugId
    ? werkzeugSearch.select.items.find(i => i.id === selectedWerkzeugId)
    : null;

  return (
    <PublicShell
      title={tx('Werkzeug anfragen')}
      description={tx('Externe Vereine können ein verfügbares Werkzeug für einen Tag anfragen. Das Team bestätigt die Anfrage.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[f]}
        draftKey="werkzeug-anfrage"
      >
        {step === 1 && (
          <>
            <EntitySelectStep
              {...werkzeugSearch.select}
              items={verfuegbareItems}
              totalCount={verfuegbareItems.length}
              avatar="none"
              selectedId={selectedWerkzeugId ?? null}
              onSelect={handleWerkzeugSelect}
              searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
              emptyText={
                ausgabeDateStr
                  ? tx('Für diesen Tag sind keine Werkzeuge verfügbar.')
                  : tx('Keine verfügbaren Werkzeuge vorhanden.')
              }
            />
            <StepNav
              onNext={() => f.validate(['werkzeug'])}
              nextStepLabel={tx('Datum')}
            />
          </>
        )}

        {step === 2 && (
          <>
            {selectedWerkzeug && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedWerkzeug.title}</span>
                {selectedWerkzeug.subtitle && (
                  <span className="ml-2">{tx('Inv.-Nr.')} {selectedWerkzeug.subtitle}</span>
                )}
              </div>
            )}
            <Bound
              form={f}
              name="ausgabe"
              hint={tx('Wunschtermin für die Abholung (Datum und Uhrzeit).')}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              {tx('Die Rückgabe ist für denselben Tag geplant (eintägige Ausleihe).')}
            </p>
            <StepNav
              onNext={() => {
                const ok = f.validate(['ausgabe']);
                if (!ok) return false;
                // Validate: date must be in the future
                const v = f.get('ausgabe') as string | undefined;
                if (v) {
                  const today = format(new Date(), 'yyyy-MM-dd');
                  if (v.slice(0, 10) < today) {
                    return tx('Das Ausgabedatum muss in der Zukunft liegen.') as string;
                  }
                }
                // Validate: werkzeug not booked on that day
                const dateStr = v ? v.slice(0, 10) : null;
                if (dateStr && selectedWerkzeugId && bookedWerkzeugIds.has(selectedWerkzeugId)) {
                  return tx('Das Werkzeug ist an diesem Tag bereits vergeben.') as string;
                }
                return true;
              }}
              nextStepLabel={tx('Prüfen')}
            />
          </>
        )}

        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Das Team des Bauhofs prüft die Anfrage und trägt den Mitarbeiter ein. Du wirst bei Rückfragen kontaktiert.')}
          />
        )}

        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[f]}
            next={[{ label: tx('Weitere Anfrage stellen'), onClick: restart }]}
            whatHappensNext={tx('Das Team des Bauhofs prüft deine Anfrage und meldet sich bei Bedarf.')}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
