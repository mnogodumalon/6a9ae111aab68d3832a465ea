/**
 * Werkzeug ausgeben — 5-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeuge wählen (Multi-Pick) → 3) Ausgabedatum bestätigen
 *        → 4) Zusammenfassung → 5) Erfolg.
 * Reads: mitarbeiter (filter aktiv=true), werkzeuge (filter status=verfuegbar).
 * Writes: ausleihen (CREATE je Werkzeug), werkzeuge (UPDATE status → verliehen je Werkzeug).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, Bound, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useRecordSearch,
  useStepForm,
  useJourneySubmit,
  nowIso,
  fieldText,
  fieldNumber,
  fieldLookup,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { IconTool, IconAlertTriangle } from '@tabler/icons-react';

export default function WerkzeugAusgebenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Mitarbeiter (active only)
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => fieldText(r, 'aktiv') !== 'false' && (r.fields.aktiv as boolean | undefined) !== false,
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim(),
      subtitle: [fieldText(m, 'personalnummer'), fieldLookup(m, 'abteilung')?.label].filter(Boolean).join(' · '),
    }),
  });

  // Step 2: Werkzeuge (available only) — multi-pick via form
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => {
      const bestand = fieldNumber(w, 'bestand');
      const stats: { label: string; value: string | number }[] = [];
      if (bestand !== null) stats.push({ label: tx('Bestand'), value: bestand });
      const kategorien = w.fields.kategorien as Array<{ key: string; label: string }> | null | undefined;
      if (kategorien && kategorien.length > 0) {
        stats.push({ label: tx('Kategorien'), value: kategorien.map(k => k.label).join(', ') });
      }
      return {
        id: w.id,
        title: fieldText(w, 'bezeichnung'),
        subtitle: fieldText(w, 'inventarnummer'),
        status: { key: fieldLookup(w, 'status')?.key ?? '', label: fieldLookup(w, 'status')?.label ?? '' },
        stats,
        icon: bestand !== null && bestand <= 0
          ? <IconAlertTriangle size={16} className="text-amber-500 shrink-0" />
          : <IconTool size={16} className="text-muted-foreground shrink-0" />,
      };
    },
  });

  // Form for ausgabe step (step 3) — tracks ausgabe datetime and rueckgabe_geplant
  const ausgabeForm = useStepForm('ausleihen', {
    fields: ['ausgabe', 'rueckgabe_geplant'],
    steps: { ausgabe: 3, rueckgabe_geplant: 3 },
    required: { rueckgabe_geplant: false },
    initial: { ausgabe: nowIso() },
  });

  // Form tracking mitarbeiter pick (single record)
  const mitarbeiterForm = useStepForm('ausleihen', {
    id: 'ma',
    fields: ['mitarbeiter'],
    steps: { mitarbeiter: 1 },
  });

  // Form tracking werkzeuge multi-pick (multipleapplookup workaround: stored as string[])
  const werkzeugForm = useStepForm('ausleihen', {
    id: 'wz',
    fields: ['werkzeug'],
    steps: { werkzeug: 2 },
  });

  // Derived state: selected werkzeug ids from the form
  const selectedWerkzeugIds = (werkzeugForm.get('werkzeug') as string[] | undefined) ?? [];
  const mitarbeiterId = mitarbeiterForm.get('mitarbeiter') as string | undefined;

  // Build the plan dynamically at submit time: one ausleihe per werkzeug + one status update per werkzeug
  const plan = useMemo(() => {
    const ausgabeWert = ausgabeForm.get('ausgabe') as string | undefined;
    const rueckgabe = ausgabeForm.get('rueckgabe_geplant') as string | undefined;

    return [
      // CREATE one ausleihe per werkzeug
      ...selectedWerkzeugIds.map((wId, idx) => ({
        key: `ausleihe-${idx}`,
        entity: 'ausleihen' as const,
        primary: idx === 0,
        values: {
          werkzeug: wId,
          mitarbeiter: mitarbeiterId ?? '',
          ausgabe: ausgabeWert ?? nowIso(),
          ...(rueckgabe ? { rueckgabe_geplant: rueckgabe } : {}),
        },
      })),
      // UPDATE status → verliehen for each werkzeug
      ...selectedWerkzeugIds.map((wId, idx) => ({
        key: `status-${idx}`,
        entity: 'werkzeuge' as const,
        updates: wId,
        values: { status: 'verliehen' },
        needs: [`ausleihe-${idx}`],
      })),
    ];
  }, [selectedWerkzeugIds, mitarbeiterId, ausgabeForm.get('ausgabe'), ausgabeForm.get('rueckgabe_geplant')]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'werkzeug-ausgeben' });

  const mitarbeiterLabel = mitarbeiterForm.get('mitarbeiter')
    ? (mitarbeiter.labelOf(mitarbeiterId!) ?? mitarbeiterId ?? '')
    : '';

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      forms={[mitarbeiterForm, werkzeugForm, ausgabeForm]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Werkzeuge an einen Mitarbeiter ausgeben und Ausleihen anlegen.'),
        needs: [tx('Name des Mitarbeiters'), tx('Inventarnummer(n) der Werkzeuge')],
      }}
    >
      {/* Schritt 1 — Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Wähle den Mitarbeiter, der die Werkzeuge erhält.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          avatar="initials"
          selectedId={mitarbeiterId ?? null}
          emptyText={tx('Keine aktiven Mitarbeiter gefunden.')}
          onSelect={id => {
            mitarbeiterForm.set('mitarbeiter', id, mitarbeiter.labelOf(id));
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2 — Werkzeuge wählen (Multi-Pick) */}
      <WizardStep
        label={tx('Werkzeuge')}
        description={tx('Wähle eines oder mehrere verfügbare Werkzeuge aus.')}
        needs={['mitarbeiter']}
      >
        <div className="space-y-4">
          {/* Chip-Liste der bereits gewählten Werkzeuge */}
          {selectedWerkzeugIds.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-secondary rounded-lg">
              <span className="text-sm text-muted-foreground w-full mb-1">
                {tx('Ausgewählt:')}
              </span>
              {selectedWerkzeugIds.map(id => {
                const rec = werkzeuge.recordOf(id);
                const bestand = rec ? fieldNumber(rec, 'bestand') : null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-card border rounded-full text-sm"
                  >
                    <IconTool size={12} className="shrink-0 text-muted-foreground" />
                    {werkzeuge.labelOf(id) ?? id}
                    {rec && fieldText(rec, 'inventarnummer') && (
                      <span className="text-muted-foreground text-xs">
                        · {fieldText(rec, 'inventarnummer')}
                      </span>
                    )}
                    {bestand !== null && bestand <= 0 && (
                      <IconAlertTriangle size={12} className="text-amber-500 shrink-0" />
                    )}
                  </span>
                );
              })}
            </div>
          )}

          <Field form={werkzeugForm} name="werkzeug">
            <EntitySelectStep
              {...werkzeuge.select}
              avatar="none"
              {...werkzeugForm.records('werkzeug', werkzeuge.labelOf)}
              emptyText={tx('Keine verfügbaren Werkzeuge. Bitte zuerst den Status prüfen.')}
              create={false}
            />
          </Field>

          <StepNav
            onNext={() => werkzeugForm.validate(['werkzeug'])}
            nextStepLabel={tx('Ausgabedatum')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3 — Ausgabedatum bestätigen */}
      <WizardStep
        label={tx('Ausgabedatum')}
        description={tx('Wann werden die Werkzeuge ausgegeben und wann erwartest du sie zurück?')}
        needs={['werkzeug']}
      >
        <div className="space-y-4">
          <Bound form={ausgabeForm} name="ausgabe" />
          <Bound
            form={ausgabeForm}
            name="rueckgabe_geplant"
            hint={tx('Optional — wann sollen die Werkzeuge zurückgebracht werden?')}
          />
          <StepNav
            onNext={() => ausgabeForm.validate(['ausgabe'])}
            nextStepLabel={tx('Zusammenfassung')}
          />
        </div>
      </WizardStep>

      {/* Schritt 4 — Zusammenfassung */}
      <WizardStep label={tx('Zusammenfassung')}>
        {!submit.done && (
          <SummaryStep
            forms={[mitarbeiterForm, werkzeugForm, ausgabeForm]}
            submit={submit}
            items={[
              {
                key: '_werkzeug_count',
                label: tx('Anzahl Werkzeuge'),
                value: String(selectedWerkzeugIds.length),
              },
              {
                key: '_mitarbeiter_name',
                label: tx('Mitarbeiter'),
                value: mitarbeiterLabel,
                step: 1,
                keys: ['mitarbeiter'],
              },
              ...selectedWerkzeugIds.map((id, idx) => ({
                key: `_werkzeug_${idx}`,
                label: tx('Werkzeug'),
                value: [
                  werkzeuge.labelOf(id),
                  werkzeuge.recordOf(id) ? fieldText(werkzeuge.recordOf(id)!, 'inventarnummer') : undefined,
                ].filter(Boolean).join(' · '),
                step: 2,
              })),
            ]}
            whatHappensNext={tx('Für jedes Werkzeug wird eine Ausleihe angelegt und der Status auf „Verliehen" gesetzt.')}
            confirmLabel={tx('Ausgabe bestätigen')}
          />
        )}
      </WizardStep>

      {/* Schritt 5 — Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[mitarbeiterForm, werkzeugForm, ausgabeForm]}
          title={tx('Werkzeuge ausgegeben')}
          whatHappensNext={tx('Bei der Rückgabe den Ablauf „Werkzeug zurücknehmen" nutzen.')}
          submit={submit}
          restartLabel={tx('Weitere Ausgabe')}
          next={[
            { label: tx('Rücknahme starten'), href: '#/intents/werkzeug-ruecknahme' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
