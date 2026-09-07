/**
 * Werkzeug zurückgeben — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur offene, ohne rueckgabe_erfolgt) →
 *         2) Rückgabe erfassen (Datum + Zustand) →
 *         3) Prüfen & abschliessen.
 * Reads: ausleihen. Writes: ausleihen (updateAusleihenEntry), werkzeuge (updateWerkzeugeEntry),
 *        wartungen (createWartungenEntry, nur bei Schaden).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep, ChoiceGroup.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Field } from '@/components/blocks/Field';
import { DatePicker } from '@/components/DatePicker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
  fieldLookup,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { tx } from '@/i18n';
import { format } from 'date-fns';

export default function WerkzeugZurueckgebenPage() {
  const [step, setStep] = useState(1);
  const data = useDashboardData({ omit: ['ausleihen'] });

  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    searchFields: [],
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => !r.fields['rueckgabe_erfolgt'],
    toItem: r => ({
      id: r.id,
      title: tx`Ausleihe vom ${r.fields['ausgabe'] ? formatDate(r.fields['ausgabe'] as string) : '—'}`,
      subtitle: '',
    }),
  });

  const ausleiheForm = useStepForm('ausleihen', {
    steps: { werkzeug: 1 },
  });

  const rueckgabeForm = useStepForm('ausleihen', {
    steps: { rueckgabe_erfolgt: 2, zustand_bei_rueckgabe: 2 },
    initial: { rueckgabe_erfolgt: todayIso() },
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'rueckgabe',
        run: async ({ done: _done }) => {
          const ausleiheId = ausleiheForm.get('werkzeug') as string;
          const zustandKey = (rueckgabeForm.get('zustand_bei_rueckgabe') as string) ?? 'einwandfrei';
          const rueckgabeDatum = rueckgabeForm.get('rueckgabe_erfolgt') as string;

          const result = await LivingAppsService.updateAusleihenEntry(ausleiheId, {
            rueckgabe_erfolgt: rueckgabeDatum,
            zustand_bei_rueckgabe: zustandKey,
          });

          const selectedRecord = ausleihen.recordOf(ausleiheId);
          if (selectedRecord) {
            const werkzeugRef = selectedRecord.fields['werkzeug'] as string | undefined;
            const werkzeugId = werkzeugRef ? extractRecordId(werkzeugRef) : null;
            if (werkzeugId) {
              const neuerStatus =
                zustandKey === 'beschaedigt' || zustandKey === 'verloren'
                  ? 'defekt'
                  : 'verfuegbar';
              await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: neuerStatus });

              if (zustandKey === 'beschaedigt') {
                const zustandLabel =
                  fieldLookup(selectedRecord, 'zustand_bei_rueckgabe')?.label ?? zustandKey;
                await LivingAppsService.createWartungenEntry({
                  werkzeug: werkzeugRef as string,
                  datum: format(new Date(), 'yyyy-MM-dd'),
                  beschreibung: tx`Automatisch aus Rückgabe: ${zustandLabel}`,
                });
              }
            }
          }

          return result;
        },
      },
    ],
    { draftKey: 'werkzeug-zurueckgeben' }
  );

  const restart = () => {
    submit.reset();
    ausleiheForm.reset();
    rueckgabeForm.reset();
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[ausleiheForm, rueckgabeForm]}
      draftKey="werkzeug-zurueckgeben"
      intro={{
        description: tx('Eine offene Ausleihe abschliessen und den Zustand des Werkzeugs erfassen.'),
        needs: [tx('Offene Ausleihe'), tx('Zustand des Werkzeugs')],
      }}
    >
      <WizardStep
        label={tx('Ausleihe wählen')}
        description={tx('Offene Ausleihe auswählen — nur noch nicht zurückgegebene Ausleihen werden angezeigt.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          selectedId={ausleiheForm.get('werkzeug') as string}
          onSelect={id => {
            ausleiheForm.set('werkzeug', id, ausleihen.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Keine offenen Ausleihen gefunden.')}
          create={false}
          searchPlaceholder={tx('Ausleihe suchen …')}
        />
        <StepNav
          hideBack
          onNext={() => ausleiheForm.validate(['werkzeug'])}
          nextStepLabel={tx('Rückgabe erfassen')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Rückgabe')}
        description={tx('Rückgabedatum und Zustand des Werkzeugs festhalten.')}
      >
        <div className="space-y-4">
          <Field form={rueckgabeForm} name="rueckgabe_erfolgt">
            <DatePicker {...rueckgabeForm.date('rueckgabe_erfolgt')} />
          </Field>
          <Field form={rueckgabeForm} name="zustand_bei_rueckgabe">
            <ChoiceGroup {...rueckgabeForm.choice('zustand_bei_rueckgabe')} />
          </Field>
          <StepNav
            onNext={() => rueckgabeForm.validate(['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[ausleiheForm, rueckgabeForm]}
            submit={submit}
            whatHappensNext={tx('Die Ausleihe wird als zurückgegeben markiert und der Werkzeug-Status aktualisiert.')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[ausleiheForm, rueckgabeForm]}
          next={[
            { label: tx('Weitere Rückgabe'), onClick: restart },
            { label: tx('Neue Ausleihe'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Der Werkzeug-Status wurde aktualisiert. Bei Schäden wurde automatisch ein Wartungseintrag angelegt.')}
        />
      )}
    </IntentWizardShell>
  );
}
