import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm, useJourneySubmit } from '@/lib/journey';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { Field } from '@/components/blocks/Field';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { IconTool, IconCalendar } from '@tabler/icons-react';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';
import { format } from 'date-fns';

const SLUG = 'werkzeug-anfrage';

interface WerkzeugRecord {
  id: string;
  bezeichnung: string;
  inventarnummer: string;
  kategorien: string[];
}

function parseWerkzeug(id: string, r: PublicRecordResult): WerkzeugRecord {
  return {
    id: r.id ?? id,
    bezeichnung: (r.fields.bezeichnung as string) ?? '',
    inventarnummer: (r.fields.inventarnummer as string) ?? '',
    kategorien: Array.isArray(r.fields.kategorien) ? (r.fields.kategorien as string[]) : [],
  };
}

export default function WerkzeugAnfrage() {
  const KATEGORIE_LABELS: Record<string, string> = {
  elektrowerkzeug: 'Elektrowerkzeug',
  handwerkzeug: 'Handwerkzeug',
  messgeraet: 'Messgerät',
  sicherheitsausruestung: 'Sicherheitsausrüstung',
};

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [werkzeuge, setWerkzeuge] = useState<WerkzeugRecord[]>([]);
  const [werkzeugeLoading, setWerkzeugeLoading] = useState(false);

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
        }
      });
  }, []);

  // Load Werkzeuge once page config is ready
  useEffect(() => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find(e => e.op === 'list' && e.entity === 'werkzeuge');
    if (!ep) return;
    setWerkzeugeLoading(true);
    listPublicRecords(cfg, page, { appId: ep.app_id, limit: 200 })
      .then(map => {
        setWerkzeuge(Object.entries(map).map(([id, r]) => parseWerkzeug(id, r)));
      })
      .finally(() => setWerkzeugeLoading(false));
  }, [cfg, page]);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const f = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 2, rueckgabe_geplant: 2 },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port ?? {
      door: 'public',
      async list() { return []; },
      async count() { return null; },
      async get() { return null; },
      async create() { return { id: '', fields: {}, createdAt: null }; },
      ref: () => '',
    },
    [{ key: 'anfrage', entity: 'ausleihen', form: f, primary: true }],
    { draftKey: 'werkzeug-anfrage' },
  );

  // Warmup challenge on first interaction
  const handleFirstInteraction = () => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find(e => e.op === 'create');
    if (!ep) return;
    prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
  };

  const werkzeugItems: SelectItem[] = werkzeuge.map(w => ({
    id: w.id,
    title: w.bezeichnung,
    subtitle: tx`Nr. ${w.inventarnummer}${w.kategorien.length > 0 ? ' · ' + w.kategorien.map(k => KATEGORIE_LABELS[k] ?? k).join(', ') : ''}`,
    icon: <IconTool size={18} />,
    status: { key: 'verfuegbar', label: tx('Verfügbar') },
  }));

  const selectedWerkzeugId = f.get('werkzeug') as string | null;

  const restart = () => {
    f.reset?.();
    setStep(1);
  };

  // Build the ausgabe display value for summary (datetime)
  const ausgabeVal = f.get('ausgabe') as string;
  const ausgabeDisplay = ausgabeVal
    ? (() => {
        try {
          const [datePart, timePart] = ausgabeVal.split('T');
          if (!datePart) return ausgabeVal;
          const [y, m, d] = datePart.split('-').map(Number);
          const [h, min] = (timePart ?? '00:00').split(':').map(Number);
          const date = new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0);
          return format(date, 'dd.MM.yyyy HH:mm') + ' Uhr';
        } catch {
          return ausgabeVal;
        }
      })()
    : '';

  const rueckgabeVal = f.get('rueckgabe_geplant') as string;
  const rueckgabeDisplay = rueckgabeVal
    ? (() => {
        try {
          const [y, m, d] = rueckgabeVal.split('-').map(Number);
          const date = new Date(y, (m ?? 1) - 1, d ?? 1);
          return format(date, 'dd.MM.yyyy');
        } catch {
          return rueckgabeVal;
        }
      })()
    : '';

  if (loading) {
    return <PublicShell loading />;
  }

  if (!cfg || !page) {
    return <PublicShell unavailable />;
  }

  return (
    <PublicShell
      title={tx('Werkzeug anfragen')}
      description={tx('Wähle ein verfügbares Werkzeug aus und gib Abholung und Rückgabe an.')}
    >
      <div onPointerDown={handleFirstInteraction} onFocus={handleFirstInteraction}>
        <IntentWizardShell
          currentStep={step}
          onStepChange={setStep}
          back={false}
          forms={[f]}
          draftKey="werkzeug-anfrage"
          surface="plain"
        >
          <WizardStep
            label={tx('Werkzeug wählen')}
            heading={tx('Welches Werkzeug benötigst du?')}
            description={tx('Nur verfügbare Werkzeuge werden angezeigt.')}
          >
            <EntitySelectStep
              items={werkzeugItems}
              loading={werkzeugeLoading}
              onSelect={id => {
                const w = werkzeuge.find(x => x.id === id);
                f.set('werkzeug', id, w?.bezeichnung ?? id);
              }}
              selectedId={selectedWerkzeugId}
              avatar="none"
              searchPlaceholder={tx('Werkzeug suchen …')}
              emptyText={tx('Aktuell sind keine Werkzeuge verfügbar.')}
              emptyIcon={<IconTool size={36} />}
              create={false}
              {...{ id: f.fieldId('werkzeug'), invalid: !!f.error('werkzeug'), 'aria-describedby': f.error('werkzeug') ? `${f.fieldId('werkzeug')}-error` : undefined }}
            />
            {f.error('werkzeug') && (
              <p id={`${f.fieldId('werkzeug')}-error`} role="alert" className="text-sm text-destructive mt-2">
                {f.error('werkzeug')}
              </p>
            )}
            <StepNav
              hideBack
              onNext={() => f.validate(['werkzeug'])}
              nextStepLabel={tx('Termin')}
            />
          </WizardStep>

          <WizardStep
            label={tx('Termin angeben')}
            heading={tx('Wann holst du das Werkzeug ab?')}
            description={tx('Abholzeitpunkt und geplante Rückgabe eingeben.')}
          >
            <div className="space-y-4">
              <Bound form={f} name="ausgabe" label={tx('Abholung (Datum & Uhrzeit)')} />
              <Bound form={f} name="rueckgabe_geplant" label={tx('Geplante Rückgabe')} />
            </div>
            <StepNav
              onNext={() => f.validate(['ausgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </WizardStep>

          <WizardStep label={tx('Prüfen & Absenden')}>
            {!submit.result && (
              <SummaryStep
                forms={[f]}
                submit={submit}
                items={[
                  ...(ausgabeDisplay ? [{ key: 'ausgabe_display', label: tx('Abholung'), value: ausgabeDisplay, keys: ['ausgabe'], step: 2, fieldId: f.fieldId('ausgabe') }] : []),
                  ...(rueckgabeDisplay ? [{ key: 'rueckgabe_display', label: tx('Geplante Rückgabe'), value: rueckgabeDisplay, keys: ['rueckgabe_geplant'], step: 2, fieldId: f.fieldId('rueckgabe_geplant') }] : []),
                ]}
                whatHappensNext={tx('Das Bauhof-Team prüft deine Anfrage und meldet sich bei dir.')}
              />
            )}
            {submit.result && (
              <SuccessStep
                result={submit.result}
                forms={[f]}
                whatHappensNext={tx('Bitte notiere deine Referenznummer. Das Bauhof-Team wird die Anfrage bearbeiten und sich bei dir melden.')}
                next={[
                  { label: tx('Weitere Anfrage stellen'), onClick: restart, icon: <IconCalendar size={16} /> },
                ]}
              />
            )}
          </WizardStep>
        </IntentWizardShell>
      </div>
    </PublicShell>
  );
}
