/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (create), werkzeuge (update status → 'defekt').
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useRecordSearch, useStepForm, useJourneySubmit, fieldText, fieldLookup, todayIso } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

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

  const schaden = useStepForm('schaeden', {
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    messages: { gemeldet_am: tx('Bitte das Meldedatum wählen.') },
  });

  const pickedWerkzeugId = schaden.get('werkzeug') as string | null;
  const pickedWerkzeug = pickedWerkzeugId ? werkzeuge.recordOf(pickedWerkzeugId) : undefined;
  const pickedStatus = pickedWerkzeug ? fieldLookup(pickedWerkzeug, 'status') : null;

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'schaden',
      entity: 'schaeden',
      form: schaden,
      primary: true,
    },
    {
      key: 'werkzeugDefekt',
      entity: 'werkzeuge',
      needs: ['schaden'],
      updates: pickedWerkzeugId ?? '',
      values: { status: 'defekt' },
      verb: 'update',
    },
  ], { draftKey: 'schaden-melden-intern' });

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[schaden]}
      draftKey="schaden-melden-intern"
      intro={{
        description: tx('Einen Schaden an einem Werkzeug erfassen und es als defekt markieren.'),
        needs: [tx('Inventarnummer oder Bezeichnung des Werkzeugs'), tx('Datum der Schadensfeststellung')],
      }}
    >
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Wähle das beschädigte Werkzeug aus — auch verliehene Werkzeuge können gemeldet werden.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          avatar="none"
          selectedId={pickedWerkzeugId}
          searchPlaceholder={tx('Bezeichnung oder Inventarnummer suchen …')}
          onSelect={id => {
            schaden.set('werkzeug', id, werkzeuge.labelOf(id));
            setStep(2);
          }}
          create={false}
          emptyText={tx('Kein Werkzeug gefunden. Bitte Suchbegriff anpassen.')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Schaden')}
        description={tx('Meldedatum, Beschreibung und optional ein Foto des Schadens angeben.')}
        needs={['werkzeug']}
      >
        {pickedWerkzeugId ? (
          <div className="space-y-4">
            {pickedStatus && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{tx('Aktueller Status:')}</span>
                <StatusBadge statusKey={pickedStatus.key} label={pickedStatus.label} />
              </div>
            )}
            <Bound form={schaden} name="gemeldet_am" />
            <Bound form={schaden} name="beschreibung" rows={4} />
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => schaden.validate(['gemeldet_am', 'beschreibung'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst ein Werkzeug in Schritt 1 auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schaden]}
            submit={submit}
            whatHappensNext={tx('Der Schaden wird angelegt und das Werkzeug als defekt markiert.')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schaden]}
          submit={submit}
          restartLabel={tx('Weiteren Schaden melden')}
          whatHappensNext={tx('Das Werkzeug ist jetzt als defekt markiert. Für eine Reparatur eine Wartung erfassen.')}
          next={[
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
