/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden erfassen → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (CREATE), werkzeuge (UPDATE status=defekt).
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
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
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

  const schaden = useStepForm('schaeden', {
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
  });

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
      updates: (ctx) => ctx.done['schaden']
        ? (schaden.get('werkzeug') as string | undefined) ?? undefined
        : undefined,
      values: { status: 'defekt' },
      needs: ['schaden'],
    },
  ], { draftKey: 'schaden-melden-intern' });

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      subtitle={tx('Werkzeug als defekt kennzeichnen und Schaden dokumentieren')}
      currentStep={step}
      onStepChange={setStep}
      forms={[schaden]}
      draftKey="schaden-melden-intern"
      intro={{
        description: tx('Ein beschädigtes Werkzeug melden und automatisch als defekt markieren.'),
        needs: [tx('Werkzeugname oder Inventarnummer'), tx('Meldedatum und Schadensbeschreibung')],
      }}
    >
      {/* Schritt 1: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug wählen')}
        description={tx('Das beschädigte Werkzeug suchen und auswählen.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          avatar="none"
          selectedId={schaden.get('werkzeug') as string | null}
          searchPlaceholder={tx('Nach Bezeichnung oder Inventarnummer suchen …')}
          onSelect={id => {
            schaden.set('werkzeug', id, werkzeuge.labelOf(id));
            setStep(2);
          }}
          create={false}
          emptyText={tx('Kein Werkzeug gefunden. Bezeichnung oder Inventarnummer prüfen.')}
        />
      </WizardStep>

      {/* Schritt 2: Schaden erfassen */}
      <WizardStep
        label={tx('Schaden')}
        description={tx('Meldedatum und Beschreibung des Schadens erfassen.')}
        needs={['werkzeug']}
      >
        {schaden.get('werkzeug') ? (
          <div className="space-y-5">
            {/* Gewähltes Werkzeug anzeigen */}
            <div className="rounded-xl border bg-secondary px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {werkzeuge.labelOf(schaden.get('werkzeug') as string) ?? tx('Werkzeug')}
                </p>
                {(() => {
                  const rec = werkzeuge.recordOf(schaden.get('werkzeug') as string);
                  const inv = rec ? fieldText(rec, 'inventarnummer') : '';
                  const st = rec ? fieldLookup(rec, 'status') : null;
                  return (
                    <div className="flex items-center gap-2 mt-0.5">
                      {inv && <span className="text-xs text-muted-foreground">{inv}</span>}
                      {st && <StatusBadge statusKey={st.key} label={st.label} />}
                    </div>
                  );
                })()}
              </div>
            </div>

            <Bound form={schaden} name="gemeldet_am" label={tx('Meldedatum')} />
            <Bound form={schaden} name="beschreibung" rows={4} hint={tx('Was ist beschädigt? Wie ist der Schaden entstanden?')} />

            {/* Hinweis: kein Foto-Upload in Flows */}
            <p className="text-xs text-muted-foreground rounded-lg bg-secondary px-3 py-2">
              {tx('Ein Foto kann nach dem Speichern direkt am Datensatz ergänzt werden.')}
            </p>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => schaden.validate(['gemeldet_am'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst ein Werkzeug auswählen.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done ? (
          <SummaryStep
            forms={[schaden]}
            submit={submit}
            whatHappensNext={tx('Der Schaden wird angelegt und das Werkzeug automatisch als defekt markiert.')}
            confirmLabel={tx('Schaden melden')}
          />
        ) : null}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schaden]}
          submit={submit}
          whatHappensNext={tx('Das Werkzeug ist jetzt als defekt markiert. Für Reparaturen eine Wartung anlegen.')}
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
