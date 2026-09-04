/**
 * Werkzeug ausgeben — 4-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen → 3) Ausgabedaten → 4) Prüfen & anlegen.
 * Reads: mitarbeiter, werkzeuge (nur status='verfuegbar'). Writes: ausleihen (createAusleihenEntry), werkzeuge (updateWerkzeugeEntry → status 'verliehen').
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, fieldNumber } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function WerkzeugAusgebenPage() {
  const data = useDashboardData({ omit: ['mitarbeiter', 'werkzeuge', 'ausleihen'] });

  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => r.fields?.aktiv === true,
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname') ?? ''} ${fieldText(m, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(m, 'personalnummer') ?? undefined,
    }),
  });

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => {
      const bestand = fieldNumber(w, 'bestand');
      return {
        id: w.id,
        title: fieldText(w, 'bezeichnung') ?? w.id,
        subtitle: fieldText(w, 'inventarnummer') ?? undefined,
        stats: bestand != null ? [{ label: tx('Bestand'), value: bestand }] : [],
      };
    },
  });

  const [step, setStep] = useState(1);

  const ausgabeForm = useStepForm('ausleihen', {
    steps: { mitarbeiter: 1, werkzeug: 2, ausgabe: 3, rueckgabe_geplant: 3 },
    initial: { ausgabe: format(new Date(), "yyyy-MM-dd'T'HH:mm") },
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'ausleihe',
        entity: 'ausleihen',
        form: ausgabeForm,
        primary: true,
      },
      {
        key: 'werkzeug_status',
        needs: ['ausleihe'],
        run: async () => {
          const werkzeugId = ausgabeForm.get('werkzeug') as string | undefined;
          if (!werkzeugId) return;
          return LivingAppsService.updateWerkzeugeEntry(werkzeugId, { status: 'verliehen' });
        },
      },
    ],
    { draftKey: 'werkzeug-ausgeben' }
  );

  const restart = () => {
    submit.reset();
    ausgabeForm.reset();
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[ausgabeForm]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Werkzeug an einen Mitarbeiter ausgeben und als verliehen markieren.'),
        needs: [tx('Mitarbeiter'), tx('Verfügbares Werkzeug')],
      }}
    >
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Den Mitarbeiter wählen, der das Werkzeug erhält.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={ausgabeForm.get('mitarbeiter') as string | undefined}
          onSelect={id => {
            ausgabeForm.set('mitarbeiter', id, mitarbeiter.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Keine aktiven Mitarbeiter gefunden.')}
          searchPlaceholder={tx('Mitarbeiter suchen …')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Nur verfügbare Werkzeuge werden angezeigt.')}
      >
        {ausgabeForm.get('mitarbeiter') ? (
          <EntitySelectStep
            {...werkzeuge.select}
            selectedId={ausgabeForm.get('werkzeug') as string | undefined}
            onSelect={id => {
              ausgabeForm.set('werkzeug', id, werkzeuge.labelOf(id));
              setStep(3);
            }}
            emptyText={tx('Alle Werkzeuge sind derzeit verliehen oder nicht verfügbar.')}
            searchPlaceholder={tx('Werkzeug suchen …')}
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

      <WizardStep
        label={tx('Ausgabedaten')}
        description={tx('Ausgabezeitpunkt und geplante Rückgabe festhalten.')}
      >
        {ausgabeForm.get('werkzeug') ? (
          <div className="space-y-4">
            <Bound form={ausgabeForm} name="ausgabe" />
            <Bound form={ausgabeForm} name="rueckgabe_geplant" />
            <StepNav
              onNext={() => ausgabeForm.validate(['ausgabe'])}
              nextStepLabel={tx('Prüfen')}
              onBack={() => setStep(2)}
            />
          </div>
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            nextDisabled
          >
            {tx('Bitte zuerst ein Werkzeug in Schritt 2 wählen.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[ausgabeForm]}
            submit={submit}
            whatHappensNext={tx('Das Werkzeug wird auf "Verliehen" gesetzt und der Ausleihe-Datensatz angelegt.')}
          />
        )}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[ausgabeForm]}
            next={[
              { label: tx('Weiteres Werkzeug ausgeben'), onClick: restart },
              { label: tx('Zum Dashboard'), href: '#/' },
            ]}
            whatHappensNext={tx('Bei der Rückgabe den Ablauf „Werkzeug zurücknehmen" nutzen.')}
          />
        )}
      </WizardStep>
    </IntentWizardShell>
  );
}
