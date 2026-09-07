/**
 * WerkzeugAnfrage — öffentliche Werkzeug-Anfrage für externe Vereine.
 *
 * Schritt 1: Werkzeug wählen (nur verfügbare)
 * Schritt 2: Kontaktdaten + Termine
 * Schritt 3: Zusammenfassung + Absenden
 *
 * Erstellt einen Ausleihen-Datensatz (werkzeug, ausgabe, rueckgabe_geplant).
 * Kontaktdaten (Name + Telefon/E-Mail) werden in der Zusammenfassung angezeigt
 * und intern per Notiz kommuniziert (ausleihen hat kein Kontaktfeld).
 */
import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { useStepForm, useJourneySubmit } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StepNav } from '@/components/blocks/StepNav';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { Input } from '@/components/ui/input';
import { tx } from '@/i18n';
import { IconTools } from '@tabler/icons-react';

const SLUG = 'werkzeug-anfrage';

interface WerkzeugRecord {
  id: string;
  bezeichnung: string;
  inventarnummer: string;
  kategorien: string[];
}

export default function WerkzeugAnfrage() {
  const STEPS: WizardStep[] = [
  { label: tx('Werkzeug wählen'), key: 'werkzeug' },
  { label: tx('Termine & Kontakt'), key: 'kontakt' },
  { label: tx('Zusammenfassung'), key: 'zusammenfassung' },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [werkzeuge, setWerkzeuge] = useState<WerkzeugRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Kontaktdaten als lokaler State — kein Feld in ausleihen vorhanden
  const [kontaktName, setKontaktName] = useState('');
  const [kontaktInfo, setKontaktInfo] = useState('');
  const [kontaktError, setKontaktError] = useState('');
  const [kontaktInfoError, setKontaktInfoError] = useState('');

  const [step, setStep] = useState(1);
  const [restartKey, setRestartKey] = useState(0);

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
  }, [restartKey]);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  // Werkzeuge laden sobald port verfügbar
  useEffect(() => {
    if (!port) return;
    setListLoading(true);
    port.list('werkzeuge').then(rows => {
      setWerkzeuge(
        rows
          .filter(r => (r.fields.status as string) === 'verfuegbar')
          .map(r => ({
            id: r.id,
            bezeichnung: (r.fields.bezeichnung as string) ?? '',
            inventarnummer: (r.fields.inventarnummer as string) ?? '',
            kategorien: Array.isArray(r.fields.kategorien)
              ? (r.fields.kategorien as string[])
              : [],
          })),
      );
      setListLoading(false);
    });
  }, [port]);

  const ausleihe = useStepForm('ausleihen', {
    fields: ['werkzeug', 'ausgabe', 'rueckgabe_geplant'],
    required: { werkzeug: true, ausgabe: true, rueckgabe_geplant: false },
    steps: { werkzeug: 1, ausgabe: 2, rueckgabe_geplant: 2 },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => { throw new Error(tx('port not ready')); }, ref: () => '' },
    [{ key: 'ausleihe', entity: 'ausleihen', form: ausleihe, primary: true }],
    { draftKey: 'werkzeug-anfrage' },
  );

  const werkzeugItems: SelectItem[] = useMemo(
    () =>
      werkzeuge.map(w => ({
        id: w.id,
        title: w.bezeichnung,
        subtitle: `${tx('Inv.-Nr.')} ${w.inventarnummer}`,
        stats: w.kategorien.length
          ? [{ label: tx('Kategorie'), value: w.kategorien.join(', ') }]
          : [],
      })),
    [werkzeuge],
  );

  const selectedWerkzeugId = ausleihe.get('werkzeug') as string | undefined;

  function handleWerkzeugSelect(id: string) {
    const w = werkzeuge.find(x => x.id === id);
    if (!w || !port) return;
    ausleihe.set('werkzeug', port.ref('6a9ae0d7cbcbecdbd87197b3', id), w.bezeichnung);
    prepareChallenge(cfg!, page!, 'POST', `/apps/6a9ae0d8b513fc8850fabef9/records`);
  }

  function validateSchritt2(): boolean | string {
    const errors = ausleihe.validate(['ausgabe']);
    if (!kontaktName.trim()) {
      setKontaktError(tx('Bitte gib deinen Namen ein.'));
      return false;
    }
    if (!kontaktInfo.trim()) {
      setKontaktInfoError(tx('Bitte gib eine Kontaktmöglichkeit ein.'));
      return false;
    }
    setKontaktError('');
    setKontaktInfoError('');
    return errors;
  }

  function restart() {
    setStep(1);
    setKontaktName('');
    setKontaktInfo('');
    setKontaktError('');
    setKontaktInfoError('');
    setRestartKey(k => k + 1);
  }

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  return (
    <PublicShell
      title={tx('Werkzeug anfragen')}
      description={tx('Wähle ein verfügbares Werkzeug und hinterlasse deine Kontaktdaten — wir melden uns.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[ausleihe]}
        draftKey="werkzeug-anfrage"
      >
        {/* Schritt 1: Werkzeug wählen */}
        {step === 1 && (
          <>
            <EntitySelectStep
              items={werkzeugItems}
              selectedId={selectedWerkzeugId ?? null}
              onSelect={handleWerkzeugSelect}
              avatar="none"
              loading={listLoading}
              emptyIcon={<IconTools size={40} />}
              emptyText={tx('Aktuell sind keine Werkzeuge verfügbar.')}
              create={false}
            />
            <StepNav
              onNext={() => {
                if (!selectedWerkzeugId) return tx('Bitte wähle ein Werkzeug aus.');
                return;
              }}
              nextStepLabel={tx('Termine & Kontakt')}
              hideBack
            />
          </>
        )}

        {/* Schritt 2: Termine & Kontaktdaten */}
        {step === 2 && (
          <div className="space-y-5">
            <Bound form={ausleihe} name="ausgabe" />
            <Bound form={ausleihe} name="rueckgabe_geplant" />

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="kontakt-name">
                {tx('Dein Name')} <span aria-hidden="true" className="text-muted-foreground"> *</span>
              </label>
              <Input
                id="kontakt-name"
                value={kontaktName}
                onChange={e => { setKontaktName(e.target.value); setKontaktError(''); }}
                placeholder={tx('Verein oder vollständiger Name')}
                autoComplete="name"
              />
              {kontaktError && (
                <p className="text-sm text-destructive" role="alert">{kontaktError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="kontakt-info">
                {tx('Kontakt (E-Mail oder Telefon)')} <span aria-hidden="true" className="text-muted-foreground"> *</span>
              </label>
              <Input
                id="kontakt-info"
                value={kontaktInfo}
                onChange={e => { setKontaktInfo(e.target.value); setKontaktInfoError(''); }}
                placeholder={tx('z. B. anfragen@meinverein.de oder 0170 123456')}
                autoComplete="email"
              />
              {kontaktInfoError && (
                <p className="text-sm text-destructive" role="alert">{kontaktInfoError}</p>
              )}
            </div>

            <StepNav
              onNext={validateSchritt2}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </div>
        )}

        {/* Schritt 3: Zusammenfassung */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[ausleihe]}
            submit={submit}
            items={[
              { key: 'kontakt_name', label: tx('Name'), value: kontaktName, keys: ['kontakt_name'], fieldId: 'kontakt-name' },
              { key: 'kontakt_info', label: tx('Kontakt'), value: kontaktInfo, keys: ['kontakt_info'], fieldId: 'kontakt-info' },
            ]}
            whatHappensNext={tx('Das Team des Bauhofs prüft deine Anfrage und meldet sich direkt bei dir.')}
          />
        )}

        {/* Erfolg */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[ausleihe]}
            facts={[
              { label: tx('Name'), value: kontaktName },
              { label: tx('Kontakt'), value: kontaktInfo },
            ]}
            whatHappensNext={tx('Das Team des Bauhofs meldet sich in Kürze per E-Mail oder Telefon.')}
            referencePrefix="W"
            next={[
              { label: tx('Weitere Anfrage stellen'), onClick: restart },
            ]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
