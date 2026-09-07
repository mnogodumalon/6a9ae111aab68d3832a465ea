import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  PageUnavailableError,
  prepareChallenge,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
  nowIso,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { Input } from '@/components/ui/input';
import { IconTool, IconCalendar, IconUser } from '@tabler/icons-react';

const SLUG = 'werkzeug-anfrage';

interface WerkzeugItem {
  id: string;
  title: string;
  subtitle?: string;
}

export default function WerkzeugAnfrage() {
  const STEPS = [
  {
    label: tx('Werkzeug wählen'),
    heading: tx('Verfügbares Werkzeug wählen'),
    description: tx('Wähle das Werkzeug, das du ausleihen möchtest. Nur aktuell verfügbare Werkzeuge werden angezeigt.'),
    key: 'werkzeug',
  },
  {
    label: tx('Zeitraum & Kontakt'),
    heading: tx('Zeitraum und Kontaktdaten'),
    description: tx('Gib den gewünschten Zeitraum und deine Kontaktdaten an.'),
    key: 'kontakt',
  },
  {
    label: tx('Prüfen & Absenden'),
    heading: tx('Anfrage prüfen'),
    key: 'pruefen',
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState(1);

  // Kontaktdaten — separate lokale State (kein Feld in der Entität)
  const [kontaktName, setKontaktName] = useState('');
  const [kontaktEmail, setKontaktEmail] = useState('');
  const [kontaktTel, setKontaktTel] = useState('');
  const [kontaktNameTouched, setKontaktNameTouched] = useState(false);
  const [kontaktKontaktTouched, setKontaktKontaktTouched] = useState(false);

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

  // Step-Form für ausleihen (werkzeug, ausgabe, rueckgabe_geplant)
  const anfrage = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 2, rueckgabe_geplant: 2 },
    initial: { ausgabe: nowIso() },
    autoComplete: true,
  });

  // Werkzeug-Suche über den public port
  const werkzeugSearch = useRecordSearch<'werkzeuge', WerkzeugItem>(
    port!,
    'werkzeuge',
    {
      searchFields: ['bezeichnung', 'inventarnummer'],
      filter: "r.v_status == 'verfuegbar'",
      toItem: (r) => ({
        id: r.id,
        title: (r.fields.bezeichnung as string) ?? '—',
        subtitle: r.fields.inventarnummer
          ? tx`Nr. ${String(r.fields.inventarnummer)}`
          : undefined,
      }),
    },
  );

  const submit = useJourneySubmit(
    port!,
    [
      {
        key: 'anfrage',
        entity: 'ausleihen',
        form: anfrage,
        primary: true,
      },
    ],
    { draftKey: 'werkzeug-anfrage' },
  );

  // Alle Hooks vor early returns
  const selectedWerkzeug = werkzeugSearch.recordOf(anfrage.get('werkzeug') as string ?? '');

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page || !port) return <PublicShell unavailable />;

  const handlePrepareChallenge = () => {
    const ep = page.endpoints?.find(e => e.op === 'create');
    if (ep?.app_id) prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
  };

  const validateKontakt = () => {
    setKontaktNameTouched(true);
    setKontaktKontaktTouched(true);
    if (!kontaktName.trim()) return false;
    if (!kontaktEmail.trim() && !kontaktTel.trim()) return false;
    return true;
  };

  const restart = () => {
    anfrage.reset();
    setKontaktName('');
    setKontaktEmail('');
    setKontaktTel('');
    setKontaktNameTouched(false);
    setKontaktKontaktTouched(false);
    submit.reset();
    setStep(1);
  };

  const kontaktNameError = kontaktNameTouched && !kontaktName.trim()
    ? tx('Bitte gib deinen Namen an.')
    : undefined;
  const kontaktKontaktError = kontaktKontaktTouched && !kontaktEmail.trim() && !kontaktTel.trim()
    ? tx('Bitte gib eine E-Mail-Adresse oder Telefonnummer an.')
    : undefined;

  return (
    <PublicShell
      title={tx('Werkzeug anfragen')}
      description={tx('Externe Vereine können hier ein verfügbares Werkzeug für einen Zeitraum anfragen. Der Bauhof meldet sich nach Eingang der Anfrage.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[anfrage]}
        draftKey="werkzeug-anfrage"
        intro={{
          description: tx('Fülle in drei Schritten deine Werkzeug-Anfrage aus. Der Bauhof prüft die Verfügbarkeit und meldet sich bei dir.'),
          needs: [tx('Name deines Vereins / Kontaktperson'), tx('Gewünschter Abhol- und Rückgabezeitpunkt')],
          estimatedMinutes: 2,
        }}
      >
        {/* Schritt 1: Werkzeug wählen */}
        {step === 1 && !submit.done && (
          <>
            <EntitySelectStep
              {...werkzeugSearch.select}
              onSelect={(id) => {
                const label = werkzeugSearch.labelOf(id);
                anfrage.set('werkzeug', id, label);
                handlePrepareChallenge();
              }}
              selectedId={anfrage.get('werkzeug') as string | null}
              avatar="none"
              searchPlaceholder={tx('Werkzeug suchen …')}
              emptyIcon={<IconTool size={40} className="text-muted-foreground" />}
              emptyText={tx('Derzeit sind keine Werkzeuge verfügbar.')}
            />
            <StepNav
              hideBack
              onNext={() => anfrage.validate(['werkzeug'])}
              nextStepLabel={tx('Zeitraum & Kontakt')}
            />
          </>
        )}

        {/* Schritt 2: Zeitraum & Kontaktdaten */}
        {step === 2 && !submit.done && (
          <div className="space-y-5">
            {selectedWerkzeug && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <IconTool size={16} className="shrink-0 text-muted-foreground" />
                <span className="font-medium">
                  {(selectedWerkzeug.fields.bezeichnung as string) ?? '—'}
                </span>
                {Boolean(selectedWerkzeug.fields.inventarnummer) && (
                  <span className="text-muted-foreground">
                    · {tx`Nr. ${String(selectedWerkzeug.fields.inventarnummer)}`}
                  </span>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Bound form={anfrage} name="ausgabe" label={tx('Abholdatum & -uhrzeit')} />
              <Bound form={anfrage} name="rueckgabe_geplant" label={tx('Geplante Rückgabe')} />
            </div>

            <hr className="border-border" />

            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <IconUser size={16} className="shrink-0" />
              {tx('Kontaktdaten')}
            </p>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="kontakt-name">
                  {tx('Kontaktperson / Verein')}{' '}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  id="kontakt-name"
                  value={kontaktName}
                  onChange={e => setKontaktName(e.target.value)}
                  onBlur={() => setKontaktNameTouched(true)}
                  placeholder={tx('z. B. Sportverein Musterstadt, Max Mustermann')}
                  autoComplete="organization"
                  aria-required
                  aria-invalid={!!kontaktNameError || undefined}
                />
                {kontaktNameError && (
                  <p className="text-xs text-destructive">{kontaktNameError}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="kontakt-email">
                  {tx('E-Mail-Adresse')}
                </label>
                <Input
                  id="kontakt-email"
                  type="email"
                  value={kontaktEmail}
                  onChange={e => setKontaktEmail(e.target.value)}
                  onBlur={() => setKontaktKontaktTouched(true)}
                  placeholder={tx('anfragen@verein.de')}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="kontakt-tel">
                  {tx('Telefonnummer')}
                </label>
                <Input
                  id="kontakt-tel"
                  type="tel"
                  value={kontaktTel}
                  onChange={e => setKontaktTel(e.target.value)}
                  onBlur={() => setKontaktKontaktTouched(true)}
                  placeholder={tx('z. B. 0123 456789')}
                  autoComplete="tel"
                />
                {kontaktKontaktError && (
                  <p className="text-xs text-destructive">{kontaktKontaktError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {tx('Bitte gib mindestens eine Kontaktmöglichkeit an.')}
                </p>
              </div>
            </div>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => {
                const formOk = anfrage.validate(['ausgabe', 'rueckgabe_geplant']);
                const kontaktOk = validateKontakt();
                return formOk && kontaktOk;
              }}
              nextStepLabel={tx('Prüfen & Absenden')}
            />
          </div>
        )}

        {/* Schritt 3: Zusammenfassung & Absenden */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[anfrage]}
            submit={submit}
            items={[
              { key: 'kontakt_name', label: tx('Kontaktperson'), value: kontaktName || '—' },
              { key: 'kontakt_email', label: tx('E-Mail'), value: kontaktEmail || '—' },
              { key: 'kontakt_tel', label: tx('Telefon'), value: kontaktTel || '—' },
            ]}
            whatHappensNext={tx('Der Bauhof prüft deine Anfrage und meldet sich innerhalb von 1–2 Werktagen per E-Mail oder Telefon bei dir.')}
          />
        )}

        {/* Erfolgsmeldung */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[anfrage]}
            facts={[
              { label: tx('Kontaktperson'), value: kontaktName || '—' },
              ...(kontaktEmail ? [{ label: tx('E-Mail'), value: kontaktEmail }] : []),
              ...(kontaktTel ? [{ label: tx('Telefon'), value: kontaktTel }] : []),
            ]}
            title={tx('Anfrage eingegangen!')}
            whatHappensNext={tx('Der Bauhof meldet sich innerhalb von 1–2 Werktagen bei dir. Bitte halte die Anfragenummer bereit.')}
            submit={submit}
            restartLabel={tx('Weitere Anfrage stellen')}
            next={[{ label: tx('Weitere Anfrage stellen'), onClick: restart }]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
