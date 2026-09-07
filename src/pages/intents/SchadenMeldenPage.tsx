/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (createSchaedenEntry), werkzeuge (updateWerkzeugeEntry, Status → defekt).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useRecordSearch,
  useStepForm,
  useJourneySubmit,
  fieldText,
  fieldLookup,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { LivingAppsService } from '@/services/livingAppsService';

export default function SchadenMeldenPage() {
  const [step, setStep] = useState(1);

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung'),
      subtitle: fieldText(w, 'inventarnummer'),
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  // schaeden.werkzeug is an applookup — stored as plain id via f.set, the port converts it.
  // werkzeug is Schritt 1 (for the answer chip and needs-gate); gemeldet_am/beschreibung are Schritt 2.
  const schadensForm = useStepForm('schaeden', {
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'schaden',
        entity: 'schaeden',
        form: schadensForm,
        primary: true,
      },
      {
        // run is the escape hatch for a side-effect update that is not a plain create/update of the form.
        key: 'statusUpdate',
        run: async () => {
          const werkzeugId = schadensForm.get('werkzeug') as string;
          if (werkzeugId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'defekt' });
          }
        },
      },
    ],
    { draftKey: 'schaden-melden-intern' },
  );

  const selectedWerkzeugId = schadensForm.get('werkzeug') as string | undefined;
  const selectedRecord = selectedWerkzeugId ? werkzeuge.recordOf(selectedWerkzeugId) : null;
  const selectedStatus = selectedRecord ? fieldLookup(selectedRecord, 'status') : null;

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[schadensForm]}
      draftKey="schaden-melden-intern"
      intro={{
        description: tx('Schaden an einem Werkzeug erfassen und das Werkzeug als defekt markieren.'),
        needs: [tx('Werkzeugbezeichnung oder Inventarnummer'), tx('Schadensbeschreibung')],
      }}
    >
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Werkzeug auswählen, an dem der Schaden aufgetreten ist.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={selectedWerkzeugId}
          onSelect={(id) => {
            schadensForm.set('werkzeug', id, werkzeuge.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Kein Werkzeug gefunden. Bitte Suche anpassen.')}
        />
        {selectedStatus && (
          <div className="mt-3 px-1">
            <StatusBadge statusKey={selectedStatus.key} label={selectedStatus.label} />
          </div>
        )}
      </WizardStep>

      <WizardStep
        label={tx('Schaden beschreiben')}
        description={tx('Meldedatum und Schadensbeschreibung eintragen.')}
        needs={['werkzeug']}
      >
        <div className="space-y-4">
          <Bound form={schadensForm} name="gemeldet_am" />
          <Bound form={schadensForm} name="beschreibung" rows={4} />
          <StepNav
            onNext={() => schadensForm.validate(['gemeldet_am', 'beschreibung'])}
            nextStepLabel={tx('Prüfen & Absenden')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schadensForm]}
            submit={submit}
            whatHappensNext={tx(
              'Der Schaden wird angelegt und das Werkzeug automatisch als defekt markiert.',
            )}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schadensForm]}
          submit={submit}
          whatHappensNext={tx(
            'Das Werkzeug ist nun als defekt markiert. Für eine Reparatur den Wartungsauftrag anlegen.',
          )}
          next={[
            {
              label: tx('Weiteren Schaden melden'),
            },
            {
              label: tx('Werkzeug ausgeben'),
              href: '#/intents/werkzeug-ausgeben',
            },
            {
              label: tx('Zum Dashboard'),
              href: '#/',
            },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
