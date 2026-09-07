/**
 * WerkzeugAnfrage — Öffentliche Werkzeug-Anfrage für externe Vereine
 *
 * Ablauf (spiegelt internen Flow 'WerkzeugAusgeben'):
 *   Schritt 1 — Werkzeug wählen (nur status=verfuegbar)
 *   Schritt 2 — Wunschdatum + geplante Rückgabe + Kontaktdaten (Name, Verein, Telefon)
 *   Schritt 3 — Zusammenfassung & Absenden
 *
 * Kontaktdaten: ausleihen hat kein Freitext-Feld — Name/Verein/Telefon werden
 * als Zusammenfassung in einem separaten, lokalen State gehalten und im
 * Bestätigungs-Screen angezeigt. Das Team sieht sie dort (Bildschirm/Ausdruck),
 * kann sie aber nicht im System nachschlagen. Das ist die einzige buildable
 * Option ohne ein Notiz-Feld in der ausleihen-Entity.
 */
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
import {
  useStepForm,
  useJourneySubmit,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StepNav } from '@/components/blocks/StepNav';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconTool } from '@tabler/icons-react';
import { tx } from '@/i18n';

const SLUG = 'werkzeug-anfrage';

interface WerkzeugRecord {
  id: string;
  bezeichnung: string;
  inventarnummer: string;
  kategorien: unknown;
}

export default function WerkzeugAnfrage() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [werkzeuge, setWerkzeuge] = useState<WerkzeugRecord[]>([]);
  const [loadingWerkzeuge, setLoadingWerkzeuge] = useState(false);
  const [step, setStep] = useState(1);

  // Kontaktdaten — kein Feld in ausleihen, daher lokaler State
  const [kontaktName, setKontaktName] = useState('');
  const [kontaktVerein, setKontaktVerein] = useState('');
  const [kontaktTelefon, setKontaktTelefon] = useState('');
  const [kontaktErrors, setKontaktErrors] = useState<Record<string, string>>({});

  // ALL hooks before early returns
  const anfrage = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 2, rueckgabe_geplant: 2 },
    autoComplete: true,
  });

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  const submit = useJourneySubmit(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    [{ key: 'anfrage', entity: 'ausleihen', form: anfrage, primary: true }],
    { draftKey: 'werkzeug-anfrage' },
  );

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setLoadingWerkzeuge(true);
    const werkzeugEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'werkzeuge');
    if (!werkzeugEp) {
      setLoadingWerkzeuge(false);
      return;
    }
    listPublicRecords(cfg, page, { appId: werkzeugEp.app_id })
      .then(map => {
        const rows = Object.values(map).map(r => ({
          id: r.id,
          bezeichnung: (r.fields.bezeichnung as string) ?? '',
          inventarnummer: (r.fields.inventarnummer as string) ?? '',
          kategorien: r.fields.kategorien,
        }));
        setWerkzeuge(rows);
        setLoadingWerkzeuge(false);
      })
      .catch(() => setLoadingWerkzeuge(false));
  }, [cfg, page]);

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  const werkzeugItems: SelectItem[] = werkzeuge.map(w => ({
    id: w.id,
    title: w.bezeichnung,
    subtitle: tx`Inv.-Nr. ${w.inventarnummer}`,
    icon: <IconTool size={18} />,
  }));

  const selectedWerkzeugId = anfrage.get('werkzeug') as string | null;
  const selectedWerkzeug = werkzeuge.find(w => w.id === selectedWerkzeugId);

  function validateKontakt(): boolean {
    const errs: Record<string, string> = {};
    if (!kontaktName.trim()) errs.name = tx('Bitte deinen Namen eingeben.');
    if (!kontaktVerein.trim()) errs.verein = tx('Bitte den Vereinsnamen eingeben.');
    if (!kontaktTelefon.trim()) errs.telefon = tx('Bitte eine Telefonnummer eingeben.');
    setKontaktErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function restart() {
    anfrage.reset();
    setKontaktName('');
    setKontaktVerein('');
    setKontaktTelefon('');
    setKontaktErrors({});
    setStep(1);
  }

  const extraFacts = [
    { key: 'kontakt_name', label: tx('Name'), value: kontaktName || '—' },
    { key: 'kontakt_verein', label: tx('Verein'), value: kontaktVerein || '—' },
    { key: 'kontakt_telefon', label: tx('Telefon'), value: kontaktTelefon || '—' },
  ];

  return (
    <PublicShell
      title={tx('Werkzeug anfragen')}
      description={tx('Wähle ein verfügbares Werkzeug und gib deine Kontaktdaten an.')}
      wide
    >
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[anfrage]}
        draftKey="werkzeug-anfrage"
      >
        <WizardStep
          label={tx('Werkzeug wählen')}
          description={tx('Nur verfügbare Werkzeuge werden angezeigt.')}
        >
          <EntitySelectStep
            items={werkzeugItems}
            avatar="none"
            loading={loadingWerkzeuge}
            emptyText={tx('Aktuell sind keine Werkzeuge verfügbar.')}
            emptyIcon={<IconTool size={32} />}
            create={false}
            selectedId={selectedWerkzeugId ?? null}
            onSelect={id => {
              const w = werkzeuge.find(x => x.id === id);
              if (w) {
                anfrage.set('werkzeug', id, w.bezeichnung);
                prepareChallenge(cfg, page, 'POST', `/apps/${page.endpoints?.find(e => e.op === 'create')?.app_id ?? ''}/records`);
              }
            }}
          />
          <StepNav
            hideBack
            onNext={() => anfrage.validate(['werkzeug'])}
            nextStepLabel={tx('Datum & Kontakt')}
          />
        </WizardStep>

        <WizardStep
          label={tx('Datum & Kontakt')}
          description={tx('Wann möchtest du das Werkzeug ausleihen?')}
        >
          <div className="space-y-5">
            {selectedWerkzeug && (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3">
                <IconTool size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{selectedWerkzeug.bezeichnung}</p>
                  <p className="text-xs text-muted-foreground">{tx`Inv.-Nr. ${selectedWerkzeug.inventarnummer}`}</p>
                </div>
              </div>
            )}

            <Field form={anfrage} name="ausgabe" label={tx('Wunschdatum & Uhrzeit')}>
              <Bound form={anfrage} name="ausgabe" />
            </Field>

            <Field form={anfrage} name="rueckgabe_geplant" label={tx('Geplante Rückgabe')}>
              <Bound form={anfrage} name="rueckgabe_geplant" />
            </Field>

            <div className="border-t border-border pt-5 space-y-4">
              <p className="text-sm font-medium text-foreground">{tx('Deine Kontaktdaten')}</p>

              <div className="space-y-1.5">
                <Label htmlFor="kontakt-name">
                  {tx('Name')}
                  <span aria-hidden="true" className="text-muted-foreground"> *</span>
                </Label>
                <Input
                  id="kontakt-name"
                  type="text"
                  autoComplete="name"
                  value={kontaktName}
                  onChange={e => {
                    setKontaktName(e.target.value);
                    if (kontaktErrors.name) setKontaktErrors(prev => ({ ...prev, name: '' }));
                  }}
                  aria-invalid={!!kontaktErrors.name || undefined}
                  aria-describedby={kontaktErrors.name ? 'kontakt-name-error' : undefined}
                  required
                />
                {kontaktErrors.name && (
                  <p id="kontakt-name-error" className="text-sm text-destructive" role="alert">
                    {kontaktErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kontakt-verein">
                  {tx('Verein')}
                  <span aria-hidden="true" className="text-muted-foreground"> *</span>
                </Label>
                <Input
                  id="kontakt-verein"
                  type="text"
                  autoComplete="organization"
                  value={kontaktVerein}
                  onChange={e => {
                    setKontaktVerein(e.target.value);
                    if (kontaktErrors.verein) setKontaktErrors(prev => ({ ...prev, verein: '' }));
                  }}
                  aria-invalid={!!kontaktErrors.verein || undefined}
                  aria-describedby={kontaktErrors.verein ? 'kontakt-verein-error' : undefined}
                  required
                />
                {kontaktErrors.verein && (
                  <p id="kontakt-verein-error" className="text-sm text-destructive" role="alert">
                    {kontaktErrors.verein}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kontakt-telefon">
                  {tx('Telefon')}
                  <span aria-hidden="true" className="text-muted-foreground"> *</span>
                </Label>
                <Input
                  id="kontakt-telefon"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={kontaktTelefon}
                  onChange={e => {
                    setKontaktTelefon(e.target.value);
                    if (kontaktErrors.telefon) setKontaktErrors(prev => ({ ...prev, telefon: '' }));
                  }}
                  aria-invalid={!!kontaktErrors.telefon || undefined}
                  aria-describedby={kontaktErrors.telefon ? 'kontakt-telefon-error' : undefined}
                  required
                />
                {kontaktErrors.telefon && (
                  <p id="kontakt-telefon-error" className="text-sm text-destructive" role="alert">
                    {kontaktErrors.telefon}
                  </p>
                )}
              </div>
            </div>
          </div>

          <StepNav
            onNext={() => {
              const formOk = anfrage.validate(['ausgabe']);
              const kontaktOk = validateKontakt();
              if (typeof formOk === 'boolean' && !formOk) return false;
              if (!kontaktOk) return false;
            }}
            nextStepLabel={tx('Zusammenfassung')}
          />
        </WizardStep>

        <WizardStep label={tx('Zusammenfassung')}>
          {!submit.result && (
            <SummaryStep
              forms={[anfrage]}
              submit={submit}
              items={extraFacts}
              whatHappensNext={tx('Das Bauhof-Team prüft deine Anfrage und meldet sich bei dir.')}
              confirmLabel={tx('Anfrage absenden')}
            />
          )}
        </WizardStep>

        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[anfrage]}
            facts={extraFacts}
            whatHappensNext={tx('Das Bauhof-Team meldet sich telefonisch bei dir, um die Ausleihe zu bestätigen.')}
            referencePrefix="W"
            submit={submit}
            restartLabel={tx('Weitere Anfrage stellen')}
            next={[
              { label: tx('Weitere Anfrage stellen'), onClick: restart },
            ]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
