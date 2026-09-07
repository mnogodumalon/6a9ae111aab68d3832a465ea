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
import { Field } from '@/components/blocks/Field';
import { Textarea } from '@/components/ui/textarea';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { tx } from '@/i18n';

const SLUG = 'schaden-melden';

export default function SchadenMelden() {
  const STEPS = [
  { label: tx('Werkzeug'), key: 'werkzeug' },
  { label: tx('Beschreibung'), key: 'beschreibung' },
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

  const f = useStepForm('schaeden', {
    fields: ['werkzeug', 'beschreibung', 'gemeldet_am'],
    required: { werkzeug: true, beschreibung: false, gemeldet_am: true },
    steps: { werkzeug: 1, beschreibung: 2, gemeldet_am: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const werkzeugSearch = useRecordSearch(port!, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: r => ({
      id: r.id,
      title: (r.fields.bezeichnung as string) ?? '',
      subtitle: (r.fields.inventarnummer as string) ?? undefined,
      status: r.fields.status
        ? { key: r.fields.status as string, label: r.fields.status as string }
        : undefined,
    }),
  });

  const submit = useJourneySubmit(
    port!,
    [{ key: 'schaden', entity: 'schaeden', form: f, primary: true }],
    { draftKey: 'schaden-melden' },
  );

  const restart = () => {
    f.reset();
    submit.reset();
    setStep(1);
  };

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  const schadensEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'schaeden');

  return (
    <PublicShell title={tx('Schaden melden')} description={tx('Beschreibe den Schaden an einem Werkzeug. Das Team wird sich darum kümmern.')}>
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[f]}
        draftKey="schaden-melden"
      >
        {step === 1 && (
          <>
            <EntitySelectStep
              {...werkzeugSearch.select}
              selectedId={f.get('werkzeug') as string | undefined}
              onSelect={(id) => {
                f.set('werkzeug', id, werkzeugSearch.labelOf(id));
                if (schadensEp) {
                  prepareChallenge(cfg, page, 'POST', `/apps/${schadensEp.app_id}/records`);
                }
              }}
            />
            <StepNav
              onNext={() => f.validate(['werkzeug'])}
              nextStepLabel={tx('Beschreibung')}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Field form={f} name="beschreibung" hint={tx('Was genau ist beschädigt? Wie ist es passiert?')}>
              <Textarea {...f.field('beschreibung')} rows={4} />
            </Field>
            <StepNav
              onNext={() => f.validate(['beschreibung'])}
              nextStepLabel={tx('Prüfen')}
            />
          </>
        )}

        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Das Team sieht die Meldung sofort und kümmert sich um das Werkzeug.')}
          />
        )}

        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[f]}
            next={[{ label: tx('Weitere Meldung'), onClick: restart }]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
