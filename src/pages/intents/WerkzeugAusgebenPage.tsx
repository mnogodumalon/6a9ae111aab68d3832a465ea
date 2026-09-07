/**
 * Werkzeug ausgeben — 5-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen → 3) Ausgabe-Details → 4) Prüfen & anlegen → 5) Erfolgsmeldung.
 * Reads: mitarbeiter (aktiv=true), werkzeuge (status=verfuegbar). Writes: ausleihen (create), werkzeuge (update status=verliehen).
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
  fieldNumber,
  nowIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { IconAlertTriangle } from '@tabler/icons-react';

const DRAFT_KEY = 'werkzeug-ausgeben';

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Mitarbeiter — only active ones
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => r.fields.aktiv === true,
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim(),
      subtitle: fieldText(m, 'personalnummer') || undefined,
    }),
    orderby: ['r.v_nachname asc', 'r.v_vorname asc'],
  });

  // Step 2: Werkzeuge — only available ones
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung'),
      subtitle: fieldText(w, 'inventarnummer'),
      status: fieldLookup(w, 'status') ?? undefined,
      stats: fieldNumber(w, 'bestand') !== null
        ? [{ label: tx('Bestand'), value: String(fieldNumber(w, 'bestand') ?? 0) }]
        : [],
    }),
    orderby: ['r.v_bezeichnung asc'],
  });

  // Form for the ausleihe record
  const ausleihe = useStepForm('ausleihen', {
    steps: {
      mitarbeiter: 1,
      werkzeug: 2,
      ausgabe: 3,
      rueckgabe_geplant: 3,
    },
    // rueckgabe_erfolgt and zustand_bei_rueckgabe are not part of this flow
    required: { rueckgabe_geplant: false, rueckgabe_erfolgt: false, zustand_bei_rueckgabe: false },
    initial: { ausgabe: nowIso() },
  });

  const selectedWerkzeugId = ausleihe.get('werkzeug') as string | null;
  const selectedWerkzeug = selectedWerkzeugId ? werkzeuge.recordOf(selectedWerkzeugId) : undefined;
  const bestand = selectedWerkzeug ? fieldNumber(selectedWerkzeug, 'bestand') : null;
  const bestandWarn = bestand !== null && bestand === 0;

  // Plan: create ausleihe, then update werkzeug status to verliehen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      form: ausleihe,
      primary: true,
    },
    {
      key: 'status_update',
      entity: 'werkzeuge',
      needs: ['ausleihe'],
      updates: selectedWerkzeugId ?? '',
      values: { status: 'verliehen' },
      verb: 'update',
    },
  ], { draftKey: DRAFT_KEY });

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[ausleihe]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Einen Mitarbeiter und ein verfügbares Werkzeug auswählen und die Ausgabe erfassen.'),
        needs: [tx('Name des Mitarbeiters'), tx('Bezeichnung oder Inventarnummer des Werkzeugs')],
      }}
    >
      {/* Step 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter wählen')}
        description={tx('Wähle den Mitarbeiter aus, dem das Werkzeug ausgegeben wird.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          avatar="initials"
          selectedId={ausleihe.get('mitarbeiter') as string | null}
          searchPlaceholder={tx('Nach Name suchen …')}
          emptyText={tx('Keine aktiven Mitarbeiter gefunden.')}
          onSelect={id => {
            ausleihe.set('mitarbeiter', id, mitarbeiter.labelOf(id));
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Step 2: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug wählen')}
        description={tx('Nur verfügbare Werkzeuge werden angezeigt.')}
        needs={['mitarbeiter']}
      >
        <div className="space-y-3">
          <EntitySelectStep
            {...werkzeuge.select}
            avatar="none"
            selectedId={ausleihe.get('werkzeug') as string | null}
            searchPlaceholder={tx('Nach Bezeichnung oder Inventarnummer suchen …')}
            emptyText={tx('Keine verfügbaren Werkzeuge vorhanden. Alle Werkzeuge sind derzeit verliehen oder nicht einsatzbereit.')}
            create={false}
            onSelect={id => {
              ausleihe.set('werkzeug', id, werkzeuge.labelOf(id));
              setStep(3);
            }}
          />
          {bestandWarn && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <IconAlertTriangle size={16} className="shrink-0 text-amber-600" />
              <span>{tx('Laut Bestand ist kein Exemplar mehr vorhanden — bitte prüfen.')}</span>
            </div>
          )}
        </div>
      </WizardStep>

      {/* Step 3: Ausgabe-Details */}
      <WizardStep
        label={tx('Details')}
        description={tx('Ausgabezeitpunkt und geplante Rückgabe festhalten.')}
        needs={['werkzeug']}
      >
        <div className="space-y-4">
          <Bound form={ausleihe} name="ausgabe" />
          <Bound form={ausleihe} name="rueckgabe_geplant" hint={tx('Optional — wann das Werkzeug zurückerwartet wird.')} />
          <StepNav
            onNext={() => ausleihe.validate(['ausgabe'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Step 4: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.result && (
          <SummaryStep
            forms={[ausleihe]}
            submit={submit}
            whatHappensNext={tx('Die Ausleihe wird angelegt und das Werkzeug als verliehen markiert.')}
            confirmLabel={tx('Ausgabe bestätigen')}
          />
        )}
      </WizardStep>

      {/* Step 5: Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[ausleihe]}
          submit={submit}
          restartLabel={tx('Weiteres Werkzeug ausgeben')}
          whatHappensNext={tx('Zur Rücknahme den Ablauf „Werkzeug zurücknehmen" verwenden.')}
          next={[
            { label: tx('Werkzeug zurücknehmen'), href: '#/intents/werkzeug-ruecknahme' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
