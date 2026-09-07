/**
 * Werkzeug zurücknehmen — 4-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe erfassen → 3) Prüfen & bestätigen → 4) Ergebnis.
 * Reads: ausleihen (offen), werkzeuge. Writes: ausleihen (update rueckgabe_erfolgt + zustand),
 *        werkzeuge (update status), wartungen (create wenn beschädigt/verloren).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldRef,
  fieldDate,
  nowIso,
  todayIso,
  optionsOf,
  type JourneyRecord,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugZuruecknehmePage() {
  const [step, setStep] = useState(1);
  const [pickedAusleihe, setPickedAusleihe] = useState<JourneyRecord | null>(null);
  const [pickedWerkzeugName, setPickedWerkzeugName] = useState('');
  const [pickedMitarbeiterName, setPickedMitarbeiterName] = useState('');

  // Nur offene Ausleihen (rueckgabe_erfolgt ist leer)
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    searchFields: [],
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => !fieldDate(r, 'rueckgabe_erfolgt'),
    toItem: (a, ctx) => {
      const ausgabe = fieldDate(a, 'ausgabe');
      return {
        id: a.id,
        title: ctx.ref('werkzeug') ?? tx('Unbekanntes Werkzeug'),
        subtitle: ctx.ref('mitarbeiter'),
        stats: ausgabe ? [{ label: tx('Ausgabe'), value: ausgabe }] : [],
      };
    },
  });

  // Formular für Rückgabe-Felder
  const f = useStepForm('ausleihen', {
    fields: ['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'],
    steps: {
      rueckgabe_erfolgt: 2,
      zustand_bei_rueckgabe: 2,
    },
    initial: {
      rueckgabe_erfolgt: nowIso(),
    },
  });

  const ausleiheId = pickedAusleihe?.id ?? '';
  const werkzeugId = pickedAusleihe ? (fieldRef(pickedAusleihe, 'werkzeug') ?? null) : null;
  const zustandKey = f.get('zustand_bei_rueckgabe') as string | null;
  const wartungAngelegt = zustandKey === 'beschaedigt' || zustandKey === 'verloren';
  const neuerStatus = wartungAngelegt ? tx('defekt') : tx('verfügbar');

  // Plan: Ausleihe aktualisieren + Werkzeug-Status setzen + ggf. Wartung anlegen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      updates: ausleiheId,
      primary: true,
      verb: 'update',
      values: () => ({
        rueckgabe_erfolgt: f.get('rueckgabe_erfolgt'),
        zustand_bei_rueckgabe: f.get('zustand_bei_rueckgabe'),
      }),
    },
    {
      key: 'werkzeug_status',
      entity: 'werkzeuge',
      updates: () => werkzeugId ?? undefined,
      verb: 'update',
      needs: ['ausleihe'],
      values: () => ({
        status: zustandKey === 'einwandfrei' || zustandKey === 'gebrauchsspuren'
          ? 'verfuegbar'
          : 'defekt',
      }),
    },
    {
      key: 'wartung',
      needs: ['ausleihe', 'werkzeug_status'],
      run: async () => {
        if (zustandKey !== 'beschaedigt' && zustandKey !== 'verloren') return;
        const zustandLabel =
          optionsOf('ausleihen', 'zustand_bei_rueckgabe').find(o => o.key === zustandKey)?.label
          ?? zustandKey ?? '';
        return await servicePort.create('wartungen', {
          datum: todayIso(),
          werkzeug: werkzeugId,
          beschreibung: tx`Automatisch aus Rückgabe erstellt — Zustand: ${zustandLabel}`,
          erledigt: false,
        });
      },
    },
  ], { draftKey: 'werkzeug-zuruecknehmen' });

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      subtitle={tx('Rückgabe erfassen und Zustand notieren')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="werkzeug-zuruecknehmen"
      intro={{
        description: tx('Ein zurückgegebenes Werkzeug erfassen — Zustand notieren und Status automatisch aktualisieren.'),
        needs: [tx('Die offene Ausleihe'), tx('Zustand des Werkzeugs')],
      }}
    >
      {/* Schritt 1: Offene Ausleihe wählen */}
      <WizardStep
        label={tx('Ausleihe wählen')}
        description={tx('Wähle die Ausleihe, die zurückgegeben wird.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          avatar="none"
          selectedId={pickedAusleihe?.id}
          emptyText={tx('Keine offenen Ausleihen gefunden — alle Werkzeuge sind bereits zurückgegeben.')}
          create={false}
          searchPlaceholder={tx('Ausleihen durchsuchen …')}
          onSelect={(id) => {
            const rec = ausleihen.recordOf(id);
            if (!rec) return;
            setPickedAusleihe(rec);
            setPickedWerkzeugName(ausleihen.refLabel(rec, 'werkzeug') ?? tx('Unbekanntes Werkzeug'));
            setPickedMitarbeiterName(ausleihen.refLabel(rec, 'mitarbeiter') ?? '');
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Rückgabe erfassen */}
      <WizardStep
        label={tx('Rückgabe erfassen')}
        description={tx('Rückgabezeitpunkt und Zustand des Werkzeugs festhalten.')}
      >
        {pickedAusleihe ? (
          <div className="space-y-5">
            <div className="rounded-lg bg-secondary px-4 py-3 text-sm">
              <span className="font-medium">{pickedWerkzeugName}</span>
              {pickedMitarbeiterName && (
                <span className="text-muted-foreground"> — {pickedMitarbeiterName}</span>
              )}
            </div>
            <Bound form={f} name="rueckgabe_erfolgt" label={tx('Rückgabezeitpunkt')} />
            <Field form={f} name="zustand_bei_rueckgabe">
              <ChoiceGroup
                {...f.choice('zustand_bei_rueckgabe')}
                options={optionsOf('ausleihen', 'zustand_bei_rueckgabe')}
              />
            </Field>
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => f.validate(['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Ausleihe auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.result && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={[
              { key: 'werkzeug_name', label: tx('Werkzeug'), value: pickedWerkzeugName },
              { key: 'mitarbeiter_name', label: tx('Mitarbeiter'), value: pickedMitarbeiterName },
              {
                key: 'neuer_status',
                label: tx('Neuer Werkzeug-Status'),
                value: wartungAngelegt
                  ? tx('defekt (Wartung wird angelegt)')
                  : tx('verfügbar'),
              },
            ]}
            whatHappensNext={
              wartungAngelegt
                ? tx('Das Werkzeug wird als defekt markiert und ein Wartungsauftrag wird automatisch angelegt.')
                : tx('Das Werkzeug wird sofort wieder als verfügbar markiert.')
            }
            confirmLabel={tx('Rückgabe bestätigen')}
          />
        )}
      </WizardStep>

      {/* Schritt 4: Ergebnis */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          title={tx('Werkzeug zurückgenommen')}
          verb="updated"
          actions={{ copy: false, print: false }}
          facts={[
            { label: tx('Werkzeug'), value: pickedWerkzeugName },
            { label: tx('Mitarbeiter'), value: pickedMitarbeiterName },
            { label: tx('Neuer Status'), value: neuerStatus },
            ...(wartungAngelegt
              ? [{ label: tx('Wartung'), value: tx('Wartungsauftrag angelegt') }]
              : []),
          ]}
          whatHappensNext={
            wartungAngelegt
              ? tx('Das Werkzeug ist als defekt erfasst. Die Wartung wurde automatisch angelegt.')
              : tx('Das Werkzeug steht wieder zur Ausgabe bereit.')
          }
          next={[
            {
              label: tx('Weitere Rückgabe'),
              onClick: () => {
                submit.reset();
                f.reset();
                setPickedAusleihe(null);
                setPickedWerkzeugName('');
                setPickedMitarbeiterName('');
                setStep(1);
              },
            },
            {
              label: tx('Werkzeug ausgeben'),
              href: '#/intents/werkzeug-ausgeben',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
