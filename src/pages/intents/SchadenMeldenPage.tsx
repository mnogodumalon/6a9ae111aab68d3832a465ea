/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (createSchaedenEntry), werkzeuge (updateWerkzeugeEntry → status: defekt).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { tx } from '@/i18n';

export default function SchadenMeldenPage() {
  const [step, setStep] = useState(1);

  // werkzeuge werden über useRecordSearch gesucht — nicht über useDashboardData
  const data = useDashboardData({ omit: ['werkzeuge'] });

  // Alle Werkzeuge sind wählbar (auch verliehene und defekte)
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? w.id,
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  // Formular für Schaden-Felder (Schritt 2)
  const schadenForm = useStepForm('schaeden', {
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
  });

  // Hilfs-Form für das Werkzeug (damit die Zusammenfassung den Namen anzeigt)
  const werkzeugForm = useStepForm('werkzeuge', {
    steps: { _werkzeugLabel: 1 },
  });

  // Plan: 1) Schaeden-Datensatz anlegen, 2) Werkzeug auf 'defekt' setzen
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'schaden',
        entity: 'schaeden',
        form: schadenForm,
        primary: true,
        values: {
          werkzeug: schadenForm.get('werkzeug') as string,
        },
      },
      {
        key: 'werkzeugDefekt',
        needs: ['schaden'],
        run: async () => {
          const werkzeugId = schadenForm.get('werkzeug') as string;
          return LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'defekt' });
        },
      },
    ],
    { draftKey: 'schaden-melden' },
  );

  const restart = () => {
    submit.reset();
    schadenForm.reset();
    werkzeugForm.reset();
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[schadenForm, werkzeugForm]}
      draftKey="schaden-melden"
      intro={{
        description: tx('Einen Schaden an einem Werkzeug erfassen und das Werkzeug als defekt markieren.'),
        needs: [tx('Werkzeugname oder Inventarnummer'), tx('Schadensbeschreibung')],
      }}
    >
      {/* Schritt 1: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Wählen Sie das beschädigte Werkzeug aus — auch verliehene oder bereits defekte Werkzeuge können erneut gemeldet werden.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={schadenForm.get('werkzeug') as string | undefined}
          onSelect={id => {
            schadenForm.set('werkzeug', id, werkzeuge.labelOf(id));
            werkzeugForm.set('_werkzeugLabel', werkzeuge.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Werkzeug suchen …')}
          create={false}
          emptyText={tx('Kein Werkzeug gefunden. Bitte Suche anpassen.')}
        />
        <StepNav
          hideBack
          onNext={() => schadenForm.validate(['werkzeug'])}
          nextStepLabel={tx('Schaden beschreiben')}
          nextDisabled={!schadenForm.get('werkzeug')}
        />
      </WizardStep>

      {/* Schritt 2: Schaden beschreiben */}
      <WizardStep
        label={tx('Schaden')}
        description={tx('Meldedatum und Beschreibung des Schadens erfassen.')}
      >
        {schadenForm.get('werkzeug') ? (
          <div className="space-y-4">
            <Bound form={schadenForm} name="gemeldet_am" />
            <Bound form={schadenForm} name="beschreibung" rows={4} />
            <StepNav
              onNext={() => schadenForm.validate(['gemeldet_am', 'beschreibung'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => {}} nextDisabled>
            {tx('Bitte zuerst ein Werkzeug in Schritt 1 auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Prüfen & Anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schadenForm]}
            submit={submit}
            whatHappensNext={tx('Der Schaden wird angelegt und das Werkzeug automatisch als defekt markiert.')}
            confirmLabel={tx('Schaden melden')}
            items={[
              {
                key: '_werkzeugName',
                label: tx('Werkzeug'),
                value: werkzeuge.labelOf(schadenForm.get('werkzeug') as string) || (schadenForm.get('werkzeug') as string),
                step: 1,
                keys: ['werkzeug'],
                fieldId: 'werkzeug',
              },
            ]}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schadenForm]}
          whatHappensNext={tx('Das Werkzeug wurde als defekt markiert. Planen Sie bei Bedarf eine Wartung oder Reparatur.')}
          next={[
            { label: tx('Weiteren Schaden melden'), onClick: restart },
            {
              label: tx('Wartung planen'),
              href: '#/intents/wartung-planen',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
