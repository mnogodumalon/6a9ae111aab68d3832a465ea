import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { Textarea } from '@/components/ui/textarea';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  todayIso,
  type JourneyRecord,
} from '@/lib/journey';
import { tx } from '@/i18n';
import { IconTool, IconAlertTriangle } from '@tabler/icons-react';

const SLUG = 'schaden-melden';

export default function SchadenMelden() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [werkzeuge, setWerkzeuge] = useState<JourneyRecord[]>([]);
  const [werkzeugeLoading, setWerkzeugeLoading] = useState(false);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);
  const [selectedWerkzeugLabel, setSelectedWerkzeugLabel] = useState<string>('');
  const [step, setStep] = useState(1);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  const schaden = useStepForm('schaeden', {
    fields: ['werkzeug', 'gemeldet_am', 'beschreibung'],
    required: { werkzeug: true, gemeldet_am: true, beschreibung: false },
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const nullPort = useMemo(() => ({
    door: 'public' as const,
    async list(): Promise<JourneyRecord[]> { return []; },
    async count(): Promise<null> { return null; },
    async get(): Promise<null> { return null; },
    async create(_entity: string, _payload: Record<string, unknown>): Promise<JourneyRecord> { throw new Error(tx('not ready')); },
    async update(_entity: string, _id: string, _payload: Record<string, unknown>): Promise<JourneyRecord> { throw new Error(tx('not ready')); },
    ref(_entity: string, _id: string): string { return ''; },
  }), []);

  const submit = useJourneySubmit(
    port ?? nullPort,
    [{ key: 'schaden', entity: 'schaeden', form: schaden, primary: true }],
    { draftKey: 'schaden-melden' },
  );

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoadingCfg(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) {
          setLoadingCfg(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!port) return;
    setWerkzeugeLoading(true);
    port
      .list('werkzeuge')
      .then(rows => setWerkzeuge(rows))
      .finally(() => setWerkzeugeLoading(false));
  }, [port]);

  const selectItems: SelectItem[] = werkzeuge.map(w => {
    const bezeichnung = (w.fields.bezeichnung as string) ?? '';
    const inventarnummer = (w.fields.inventarnummer as string) ?? '';
    const statusRaw = w.fields.status as { key?: string; label?: string } | null;
    const statusKey = statusRaw?.key ?? '';
    const statusLbl = statusRaw?.label ?? statusKey;
    return {
      id: w.id,
      title: bezeichnung,
      subtitle: inventarnummer ? tx`Nr. ${inventarnummer}` : undefined,
      status: statusKey ? { key: statusKey, label: statusLbl } : undefined,
      icon: <IconTool size={18} />,
    };
  });

  function handleWerkzeugSelect(id: string) {
    const w = werkzeuge.find(x => x.id === id);
    if (!w) return;
    const label = (w.fields.bezeichnung as string) ?? id;
    setSelectedWerkzeugId(id);
    setSelectedWerkzeugLabel(label);
    schaden.set('werkzeug', id, label);
    if (cfg && page) {
      const ep = page.endpoints?.find(e => e.op === 'create');
      if (ep?.app_id) {
        prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
      }
    }
  }

  function restart() {
    setSelectedWerkzeugId(null);
    setSelectedWerkzeugLabel('');
    setStep(1);
    schaden.reset();
    submit.reset();
  }

  if (loadingCfg) return <PublicShell loading />;
  if (!cfg || !page) return <PublicShell unavailable />;

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Werkzeugschäden schnell und unkompliziert melden — auch ohne Login.')}
    >
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[schaden]}
        draftKey="schaden-melden"
      >
        {/* Schritt 1: Werkzeug wählen */}
        <WizardStep
          label={tx('Werkzeug wählen')}
          description={tx('Wähle das beschädigte Werkzeug. Auch verliehene Werkzeuge können gemeldet werden.')}
        >
          <EntitySelectStep
            items={selectItems}
            onSelect={handleWerkzeugSelect}
            selectedId={selectedWerkzeugId}
            loading={werkzeugeLoading}
            avatar="none"
            searchPlaceholder={tx('Werkzeug suchen …')}
            emptyText={tx('Keine Werkzeuge gefunden.')}
            create={false}
            emptyIcon={<IconTool size={32} />}
          />
          <StepNav
            onNext={() => {
              if (!selectedWerkzeugId) return tx('Bitte wähle ein Werkzeug aus.');
              return schaden.validate(['werkzeug']);
            }}
          />
        </WizardStep>

        {/* Schritt 2: Schaden beschreiben */}
        <WizardStep
          label={tx('Schaden beschreiben')}
          description={tx('Beschreibe den Schaden so genau wie möglich.')}
        >
          <div className="space-y-5">
            {selectedWerkzeugLabel && (
              <div className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm">
                <IconTool size={16} className="shrink-0 text-muted-foreground" />
                <span className="font-medium">{selectedWerkzeugLabel}</span>
              </div>
            )}

            <Bound form={schaden} name="gemeldet_am" />

            <Field form={schaden} name="beschreibung" hint={tx('Wo genau ist der Schaden? Was ist passiert?')}>
              <Textarea
                {...schaden.field('beschreibung')}
                placeholder={tx('z. B. Gehäuse gebrochen, Kabel beschädigt …')}
                rows={4}
              />
            </Field>

            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{tx('Fotos können derzeit nicht hochgeladen werden. Bitte sprich das Team direkt an, falls du ein Foto beifügen möchtest.')}</span>
            </div>
          </div>

          <StepNav
            onNext={() => schaden.validate(['gemeldet_am'])}
          />
        </WizardStep>

        {/* Schritt 3: Zusammenfassung & Absenden */}
        <WizardStep label={tx('Überprüfen & Absenden')}>
          {!submit.done && (
            <SummaryStep
              forms={[schaden]}
              submit={submit}
              whatHappensNext={tx('Das Team wird den Schaden prüfen und das Werkzeug bei Bedarf aus dem Verleih nehmen.')}
              items={[
                {
                  key: 'werkzeug_name',
                  label: tx('Werkzeug'),
                  value: selectedWerkzeugLabel,
                  step: 1,
                },
              ]}
            />
          )}
          {submit.result && (
            <SuccessStep
              result={submit.result}
              forms={[schaden]}
              next={[{ label: tx('Weiteren Schaden melden'), onClick: restart }]}
            />
          )}
        </WizardStep>
      </IntentWizardShell>
    </PublicShell>
  );
}
