/**
 * Werkzeug ausgeben — 4-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen → 3) Ausgabe bestätigen → 4) Prüfen & anlegen.
 * Reads: mitarbeiter (filter: aktiv), werkzeuge (filter: status=verfuegbar).
 * Writes: ausleihen (createAusleihenEntry) + werkzeuge status→verliehen (updateWerkzeugeEntry via run).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => fieldText(r, 'aktiv') !== 'false' && r.fields['aktiv'] !== false,
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim(),
      subtitle: fieldText(m, 'personalnummer') ?? undefined,
    }),
  });

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? tx('Unbekannt'),
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
    }),
  });

  // Ausgabezeitpunkt: jetzt als datetimeminute-String (format: yyyy-MM-dd'T'HH:mm)
  const nowDt = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  const ausleihe = useStepForm('ausleihen', {
    steps: {
      mitarbeiter: 1,
      werkzeug: 2,
      ausgabe: 3,
      rueckgabe_geplant: 3,
    },
    initial: {
      ausgabe: nowDt,
    },
    required: {
      // rueckgabe_geplant ist optional in diesem Flow
      rueckgabe_geplant: false,
      // zustand_bei_rueckgabe wird bei Ausgabe nicht abgefragt
      zustand_bei_rueckgabe: false,
    },
  });

  const werkzeugId = ausleihe.get('werkzeug') as string | undefined;

  // Minimales Form für den Status-Update des Werkzeugs (kein Input — Wert kommt aus values)
  const werkzeugUpdate = useStepForm('werkzeuge', {
    steps: {},
    required: { status: false },
  });

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      form: ausleihe,
      primary: true,
    },
    {
      key: 'werkzeug_verliehen',
      entity: 'werkzeuge',
      form: werkzeugUpdate,
      updates: werkzeugId ?? '',
      values: { status: 'verliehen' },
      needs: ['ausleihe'],
    },
  ], { draftKey: 'werkzeug-ausgeben' });

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[ausleihe]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Werkzeug an einen Mitarbeiter ausgeben und Ausleihe anlegen.'),
        needs: [tx('Mitarbeiter'), tx('Werkzeug (muss verfügbar sein)')],
      }}
    >
      {/* Schritt 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Wer nimmt das Werkzeug mit?')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={ausleihe.get('mitarbeiter') as string}
          onSelect={id => {
            ausleihe.set('mitarbeiter', id, mitarbeiter.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Vorname oder Nachname …')}
          create={false}
        />
      </WizardStep>

      {/* Schritt 2: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Welches Werkzeug wird mitgenommen? Nur verfügbare Werkzeuge werden angezeigt.')}
      >
        {ausleihe.get('mitarbeiter') ? (
          <EntitySelectStep
            {...werkzeuge.select}
            selectedId={ausleihe.get('werkzeug') as string}
            onSelect={id => {
              ausleihe.set('werkzeug', id, werkzeuge.labelOf(id));
              setStep(3);
            }}
            searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
            create={false}
          />
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            nextDisabled
          >
            {tx('Bitte zuerst einen Mitarbeiter auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Ausgabe bestätigen */}
      <WizardStep
        label={tx('Ausgabe')}
        description={tx('Ausgabezeitpunkt prüfen und optionalen Rückgabetermin festlegen.')}
      >
        {ausleihe.get('werkzeug') ? (
          <div className="space-y-4">
            <Bound form={ausleihe} name="ausgabe" />
            <Bound
              form={ausleihe}
              name="rueckgabe_geplant"
              hint={tx('Optional — wann soll das Werkzeug zurückgebracht werden?')}
            />
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => ausleihe.validate(['ausgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav
            onBack={() => setStep(2)}
            nextDisabled
          >
            {tx('Bitte zuerst ein Werkzeug auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & Anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.result && (
          <SummaryStep
            forms={[ausleihe]}
            submit={submit}
            whatHappensNext={tx('Die Ausleihe wird angelegt und das Werkzeug als „Verliehen" markiert.')}
            confirmLabel={tx('Ausgabe bestätigen')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          forms={[ausleihe]}
          whatHappensNext={tx('Bei Rückgabe den Ablauf „Werkzeug zurück" starten.')}
          next={[
            { label: tx('Weiteres Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Werkzeug zurück'), href: '#/intents/werkzeug-ruecknahme' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
