import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import {
  useStepForm, useJourneySubmit, useRecordSearch, nowIso, todayIso,
  fieldText,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';
import { Input } from '@/components/ui/input';
import { IconSearch } from '@tabler/icons-react';

const SLUG = 'werkzeug-anfrage';

export default function WerkzeugAnfrage() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Werkzeug wählen'),
    description: tx('Wähle ein verfügbares Werkzeug aus der Liste.'),
  },
  {
    label: tx('Kontaktdaten'),
    description: tx('Gib deine Kontaktdaten ein, damit wir dich erreichen können.'),
  },
  {
    label: tx('Zusammenfassung'),
    description: tx('Prüfe deine Angaben und schicke die Anfrage ab.'),
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
        }
      });
  }, []);

  const nullPort = useMemo(() => ({
    door: 'public' as const,
    list: () => Promise.resolve([]),
    count: () => Promise.resolve<number | null>(null),
    get: () => Promise.resolve(null),
    create: (_entity: string, _values: Record<string, unknown>): Promise<never> => Promise.reject(new Error(tx('not ready'))),
    ref: () => '',
  }), []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  // Werkzeug form — step 1
  const ausleihe = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 1, rueckgabe_geplant: 1 },
    initial: { ausgabe: nowIso(), rueckgabe_geplant: todayIso() },
    autoComplete: true,
  });

  // Kontaktdaten form — step 2
  const kontakt = useStepForm('mitarbeiter', {
    fields: ['vorname', 'nachname', 'mobil'],
    required: { vorname: true, nachname: true, mobil: false },
    steps: { vorname: 2, nachname: 2, mobil: 2 },
    autoComplete: true,
  });

  // Werkzeug search — only verfuegbar (scoped by surface.json)
  const werkzeugSearch = useRecordSearch(
    port ?? nullPort,
    'werkzeuge',
    {
      searchFields: ['bezeichnung', 'inventarnummer'],
      toItem: (r): SelectItem => ({
        id: r.id,
        title: fieldText(r, 'bezeichnung'),
        subtitle: fieldText(r, 'inventarnummer'),
        status: (() => {
          const kat = r.fields.kategorien;
          if (Array.isArray(kat) && kat.length > 0) {
            const first = kat[0] as { key: string; label: string };
            return { key: first.key, label: first.label };
          }
          return undefined;
        })(),
      }),
    },
  );

  const submit = useJourneySubmit(
    port ?? nullPort,
    [
      {
        key: 'kontakt',
        entity: 'mitarbeiter',
        form: kontakt,
      },
      {
        key: 'ausleihe',
        entity: 'ausleihen',
        form: ausleihe,
        primary: true,
        needs: ['kontakt'],
        link: { mitarbeiter: 'kontakt' },
      },
    ],
    { draftKey: 'werkzeug-anfrage' },
  );

  const selectedWerkzeugId = ausleihe.get('werkzeug') as string | null;

  if (loading) {
    return <PublicShell loading />;
  }
  if (!cfg || !page || !port) {
    return <PublicShell unavailable />;
  }

  if (submit.result) {
    return (
      <PublicShell title={tx('Werkzeug anfragen')}>
        <SuccessStep
          result={submit.result}
          forms={[ausleihe, kontakt]}
          whatHappensNext={tx('Wir prüfen deine Anfrage und melden uns bei dir. Das Werkzeug wird für dich bereitgelegt, sobald die Anfrage genehmigt ist.')}
          next={[
            {
              label: tx('Weitere Anfrage stellen'),
              onClick: () => {
                submit.reset();
                ausleihe.reset();
                kontakt.reset();
                setStep(1);
              },
            },
          ]}
          referencePrefix="A"
          submit={submit}
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell title={tx('Werkzeug anfragen')} description={tx('Externe Vereine können hier ein verfügbares Werkzeug für einen Tag anfragen.')}>
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[ausleihe, kontakt]}
        draftKey="werkzeug-anfrage"
        intro={{
          description: tx('Wähle ein Werkzeug, gib deine Kontaktdaten ein und sende die Anfrage ab. Wir melden uns nach der Prüfung bei dir.'),
          needs: [tx('Bezeichnung des gewünschten Werkzeugs'), tx('Wunschtermin für Abholung'), tx('Deine Kontaktdaten (Name, Telefon)')],
          estimatedMinutes: 2,
        }}
      >
        {/* Step 1: Werkzeug wählen + Datum */}
        {step === 1 && (
          <div className="space-y-6">
            <EntitySelectStep
              {...werkzeugSearch.select}
              selectedId={selectedWerkzeugId}
              onSelect={id => {
                const label = werkzeugSearch.labelOf(id) ?? id;
                ausleihe.set('werkzeug', id, label);
              }}
              avatar="none"
              searchPlaceholder={tx('Werkzeug suchen…')}
              emptyIcon={<IconSearch size={32} className="text-muted-foreground" />}
              emptyText={tx('Keine verfügbaren Werkzeuge gefunden.')}
              id={ausleihe.fieldId('werkzeug')}
              invalid={!!ausleihe.error('werkzeug')}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Bound form={ausleihe} name="ausgabe" label={tx('Gewünschter Abholzeitpunkt')} />
              <Bound form={ausleihe} name="rueckgabe_geplant" label={tx('Geplante Rückgabe')} />
            </div>

            <StepNav
              hideBack
              onNext={() => {
                const ok = ausleihe.validate(['werkzeug', 'ausgabe']);
                return ok;
              }}
              nextStepLabel={tx('Kontaktdaten')}
            />
          </div>
        )}

        {/* Step 2: Kontaktdaten */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field form={kontakt} name="vorname">
                <Input {...kontakt.field('vorname')} placeholder={tx('z. B. Max')} />
              </Field>
              <Field form={kontakt} name="nachname">
                <Input {...kontakt.field('nachname')} placeholder={tx('z. B. Mustermann')} />
              </Field>
            </div>
            <Field form={kontakt} name="mobil" hint={tx('Damit wir dich bei Rückfragen erreichen können.')}>
              <Input {...kontakt.field('mobil')} placeholder={tx('z. B. 0151 12345678')} />
            </Field>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => kontakt.validate(['vorname', 'nachname'])}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </div>
        )}

        {/* Step 3: Zusammenfassung */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[ausleihe, kontakt]}
            submit={submit}
            whatHappensNext={tx('Wir prüfen deine Anfrage und melden uns bei dir. Das Werkzeug wird für dich bereitgelegt, sobald die Anfrage genehmigt ist.')}
            confirmLabel={tx('Anfrage absenden')}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
