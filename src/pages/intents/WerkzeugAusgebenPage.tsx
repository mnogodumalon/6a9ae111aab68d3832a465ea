/**
 * Werkzeug ausgeben — 4-Schritt-Wizard.
 * Steps: 1) Mitarbeiter wählen → 2) Werkzeug wählen (nur verfügbare) → 3) Ausgabedaten → 4) Prüfen & anlegen.
 * Reads: mitarbeiter, werkzeuge. Writes: ausleihen (createAusleihenEntry) + updateWerkzeugeEntry (status → verliehen).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { DatePicker } from '@/components/DatePicker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldNumber,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { tx } from '@/i18n';
import { useState } from 'react';
import { IconPackage, IconUser, IconCalendar } from '@tabler/icons-react';

export default function WerkzeugAusgebenPage() {
  const data = useDashboardData({ omit: ['mitarbeiter', 'werkzeuge', 'ausleihen'] });

  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_aktiv == True",
    where: r => r.fields['aktiv'] !== false,
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname') ?? ''} ${fieldText(m, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(m, 'personalnummer') ?? undefined,
    }),
  });

  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['bezeichnung', 'inventarnummer'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'bezeichnung') ?? tx('Unbenannt'),
      subtitle: fieldText(w, 'inventarnummer') ?? undefined,
      stats: fieldNumber(w, 'bestand') != null
        ? [{ label: tx('Bestand'), value: String(fieldNumber(w, 'bestand')) }]
        : undefined,
    }),
  });

  const [step, setStep] = useState(1);

  const mitarbeiterForm = useStepForm('mitarbeiter', {
    steps: { mitarbeiter: 1 },
  });

  const werkzeugForm = useStepForm('werkzeuge', {
    steps: { werkzeug: 2 },
  });

  const ausgabeForm = useStepForm('ausleihen', {
    steps: { ausgabe: 3, rueckgabe_geplant: 3 },
    initial: {
      ausgabe: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    },
  });

  const selectedMitarbeiterId = mitarbeiterForm.get('mitarbeiter') as string | undefined;
  const selectedWerkzeugId = werkzeugForm.get('werkzeug') as string | undefined;

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      entity: 'ausleihen',
      form: ausgabeForm,
      primary: true,
      values: {
        ...(selectedWerkzeugId ? { werkzeug: selectedWerkzeugId } : {}),
        ...(selectedMitarbeiterId ? { mitarbeiter: selectedMitarbeiterId } : {}),
      },
    },
    {
      key: 'werkzeug_status',
      run: async () => {
        if (selectedWerkzeugId) {
          await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, { status: 'verliehen' });
        }
      },
      needs: ['ausleihe'],
    },
  ], { draftKey: 'werkzeug-ausgeben' });

  const restart = () => {
    submit.reset();
    mitarbeiterForm.reset();
    werkzeugForm.reset();
    ausgabeForm.reset();
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausgeben')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[mitarbeiterForm, werkzeugForm, ausgabeForm]}
      draftKey="werkzeug-ausgeben"
      intro={{
        description: tx('Ein verfügbares Werkzeug an einen Mitarbeiter ausgeben und Ausleihe anlegen.'),
        needs: [tx('Mitarbeitername'), tx('Werkzeugbezeichnung oder Inventarnummer')],
      }}
    >
      {/* Schritt 1: Mitarbeiter wählen */}
      <WizardStep
        label={tx('Mitarbeiter')}
        description={tx('Den Mitarbeiter wählen, der das Werkzeug erhält.')}
      >
        <EntitySelectStep
          {...mitarbeiter.select}
          selectedId={selectedMitarbeiterId}
          onSelect={id => {
            mitarbeiterForm.set('mitarbeiter', id, mitarbeiter.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Nach Vorname oder Nachname suchen …')}
          emptyText={tx('Kein aktiver Mitarbeiter gefunden.')}
          create={false}
        />
      </WizardStep>

      {/* Schritt 2: Werkzeug wählen */}
      <WizardStep
        label={tx('Werkzeug')}
        description={tx('Ein verfügbares Werkzeug auswählen.')}
      >
        {selectedMitarbeiterId ? (
          <EntitySelectStep
            {...werkzeuge.select}
            selectedId={selectedWerkzeugId}
            onSelect={id => {
              werkzeugForm.set('werkzeug', id, werkzeuge.labelOf(id));
              setStep(3);
            }}
            searchPlaceholder={tx('Nach Bezeichnung oder Inventarnummer suchen …')}
            emptyText={tx('Kein Werkzeug mit Status „Verfügbar" gefunden.')}
            create={false}
          />
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            nextDisabled
          >
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst einen Mitarbeiter in Schritt 1 wählen.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Ausgabedaten */}
      <WizardStep
        label={tx('Ausgabe')}
        description={tx('Ausgabedatum und geplante Rückgabe festlegen.')}
      >
        {selectedWerkzeugId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
              <IconPackage size={16} className="shrink-0 text-muted-foreground" />
              <span className="font-medium">{werkzeuge.labelOf(selectedWerkzeugId)}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
              <IconUser size={16} className="shrink-0 text-muted-foreground" />
              <span>{selectedMitarbeiterId ? mitarbeiter.labelOf(selectedMitarbeiterId) : ''}</span>
            </div>
            <div className="space-y-3 pt-2">
              <Field form={ausgabeForm} name="ausgabe">
                <DatePicker {...ausgabeForm.date('ausgabe')} />
              </Field>
              <Field form={ausgabeForm} name="rueckgabe_geplant" hint={tx('optional')}>
                <DatePicker {...ausgabeForm.date('rueckgabe_geplant')} />
              </Field>
            </div>
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => ausgabeForm.validate(['ausgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav
            onBack={() => setStep(2)}
            nextDisabled
          >
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst ein Werkzeug in Schritt 2 wählen.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[mitarbeiterForm, werkzeugForm, ausgabeForm]}
            submit={submit}
            whatHappensNext={tx('Die Ausleihe wird angelegt und das Werkzeug als „Verliehen" markiert.')}
            items={[
              {
                key: 'mitarbeiter_name',
                label: tx('Mitarbeiter'),
                value: (selectedMitarbeiterId ? mitarbeiter.labelOf(selectedMitarbeiterId) : undefined) ?? '—',
                keys: ['mitarbeiter'],
                fieldId: 'mitarbeiter',
              },
              {
                key: 'werkzeug_name',
                label: tx('Werkzeug'),
                value: (selectedWerkzeugId ? werkzeuge.labelOf(selectedWerkzeugId) : undefined) ?? '—',
                keys: ['werkzeug'],
                fieldId: 'werkzeug',
              },
            ]}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[mitarbeiterForm, werkzeugForm, ausgabeForm]}
          whatHappensNext={tx('Bei der Rückgabe den Ablauf „Werkzeug zurücknehmen" nutzen.')}
          next={[
            { label: tx('Weiteres Werkzeug ausgeben'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
