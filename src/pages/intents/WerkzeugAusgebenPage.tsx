/**
 * Werkzeug ausgeben — 4-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen (wiederholbar) → 3) Ausgabezeitpunkt bestätigen → 4) Zusammenfassung & anlegen.
 * Reads: mitarbeiter (aktiv=true), werkzeuge (status=verfuegbar). Writes: ausleihen (create, one per Werkzeug) + werkzeuge (update status→verliehen).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
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
  fieldNumber,
  nowIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  // Mitarbeiter-Suche: nur aktive
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => r.fields['aktiv'] === true,
    searchFields: ['vorname', 'nachname', 'personalnummer'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim(),
      subtitle: fieldText(m, 'personalnummer') || undefined,
    }),
  });

  // Werkzeug-Suche: nur verfügbare
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => (r.fields['status'] as { key: string } | null)?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung'),
      subtitle: fieldText(w, 'inventarnummer') || undefined,
    }),
  });

  // Formular für Ausgabe-Details (Step 3)
  const ausgabeForm = useStepForm('ausleihen', {
    steps: { ausgabe: 3, rueckgabe_geplant: 3 },
    required: { rueckgabe_geplant: false },
    initial: { ausgabe: nowIso() },
    messages: {
      ausgabe: tx('Bitte den Ausgabezeitpunkt angeben.'),
    },
  });

  // Gewählte Werkzeuge (Liste)
  const [gewaehltWerkzeuge, setGewaehltWerkzeuge] = useState<Array<{ id: string; label: string; bestand: number | null }>>([]);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Gewählter Mitarbeiter
  const [mitarbeiterId, setMitarbeiterId] = useState<string | null>(null);
  const [mitarbeiterLabel, setMitarbeiterLabel] = useState<string>('');

  // Plan: für jedes Werkzeug eine Ausleihe anlegen + Status auf verliehen setzen
  const plan = gewaehltWerkzeuge.flatMap(w => [
    {
      key: `ausleihe-${w.id}`,
      entity: 'ausleihen' as const,
      form: ausgabeForm,
      values: {
        werkzeug: w.id,
        mitarbeiter: mitarbeiterId ?? '',
      },
      primary: gewaehltWerkzeuge.indexOf(w) === 0,
    },
    {
      key: `status-${w.id}`,
      entity: 'werkzeuge' as const,
      updates: w.id,
      values: { status: 'verliehen' },
      needs: [`ausleihe-${w.id}`],
    },
  ]);

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'werkzeug-ausgeben' });

  const handleMitarbeiterSelect = (id: string) => {
    setMitarbeiterId(id);
    setMitarbeiterLabel(mitarbeiter.labelOf(id) ?? id);
    setStep(2);
  };

  const handleWerkzeugSelect = (id: string) => {
    if (gewaehltWerkzeuge.some(w => w.id === id)) return;
    const rec = werkzeuge.recordOf(id);
    const bestand = rec ? fieldNumber(rec, 'bestand') : null;
    setGewaehltWerkzeuge(prev => [...prev, { id, label: werkzeuge.labelOf(id) ?? id, bestand }]);
    setSelectedWerkzeugId(id);
  };

  const handleWerkzeugEntfernen = (id: string) => {
    setGewaehltWerkzeuge(prev => prev.filter(w => w.id !== id));
    if (selectedWerkzeugId === id) setSelectedWerkzeugId(null);
  };

  const handleRestart = () => {
    submit.reset();
    ausgabeForm.reset({ ausgabe: nowIso() });
    setGewaehltWerkzeuge([]);
    setSelectedWerkzeugId(null);
    setMitarbeiterId(null);
    setMitarbeiterLabel('');
    setStep(1);
  };

  const ausgabeDatum = ausgabeForm.get('ausgabe') as string | null;
  const ausgabeAnzeige = ausgabeDatum
    ? format(new Date(ausgabeDatum), 'dd.MM.yyyy HH:mm') + ' Uhr'
    : '—';

  const summaryItems = [
    { key: 'mitarbeiter', label: tx('Mitarbeiter'), value: mitarbeiterLabel || '—' },
    {
      key: 'werkzeuge-liste',
      label: tx('Werkzeuge'),
      value: gewaehltWerkzeuge.length > 0
        ? gewaehltWerkzeuge.map(w => w.label).join(', ')
        : '—',
    },
    { key: 'ausgabe-anzeige', label: tx('Ausgabezeitpunkt'), value: ausgabeAnzeige },
    {
      key: 'rueckgabe-anzeige',
      label: tx('Geplante Rückgabe'),
      value: (ausgabeForm.get('rueckgabe_geplant') as string | null) ?? '—',
    },
  ];

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[ausgabeForm]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Werkzeuge an einen Mitarbeiter ausgeben und Ausleihe anlegen.'),
        needs: [tx('Name des Mitarbeiters'), tx('Inventarnummer des Werkzeugs')],
      }}
    >
      {/* Schritt 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Den Mitarbeiter wählen, der das Werkzeug mitnimmt.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={mitarbeiterId}
          onSelect={handleMitarbeiterSelect}
          searchPlaceholder={tx('Vorname, Nachname oder Personalnummer …')}
          emptyText={tx('Keine aktiven Mitarbeiter gefunden.')}
          avatar="initials"
        />
      </WizardStep>

      {/* Schritt 2: Werkzeug wählen (wiederholbar) */}
      <WizardStep
        label={tx('Werkzeuge')}
        description={tx('Ein oder mehrere verfügbare Werkzeuge wählen.')}
        needs={['mitarbeiter']}
      >
        {mitarbeiterId ? (
          <div className="space-y-4">
            {/* Bereits gewählte Werkzeuge */}
            {gewaehltWerkzeuge.length > 0 && (
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {tx('Bereits gewählt')}
                </p>
                <ul className="space-y-1">
                  {gewaehltWerkzeuge.map(w => (
                    <li key={w.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <IconCheck size={14} className="shrink-0 text-emerald-600" />
                        <span className="truncate text-sm">{w.label}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {w.bestand !== null && w.bestand <= 1 && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <IconAlertTriangle size={12} className="shrink-0" />
                            {tx('Letztes Stück')}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleWerkzeugEntfernen(w.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-0.5 rounded"
                        >
                          {tx('Entfernen')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Picker: nächstes Werkzeug wählen */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                {gewaehltWerkzeuge.length > 0
                  ? tx('Weiteres Werkzeug hinzufügen:')
                  : tx('Werkzeug wählen:')}
              </p>
              <EntitySelectStep
                {...werkzeuge.select}
                selectedId={selectedWerkzeugId}
                onSelect={handleWerkzeugSelect}
                searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
                emptyText={tx('Keine verfügbaren Werkzeuge. Alle sind derzeit verliehen oder in Wartung.')}
                avatar="none"
              />
            </div>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => {
                if (gewaehltWerkzeuge.length === 0) {
                  return tx('Bitte ein Werkzeug auswählen.');
                }
              }}
              nextStepLabel={tx('Ausgabezeitpunkt')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <span className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht zuerst einen Mitarbeiter aus Schritt 1.')}
            </span>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Ausgabezeitpunkt bestätigen */}
      <WizardStep
        label={tx('Ausgabe')}
        description={tx('Ausgabezeitpunkt und optionale Rückgabe festhalten.')}
        needs={['ausgabe']}
      >
        {gewaehltWerkzeuge.length > 0 ? (
          <div className="space-y-4">
            <Bound form={ausgabeForm} name="ausgabe" label={tx('Ausgabezeitpunkt')} />
            <Bound form={ausgabeForm} name="rueckgabe_geplant" label={tx('Geplante Rückgabe')} hint={tx('Optional')} />
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => ausgabeForm.validate(['ausgabe'])}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(2)} nextDisabled>
            <span className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht mindestens ein Werkzeug aus Schritt 2.')}
            </span>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Zusammenfassung */}
      <WizardStep label={tx('Zusammenfassung')}>
        {!submit.result && (
          <SummaryStep
            forms={[ausgabeForm]}
            submit={submit}
            items={summaryItems}
            whatHappensNext={tx('Für jedes Werkzeug wird eine Ausleihe angelegt und der Status auf „Verliehen" gesetzt.')}
            confirmLabel={tx('Ausgabe bestätigen')}
          />
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[ausgabeForm]}
          facts={summaryItems.map(i => ({ label: i.label, value: i.value }))}
          whatHappensNext={tx('Zur Rücknahme den Ablauf „Werkzeug zurücknehmen" verwenden.')}
          next={[
            { label: tx('Weitere Ausgabe'), onClick: handleRestart },
            { label: tx('Werkzeug zurücknehmen'), href: '#/intents/werkzeug-zuruecknehmen' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
