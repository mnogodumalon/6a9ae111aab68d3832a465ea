/**
 * Werkzeug zurücknehmen — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe erfassen → 3) Prüfen & abschließen.
 * Reads: ausleihen (nur offene, ohne rueckgabe_erfolgt).
 * Writes: ausleihen (update: rueckgabe_erfolgt, zustand_bei_rueckgabe),
 *         werkzeuge (update: status → verfuegbar oder defekt),
 *         wartungen (create: wenn beschaedigt oder verloren).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Field, ChoiceGroup,
 *           Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldRef,
  fieldDate,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugZuruecknahmenPage() {
  const [step, setStep] = useState(1);
  const [ausleihenId, setAusleihenId] = useState<string | undefined>();
  const [werkzeugId, setWerkzeugId] = useState<string | undefined>();

  // Nur offene Ausleihen (ohne rueckgabe_erfolgt)
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => !fieldDate(r, 'rueckgabe_erfolgt'),
    searchFields: [],
    toItem: (a, ctx) => ({
      id: a.id,
      title: ctx.ref('werkzeug') ?? tx('Unbekanntes Werkzeug'),
      subtitle: ctx.ref('mitarbeiter') ?? undefined,
      stats: fieldDate(a, 'ausgabe')
        ? [{ label: tx('Ausgabe'), value: fieldDate(a, 'ausgabe')! }]
        : [],
    }),
  });

  // Schritt 2: Rückgabe erfassen
  const rueckgabe = useStepForm('ausleihen', {
    steps: {
      rueckgabe_erfolgt: 2,
      zustand_bei_rueckgabe: 2,
    },
    initial: {
      rueckgabe_erfolgt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    },
  });

  const zustand = rueckgabe.get('zustand_bei_rueckgabe') as string | undefined;
  const istBeschaedigt = zustand === 'beschaedigt' || zustand === 'verloren';

  // Plan: Ausleihe aktualisieren + Werkzeug-Status + ggf. Wartung anlegen
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'ausleihe',
        entity: 'ausleihen',
        form: rueckgabe,
        updates: () => ausleihenId,
        primary: true,
        verb: 'update',
      },
      {
        // Werkzeug-Status auf 'verfuegbar' setzen (einwandfrei/gebrauchsspuren)
        key: 'werkzeug_status',
        run: async () => {
          if (!werkzeugId) return;
          const z = rueckgabe.get('zustand_bei_rueckgabe') as string | undefined;
          const neuerStatus = (z === 'beschaedigt' || z === 'verloren') ? 'defekt' : 'verfuegbar';
          return await servicePort.update('werkzeuge', werkzeugId, { status: neuerStatus });
        },
        needs: ['ausleihe'],
        verb: 'update',
      },
      {
        // Wartungseintrag nur bei Schaden oder Verlust
        key: 'wartung',
        run: async () => {
          const z = rueckgabe.get('zustand_bei_rueckgabe') as string | undefined;
          if (z !== 'beschaedigt' && z !== 'verloren') return;
          if (!werkzeugId) return;
          return await servicePort.create('wartungen', {
            datum: todayIso(),
            beschreibung: 'Rückgabe: beschädigt/verloren',
            werkzeug: werkzeugId,
          });
        },
        needs: ['ausleihe'],
      },
    ],
    { draftKey: 'werkzeug-zuruecknehmen' },
  );

  const restart = () => {
    submit.reset();
    rueckgabe.reset();
    setAusleihenId(undefined);
    setWerkzeugId(undefined);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[rueckgabe]}
      draftKey="werkzeug-zuruecknehmen"
      intro={{
        description: tx('Eine offene Ausleihe abschließen und den Zustand des Werkzeugs festhalten.'),
        needs: [tx('Werkzeugbezeichnung oder Mitarbeitername')],
      }}
    >
      {/* Schritt 1: Offene Ausleihe wählen */}
      <WizardStep
        label={tx('Ausleihe')}
        description={tx('Offene Ausleihe auswählen — nur Werkzeuge ohne Rückgabedatum werden angezeigt.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          selectedId={ausleihenId}
          emptyText={tx('Keine offenen Ausleihen vorhanden. Alle Werkzeuge wurden bereits zurückgegeben.')}
          onSelect={(id) => {
            setAusleihenId(id);
            const rec = ausleihen.recordOf(id);
            if (rec) {
              setWerkzeugId(fieldRef(rec, 'werkzeug') ?? undefined);
            }
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Rückgabe erfassen */}
      <WizardStep
        label={tx('Rückgabe')}
        description={tx('Rückgabedatum und Zustand des Werkzeugs bei Rückgabe erfassen.')}
      >
        {ausleihenId ? (
          <div className="space-y-6">
            <Bound
              form={rueckgabe}
              name="rueckgabe_erfolgt"
              label={tx('Rückgabe erfolgt am')}
            />
            <Field form={rueckgabe} name="zustand_bei_rueckgabe">
              <ChoiceGroup {...rueckgabe.choice('zustand_bei_rueckgabe')} />
            </Field>
            <StepNav
              onNext={() => rueckgabe.validate(['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Ausleihe in Schritt 1 auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Prüfen & abschließen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[rueckgabe]}
            submit={submit}
            items={[
              {
                key: '_ausleihe',
                label: tx('Ausleihe'),
                value: ausleihenId
                  ? (ausleihen.labelOf(ausleihenId) ?? tx('Ausgewählte Ausleihe'))
                  : '—',
              },
            ]}
            whatHappensNext={
              istBeschaedigt
                ? tx('Das Werkzeug wird auf „Defekt" gesetzt und ein Wartungseintrag angelegt.')
                : tx('Das Werkzeug wird wieder als verfügbar markiert.')
            }
            confirmLabel={tx('Rückgabe abschließen')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[rueckgabe]}
          next={[
            { label: tx('Weitere Rücknahme'), onClick: restart },
            { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Der Ausleihvorgang ist abgeschlossen. Bei Schäden wurde ein Wartungseintrag angelegt.')}
        />
      )}
    </IntentWizardShell>
  );
}
