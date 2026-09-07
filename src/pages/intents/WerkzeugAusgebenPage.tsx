/**
 * Werkzeug ausgeben — 4-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen → 3) Ausgabe bestätigen → 4) Prüfen & anlegen.
 * Reads: mitarbeiter, werkzeuge. Writes: ausleihen (createAusleihenEntry); updates werkzeuge status → 'verliehen'.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep, StatusBadge.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { format } from 'date-fns';

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Mitarbeiter-Suche — nur aktive Mitarbeiter
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => r.fields?.aktiv !== false,
    searchFields: ['vorname', 'nachname', 'personalnummer'],
    toItem: m => ({
      id: m.id,
      title: [fieldText(m, 'vorname'), fieldText(m, 'nachname')].filter(Boolean).join(' ') || m.id,
      subtitle: fieldText(m, 'personalnummer') ?? undefined,
      status: fieldLookup(m, 'abteilung') ?? undefined,
    }),
  });

  // Schritt 2: Werkzeug-Suche — nur verfügbare Werkzeuge
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? w.id,
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  // Formular für Ausleihe — Schritt 3 hält Ausgabe + geplante Rückgabe
  const f = useStepForm('ausleihen', {
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
      rueckgabe_geplant: false,
    },
  });

  // Hilfsformular für den Werkzeugstatus-Update (kein eigener Step — nur values im Plan)
  const wStatus = useStepForm('werkzeuge', { fields: [] });

  // Plan: 1) Ausleihe anlegen  2) Werkzeugstatus auf 'verliehen' setzen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      form: f,
      primary: true,
    },
    {
      key: 'werkzeug_status',
      entity: 'werkzeuge',
      form: wStatus,
      updates: f.get('werkzeug') as string,
      values: { status: 'verliehen' },
    },
  ], { draftKey: 'werkzeug-ausgeben' });

  const selectedWerkzeugLabel = werkzeuge.labelOf(f.get('werkzeug') as string);
  const selectedMitarbeiterLabel = mitarbeiter.labelOf(f.get('mitarbeiter') as string);

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Einem Mitarbeiter ein verfügbares Werkzeug ausgeben und eine Ausleihe anlegen.'),
        needs: [tx('Name des Mitarbeiters'), tx('Bezeichnung oder Inventarnummer des Werkzeugs')],
      }}
    >
      {/* Schritt 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        heading={tx('Mitarbeiter wählen')}
        description={tx('Wähle den Mitarbeiter, dem das Werkzeug ausgegeben wird.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={f.get('mitarbeiter') as string}
          onSelect={id => {
            f.set('mitarbeiter', id, mitarbeiter.labelOf(id));
          }}
          emptyText={tx('Keine aktiven Mitarbeiter gefunden.')}
          searchPlaceholder={tx('Vorname, Nachname oder Personalnummer …')}
          create={false}
        />
        <StepNav
          hideBack
          onNext={() => f.validate(['mitarbeiter'])}
          nextStepLabel={tx('Werkzeug wählen')}
        />
      </WizardStep>

      {/* Schritt 2: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        heading={tx('Werkzeug wählen')}
        description={tx('Es werden nur verfügbare Werkzeuge angezeigt. Bereits verliehene, defekte oder in Wartung befindliche Werkzeuge sind nicht wählbar.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={f.get('werkzeug') as string}
          onSelect={id => {
            f.set('werkzeug', id, werkzeuge.labelOf(id));
          }}
          emptyText={tx('Kein Werkzeug ist aktuell verfügbar — alle sind verliehen, defekt oder in Wartung.')}
          searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
          create={false}
        />
        <StepNav
          onNext={() => f.validate(['werkzeug'])}
          nextStepLabel={tx('Ausgabe bestätigen')}
        />
      </WizardStep>

      {/* Schritt 3: Ausgabezeitpunkt + geplante Rückgabe */}
      <WizardStep
        label={tx('Ausgabe')}
        heading={tx('Ausgabe bestätigen')}
        description={tx('Zeitpunkt der Ausgabe festhalten und optional ein geplantes Rückgabedatum eintragen.')}
      >
        <div className="space-y-4">
          {/* Kontext: welches Werkzeug geht an wen */}
          {(selectedWerkzeugLabel || selectedMitarbeiterLabel) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-4 py-3 text-sm">
              {selectedWerkzeugLabel && <span className="font-medium">{selectedWerkzeugLabel}</span>}
              {selectedWerkzeugLabel && selectedMitarbeiterLabel && <span className="text-muted-foreground">{'→' /* i18n-exempt */}</span>}
              {selectedMitarbeiterLabel && <span>{selectedMitarbeiterLabel}</span>}
            </div>
          )}
          {/* Ausgabedatum: date/datetimeminute */}
          <Bound form={f} name="ausgabe" />
          {/* Geplante Rückgabe: date/date — optional */}
          <Bound form={f} name="rueckgabe_geplant" hint={tx('Optional — leer lassen wenn unbekannt')} />
          <StepNav
            onNext={() => f.validate(['ausgabe'])}
            nextStepLabel={tx('Prüfen & bestätigen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 4: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')} heading={tx('Zusammenfassung')}>
        {!submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={[
              {
                key: 'ma_name',
                label: tx('Mitarbeiter'),
                value: selectedMitarbeiterLabel || '—',
                step: 1,
                keys: ['mitarbeiter'],
                fieldId: 'mitarbeiter',
              },
              {
                key: 'wz_name',
                label: tx('Werkzeug'),
                value: selectedWerkzeugLabel || '—',
                step: 2,
                keys: ['werkzeug'],
                fieldId: 'werkzeug',
              },
            ]}
            confirmLabel={tx('Werkzeug ausgeben')}
            whatHappensNext={tx('Die Ausleihe wird angelegt und der Werkzeugstatus auf „Verliehen" gesetzt.')}
          />
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          next={[
            {
              label: tx('Weiteres Werkzeug ausgeben'),
              onClick: () => {
                submit.reset();
                f.reset();
              },
            },
            { label: tx('Werkzeug zurücknehmen'), href: '#/intents/werkzeug-ruecknahme' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Für die Rückgabe den Ablauf „Werkzeug zurücknehmen" starten. Bei Schäden „Schaden melden" verwenden.')}
        />
      )}
    </IntentWizardShell>
  );
}
