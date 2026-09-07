/**
 * Werkzeug-Rücknahme — 4-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe-Details erfassen → 3) Prüfen & bestätigen → 4) Erfolgsmeldung.
 * Reads: ausleihen (nur offene), werkzeuge, mitarbeiter.
 * Writes: UPDATE ausleihen (rueckgabe_erfolgt, zustand_bei_rueckgabe); UPDATE werkzeuge (status).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldRef,
  nowIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugRuecknahmePage() {
  const [step, setStep] = useState(1);

  // Nur offene Ausleihen (kein rueckgabe_erfolgt) — EnrichedAusleihen via ctx.ref
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => !fieldText(r, 'rueckgabe_erfolgt'),
    searchFields: [],
    toItem: (r, ctx) => ({
      id: r.id,
      title: ctx.ref('werkzeug') ?? tx('Werkzeug unbekannt'),
      subtitle: ctx.ref('mitarbeiter'),
    }),
  });

  // Formular für die Rückgabe-Details
  const f = useStepForm('ausleihen', {
    fields: ['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'],
    steps: { rueckgabe_erfolgt: 2, zustand_bei_rueckgabe: 2 },
    initial: { rueckgabe_erfolgt: nowIso() },
  });

  // State für die gewählte Ausleihe
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  // Plan: UPDATE ausleihen + UPDATE werkzeuge-Status je nach Zustand
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ruecknahme',
      entity: 'ausleihen',
      form: f,
      updates: ausleiheId ?? '',
      primary: true,
      verb: 'update',
    },
    {
      key: 'werkzeugstatus',
      entity: 'werkzeuge',
      needs: ['ruecknahme'],
      updates: () => {
        const ausleihe = ausleihen.recordOf(ausleiheId ?? '');
        return ausleihe ? (fieldRef(ausleihe, 'werkzeug') ?? undefined) : undefined;
      },
      values: (_ctx) => {
        const zustand = f.get('zustand_bei_rueckgabe') as string | null;
        const verfuegbar = zustand === 'einwandfrei' || zustand === 'gebrauchsspuren';
        return { status: verfuegbar ? 'verfuegbar' : 'in_wartung' };
      },
      verb: 'update',
    },
  ], { draftKey: 'werkzeug-ruecknahme' });

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      subtitle={tx('Rückgabe einer offenen Ausleihe erfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="werkzeug-ruecknahme"
      intro={{
        description: tx('Eine offene Ausleihe abschließen und den Zustand des Werkzeugs festhalten.'),
        needs: [tx('Name des Mitarbeiters oder Werkzeugs')],
      }}
    >
      {/* Schritt 1: Offene Ausleihe wählen */}
      <WizardStep
        label={tx('Ausleihe wählen')}
        description={tx('Offene Ausleihe auswählen, für die das Werkzeug zurückgegeben wird.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          avatar="none"
          selectedId={ausleiheId}
          searchPlaceholder={tx('Werkzeug oder Mitarbeiter suchen …')}
          emptyText={tx('Keine offenen Ausleihen vorhanden — alle Werkzeuge sind bereits zurückgegeben.')}
          create={false}
          onSelect={(id) => {
            setAusleiheId(id);
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Rückgabe-Details */}
      <WizardStep
        label={tx('Rückgabe')}
        description={tx('Rückgabezeitpunkt und Zustand des Werkzeugs festhalten.')}
        needs={['rueckgabe_erfolgt', 'zustand_bei_rueckgabe']}
      >
        {ausleiheId ? (
          <div className="space-y-4">
            <Bound form={f} name="rueckgabe_erfolgt" />
            <Bound form={f} name="zustand_bei_rueckgabe" />
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
        {!submit.done && ausleiheId ? (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={[
              {
                key: 'ausleihe',
                label: tx('Ausleihe'),
                value: ausleihen.labelOf(ausleiheId) ?? ausleiheId,
                step: 1,
                keys: ['_ausleihe'],
              },
              {
                key: 'neuer_status',
                label: tx('Neuer Werkzeugstatus'),
                value: (() => {
                  const zustand = f.get('zustand_bei_rueckgabe') as string | null;
                  if (!zustand) return tx('—');
                  return zustand === 'einwandfrei' || zustand === 'gebrauchsspuren'
                    ? tx('Verfügbar')
                    : tx('In Wartung');
                })(),
              },
            ]}
            whatHappensNext={tx('Die Ausleihe wird als zurückgegeben markiert und der Werkzeugstatus entsprechend aktualisiert.')}
          />
        ) : !ausleiheId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        ) : null}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          verb="updated"
          actions={{ copy: false, print: false }}
          whatHappensNext={tx('Bei Schäden kann zusätzlich ein Schadensfall gemeldet werden.')}
          next={[
            { label: tx('Weitere Rücknahme'), onClick: () => { submit.reset(); f.reset({ rueckgabe_erfolgt: nowIso() }); setAusleiheId(null); setStep(1); } },
            { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Schaden melden'), href: '#/intents/schaden-melden-intern' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
