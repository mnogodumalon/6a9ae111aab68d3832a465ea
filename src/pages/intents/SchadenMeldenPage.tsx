/**
 * Schaden melden — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Schaden erfassen → 3) Prüfen & anlegen.
 * Reads: werkzeuge (via useRecordSearch, kein Filter — alle Werkzeuge können beschädigt sein).
 * Writes: schaeden (createSchaedenEntry), werkzeuge (updateWerkzeugeEntry → status: 'defekt').
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep, StatusBadge.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, todayIso } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function SchadenMeldenPage() {
  const data = useDashboardData({ omit: ['werkzeuge', 'schaeden'] });
  const [step, setStep] = useState(1);

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? w.id,
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  const schadensForm = useStepForm('schaeden', {
    fields: ['gemeldet_am', 'beschreibung'],
    initial: { gemeldet_am: todayIso() },
  });

  const selectedWerkzeugId = schadensForm.get('_werkzeugId') as string | undefined;
  const selectedWerkzeugName = schadensForm.get('_werkzeugName') as string | undefined;

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'schaden',
      entity: 'schaeden',
      form: schadensForm,
      primary: true,
      values: {
        werkzeug: selectedWerkzeugId ?? '',
      },
    },
    {
      key: 'status_update',
      needs: ['schaden'],
      run: async () => {
        if (!selectedWerkzeugId) return;
        await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, { status: 'defekt' });
      },
    },
  ], { draftKey: 'schaden-melden' });

  const restart = () => {
    submit.reset();
    schadensForm.reset();
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[schadensForm]}
      draftKey="schaden-melden"
      intro={{
        description: tx('Ein beschädigtes Werkzeug erfassen und als defekt markieren.'),
        needs: [tx('Werkzeugbezeichnung oder Inventarnummer'), tx('Kurze Schadensbeschreibung')],
      }}
    >
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Das beschädigte Werkzeug auswählen — auch verliehene Werkzeuge können gemeldet werden.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={selectedWerkzeugId}
          onSelect={id => {
            const rec = werkzeuge.recordOf(id);
            schadensForm.set('_werkzeugId', id);
            schadensForm.set('_werkzeugName', werkzeuge.labelOf(id));
            schadensForm.set('_werkzeugStatus', rec ? (fieldLookup(rec, 'status')?.key ?? '') : '');
            setStep(2);
          }}
          searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Schaden')}
        description={tx('Meldedatum und Schadensbeschreibung eingeben.')}
      >
        {!selectedWerkzeugId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst ein Werkzeug auswählen.')}
          </StepNav>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary px-4 py-3 text-sm flex items-center gap-3">
              <span className="font-medium text-foreground truncate min-w-0">{selectedWerkzeugName}</span>
              {(() => {
                const rec = werkzeuge.recordOf(selectedWerkzeugId);
                const s = rec ? fieldLookup(rec, 'status') : null;
                return s ? <StatusBadge statusKey={s.key} label={s.label} /> : null;
              })()}
            </div>
            <Bound form={schadensForm} name="gemeldet_am" />
            <Bound form={schadensForm} name="beschreibung" rows={4} placeholder={tx('Was ist beschädigt? Wie kam es dazu?')} />
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => schadensForm.validate(['gemeldet_am'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schadensForm]}
            submit={submit}
            items={[
              {
                key: '_werkzeugId',
                label: tx('Werkzeug'),
                value: selectedWerkzeugName ?? '—',
                step: 1,
                keys: ['_werkzeugId'],
                fieldId: '_werkzeugId',
              },
            ]}
            whatHappensNext={tx('Der Schaden wird erfasst und das Werkzeug sofort als defekt markiert.')}
            confirmLabel={tx('Schaden melden')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schadensForm]}
          title={tx('Schaden erfasst')}
          whatHappensNext={tx('Das Werkzeug ist jetzt als defekt markiert und kann erst wieder ausgeliehen werden, wenn es repariert oder ausgetauscht wurde.')}
          facts={[
            { label: tx('Werkzeug'), value: selectedWerkzeugName ?? '—' },
          ]}
          next={[
            { label: tx('Weiteren Schaden melden'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          actions={{ copy: false, print: false }}
        />
      )}
    </IntentWizardShell>
  );
}
