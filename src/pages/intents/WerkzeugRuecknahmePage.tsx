/**
 * Werkzeug-Rücknahme — 4-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Zustand bei Rückgabe erfassen → 3) Prüfen & bestätigen → 4) Erfolg.
 * Reads: ausleihen (gefiltert: rueckgabe_erfolgt is None), werkzeuge, mitarbeiter.
 * Writes: ausleihen (update rueckgabe_erfolgt + zustand_bei_rueckgabe),
 *         werkzeuge (update status → verfuegbar | defekt),
 *         wartungen (create, nur wenn beschaedigt).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound,
 *           StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useRecordSearch,
  useStepForm,
  useJourneySubmit,
  fieldText,
  fieldLookup,
  fieldDate,
  nowIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugRuecknahmePage() {
  const [step, setStep] = useState(1);
  const [ausleihId, setAusleihId] = useState<string | null>(null);

  // Schritt 1: Offene Ausleihen — nur solche, bei denen rueckgabe_erfolgt noch leer ist.
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    filter: 'r.v_rueckgabe_erfolgt is None',
    where: r => !fieldDate(r, 'rueckgabe_erfolgt'),
    searchFields: [],
    toItem: (a, ctx) => {
      const werkzeugName = ctx.ref('werkzeug') ?? tx('Unbekanntes Werkzeug');
      const mitarbeiterName = ctx.ref('mitarbeiter') ?? tx('Unbekannter Mitarbeiter');
      const ausgabe = fieldDate(a, 'ausgabe');
      const rueckgabePlant = fieldDate(a, 'rueckgabe_geplant');
      return {
        id: a.id,
        title: werkzeugName,
        subtitle: mitarbeiterName,
        stats: [
          { label: tx('Ausgabe'), value: ausgabe ? format(new Date(ausgabe), 'dd.MM.yyyy HH:mm') : tx('unbekannt') },
          ...(rueckgabePlant ? [{ label: tx('Geplante Rückgabe'), value: format(new Date(rueckgabePlant), 'dd.MM.yyyy') }] : []),
        ],
        avatar: 'none' as const,
      };
    },
  });

  // Formular für Schritt 2: Zustand-Felder der Ausleihe
  const rueckgabeForm = useStepForm('ausleihen', {
    fields: ['zustand_bei_rueckgabe', 'rueckgabe_erfolgt'],
    steps: { zustand_bei_rueckgabe: 2, rueckgabe_erfolgt: 2 },
    required: { zustand_bei_rueckgabe: true, rueckgabe_erfolgt: true },
    initial: { rueckgabe_erfolgt: nowIso() },
  });

  const zustand = rueckgabeForm.get('zustand_bei_rueckgabe') as string | null;

  // Plan: 1) Ausleihe aktualisieren, 2) Werkzeug-Status setzen, 3) ggf. Wartung anlegen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      form: rueckgabeForm,
      updates: () => ausleihId ?? '',
      primary: true,
      verb: 'update',
    },
    {
      key: 'werkzeug_status',
      entity: 'werkzeuge',
      needs: ['ausleihe'],
      updates: (ctx) => {
        const ausleiheRecord = ctx.done['ausleihe'];
        const werkzeugRef = ausleiheRecord?.fields['werkzeug'];
        if (typeof werkzeugRef === 'string') {
          const parts = werkzeugRef.split('/');
          return parts[parts.length - 1] ?? undefined;
        }
        return undefined;
      },
      values: () => {
        const z = zustand;
        const newStatus = (z === 'einwandfrei' || z === 'gebrauchsspuren') ? 'verfuegbar' : 'defekt';
        return { status: newStatus };
      },
      verb: 'update',
    },
    {
      key: 'wartung',
      needs: ['ausleihe'],
      run: async (ctx) => {
        // Nur anlegen wenn Zustand = 'beschaedigt'
        if (zustand !== 'beschaedigt') return;
        const ausleiheRecord = ctx.done['ausleihe'];
        const werkzeugRef = ausleiheRecord?.fields['werkzeug'];
        let werkzeugId: string | undefined;
        if (typeof werkzeugRef === 'string') {
          const parts = werkzeugRef.split('/');
          werkzeugId = parts[parts.length - 1];
        }
        if (!werkzeugId) return;
        return ctx.port.create('wartungen', {
          werkzeug: werkzeugId,
          datum: format(new Date(), 'yyyy-MM-dd'),
          beschreibung: 'Werkzeug bei Rückgabe beschädigt',
          erledigt: false,
        });
      },
    },
  ], { draftKey: 'werkzeug-ruecknahme' });

  // Restart-Handler
  const restart = () => {
    submit.reset();
    rueckgabeForm.reset({ rueckgabe_erfolgt: nowIso() });
    setAusleihId(null);
    setStep(1);
  };

  // Ausgewählte Ausleihe für Anzeige
  const selectedAusleihe = ausleihId ? ausleihen.recordOf(ausleihId) : undefined;
  const werkzeugName = selectedAusleihe
    ? (ausleihen.refLabel(selectedAusleihe, 'werkzeug') ?? tx('Werkzeug'))
    : tx('Werkzeug');
  const mitarbeiterName = selectedAusleihe
    ? (ausleihen.refLabel(selectedAusleihe, 'mitarbeiter') ?? tx('Mitarbeiter'))
    : tx('Mitarbeiter');

  const wartungAngelegt = submit.result?.records['wartung'] != null;
  const neuerStatus = (zustand === 'einwandfrei' || zustand === 'gebrauchsspuren') ? tx('Verfügbar') : tx('Defekt');

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurücknehmen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[rueckgabeForm]}
      draftKey="werkzeug-ruecknahme"
      intro={{
        description: tx('Eine offene Ausleihe abschließen und den Zustand des Werkzeugs erfassen.'),
        needs: [tx('Die zurückgegebene Ausleihe'), tx('Angabe zum Werkzeugzustand')],
      }}
    >
      {/* Schritt 1: Offene Ausleihe wählen */}
      <WizardStep
        label={tx('Ausleihe')}
        description={tx('Wähle die Ausleihe, die jetzt abgeschlossen wird.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          selectedId={ausleihId ?? null}
          emptyText={tx('Keine offenen Ausleihen vorhanden — alle Werkzeuge sind bereits zurückgegeben.')}
          emptyIcon={undefined}
          create={false}
          avatar="none"
          onSelect={(id) => {
            const record = ausleihen.recordOf(id);
            const wName = record ? (ausleihen.refLabel(record, 'werkzeug') ?? tx('Werkzeug')) : tx('Werkzeug');
            setAusleihId(id);
            rueckgabeForm.remember(id, wName);
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Zustand bei Rückgabe */}
      <WizardStep
        label={tx('Zustand')}
        description={tx('Erfasse den Zustand des zurückgegebenen Werkzeugs.')}
        needs={['_ausleihId']}
      >
        {ausleihId ? (
          <div className="space-y-5">
            <div className="rounded-lg bg-secondary px-4 py-3 text-sm">
              <span className="font-medium">{werkzeugName}</span>
              {' '}
              <span className="text-muted-foreground">{tx('von')} {mitarbeiterName}</span>
            </div>
            <Bound form={rueckgabeForm} name="zustand_bei_rueckgabe" />
            <Bound form={rueckgabeForm} name="rueckgabe_erfolgt" />
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => rueckgabeForm.validate(['zustand_bei_rueckgabe', 'rueckgabe_erfolgt'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst eine Ausleihe wählen.')}</p>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && ausleihId !== null ? (
          <SummaryStep
            forms={[rueckgabeForm]}
            submit={submit}
            items={[
              { key: 'werkzeug', label: tx('Werkzeug'), value: werkzeugName },
              { key: 'mitarbeiter', label: tx('Mitarbeiter'), value: mitarbeiterName },
            ]}
            whatHappensNext={
              zustand === 'beschaedigt'
                ? tx('Die Ausleihe wird abgeschlossen, das Werkzeug auf „Defekt" gesetzt und eine Wartung automatisch angelegt.')
                : tx('Die Ausleihe wird abgeschlossen und der Werkzeugstatus entsprechend aktualisiert.')
            }
          />
        ) : ausleihId === null ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst eine Ausleihe wählen.')}</p>
          </StepNav>
        ) : null}
      </WizardStep>

      {/* Schritt 4: Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[rueckgabeForm]}
          facts={[
            { label: tx('Werkzeug'), value: werkzeugName },
            { label: tx('Mitarbeiter'), value: mitarbeiterName },
            { label: tx('Neuer Status'), value: neuerStatus },
            ...(wartungAngelegt ? [{ label: tx('Wartung'), value: tx('Automatisch angelegt') }] : []),
          ]}
          verb="updated"
          whatHappensNext={
            wartungAngelegt
              ? tx('Das Werkzeug ist als defekt markiert und eine Wartung wurde angelegt.')
              : tx('Das Werkzeug steht wieder zur Verfügung.')
          }
          next={[
            { label: tx('Weitere Rücknahme'), onClick: restart },
            { label: tx('Werkzeug ausgeben'), href: '#/intents/werkzeug-ausgeben' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
