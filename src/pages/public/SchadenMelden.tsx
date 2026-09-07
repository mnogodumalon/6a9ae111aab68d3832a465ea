import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  prepareChallenge,
  type PublicPageConfig,
  type PublicPagesConfig,
} from '@/lib/publicClient';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
  type JourneyRecord,
} from '@/lib/journey';
import { tx } from '@/i18n';
import { IconAlertTriangle, IconTool, IconInfoCircle } from '@tabler/icons-react';

const SLUG = 'schaden-melden';

interface WerkzeugItem extends SelectItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: { key: string; label: string };
}

export default function SchadenMelden() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Werkzeug wählen'),
    description: tx('Wähle das beschädigte Werkzeug aus der Liste aus.'),
  },
  {
    label: tx('Schaden beschreiben'),
    description: tx('Beschreibe den Schaden so genau wie möglich.'),
  },
  {
    label: tx('Absenden'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) {
          setLoading(false);
        } else {
          setLoading(false);
        }
      });
  }, []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  const schadenForm = useStepForm('schaeden', {
    fields: ['werkzeug', 'gemeldet_am', 'beschreibung'],
    required: { werkzeug: true, gemeldet_am: true, beschreibung: false },
    steps: { werkzeug: 1, gemeldet_am: 2, beschreibung: 2 },
    initial: { gemeldet_am: todayIso() },
    autoComplete: true,
  });

  const werkzeugSearch = useRecordSearch<'werkzeuge', WerkzeugItem>(
    port ?? ({} as never),
    'werkzeuge',
    {
      searchFields: ['bezeichnung', 'inventarnummer'],
      toItem: (r: JourneyRecord): WerkzeugItem => {
        const bez = (r.fields.bezeichnung as string) ?? '';
        const inv = (r.fields.inventarnummer as string) ?? '';
        const statusRaw = r.fields.status as { key: string; label: string } | null;
        return {
          id: r.id,
          title: bez,
          subtitle: inv ? tx`Inv.-Nr. ${inv}` : undefined,
          status: statusRaw
            ? { key: statusRaw.key, label: statusRaw.label }
            : undefined,
        };
      },
      orderby: ['r.v_bezeichnung asc'],
    },
  );

  const submit = useJourneySubmit(
    port ?? ({} as never),
    [
      {
        key: 'schaden',
        entity: 'schaeden',
        form: schadenForm,
        primary: true,
      },
    ],
    { draftKey: SLUG },
  );

  if (loading || !cfg || !page || !port) {
    return <PublicShell loading={loading} unavailable={!loading && (!cfg || !page)} />;
  }

  const createEp = page.endpoints?.find(e => e.op === 'create');
  const appId = createEp?.app_id ?? '';

  const handleWerkzeugSelect = (id: string) => {
    const label = werkzeugSearch.labelOf(id) ?? id;
    schadenForm.set('werkzeug', id, label);
    prepareChallenge(cfg, page, 'POST', `/apps/${appId}/records`);
    setStep(2);
  };

  const handleDescriptionNext = () => {
    return schadenForm.validate(['beschreibung']);
  };

  const restart = () => {
    submit.reset();
    schadenForm.reset({ gemeldet_am: todayIso() });
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Schaden melden')}
      description={tx('Melde einen Schaden an einem Werkzeug — das Team kümmert sich darum.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[schadenForm]}
        draftKey={SLUG}
      >
        {/* Schritt 1: Werkzeug wählen */}
        {step === 1 && !submit.done && (
          <div className="space-y-4">
            <EntitySelectStep
              {...werkzeugSearch.select}
              selectedId={schadenForm.get('werkzeug') as string | null}
              onSelect={handleWerkzeugSelect}
              avatar="none"
              searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
              emptyIcon={<IconTool size={40} className="text-muted-foreground" />}
              emptyText={tx('Keine Werkzeuge gefunden.')}
            />
          </div>
        )}

        {/* Schritt 2: Schaden beschreiben */}
        {step === 2 && !submit.done && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <IconInfoCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <p>
                {tx('Fotos können nach dem Absenden direkt vom Team ergänzt werden.')}
              </p>
            </div>

            <Field form={schadenForm} name="gemeldet_am">
              <Bound form={schadenForm} name="gemeldet_am" />
            </Field>

            <Field
              form={schadenForm}
              name="beschreibung"
              hint={tx('Beschreibe Art und Ausmaß des Schadens möglichst genau.')}
            >
              <Bound form={schadenForm} name="beschreibung" rows={5} />
            </Field>

            <StepNav
              onBack={() => setStep(1)}
              onNext={handleDescriptionNext}
              nextStepLabel={tx('Prüfen & Absenden')}
            />
          </div>
        )}

        {/* Schritt 3: Zusammenfassung & Absenden */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[schadenForm]}
            submit={submit}
            whatHappensNext={tx('Das Team wird den Schaden aufnehmen und das Werkzeug prüfen.')}
            confirmLabel={tx('Schaden melden')}
          />
        )}

        {/* Erfolgsmeldung */}
        {submit.done && submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[schadenForm]}
            title={tx('Schaden gemeldet')}
            whatHappensNext={tx('Das Team wurde benachrichtigt und kümmert sich um das Werkzeug.')}
            referencePrefix="S"
            submit={submit}
            restartLabel={tx('Weiteren Schaden melden')}
            next={[
              {
                label: tx('Weiteren Schaden melden'),
                onClick: restart,
                icon: <IconAlertTriangle size={16} className="shrink-0" />,
              },
            ]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
