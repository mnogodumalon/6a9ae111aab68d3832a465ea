/**
 * Werkzeug ausgeben — 3-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug(e) wählen (Multi-Select, nur verfügbare) → 3) Ausgabe-Details → 4) Prüfen & anlegen.
 * Reads: mitarbeiter, werkzeuge. Writes: ausleihen (createAusleihenEntry × N gewählte Werkzeuge), werkzeuge-Status → 'verliehen'.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { DatePicker } from '@/components/DatePicker';
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

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Mitarbeiter — nur aktive
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => r.fields?.aktiv === true,
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname') ?? ''} ${fieldText(m, 'nachname') ?? ''}`.trim(),
      subtitle: fieldLookup(m, 'abteilung')?.label ?? undefined,
    }),
  });

  // Step 2: Werkzeuge — nur verfügbare, Multi-Select
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? '',
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
    }),
  });

  // Form für Details (Ausgabezeitpunkt, geplante Rückgabe)
  const detailsForm = useStepForm('ausleihen', {
    steps: { ausgabe: 3, rueckgabe_geplant: 3 },
    initial: { ausgabe: format(new Date(), "yyyy-MM-dd'T'HH:mm") },
    required: { rueckgabe_geplant: false },
  });

  // Mitarbeiter-Auswahl (step 1)
  const [mitarbeiterId, setMitarbeiterId] = useState<string>('');
  const [mitarbeiterLabel, setMitarbeiterLabel] = useState<string>('');

  // Werkzeug-Auswahl via Field+records (step 2, multi)
  const werkzeugForm = useStepForm('ausleihen', {
    steps: { werkzeug: 2 },
  });

  // Plan: für jedes gewählte Werkzeug eine Ausleihe + Status-Update
  const selectedWerkzeugIds = (werkzeugForm.get('werkzeug') as string[] | undefined) ?? [];

  const plan = [
    ...selectedWerkzeugIds.map((wId, i) => ({
      key: `ausleihe-${i}`,
      entity: 'ausleihen' as const,
      primary: i === 0,
      values: {
        mitarbeiter: mitarbeiterId,
        werkzeug: wId,
        ausgabe: detailsForm.get('ausgabe') as string | undefined,
        rueckgabe_geplant: detailsForm.get('rueckgabe_geplant') as string | undefined || undefined,
      },
    })),
    ...selectedWerkzeugIds.map((wId, i) => ({
      key: `status-${i}`,
      entity: 'werkzeuge' as const,
      updates: wId,
      needs: [`ausleihe-${i}`],
      values: { status: 'verliehen' },
    })),
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'werkzeug-ausgeben' });

  const restart = () => {
    submit.reset();
    werkzeugForm.reset();
    detailsForm.reset();
    setMitarbeiterId('');
    setMitarbeiterLabel('');
    setStep(1);
  };

  const werkzeugCount = selectedWerkzeugIds.length;

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[werkzeugForm, detailsForm]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Einen Mitarbeiter wählen und verfügbare Werkzeuge ausgeben.'),
        needs: [tx('Name des Mitarbeiters'), tx('Zu verleihende Werkzeuge')],
      }}
    >
      {/* Schritt 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Den Mitarbeiter wählen, der die Werkzeuge erhält.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={mitarbeiterId}
          onSelect={id => {
            setMitarbeiterId(id);
            setMitarbeiterLabel(mitarbeiter.labelOf(id) ?? '');
            setStep(2);
          }}
          searchPlaceholder={tx('Vorname oder Nachname …')}
        />
      </WizardStep>

      {/* Schritt 2: Werkzeug(e) wählen — Multi-Select */}
      <WizardStep
        label={tx('Werkzeuge')}
        description={tx('Ein oder mehrere verfügbare Werkzeuge auswählen.')}
        needs={['mitarbeiter']}
      >
        {mitarbeiterId ? (
          <>
            <Field form={werkzeugForm} name="werkzeug">
              <EntitySelectStep
                {...werkzeuge.select}
                {...werkzeugForm.records('werkzeug', werkzeuge.labelOf)}
                emptyText={tx('Aktuell kein Werkzeug verfügbar — alle Geräte sind verliehen oder in Wartung.')}
                searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
                create={false}
              />
            </Field>
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => werkzeugForm.validate(['werkzeug'])}
              nextStepLabel={tx('Ausgabe-Details')}
            />
          </>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Mitarbeiter auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Ausgabe-Details */}
      <WizardStep
        label={tx('Details')}
        description={tx('Ausgabezeitpunkt und geplante Rückgabe festhalten.')}
        needs={['werkzeug']}
      >
        {werkzeugCount > 0 ? (
          <div className="space-y-4">
            <Field form={detailsForm} name="ausgabe">
              <DatePicker {...detailsForm.date('ausgabe')} />
            </Field>
            <Field form={detailsForm} name="rueckgabe_geplant" hint={tx('Optional')}>
              <DatePicker {...detailsForm.date('rueckgabe_geplant')} />
            </Field>
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => detailsForm.validate(['ausgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(2)} nextDisabled>
            {tx('Bitte zuerst Werkzeuge auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done ? (
          <SummaryStep
            forms={[werkzeugForm, detailsForm]}
            submit={submit}
            items={[
              { key: 'ma', label: tx('Mitarbeiter'), value: mitarbeiterLabel },
              {
                key: 'anzahl',
                label: tx('Werkzeuge'),
                value: werkzeugCount > 0
                  ? tx`${werkzeugCount} ausgewählt`
                  : tx('Keine'),
              },
            ]}
            whatHappensNext={tx('Für jedes Werkzeug wird eine Ausleihe angelegt und der Status auf „Verliehen" gesetzt.')}
            confirmLabel={tx('Ausgabe bestätigen')}
          />
        ) : null}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[werkzeugForm, detailsForm]}
          next={[
            { label: tx('Weitere Ausgabe'), onClick: restart },
            { label: tx('Werkzeug zurücknehmen'), href: '#/intents/werkzeug-zuruecknehmen' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Ausleihe ist aktiv. Für die Rückgabe den Ablauf „Werkzeug zurücknehmen" nutzen.')}
        />
      )}
    </IntentWizardShell>
  );
}
