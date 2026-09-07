/**
 * Werkzeug zurücknehmen — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Zustand bei Rückgabe erfassen → 3) Prüfen & abschließen.
 * Reads: ausleihen (nur ohne rueckgabe_erfolgt).
 * Writes: ausleihen (update), werkzeuge (update status), wartungen (create, nur wenn beschädigt).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useStepForm, useJourneySubmit, useRecordSearch, todayIso } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { extractRecordId, createRecordUrl, LivingAppsService } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { tx } from '@/i18n';

export default function WerkzeugZuruecknehmenPage() {
  const [step, setStep] = useState(1);

  // ausleihen hat keine Stringfelder → searchFields: [] (filter hält die Liste klein)
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => r.fields['rueckgabe_erfolgt'] == null,
    searchFields: [],
    toItem: (a, ctx) => ({
      id: a.id,
      title: ctx.ref('werkzeug') ?? tx('Unbekanntes Werkzeug'),
      subtitle: ctx.ref('mitarbeiter') ?? undefined,
    }),
  });

  const step2Form = useStepForm('ausleihen', {
    fields: ['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'],
    initial: { rueckgabe_erfolgt: todayIso() },
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'rueckgabe',
        entity: 'ausleihen',
        form: step2Form,
        updates: () => step2Form.get('_ausleiheId') as string,
        primary: true,
        verb: 'update',
      },
      {
        key: 'werkzeugStatus',
        needs: ['rueckgabe'],
        run: async () => {
          const zustandKey = step2Form.get('zustand_bei_rueckgabe') as string;
          const werkzeugId = step2Form.get('_werkzeugId') as string;
          const status =
            zustandKey === 'beschaedigt' || zustandKey === 'verloren' ? 'defekt' : 'verfuegbar';
          await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status });
        },
      },
      {
        key: 'wartung',
        needs: ['werkzeugStatus'],
        run: async () => {
          const zustandKey = step2Form.get('zustand_bei_rueckgabe') as string;
          if (zustandKey !== 'beschaedigt') return;
          const werkzeugId = step2Form.get('_werkzeugId') as string;
          await LivingAppsService.createWartungenEntry({
            werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
            datum: format(new Date(), 'yyyy-MM-dd'),
            beschreibung: tx('Schaden bei Rückgabe festgestellt'),
            erledigt: false,
          });
        },
      },
    ],
    { draftKey: 'werkzeug-zuruecknehmen' },
  );

  const zustandKey = step2Form.get('zustand_bei_rueckgabe') as string | undefined;

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[step2Form]}
      draftKey="werkzeug-zuruecknehmen"
      intro={{
        description: tx('Eine offene Ausleihe abschließen und den Zustand des Werkzeugs festhalten.'),
        needs: [tx('Ausgeliehenes Werkzeug'), tx('Zustand bei Rückgabe')],
      }}
    >
      <WizardStep
        label={tx('Ausleihe wählen')}
        description={tx('Nur offene Ausleihen ohne Rückgabedatum werden angezeigt.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          emptyText={tx('Keine offenen Ausleihen vorhanden.')}
          create={false}
          selectedId={step2Form.get('_ausleiheId') as string | undefined}
          onSelect={id => {
            const rec = ausleihen.recordOf(id);
            const werkzeugId = rec ? (extractRecordId(rec.fields['werkzeug']) ?? '') : '';
            step2Form.set('_ausleiheId', id, ausleihen.labelOf(id));
            step2Form.set('_werkzeugId', werkzeugId);
            setStep(2);
          }}
        />
      </WizardStep>

      <WizardStep
        label={tx('Zustand erfassen')}
        description={tx('Rückgabezeitpunkt und Zustand des Werkzeugs dokumentieren.')}
        needs={['_ausleiheId']}
      >
        <div className="space-y-4">
          <Bound form={step2Form} name="rueckgabe_erfolgt" />
          <Bound form={step2Form} name="zustand_bei_rueckgabe" />
          {(zustandKey === 'beschaedigt' || zustandKey === 'verloren') && (
            <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-foreground">
              {zustandKey === 'beschaedigt'
                ? tx('Das Werkzeug wird als defekt markiert und ein Wartungseintrag wird angelegt.')
                : tx('Das Werkzeug wird als defekt markiert.')}
            </div>
          )}
          <StepNav
            onNext={() => step2Form.validate(['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[step2Form]}
            submit={submit}
            whatHappensNext={tx(
              'Die Ausleihe wird abgeschlossen. Bei Beschädigung wird außerdem ein Wartungseintrag angelegt.',
            )}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[step2Form]}
          submit={submit}
          next={[
            {
              label: tx('Weitere Rücknahme'),
              onClick: () => {
                submit.reset();
                step2Form.reset();
                setStep(1);
              },
            },
            { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Das Werkzeug ist nun wieder verfügbar oder als defekt markiert.')}
        />
      )}
    </IntentWizardShell>
  );
}
