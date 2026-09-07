/**
 * Werkzeug ausgeben — 5-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen (nur verfügbare) →
 *        3) Ausgabe erfassen (Datum + geplante Rückgabe) → 4) Prüfen & anlegen → 5) Erfolg.
 * Reads: mitarbeiter (aktiv=true), werkzeuge (status=verfuegbar).
 * Writes: ausleihen (createAusleihenEntry) + werkzeuge status → 'verliehen' (updateWerkzeugeEntry via run).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Bound } from '@/components/blocks/Bound';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, fieldNumber } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { LOOKUP_OPTIONS } from '@/types/app';

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Mitarbeiter — nur aktive (aktiv == True)
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => fieldText(r, 'aktiv') !== 'false' && r.fields['aktiv'] !== false,
    searchFields: ['vorname', 'nachname', 'personalnummer'],
    toItem: (m) => ({
      id: m.id,
      title: `${fieldText(m, 'vorname') ?? ''} ${fieldText(m, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(m, 'personalnummer') ?? undefined,
      status: fieldLookup(m, 'abteilung') ?? undefined,
    }),
  });

  // Schritt 2: Werkzeug — nur verfügbare
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: (w) => {
      const bestand = fieldNumber(w, 'bestand');
      return {
        id: w.id,
        title: fieldText(w, 'bezeichnung') ?? '',
        subtitle: fieldText(w, 'inventarnummer') ?? undefined,
        stats: bestand != null
          ? [{ label: tx('Bestand'), value: bestand === 0 ? tx('⚠ Bestand: 0') : String(bestand) }]
          : undefined,
      };
    },
  });

  // Formular für Schritt 3: Ausgabedatum + geplante Rückgabe
  const ausgabeForm = useStepForm('ausleihen', {
    steps: {
      mitarbeiter: 1,
      werkzeug: 2,
      ausgabe: 3,
      rueckgabe_geplant: 3,
    },
    initial: {
      ausgabe: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    },
    required: {
      zustand_bei_rueckgabe: false,
      rueckgabe_erfolgt: false,
    },
  });

  // Hilfsvariable: Werkzeug-ID aus dem Formular (für den Status-Update-Step)
  const selectedWerkzeugId = ausgabeForm.get('werkzeug') as string | undefined;

  // Plan: 1) Ausleihe anlegen, 2) Werkzeugstatus auf 'verliehen' setzen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      form: ausgabeForm,
      primary: true,
    },
    {
      key: 'statusUpdate',
      entity: 'werkzeuge',
      updates: selectedWerkzeugId ?? '',
      values: { status: LOOKUP_OPTIONS['werkzeuge']?.['status']?.find(o => o.key === 'verliehen')?.key ?? 'verliehen' },
    },
  ], { draftKey: 'werkzeug-ausgeben' });

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[ausgabeForm]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Werkzeug an einen Mitarbeiter ausgeben und als verliehen erfassen.'),
        needs: [tx('Name des Mitarbeiters'), tx('Bezeichnung oder Inventarnummer des Werkzeugs')],
      }}
    >
      {/* Schritt 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Aktiven Mitarbeiter auswählen, der das Werkzeug erhält.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={ausgabeForm.get('mitarbeiter') as string}
          onSelect={id => {
            ausgabeForm.set('mitarbeiter', id, mitarbeiter.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Name oder Personalnummer …')}
          emptyText={tx('Keine aktiven Mitarbeiter gefunden.')}
          create={false}
        />
      </WizardStep>

      {/* Schritt 2: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Nur verfügbare Werkzeuge werden angezeigt. Bei Bestand 0 trotzdem wählbar.')}
      >
        {ausgabeForm.get('mitarbeiter') ? (
          <EntitySelectStep
            {...werkzeuge.select}
            selectedId={ausgabeForm.get('werkzeug') as string}
            onSelect={id => {
              ausgabeForm.set('werkzeug', id, werkzeuge.labelOf(id));
              setStep(3);
            }}
            searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
            emptyText={tx('Alle Werkzeuge sind derzeit verliehen oder nicht verfügbar.')}
            create={false}
          />
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            nextDisabled
          >
            {tx('Bitte zuerst einen Mitarbeiter in Schritt 1 wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Ausgabedaten erfassen */}
      <WizardStep
        label={tx('Ausgabe')}
        description={tx('Ausgabezeitpunkt festhalten und optional ein Rückgabedatum planen.')}
      >
        {ausgabeForm.get('werkzeug') ? (
          <div className="space-y-4">
            {/* Bestand-Warnung wenn 0 */}
            {(() => {
              const rec = werkzeuge.recordOf(ausgabeForm.get('werkzeug') as string);
              const bestand = rec ? fieldNumber(rec, 'bestand') : null;
              if (bestand === 0) {
                return (
                  <p className="text-xs text-destructive">
                    {tx('Hinweis: Der Bestand dieses Werkzeugs ist 0. Die Ausgabe wird trotzdem erfasst.')}
                  </p>
                );
              }
              return null;
            })()}

            {/* Ausgewähltes Werkzeug anzeigen */}
            {(() => {
              const rec = werkzeuge.recordOf(ausgabeForm.get('werkzeug') as string);
              const status = rec ? fieldLookup(rec, 'status') : null;
              if (rec && status) {
                return (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <StatusBadge statusKey={status.key} label={status.label} />
                    <span>{werkzeuge.labelOf(ausgabeForm.get('werkzeug') as string)}</span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Ausgabedatum (datetimeminute) — Pflichtfeld */}
            <Bound form={ausgabeForm} name="ausgabe" />

            {/* Geplante Rückgabe (date/date) — optional */}
            <Bound form={ausgabeForm} name="rueckgabe_geplant" />

            <StepNav
              onBack={() => setStep(2)}
              onNext={() => ausgabeForm.validate(['ausgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav
            onBack={() => setStep(2)}
            nextDisabled
          >
            {tx('Bitte zuerst ein Werkzeug in Schritt 2 wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Zusammenfassung & Bestätigung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[ausgabeForm]}
            submit={submit}
            whatHappensNext={tx('Das Werkzeug wird als „Verliehen" markiert. Bei Rückgabe den Ablauf „Werkzeug zurücknehmen" nutzen.')}
            confirmLabel={tx('Ausgabe erfassen')}
          />
        )}
      </WizardStep>

      {/* Erfolgsschritt */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[ausgabeForm]}
          submit={submit}
          whatHappensNext={tx('Das Werkzeug ist jetzt als verliehen erfasst. Zur Rückgabe den Ablauf „Werkzeug zurücknehmen" verwenden.')}
          next={[
            { label: tx('Weiteres Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
