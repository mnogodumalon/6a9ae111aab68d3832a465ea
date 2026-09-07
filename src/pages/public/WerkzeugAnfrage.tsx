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
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm } from '@/lib/journey/useStepForm';
import { useJourneySubmit } from '@/lib/journey/useJourneySubmit';
import { createPublicPort } from '@/lib/journey/publicPort';
import { tx } from '@/i18n';

interface WerkzeugRecord {
  id: string;
  bezeichnung: string;
  inventarnummer: string;
  status: string;
  kategorien: string[];
}

export default function WerkzeugAnfrage() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [werkzeuge, setWerkzeuge] = useState<WerkzeugRecord[]>([]);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig('werkzeug-anfrage').then(async c => {
      if (!c) { setLoading(false); return; }
      const p = c.pages['werkzeug-anfrage'] ?? null;
      setCfg(c);
      setPage(p);
      if (p) {
        const werkzeugeEp = p.endpoints?.find(e => e.op === 'list' && e.entity === 'werkzeuge');
        if (werkzeugeEp) {
          try {
            const raw = await listPublicRecords(c, p, { appId: werkzeugeEp.app_id });
            const list: WerkzeugRecord[] = Object.values(raw).map(r => ({
              id: r.id,
              bezeichnung: (r.fields.bezeichnung as string) ?? '',
              inventarnummer: (r.fields.inventarnummer as string) ?? '',
              status: (r.fields.status as string) ?? '',
              kategorien: Array.isArray(r.fields.kategorien) ? (r.fields.kategorien as string[]) : [],
            }));
            setWerkzeuge(list);
          } catch {
            // leere Liste ist kein harter Fehler
          }
        }
      }
      setLoading(false);
    });
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const form = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 2, rueckgabe_geplant: 2 },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => { throw new Error(tx('not ready')); }, ref: () => '' },
    [{ key: 'anfrage', entity: 'ausleihen', form, primary: true }],
    { draftKey: 'werkzeug-anfrage' },
  );

  const werkzeugItems: SelectItem[] = useMemo(() => werkzeuge.map(w => ({
    id: w.id,
    title: w.bezeichnung,
    subtitle: w.inventarnummer,
    stats: w.kategorien.length > 0 ? [{ label: tx('Kategorie'), value: w.kategorien.join(', ') }] : undefined,
    icon: undefined,
  })), [werkzeuge]);

  const selectedWerkzeugId = form.get('werkzeug') as string | null;

  function handleSelectWerkzeug(id: string) {
    const w = werkzeuge.find(x => x.id === id);
    if (!w) return;
    form.set('werkzeug', id, w.bezeichnung);
    if (cfg && page) {
      const createEp = page.endpoints?.find(e => e.op === 'create');
      if (createEp) {
        prepareChallenge(cfg, page, 'POST', `/apps/${createEp.app_id}/records`);
      }
    }
  }

  function restart() {
    form.reset();
    submit.reset();
    setStep(1);
  }

  if (loading) {
    return <PublicShell loading />;
  }

  if (!cfg || !page) {
    return <PublicShell unavailable />;
  }

  return (
    <PublicShell title={tx('Werkzeug anfragen')} description={tx('Wähle ein verfügbares Werkzeug und gib deinen Wunschtermin an.')}>
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[form]}
        draftKey="werkzeug-anfrage"
      >
        <WizardStep
          label={tx('Werkzeug wählen')}
          description={tx('Nur verfügbare Werkzeuge werden angezeigt.')}
        >
          <Field form={form} name="werkzeug" label={tx('Werkzeug')}>
            <EntitySelectStep
              items={werkzeugItems}
              selectedId={selectedWerkzeugId}
              onSelect={handleSelectWerkzeug}
              id={form.fieldId('werkzeug')}
              invalid={!!form.error('werkzeug')}
              avatar="none"
              searchPlaceholder={tx('Werkzeug suchen …')}
              emptyText={tx('Aktuell sind keine Werkzeuge verfügbar.')}
              create={false}
              columns={1}
            />
          </Field>
          <StepNav
            hideBack
            onNext={() => form.validate(['werkzeug'])}
            nextStepLabel={tx('Termin angeben')}
          />
        </WizardStep>

        <WizardStep
          label={tx('Termin angeben')}
          description={tx('Gib an, wann du das Werkzeug benötigst.')}
        >
          <div className="space-y-5">
            <Bound form={form} name="ausgabe" label={tx('Ausgabe (Datum und Uhrzeit)')} />
            <Bound form={form} name="rueckgabe_geplant" label={tx('Geplante Rückgabe (Datum)')} />
          </div>
          <StepNav
            onNext={() => form.validate(['ausgabe'])}
            nextStepLabel={tx('Prüfen und absenden')}
          />
        </WizardStep>

        <WizardStep label={tx('Zusammenfassung')}>
          {!submit.result && (
            <SummaryStep
              forms={[form]}
              submit={submit}
              whatHappensNext={tx('Das Team des Bauhofs prüft deine Anfrage und meldet sich.')}
              confirmLabel={tx('Anfrage absenden')}
            />
          )}
          {submit.result && (
            <SuccessStep
              result={submit.result}
              forms={[form]}
              whatHappensNext={tx('Das Team des Bauhofs prüft deine Anfrage und meldet sich.')}
              next={[{ label: tx('Weitere Anfrage stellen'), onClick: restart }]}
            />
          )}
        </WizardStep>
      </IntentWizardShell>
    </PublicShell>
  );
}
