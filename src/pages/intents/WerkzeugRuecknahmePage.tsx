/**
 * Werkzeug Rücknahme — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Zustand erfassen → 3) Prüfen & abschließen.
 * Reads: ausleihen (filter: rueckgabe_erfolgt is None), werkzeuge & mitarbeiter via ref.
 * Writes: ausleihen update (rueckgabe_erfolgt + zustand_bei_rueckgabe),
 *         werkzeuge update (status → verfuegbar oder in_wartung),
 *         schaeden create (bei beschaedigt oder verloren).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound,
 *           Field, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldRef,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { LivingAppsService } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function WerkzeugRuecknahmePage() {
  const [step, setStep] = useState(1);
  // ID der gewählten Ausleihe — wird in Schritt 1 gesetzt
  const [ausleiheId, setAusleiheId] = useState<string | undefined>(undefined);
  const [ausleiheLabel, setAusleiheLabel] = useState<string | undefined>(undefined);

  // Nur offene Ausleihen (noch nicht zurückgegeben)
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    filter: 'r.v_rueckgabe_erfolgt is None',
    where: r => !r.fields['rueckgabe_erfolgt'],
    searchFields: [],
    toItem: (a, ctx) => ({
      id: a.id,
      title: ctx.ref('werkzeug') ?? tx('Unbekanntes Werkzeug'),
      subtitle: ctx.ref('mitarbeiter') ?? undefined,
    }),
  });

  // Rückgabezeit: jetzt als datetimeminute-String (Format: yyyy-MM-dd'T'HH:mm)
  const nowDt = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  const zustand = useStepForm('ausleihen', {
    steps: {
      zustand_bei_rueckgabe: 2,
      rueckgabe_erfolgt: 2,
    },
    initial: {
      rueckgabe_erfolgt: nowDt,
    },
    required: {
      // Diese Felder werden im Rücknahme-Flow nicht abgefragt
      werkzeug: false,
      mitarbeiter: false,
      ausgabe: false,
      rueckgabe_geplant: false,
    },
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'ruecknahme',
        entity: 'ausleihen',
        form: zustand,
        updates: ausleiheId ?? '',
        primary: true,
        verb: 'update',
      },
      {
        key: 'werkzeug_status',
        entity: 'werkzeuge',
        needs: ['ruecknahme'],
        updates: () => {
          const ausRecord = ausleiheId ? ausleihen.recordOf(ausleiheId) : null;
          return ausRecord ? (fieldRef(ausRecord, 'werkzeug') ?? undefined) : undefined;
        },
        values: () => {
          const zustandKey = zustand.get('zustand_bei_rueckgabe') as string | undefined;
          return {
            status:
              zustandKey === 'beschaedigt' || zustandKey === 'verloren'
                ? 'in_wartung'
                : 'verfuegbar',
          };
        },
      },
      {
        key: 'schaden',
        needs: ['ruecknahme'],
        run: async () => {
          const zustandKey = zustand.get('zustand_bei_rueckgabe') as string | undefined;
          if (zustandKey !== 'beschaedigt' && zustandKey !== 'verloren') return;
          const ausRecord = ausleiheId ? ausleihen.recordOf(ausleiheId) : null;
          const werkzeugId = ausRecord ? fieldRef(ausRecord, 'werkzeug') : null;
          if (!werkzeugId) return;
          await LivingAppsService.createSchaedenEntry({
            werkzeug: werkzeugId,
            gemeldet_am: format(new Date(), 'yyyy-MM-dd'),
            beschreibung: tx('Schaden bei Rückgabe festgestellt'),
          });
        },
      },
    ],
    { draftKey: 'werkzeug-ruecknahme' },
  );

  const zustandKey = zustand.get('zustand_bei_rueckgabe') as string | undefined;
  const inWartung = zustandKey === 'beschaedigt' || zustandKey === 'verloren';

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[zustand]}
      draftKey="werkzeug-ruecknahme"
      intro={{
        description: tx('Ausgeliehenes Werkzeug zurücknehmen und Zustand festhalten.'),
        needs: [tx('Offene Ausleihe'), tx('Zustand des Werkzeugs')],
      }}
    >
      {/* Schritt 1: Offene Ausleihe wählen */}
      <WizardStep
        label={tx('Ausleihe')}
        description={tx('Welche Ausleihe wird jetzt zurückgegeben?')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          selectedId={ausleiheId}
          onSelect={id => {
            setAusleiheId(id);
            setAusleiheLabel(ausleihen.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Keine offenen Ausleihen — alle Werkzeuge sind bereits zurückgegeben.')}
          searchPlaceholder={tx('Werkzeugname …')}
          create={false}
        />
      </WizardStep>

      {/* Schritt 2: Zustand erfassen */}
      <WizardStep
        label={tx('Zustand')}
        description={tx('Zustand des zurückgegebenen Werkzeugs und Rückgabezeitpunkt erfassen.')}
      >
        {ausleiheId ? (
          <div className="space-y-4">
            <Field form={zustand} name="zustand_bei_rueckgabe">
              <ChoiceGroup {...zustand.choice('zustand_bei_rueckgabe')} />
            </Field>
            <Bound form={zustand} name="rueckgabe_erfolgt" />
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => zustand.validate(['zustand_bei_rueckgabe', 'rueckgabe_erfolgt'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine offene Ausleihe auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Prüfen & Abschließen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.result && (
          <SummaryStep
            forms={[zustand]}
            submit={submit}
            confirmLabel={tx('Rücknahme bestätigen')}
            items={[
              {
                key: '_ausleihe',
                keys: [],
                label: tx('Ausleihe'),
                value: ausleiheLabel ?? '—',
              },
            ]}
            whatHappensNext={
              inWartung
                ? tx('Das Werkzeug wird in Wartung gesetzt und ein Schaden angelegt.')
                : tx('Das Werkzeug ist wieder als verfügbar markiert.')
            }
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          forms={[zustand]}
          verb="updated"
          whatHappensNext={
            inWartung
              ? tx('Werkzeug wurde in Wartung gesetzt. Bitte einen Wartungsauftrag anlegen.')
              : tx('Das Werkzeug steht wieder zur Ausgabe bereit.')
          }
          next={[
            { label: tx('Weiteres Werkzeug zurücknehmen'), href: '#/intents/werkzeug-ruecknahme' },
            { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
