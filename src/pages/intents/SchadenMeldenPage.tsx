/**
 * Schaden melden — 3-Schritt-Wizard (intern: #/intents/schaden-melden-intern).
 * Steps: 1) Werkzeug wählen → 2) Schaden beschreiben → 3) Prüfen & anlegen.
 * Reads: werkzeuge. Writes: schaeden (createSchaedenEntry), werkzeug-Status 'defekt'
 *        (updateWerkzeugeEntry via servicePort.update), wartungen (createWartungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Field, Bound,
 *           StepNav, SummaryStep, SuccessStep.
 */
import { useRef, useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { Button } from '@/components/ui/button';
import { IconPhoto, IconX } from '@tabler/icons-react';
import { uploadFile } from '@/services/livingAppsService';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

const DRAFT_KEY = 'schaden-melden-intern';

export default function SchadenMeldenPage() {
  const [step, setStep] = useState(1);
  const [fotoUrl, setFotoUrl] = useState<string | undefined>();
  const [fotoUploading, setFotoUploading] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung'),
      subtitle: fieldText(w, 'inventarnummer'),
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  const schaden = useStepForm('schaeden', {
    steps: {
      werkzeug: 1,
      gemeldet_am: 2,
      beschreibung: 2,
    },
    initial: { gemeldet_am: todayIso() },
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'schaden',
        entity: 'schaeden',
        form: schaden,
        primary: true,
        values: { foto: fotoUrl },
      },
      {
        key: 'statusUpdate',
        needs: ['schaden'],
        verb: 'update',
        run: async () => {
          const werkzeugId = schaden.get('werkzeug') as string | undefined;
          if (!werkzeugId) return;
          return await servicePort.update('werkzeuge', werkzeugId, { status: 'defekt' });
        },
      },
      {
        key: 'wartung',
        needs: ['schaden'],
        run: async () => {
          const werkzeugId = schaden.get('werkzeug') as string | undefined;
          if (!werkzeugId) return;
          const beschreibungRaw = schaden.get('beschreibung') as string | undefined;
          const kurztext = beschreibungRaw?.slice(0, 80) ?? '';
          return await servicePort.create('wartungen', {
            werkzeug: werkzeugId,
            datum: schaden.get('gemeldet_am') as string,
            beschreibung: tx('Schaden gemeldet: ') + kurztext,
          });
        },
      },
    ],
    { draftKey: DRAFT_KEY },
  );

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoUploading(true);
    try {
      const url = await uploadFile(file, file.name);
      setFotoUrl(url);
    } finally {
      setFotoUploading(false);
    }
  }

  return (
    <IntentWizardShell
      title={tx('Schaden melden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[schaden]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Defektes Werkzeug erfassen und Wartungsauftrag automatisch anlegen.'),
        needs: [tx('Bezeichnung oder Inventarnummer des Werkzeugs'), tx('Schadensbeschreibung')],
      }}
    >
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Werkzeug auswählen, das beschädigt oder defekt zurückgekommen ist.')}
      >
        <EntitySelectStep
          {...werkzeuge.select}
          selectedId={schaden.get('werkzeug') as string}
          onSelect={id => {
            schaden.set('werkzeug', id, werkzeuge.labelOf(id));
          }}
          searchPlaceholder={tx('Bezeichnung oder Inventarnummer …')}
          create={false}
          emptyText={tx('Kein Werkzeug gefunden. Bitte Suchbegriff anpassen.')}
        />
        <StepNav
          hideBack
          onNext={() => schaden.validate(['werkzeug'])}
          nextStepLabel={tx('Schaden beschreiben')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Schaden')}
        description={tx('Datum, Beschreibung und optionales Foto zum Schaden erfassen.')}
        needs={['werkzeug']}
      >
        <div className="space-y-4">
          <Bound form={schaden} name="gemeldet_am" />
          <Bound form={schaden} name="beschreibung" rows={4} />

          {/* Foto — optionales Datei-Upload außerhalb des Formulars */}
          <Field form={schaden} name="foto" hint={tx('Optional — max. ein Foto')}>
            {fotoUrl ? (
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <img
                  src={fotoUrl}
                  alt={tx('Schadensfoto')}
                  className="h-16 w-16 rounded object-cover"
                />
                <p className="flex-1 truncate text-sm text-foreground">
                  {fotoUrl.split('/').pop()}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => { setFotoUrl(undefined); if (fotoInputRef.current) fotoInputRef.current.value = ''; }}
                >
                  <IconX stroke={1.5} className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={fotoUploading}
                onClick={() => fotoInputRef.current?.click()}
              >
                <IconPhoto stroke={1.5} className="mr-2 h-4 w-4" />
                {fotoUploading ? tx('Wird hochgeladen …') : tx('Foto auswählen')}
              </Button>
            )}
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFotoChange}
            />
          </Field>

          <StepNav
            onNext={() => schaden.validate(['gemeldet_am', 'beschreibung'])}
            nextStepLabel={tx('Prüfen & melden')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[schaden]}
            submit={submit}
            whatHappensNext={tx(
              'Das Werkzeug wird auf „Defekt" gesetzt und eine Wartung wird automatisch angelegt.',
            )}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[schaden]}
          submit={submit}
          whatHappensNext={tx(
            'Das Werkzeug ist jetzt als defekt markiert und erscheint nicht mehr in der Ausgabe-Auswahl.',
          )}
          next={[
            { label: tx('Weiteren Schaden melden') },
            {
              label: tx('Werkzeug ausgeben'),
              href: '#/intents/werkzeug-ausgeben',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
