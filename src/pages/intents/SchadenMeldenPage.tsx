/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (create), werkzeuge (update status → 'defekt').
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
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

  // Form for Schaden fields
  const schaden = useStepForm('schaeden', {
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
  });

  const werkzeugId = schaden.get('werkzeug') as string | undefined;
  const werkzeugName = schaden.labels[werkzeugId ?? ''] ?? werkzeuge.labelOf(werkzeugId ?? '') ?? '';
  const werkzeugRecord = werkzeugId ? werkzeuge.recordOf(werkzeugId) : undefined;
  const inventarnummer = werkzeugRecord ? fieldText(werkzeugRecord, 'inventarnummer') : '';

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'schaden',
      entity: 'schaeden',
      form: schaden,
      primary: true,
    },
    {
      key: 'werkzeug_defekt',
      entity: 'werkzeuge',
      needs: ['schaden'],
      updates: werkzeugId ?? '',
      values: { status: 'defekt' },
      verb: 'update',
    },
  ], { draftKey: 'schaden-melden-intern' });

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      subtitle={tx('Werkzeug als beschädigt melden und Status auf „Defekt" setzen.')}
      currentStep={step}
      onStepChange={setStep}
      forms={[schaden]}
      draftKey="schaden-melden-intern"
      intro={{
        description: tx('Ein beschädigtes Werkzeug erfassen und automatisch als defekt markieren.'),
        needs: [tx('Werkzeug (Bezeichnung oder Inventarnummer)'), tx('Beschreibung des Schadens')],
      }}
    >
      {/* Schritt 1 — Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Das beschädigte Werkzeug suchen und auswählen.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          avatar="none"
          selectedId={werkzeugId ?? null}
          searchPlaceholder={tx('Nach Bezeichnung oder Inventarnummer suchen …')}
          onSelect={id => {
            schaden.set('werkzeug', id, werkzeuge.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Kein Werkzeug gefunden. Bitte Suchbegriff anpassen.')}
        />
      </WizardStep>

      {/* Schritt 2 — Schaden beschreiben */}
      <WizardStep
        label={tx('Schaden')}
        description={tx('Datum, Schadensbeschreibung und optional ein Foto angeben.')}
        needs={['werkzeug']}
      >
        {schaden.get('werkzeug') ? (
          <div className="space-y-4">
            {werkzeugRecord && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary text-sm">
                <span className="font-medium">{werkzeugName}</span>
                {inventarnummer && (
                  <span className="text-muted-foreground">· {inventarnummer}</span>
                )}
                <StatusBadge
                  statusKey={fieldLookup(werkzeugRecord, 'status')?.key}
                  label={fieldLookup(werkzeugRecord, 'status')?.label}
                />
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
            {tx('Bitte zuerst ein Werkzeug auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3 — Zusammenfassung */}
      <WizardStep label={tx('Prüfen')} needs={['werkzeug', 'gemeldet_am']}>
        {schaden.get('werkzeug') && schaden.get('gemeldet_am') ? (
          !submit.done && (
            <SummaryStep
              forms={[schaden]}
              submit={submit}
              items={[
                {
                  key: '_inventarnummer',
                  label: tx('Inventarnummer'),
                  value: inventarnummer || '—',
                },
              ]}
              whatHappensNext={tx('Der Schaden wird angelegt und das Werkzeug automatisch auf „Defekt" gesetzt.')}
            />
          )
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst Werkzeug und Schadendatum angeben.')}
          </StepNav>
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schaden]}
          whatHappensNext={tx('Das Werkzeug ist jetzt als defekt markiert und muss vor der nächsten Ausgabe repariert werden.')}
          next={[
            { label: tx('Weiteren Schaden melden'), onClick: () => { submit.reset(); schaden.reset(); setStep(1); } },
            { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
