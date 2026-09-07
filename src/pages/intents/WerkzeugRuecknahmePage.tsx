/**
 * Werkzeug Rücknahme — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur offene, ohne Rückgabedatum) →
 *        2) Zustand erfassen (Rückgabedatum + Zustandsbewertung) →
 *        3) Zusammenfassung & Abschliessen.
 * Reads: ausleihen (gefiltert: rueckgabe_erfolgt = null).
 * Writes: ausleihen (update: rueckgabe_erfolgt, zustand_bei_rueckgabe),
 *         werkzeuge (update: status → verfuegbar oder in_wartung).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup,
 *           Field, DatePicker, StepNav, SummaryStep, SuccessStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { DatePicker } from '@/components/DatePicker';
import {
  useRecordSearch,
  useStepForm,
  useJourneySubmit,
  fieldRef,
  fieldDate,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { formatDate } from '@/lib/formatters';

export default function WerkzeugRuecknahmePage() {
  const [step, setStep] = useState(1);
  // Local state for the selected loan — we need the full record to derive werkzeugId
  const [ausleiheId, setAusleiheId] = useState<string | undefined>();
  const [ausleiheWerkzeugName, setAusleiheWerkzeugName] = useState<string>('');
  const [ausleiheWerkzeugId, setAusleiheWerkzeugId] = useState<string | undefined>();
  const [ausleiheMitarbeiterName, setAusleiheMitarbeiterName] = useState<string>('');

  // Step 1: only open loans (no return date set yet)
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => !fieldDate(r, 'rueckgabe_erfolgt'),
    searchFields: [],
    toItem: (a, ctx) => ({
      id: a.id,
      title: ctx.ref('werkzeug') ?? tx('Unbekanntes Werkzeug'),
      subtitle: ctx.ref('mitarbeiter') ?? tx('Unbekannter Mitarbeiter'),
      stats: [
        {
          label: tx('Ausgabe'),
          value: fieldDate(a, 'ausgabe') ? formatDate(fieldDate(a, 'ausgabe')!) : tx('—'),
        },
      ],
    }),
  });

  // Step 2: capture return date and condition
  const ruecknahme = useStepForm('ausleihen', {
    fields: ['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'],
    steps: { rueckgabe_erfolgt: 2, zustand_bei_rueckgabe: 2 },
    initial: { rueckgabe_erfolgt: format(new Date(), "yyyy-MM-dd'T'HH:mm") },
  });

  // Derive new tool status from chosen condition
  const zustandKey = ruecknahme.get('zustand_bei_rueckgabe') as string | undefined;
  const neuerWerkzeugStatus =
    zustandKey === 'beschaedigt' || zustandKey === 'verloren' ? 'in_wartung' : 'verfuegbar';

  // Plan: update the loan, then update the tool status
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'ruecknahme',
        entity: 'ausleihen',
        form: ruecknahme,
        updates: ausleiheId ?? '',
        primary: true,
      },
      {
        key: 'werkzeugStatus',
        entity: 'werkzeuge',
        updates: ausleiheWerkzeugId ?? '',
        needs: ['ruecknahme'],
        values: { status: neuerWerkzeugStatus },
      },
    ],
    { draftKey: 'werkzeug-ruecknahme' },
  );

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[ruecknahme]}
      draftKey="werkzeug-ruecknahme"
      intro={{
        description: tx('Eine laufende Ausleihe abschliessen und den Werkzeugstatus aktualisieren.'),
        needs: [tx('Laufende Ausleihe'), tx('Zustand des Werkzeugs bei Rückgabe')],
      }}
    >
      {/* Step 1: Pick an open loan */}
      <WizardStep
        label={tx('Ausleihe')}
        description={tx('Offene Ausleihe auswählen — bereits zurückgegebene werden nicht angezeigt.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          selectedId={ausleiheId}
          onSelect={id => {
            const rec = ausleihen.recordOf(id);
            setAusleiheId(id);
            setAusleiheWerkzeugId(rec ? (fieldRef(rec, 'werkzeug') ?? undefined) : undefined);
            setAusleiheWerkzeugName(rec ? (ausleihen.refLabel(rec, 'werkzeug') ?? tx('Werkzeug')) : tx('Werkzeug'));
            setAusleiheMitarbeiterName(rec ? (ausleihen.refLabel(rec, 'mitarbeiter') ?? tx('Mitarbeiter')) : tx('Mitarbeiter'));
            setStep(2);
          }}
          emptyText={tx('Keine offenen Ausleihen vorhanden. Alle Werkzeuge wurden bereits zurückgegeben.')}
          create={false}
          searchPlaceholder={tx('Nach Werkzeug oder Mitarbeiter suchen …')}
        />
      </WizardStep>

      {/* Step 2: Return date + condition */}
      <WizardStep
        label={tx('Zustand')}
        description={tx('Rückgabezeitpunkt und Zustand des Werkzeugs festhalten.')}
      >
        {!ausleiheId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Ausleihe auswählen.')}
          </StepNav>
        ) : (
          <div className="space-y-6">
            {/* Context card: which tool / person */}
            <div className="rounded-xl border bg-card p-4 flex flex-wrap gap-3 text-sm">
              <span className="font-medium text-foreground">{ausleiheWerkzeugName}</span>
              <span className="text-muted-foreground">{tx('ausgeliehen von')}</span>
              <span className="text-foreground">{ausleiheMitarbeiterName}</span>
            </div>

            <Field form={ruecknahme} name="rueckgabe_erfolgt">
              <DatePicker {...ruecknahme.date('rueckgabe_erfolgt')} />
            </Field>

            <Field form={ruecknahme} name="zustand_bei_rueckgabe">
              <ChoiceGroup {...ruecknahme.choice('zustand_bei_rueckgabe')} />
            </Field>

            {/* Live preview of the resulting tool status */}
            {zustandKey && (
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-3 text-sm">
                <span className="text-muted-foreground">{tx('Werkzeug wird danach markiert als:')}</span>
                <StatusBadge
                  statusKey={neuerWerkzeugStatus}
                  label={neuerWerkzeugStatus === 'in_wartung' ? tx('In Wartung') : tx('Verfügbar')}
                  tone={neuerWerkzeugStatus === 'in_wartung' ? 'warning' : 'positive'}
                />
              </div>
            )}

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => ruecknahme.validate(['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        )}
      </WizardStep>

      {/* Step 3: Summary */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[ruecknahme]}
            submit={submit}
            whatHappensNext={
              neuerWerkzeugStatus === 'in_wartung'
                ? tx('Die Ausleihe wird abgeschlossen und das Werkzeug zur Wartung weitergeleitet.')
                : tx('Die Ausleihe wird abgeschlossen und das Werkzeug als verfügbar markiert.')
            }
            items={[
              {
                key: 'werkzeug',
                fieldId: 'werkzeug',
                label: tx('Werkzeug'),
                value: ausleiheWerkzeugName,
                keys: [],
              },
              {
                key: 'neuerStatus',
                fieldId: 'zustand_bei_rueckgabe',
                label: tx('Neuer Werkzeugstatus'),
                value: neuerWerkzeugStatus === 'in_wartung' ? tx('In Wartung') : tx('Verfügbar'),
                keys: ['zustand_bei_rueckgabe'],
              },
            ]}
          />
        )}
      </WizardStep>

      {/* Success screen */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[ruecknahme]}
          actions={{ copy: false, print: false }}
          whatHappensNext={
            neuerWerkzeugStatus === 'in_wartung'
              ? tx('Werkzeug wurde zur Wartung weitergeleitet.')
              : undefined
          }
          next={[
            {
              label: tx('Weitere Rücknahme'),
              href: '#/intents/werkzeug-ruecknahme',
            },
            {
              label: tx('Werkzeug ausgeben'),
              href: '#/intents/werkzeug-ausgeben',
            },
            {
              label: tx('Zum Dashboard'),
              href: '#/',
            },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
