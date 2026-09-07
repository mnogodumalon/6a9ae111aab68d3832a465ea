import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm, todayIso } from '@/lib/journey';
import { useJourneySubmit } from '@/lib/journey';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { Textarea } from '@/components/ui/textarea';
import { IconAlertTriangle, IconTool } from '@tabler/icons-react';
import { tx } from '@/i18n';

const SLUG = 'schaden-melden';

export default function SchadenMelden() {
  const STEPS: WizardStep[] = [
  { label: tx('Werkzeug wählen') },
  { label: tx('Schaden beschreiben') },
  { label: tx('Prüfen & Absenden') },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState(1);

  // Werkzeuge aus dem list-Endpoint
  const [werkzeuge, setWerkzeuge] = useState<SelectItem[]>([]);
  const [loadingWerkzeuge, setLoadingWerkzeuge] = useState(false);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    }).catch(err => {
      if (err instanceof PageUnavailableError) setUnavailable(true);
      setLoading(false);
    });
  }, []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  // Werkzeuge laden sobald Port verfügbar
  useEffect(() => {
    if (!port) return;
    setLoadingWerkzeuge(true);
    port.list('werkzeuge').then(rows => {
      setWerkzeuge(
        rows.map(r => {
          const bez = (r.fields.bezeichnung as string | null) ?? '';
          const inv = (r.fields.inventarnummer as string | null) ?? '';
          const statusKey = (r.fields.status as { key: string; label: string } | string | null);
          const statusLabel = typeof statusKey === 'object' && statusKey !== null
            ? statusKey.label
            : typeof statusKey === 'string' ? statusKey : '';
          const statusRaw = typeof statusKey === 'object' && statusKey !== null
            ? statusKey.key
            : typeof statusKey === 'string' ? statusKey : '';
          return {
            id: r.id,
            title: bez,
            subtitle: inv ? tx`Nr. ${inv}` : undefined,
            status: statusRaw ? { key: statusRaw, label: statusLabel } : undefined,
          } satisfies SelectItem;
        })
      );
    }).finally(() => setLoadingWerkzeuge(false));
  }, [port]);

  const f = useStepForm('schaeden', {
    fields: ['werkzeug', 'gemeldet_am', 'beschreibung'],
    required: { werkzeug: true, gemeldet_am: true, beschreibung: false },
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port!,
    [{ key: 'schaden', entity: 'schaeden', form: f, primary: true }],
    { draftKey: 'schaden-melden' },
  );

  const restart = () => {
    f.reset?.();
    setStep(1);
  };

  // challenge beim ersten Schritt-Wechsel vorbereiten
  const handleFirstInteraction = () => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find(e => e.op === 'create');
    if (!ep) return;
    prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
  };

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  const selectedWerkzeugId = f.get('werkzeug') as string | null;

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Teile uns mit, welches Werkzeug beschädigt wurde — wir kümmern uns darum.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[f]}
        draftKey="schaden-melden"
      >
        {/* Schritt 1: Werkzeug wählen */}
        {step === 1 && !submit.done && (
          <div className="space-y-5" onPointerDown={handleFirstInteraction}>
            <Field form={f} name="werkzeug">
              <EntitySelectStep
                {...f.record('werkzeug')}
                items={werkzeuge}
                loading={loadingWerkzeuge}
                avatar="none"
                emptyIcon={<IconTool size={32} />}
                emptyText={tx('Keine Werkzeuge gefunden.')}
                searchPlaceholder={tx('Werkzeug suchen …')}
                create={false}
                onSelect={id => {
                  const w = werkzeuge.find(wz => wz.id === id);
                  f.set('werkzeug', id, w?.title ?? id);
                }}
                selectedId={selectedWerkzeugId}
              />
            </Field>
            <StepNav
              onNext={() => f.validate(['werkzeug'])}
              nextStepLabel={tx('Schaden beschreiben')}
              hideBack
            />
          </div>
        )}

        {/* Schritt 2: Schaden beschreiben */}
        {step === 2 && !submit.done && (
          <div className="space-y-5">
            <Bound form={f} name="gemeldet_am" />
            <Field form={f} name="beschreibung" hint={tx('Was ist passiert? Je genauer, desto besser.')}>
              <Textarea
                {...f.field('beschreibung')}
                rows={4}
                placeholder={tx('z. B. Kabelbruch an der Bohrmaschine nach Sturz vom Gerüst …')}
              />
            </Field>
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{tx('Fotos können nach dem Absenden intern ergänzt werden.')}</span>
            </div>
            <StepNav
              onNext={() => f.validate(['gemeldet_am'])}
              nextStepLabel={tx('Prüfen & Absenden')}
            />
          </div>
        )}

        {/* Schritt 3: Zusammenfassung */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Das Team sieht die Meldung sofort intern und meldet sich bei Rückfragen.')}
          />
        )}

        {/* Erfolg */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[f]}
            whatHappensNext={tx('Das Team sieht die Meldung sofort intern und meldet sich bei Rückfragen.')}
            next={[{ label: tx('Weitere Meldung absenden'), onClick: restart }]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
