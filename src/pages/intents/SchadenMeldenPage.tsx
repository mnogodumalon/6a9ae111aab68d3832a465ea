/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (createSchaedenEntry), updates werkzeuge status → 'in_wartung'.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep, StatusBadge.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, todayIso } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { LivingAppsService } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function SchadenMeldenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Werkzeugauswahl — kein Filter, alle Werkzeuge sind meldbar
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? w.id,
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  // Schritt 2: Schadensbeschreibung — gemeldet_am + beschreibung
  const schaden = useStepForm('schaeden', {
    fields: ['gemeldet_am', 'beschreibung'],
    initial: { gemeldet_am: todayIso() },
  });

  // Gewähltes Werkzeug: ID und Anzeigename werden als interne Werte im Formular gespeichert
  const werkzeugId = schaden.get('_werkzeugId') as string | undefined;
  const werkzeugName = schaden.get('_werkzeugLabel') as string | undefined;

  // Plan: Schaden anlegen + Werkzeug-Status auf 'in_wartung' setzen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'schaden',
      entity: 'schaeden',
      form: schaden,
      primary: true,
      values: { werkzeug: werkzeugId ?? '' },
    },
    {
      key: 'status_update',
      run: async () => {
        if (werkzeugId) {
          await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'in_wartung' });
        }
      },
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
        description: tx('Ein beschädigtes Werkzeug melden und sofort zur Wartung sperren.'),
        needs: [tx('Werkzeug'), tx('Schadensbeschreibung')],
      }}
    >
      {/* Schritt 1: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Welches Werkzeug ist beschädigt? Auch verliehene oder defekte Werkzeuge können gemeldet werden.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={werkzeugId}
          onSelect={id => {
            const rec = werkzeuge.recordOf(id);
            const label = werkzeuge.labelOf(id);
            schaden.set('_werkzeugId', id, label);
            schaden.set('_werkzeugLabel', label);
            const statusVal = rec ? fieldLookup(rec, 'status') : null;
            if (statusVal) {
              schaden.set('_werkzeugStatus', statusVal.key, statusVal.label);
            }
            setStep(2);
          }}
          searchPlaceholder={tx('Bezeichnung oder Inventarnummer suchen …')}
          emptyText={tx('Kein Werkzeug gefunden. Bitte Suchbegriff anpassen.')}
        />
      </WizardStep>

      {/* Schritt 2: Schaden beschreiben */}
      <WizardStep
        label={tx('Schaden')}
        description={tx('Schadensdatum und eine kurze Beschreibung des Schadens eingeben.')}
        needs={['_werkzeugId']}
      >
        <div className="space-y-4">
          {werkzeugName && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary">
              <span className="text-sm font-medium">{werkzeugName}</span>
              {(() => {
                const statusKey = schaden.get('_werkzeugStatus') as string | undefined;
                const statusLabel = statusKey
                  ? (werkzeuge.recordOf(werkzeugId ?? '')
                      ? fieldLookup(werkzeuge.recordOf(werkzeugId ?? '')!, 'status')?.label
                      : statusKey)
                  : undefined;
                return statusKey ? (
                  <StatusBadge statusKey={statusKey} label={statusLabel ?? statusKey} />
                ) : null;
              })()}
            </div>
          )}
          <Bound form={schaden} name="gemeldet_am" />
          <Bound
            form={schaden}
            name="beschreibung"
            rows={4}
            hint={tx('Ein Foto kann später in der Detailansicht des Schadens hinzugefügt werden.')}
          />
          <StepNav
            onNext={() => schaden.validate(['gemeldet_am'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schaden]}
            submit={submit}
            items={[
              {
                key: '_werkzeug',
                label: tx('Werkzeug'),
                value: werkzeugName ?? '—',
                step: 1,
                keys: ['_werkzeugId', '_werkzeugLabel', '_werkzeugStatus'],
                fieldId: 'field-_werkzeugId',
              },
            ]}
            whatHappensNext={tx('Der Schaden wird angelegt und das Werkzeug sofort auf „In Wartung" gesetzt.')}
            confirmLabel={tx('Schaden melden')}
          />
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          forms={[schaden]}
          restartLabel={tx('Weiteren Schaden melden')}
          whatHappensNext={
            werkzeugName
              ? tx`${werkzeugName} — Schaden wurde gemeldet. Werkzeug ist jetzt in Wartung.`
              : tx('Schaden wurde gemeldet. Werkzeug ist jetzt in Wartung.')
          }
          actions={{ copy: false, print: false }}
          next={[
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
