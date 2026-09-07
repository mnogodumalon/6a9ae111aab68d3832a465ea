import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm, useJourneySubmit, useRecordSearch, todayIso,
  type JourneyRecord,
} from '@/lib/journey';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';

const SLUG = 'schaden-melden';

export default function SchadenMelden() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Werkzeug wählen'),
    description: tx('Welches Werkzeug wurde beschädigt?'),
    needs: ['werkzeug'],
  },
  {
    label: tx('Schaden beschreiben'),
    description: tx('Beschreibe den Schaden so genau wie möglich.'),
  },
  {
    label: tx('Prüfen & Abschicken'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  const f = useStepForm('schaeden', {
    fields: ['werkzeug', 'gemeldet_am', 'beschreibung'],
    required: { werkzeug: true, gemeldet_am: true },
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const werkzeugSearch = useRecordSearch(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    'werkzeuge',
    {
      searchFields: ['bezeichnung', 'inventarnummer'],
      toItem: (r: JourneyRecord) => ({
        id: r.id,
        title: (r.fields.bezeichnung as string) ?? r.id,
        subtitle: r.fields.inventarnummer
          ? tx`Nr. ${r.fields.inventarnummer as string}`
          : undefined,
      }),
    },
  );

  const submit = useJourneySubmit(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    [{ key: 'schaden', entity: 'schaeden', form: f, primary: true }],
    { draftKey: 'schaden-melden' },
  );

  if (loading || (!cfg && !unavailable)) {
    return <PublicShell loading />;
  }
  if (unavailable || !cfg || !page || !port) {
    return <PublicShell unavailable />;
  }

  const handleRestart = () => {
    submit.reset();
    f.reset({ gemeldet_am: todayIso() });
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Externe können hier Schäden an Werkzeugen schnell und einfach melden.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[f]}
        draftKey="schaden-melden"
        intro={{
          description: tx('Melde einen Schaden an einem Werkzeug in drei Schritten. Das Team prüft die Meldung intern.'),
          needs: [
            tx('Bezeichnung oder Inventarnummer des Werkzeugs'),
            tx('Beschreibung des Schadens'),
          ],
          estimatedMinutes: 2,
        }}
      >
        {/* Schritt 1 — Werkzeug wählen */}
        {step === 1 && (
          <>
            <EntitySelectStep
              {...werkzeugSearch.select}
              onSelect={(id) => {
                const label = werkzeugSearch.labelOf(id);
                f.set('werkzeug', id, label);
              }}
              selectedId={(f.get('werkzeug') as string) ?? null}
              avatar="none"
              searchPlaceholder={tx('Bezeichnung oder Inventarnummer suchen …')}
              emptyText={tx('Kein Werkzeug gefunden.')}
              id={f.fieldId('werkzeug')}
              invalid={!!f.error('werkzeug')}
            />
            <StepNav
              onNext={() => f.validate(['werkzeug'])}
              nextStepLabel={tx('Schaden beschreiben')}
              hideBack
            />
          </>
        )}

        {/* Schritt 2 — Schaden beschreiben */}
        {step === 2 && (
          <>
            <div className="space-y-4">
              <Field form={f} name="gemeldet_am">
                <Bound form={f} name="gemeldet_am" />
              </Field>
              <Field form={f} name="beschreibung" hint={tx('Je genauer, desto schneller kann das Team reagieren.')}>
                <Bound form={f} name="beschreibung" rows={5} placeholder={tx('z. B. Gehäuse gebrochen, Kabel beschädigt, ungewöhnliche Geräusche …')} />
              </Field>
            </div>
            <StepNav
              onNext={() => f.validate(['gemeldet_am', 'beschreibung'])}
              nextStepLabel={tx('Prüfen & Abschicken')}
            />
          </>
        )}

        {/* Schritt 3 — Zusammenfassung & Abschicken */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Das Team wird die Meldung intern prüfen und sich bei Rückfragen melden.')}
            confirmLabel={tx('Schaden melden')}
          />
        )}

        {/* Erfolg */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[f]}
            title={tx('Schaden gemeldet')}
            whatHappensNext={tx('Das Team hat deine Meldung erhalten und prüft den Schaden.')}
            referencePrefix="S"
            submit={submit}
            restartLabel={tx('Weiteren Schaden melden')}
            next={[{ label: tx('Weiteren Schaden melden'), onClick: handleRestart }]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
