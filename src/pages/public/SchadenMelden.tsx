import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm, useJourneySubmit, useRecordSearch, todayIso } from '@/lib/journey';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';
import { IconAlertTriangle, IconCamera } from '@tabler/icons-react';
import type { JourneyRecord } from '@/lib/journey';

const SLUG = 'schaden-melden';

interface WerkzeugItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: { key: string; label: string };
}

function toWerkzeugItem(r: JourneyRecord): WerkzeugItem {
  const bezeichnung = (r.fields.bezeichnung as string) ?? '';
  const inventarnummer = (r.fields.inventarnummer as string) ?? '';
  const statusKey = ((r.fields.status as { key?: string } | null)?.key) ?? '';
  const statusLabel = ((r.fields.status as { label?: string } | null)?.label) ?? '';
  return {
    id: r.id,
    title: bezeichnung,
    subtitle: inventarnummer ? tx`Nr. ${inventarnummer}` : undefined,
    status: statusKey ? { key: statusKey, label: statusLabel } : undefined,
  };
}

export default function SchadenMelden() {
  const STEPS = [
  {
    label: tx('Werkzeug wählen'),
    description: tx('Wähle das beschädigte Werkzeug aus der Liste aus.'),
  },
  {
    label: tx('Beschreibung'),
    description: tx('Beschreibe den Schaden so genau wie möglich.'),
  },
  {
    label: tx('Prüfen & Absenden'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
      if (!c?.pages[SLUG]) setUnavailable(true);
    }).catch(err => {
      if (err instanceof PageUnavailableError) {
        setUnavailable(true);
      }
      setLoading(false);
    });
  }, []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  // ALL hooks before any early return
  const werkzeugSearch = useRecordSearch(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => ({ id: '', fields: {}, createdAt: null }), ref: () => '' },
    'werkzeuge',
    {
      searchFields: ['bezeichnung', 'inventarnummer'],
      toItem: toWerkzeugItem,
      orderby: ['r.v_bezeichnung asc'],
    },
  );

  const form = useStepForm('schaeden', {
    fields: ['werkzeug', 'gemeldet_am', 'beschreibung'],
    required: { werkzeug: true, gemeldet_am: true, beschreibung: false },
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => ({ id: '', fields: {}, createdAt: null }), ref: () => '' },
    [
      {
        key: 'schaden',
        entity: 'schaeden',
        form,
        primary: true,
      },
    ],
    { draftKey: SLUG },
  );

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page || !port) return <PublicShell unavailable />;

  const handleWerkzeugSelect = (id: string) => {
    const label = werkzeugSearch.labelOf(id);
    form.set('werkzeug', id, label);
    setStep(2);
  };

  const handleRestart = () => {
    submit.reset();
    form.reset({ gemeldet_am: todayIso() });
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Melde einen Schaden an einem Werkzeug — schnell und ohne Login.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[form]}
        draftKey={SLUG}
      >
        {/* Schritt 1: Werkzeug wählen */}
        {step === 1 && (
          <EntitySelectStep
            {...werkzeugSearch.select}
            onSelect={handleWerkzeugSelect}
            selectedId={form.get('werkzeug') as string | null}
            avatar="none"
            searchPlaceholder={tx('Werkzeug suchen...')}
            emptyText={tx('Kein Werkzeug gefunden.')}
          />
        )}

        {/* Schritt 2: Beschreibung */}
        {step === 2 && (
          <div className="space-y-5">
            <Field form={form} name="gemeldet_am">
              <Bound form={form} name="gemeldet_am" />
            </Field>

            <Field form={form} name="beschreibung" hint={tx('Beschreibe Art und Ausmaß des Schadens.')}>
              <Bound form={form} name="beschreibung" rows={4} />
            </Field>

            {/* Hinweis: Foto kann nicht hochgeladen werden */}
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="font-medium">{tx('Fotos werden intern hinzugefügt')}</p>
                <p className="text-amber-700">
                  {tx('Das Hochladen von Fotos ist hier nicht möglich. Das Team fügt Fotos nach Eingang der Meldung intern hinzu.')}
                </p>
                <p className="flex items-center gap-1.5 text-amber-600">
                  <IconCamera size={14} className="shrink-0" />
                  {tx('Du kannst das Foto per E-Mail oder im nächsten Gespräch nachreichen.')}
                </p>
              </div>
            </div>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => form.validate(['gemeldet_am'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        )}

        {/* Schritt 3: Zusammenfassung & Absenden */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[form]}
            submit={submit}
            whatHappensNext={tx('Das Team prüft deinen Schadenshinweis und meldet sich bei Bedarf. Fotos können intern nachgereicht werden.')}
            confirmLabel={tx('Schaden melden')}
          />
        )}

        {/* Erfolg */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[form]}
            whatHappensNext={tx('Das Team wurde informiert und kümmert sich um die Schadensbehebung. Fotos werden intern ergänzt.')}
            next={[{ label: tx('Weitere Meldung'), onClick: handleRestart }]}
            referencePrefix="S"
            submit={submit}
            restartLabel={tx('Neue Meldung')}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
