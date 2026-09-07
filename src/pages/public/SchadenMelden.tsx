import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Textarea } from '@/components/ui/textarea';
import { useStepForm, useJourneySubmit, todayIso } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { tx } from '@/i18n';
import { IconAlertTriangle, IconTool } from '@tabler/icons-react';

const SLUG = 'schaden-melden';

export default function SchadenMelden() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [werkzeuge, setWerkzeuge] = useState<PublicRecordResult[]>([]);
  const [werkzeugLoading, setWerkzeugLoading] = useState(false);
  const [step, setStep] = useState(1);

  // ALL hooks before any early return
  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const schadensForm = useStepForm('schaeden', {
    fields: ['werkzeug', 'beschreibung', 'gemeldet_am'],
    required: { werkzeug: true, beschreibung: false },
    steps: { werkzeug: 1, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    // port may be null before config loads — cast is safe because we never call submit before port is ready
    port as NonNullable<typeof port>,
    [{ key: 'schaden', entity: 'schaeden', form: schadensForm, primary: true }],
    { draftKey: 'schaden-melden' },
  );

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find(e => e.op === 'list');
    if (!ep) return;
    setWerkzeugLoading(true);
    listPublicRecords(cfg, page, { appId: ep.app_id, limit: 500 })
      .then(map => setWerkzeuge(Object.values(map)))
      .catch(() => setWerkzeuge([]))
      .finally(() => setWerkzeugLoading(false));
  }, [cfg, page]);

  const werkzeugItems: SelectItem[] = useMemo(() =>
    werkzeuge.map(w => ({
      id: w.id,
      title: (w.fields.bezeichnung as string) ?? w.id,
      subtitle: (w.fields.inventarnummer as string) ?? undefined,
      status: w.fields.status
        ? { key: w.fields.status as string, label: w.fields.status as string }
        : undefined,
    })),
    [werkzeuge],
  );

  const handleWerkzeugSelect = (id: string) => {
    if (!cfg || !page) return;
    const record = werkzeuge.find(w => w.id === id);
    if (!record) return;
    schadensForm.set('werkzeug', id, (record.fields.bezeichnung as string) ?? id);
    const createEp = page.endpoints?.find(e => e.op === 'create');
    if (createEp) {
      prepareChallenge(cfg, page, 'POST', `/apps/${createEp.app_id}/records`);
    }
  };

  const restart = () => {
    setStep(1);
    submit.reset?.();
  };

  if (loading) {
    return <PublicShell loading />;
  }
  if (!cfg || !page || !port) {
    return <PublicShell unavailable />;
  }

  if (submit.result) {
    return (
      <PublicShell title={tx('Schaden gemeldet')}>
        <SuccessStep
          result={submit.result}
          forms={[schadensForm]}
          whatHappensNext={tx('Das Team sieht die Meldung im Dashboard und kümmert sich darum.')}
          next={[{ label: tx('Weiteren Schaden melden'), onClick: restart }]}
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Schaden an einem Werkzeug anonym melden — keine Anmeldung erforderlich.')}
    >
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        forms={[schadensForm]}
        draftKey="schaden-melden"
        back={false}
      >
        <WizardStep
          label={tx('Werkzeug wählen')}
          heading={tx('Werkzeug auswählen')}
          description={tx('Welches Werkzeug hat einen Schaden?')}
        >
          <Field form={schadensForm} name="werkzeug" label={tx('Werkzeug')}>
            <EntitySelectStep
              id={schadensForm.fieldId('werkzeug')}
              invalid={schadensForm.error('werkzeug') != null}
              items={werkzeugItems}
              selectedId={schadensForm.get('werkzeug') as string | null}
              onSelect={handleWerkzeugSelect}
              avatar="none"
              searchPlaceholder={tx('Werkzeug suchen ...')}
              loading={werkzeugLoading}
              emptyText={tx('Keine Werkzeuge verfügbar.')}
              create={false}
              emptyIcon={<IconTool size={32} />}
            />
          </Field>
          <StepNav
            onNext={() => schadensForm.validate(['werkzeug'])}
            nextStepLabel={tx('Beschreibung')}
          />
        </WizardStep>

        <WizardStep
          label={tx('Beschreibung')}
          heading={tx('Schaden beschreiben')}
          description={tx('Beschreibe den Schaden so genau wie möglich.')}
        >
          <div className="space-y-4">
            <Field
              form={schadensForm}
              name="beschreibung"
              hint={tx('Art und Ausmaß des Schadens. Falls du ein Foto hast, schreibe es in die Beschreibung.')}
            >
              <Textarea
                {...schadensForm.field('beschreibung')}
                rows={5}
                placeholder={tx('z. B. Gehäuse gebrochen, Kabel beschädigt, nicht mehr funktionsfähig ...')}
              />
            </Field>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm text-amber-800">
              <IconAlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
              <p>{tx('Kein Foto-Upload möglich: Erwähne in der Beschreibung, dass du ein Foto per E-Mail senden möchtest — das Team meldet sich dann.')}</p>
            </div>
          </div>
          <StepNav
            onNext={() => schadensForm.validate([])}
            nextStepLabel={tx('Prüfen & Absenden')}
          />
        </WizardStep>

        <WizardStep label={tx('Prüfen & Absenden')}>
          <SummaryStep
            forms={[schadensForm]}
            submit={submit}
            whatHappensNext={tx('Das Team sieht die Meldung sofort im Dashboard und kümmert sich darum.')}
            confirmLabel={tx('Schaden melden')}
          />
        </WizardStep>
      </IntentWizardShell>
    </PublicShell>
  );
}
