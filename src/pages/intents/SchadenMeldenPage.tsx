/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (createSchaedenEntry); updates: werkzeuge (status → in_wartung).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, todayIso } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { useState } from 'react';

export default function SchadenMeldenPage() {
  const [step, setStep] = useState(1);

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? w.id,
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  const schaden = useStepForm('schaeden', {
    steps: { werkzeug: 1, beschreibung: 2, gemeldet_am: 2 },
    initial: { gemeldet_am: todayIso() },
  });

  const werkzeugId = schaden.get('werkzeug') as string | undefined;

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'schaden',
      entity: 'schaeden',
      form: schaden,
      primary: true,
    },
    {
      key: 'status_update',
      entity: 'werkzeuge',
      updates: werkzeugId,
      needs: ['schaden'],
      values: { status: 'in_wartung' },
    },
  ], { draftKey: 'schaden-melden-intern' });

  const restart = () => { submit.reset(); schaden.reset(); setStep(1); };

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[schaden]}
      draftKey="schaden-melden-intern"
      intro={{
        description: tx('Ein beschädigtes Werkzeug intern melden — es wird automatisch auf „In Wartung" gesetzt.'),
        needs: [tx('Werkzeug kennen'), tx('Schaden kurz beschreiben')],
      }}
    >
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Das beschädigte Werkzeug auswählen.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={werkzeugId}
          onSelect={id => {
            schaden.set('werkzeug', id, werkzeuge.labelOf(id));
            setStep(2);
          }}
        />
      </WizardStep>

      <WizardStep
        label={tx('Schaden')}
        description={tx('Schaden beschreiben und optional ein Foto hochladen.')}
        needs={['werkzeug']}
      >
        <div className="space-y-4">
          <Bound form={schaden} name="gemeldet_am" />
          <Bound form={schaden} name="beschreibung" rows={4} />
          <StepNav
            onNext={() => schaden.validate(['beschreibung', 'gemeldet_am'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schaden]}
            submit={submit}
            whatHappensNext={tx('Das Werkzeug wird sofort auf „In Wartung" gesetzt.')}
            confirmLabel={tx('Schaden melden')}
          />
        )}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[schaden]}
            title={tx('Schaden wurde gemeldet. Das Werkzeug ist jetzt in Wartung.')}
            next={[
              { label: tx('Noch einmal melden'), onClick: restart },
              { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
              { label: tx('Zum Dashboard'), href: '#/' },
            ]}
            actions={{ copy: false, print: false }}
          />
        )}
      </WizardStep>
    </IntentWizardShell>
  );
}
