import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, useJourneySubmit, todayIso } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { tx } from '@/i18n';
import { IconTool } from '@tabler/icons-react';

interface WerkzeugRecord {
  id: string;
  bezeichnung: string;
  inventarnummer: string;
  statusKey: string;
  statusLabel: string;
}

const STATUS_LABELS: Record<string, string> = {
  verfuegbar: 'Verfügbar', /* i18n-exempt */
  verliehen: 'Verliehen', /* i18n-exempt */
  defekt: 'Defekt', /* i18n-exempt */
  in_wartung: 'In Wartung', /* i18n-exempt */
};

export default function SchadenMelden() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [werkzeuge, setWerkzeuge] = useState<WerkzeugRecord[]>([]);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig('schaden-melden').then(c => {
      if (!c) { setLoading(false); return; }
      const p = c.pages['schaden-melden'] ?? null;
      setCfg(c);
      setPage(p);
      if (!p) { setLoading(false); return; }
      const ep = p.endpoints?.find(e => e.op === 'list' && e.entity === 'werkzeuge');
      const appId = ep?.app_id ?? p.app_id;
      listPublicRecords(c, p, { appId, limit: 500 })
        .then(map => {
          const rows = Object.values(map).map(r => {
            const statusKey = (r.fields.status as { key?: string } | string | null)
              ? (typeof r.fields.status === 'object' && r.fields.status !== null
                  ? ((r.fields.status as { key?: string }).key ?? '')
                  : String(r.fields.status ?? ''))
              : '';
            return {
              id: r.id,
              bezeichnung: (r.fields.bezeichnung as string) ?? '',
              inventarnummer: (r.fields.inventarnummer as string) ?? '',
              statusKey,
              statusLabel: STATUS_LABELS[statusKey] ?? statusKey,
            };
          });
          rows.sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung));
          setWerkzeuge(rows);
        })
        .catch(() => {/* Fehler beim Laden — leere Liste zeigen */})
        .finally(() => setLoading(false));
    });
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const schaden = useStepForm('schaeden', {
    fields: ['werkzeug', 'gemeldet_am', 'beschreibung'],
    required: { werkzeug: true, gemeldet_am: true, beschreibung: false },
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port!,
    [{ key: 'schaden', entity: 'schaeden', form: schaden, primary: true }],
    { draftKey: 'schaden-melden' },
  );

  const restart = () => {
    submit.reset();
    schaden.reset();
    setStep(1);
  };

  const selectItems: SelectItem[] = werkzeuge.map(w => ({
    id: w.id,
    title: w.bezeichnung,
    subtitle: w.inventarnummer ? tx`Nr. ${w.inventarnummer}` : undefined,
    status: { key: w.statusKey, label: w.statusLabel },
    icon: <IconTool size={16} />,
  }));

  const selectedWerkzeugId = schaden.get('werkzeug') as string | null;

  const handleWerkzeugSelect = (id: string) => {
    const w = werkzeuge.find(r => r.id === id);
    schaden.set('werkzeug', id, w?.bezeichnung ?? id);
    if (cfg && page) {
      const ep = page.endpoints?.find(e => e.op === 'create');
      if (ep) prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
    }
  };

  if (loading) {
    return <PublicShell loading />;
  }

  if (!cfg || !page || !port) {
    return <PublicShell unavailable />;
  }

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Schaden an einem Werkzeug ohne Anmeldung melden')}
    >
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[schaden]}
        draftKey="schaden-melden"
      >
        <WizardStep
          label={tx('Werkzeug')}
          description={tx('Welches Werkzeug ist beschaedigt?')}
        >
          <Field form={schaden} name="werkzeug">
            <EntitySelectStep
              {...schaden.record('werkzeug')}
              items={selectItems}
              onSelect={handleWerkzeugSelect}
              selectedId={selectedWerkzeugId}
              avatar="none"
              searchPlaceholder={tx('Werkzeug suchen...')}
              emptyText={tx('Keine Werkzeuge gefunden')}
              create={false}
            />
          </Field>
          <StepNav
            onNext={() => schaden.validate(['werkzeug'])}
            nextStepLabel={tx('Details')}
          />
        </WizardStep>

        <WizardStep
          label={tx('Details')}
          description={tx('Beschreibung und Datum des Schadens')}
        >
          <div className="space-y-5">
            <Bound form={schaden} name="gemeldet_am" />
            <Bound form={schaden} name="beschreibung" hint={tx('Was ist beschaedigt? Wie ist es passiert?')} rows={4} placeholder={tx('Beschreibung des Schadens...')} />
          </div>
          <StepNav
            onNext={() => schaden.validate(['gemeldet_am'])}
            nextStepLabel={tx('Pruefen')}
          />
        </WizardStep>

        <WizardStep label={tx('Pruefen')}>
          {!submit.result && (
            <SummaryStep
              forms={[schaden]}
              submit={submit}
              whatHappensNext={tx('Der Schaden wird im System eingetragen und kann vom Team bearbeitet werden.')}
              confirmLabel={tx('Schaden melden')}
            />
          )}
          {submit.result && (
            <SuccessStep
              result={submit.result}
              forms={[schaden]}
              title={tx('Schaden gemeldet')}
              whatHappensNext={tx('Vielen Dank. Der gemeldete Schaden wurde gespeichert.')}
              next={[
                { label: tx('Weiteren Schaden melden'), onClick: restart },
              ]}
            />
          )}
        </WizardStep>
      </IntentWizardShell>
    </PublicShell>
  );
}
