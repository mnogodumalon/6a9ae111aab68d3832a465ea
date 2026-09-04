/**
 * Werkzeug zurück — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur offene, ohne rueckgabe_erfolgt) →
 *        2) Rückgabe erfassen (Datum/Uhrzeit + Zustand) →
 *        3) Prüfen & abschliessen.
 * Reads: ausleihen (via useRecordSearch, gefiltert), werkzeuge + mitarbeiter (Maps für Enrichment).
 * Writes: updateAusleihenEntry (rueckgabe_erfolgt, zustand_bei_rueckgabe),
 *         updateWerkzeugeEntry (status: verfuegbar | defekt).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup,
 *           StepNav, SummaryStep, SuccessStep, Field, DatePicker.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Field } from '@/components/blocks/Field';
import { DatePicker } from '@/components/DatePicker';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldLookup, fieldRef } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihen } from '@/lib/enrich';
import { LivingAppsService } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const DRAFT_KEY = 'werkzeug-zurueck';

function nowDatetime(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

export default function WerkzeugZurueckPage() {
  // Werkzeuge + Mitarbeiter werden für Enrichment (Anzeige in der Auswahl) benötigt.
  // Ausleihen werden via useRecordSearch geladen (nur offene), nicht per useDashboardData.
  const data = useDashboardData({ omit: ['ausleihen'] });
  const { werkzeugeMap, mitarbeiterMap, loading, error, fetchAll } = data;

  // Ausleihen haben keine String-Felder → searchFields: [] lädt alle und sucht client-seitig.
  // Die Karten zeigen Werkzeug- und Mitarbeitername aus den Maps.
  const ausleihen = useRecordSearch(servicePort, 'ausleihen', {
    searchFields: [],
    filter: "r.v_rueckgabe_erfolgt is None",
    where: r => !r.fields['rueckgabe_erfolgt'],
    toItem: r => {
      const werkzeugId = fieldRef(r, 'werkzeug');
      const mitarbeiterId = fieldRef(r, 'mitarbeiter');
      const werkzeug = werkzeugId ? werkzeugeMap.get(werkzeugId) : undefined;
      const mitarbeiter = mitarbeiterId ? mitarbeiterMap.get(mitarbeiterId) : undefined;
      const werkzeugName = werkzeug?.fields.bezeichnung ?? tx('Unbekanntes Werkzeug');
      const vorname = mitarbeiter?.fields.vorname ?? '';
      const nachname = mitarbeiter?.fields.nachname ?? '';
      const mitarbeiterName = [vorname, nachname].filter(Boolean).join(' ') || tx('Unbekannte Person');
      return {
        id: r.id,
        title: werkzeugName,
        subtitle: mitarbeiterName,
      };
    },
  });

  const [step, setStep] = useState(1);

  // Formular für Schritt 2: Rückgabe erfassen
  const rueckgabeForm = useStepForm('ausleihen', {
    fields: ['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'],
    steps: { rueckgabe_erfolgt: 2, zustand_bei_rueckgabe: 2 },
    initial: { rueckgabe_erfolgt: nowDatetime() },
  });

  // Plan: zwei run-Schritte — Ausleihe schliessen, dann Werkzeugstatus setzen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'ausleihe',
      verb: 'update',
      primary: true,
      run: async () => {
        const ausleiheId = rueckgabeForm.get('_ausleiheId') as string;
        const rueckgabe = rueckgabeForm.get('rueckgabe_erfolgt') as string;
        const zustand = rueckgabeForm.get('zustand_bei_rueckgabe') as string;
        return LivingAppsService.updateAusleihenEntry(ausleiheId, {
          rueckgabe_erfolgt: rueckgabe,
          zustand_bei_rueckgabe: zustand,
        });
      },
    },
    {
      key: 'werkzeug',
      verb: 'update',
      needs: ['ausleihe'],
      run: async () => {
        const werkzeugId = rueckgabeForm.get('_werkzeugId') as string;
        const zustand = rueckgabeForm.get('zustand_bei_rueckgabe') as string;
        const neuerStatus = zustand === 'beschaedigt' || zustand === 'verloren' ? 'defekt' : 'verfuegbar';
        return LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          status: neuerStatus,
        });
      },
    },
  ], { draftKey: DRAFT_KEY });

  const restart = () => {
    submit.reset();
    rueckgabeForm.reset({ rueckgabe_erfolgt: nowDatetime() });
    setStep(1);
  };

  const selectedAusleiheId = rueckgabeForm.get('_ausleiheId') as string | undefined;

  // Werkzeugname für die Erfolgsanzeige
  const werkzeugId = rueckgabeForm.get('_werkzeugId') as string | undefined;
  const werkzeugName = werkzeugId ? (werkzeugeMap.get(werkzeugId)?.fields.bezeichnung ?? '') : '';
  const zustandKey = rueckgabeForm.get('zustand_bei_rueckgabe') as string | undefined;
  const neuerStatus = zustandKey === 'beschaedigt' || zustandKey === 'verloren' ? 'defekt' : 'verfuegbar';

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
      forms={[rueckgabeForm]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Eine offene Ausleihe abschliessen und den Zustand des Werkzeugs erfassen.'),
        needs: [tx('Werkzeug- oder Mitarbeitername der Ausleihe'), tx('Zustand des zurückgegebenen Werkzeugs')],
      }}
    >
      {/* Schritt 1: Offene Ausleihe wählen */}
      <WizardStep
        label={tx('Ausleihe')}
        description={tx('Nur offene Ausleihen (ohne Rückgabedatum) werden angezeigt.')}
      >
        <EntitySelectStep
          {...ausleihen.select}
          selectedId={selectedAusleiheId}
          emptyText={tx('Keine offenen Ausleihen vorhanden — alle Werkzeuge wurden bereits zurückgegeben.')}
          create={false}
          onSelect={id => {
            const rec = ausleihen.recordOf(id);
            const wId = rec ? fieldRef(rec, 'werkzeug') : null;
            rueckgabeForm.set('_ausleiheId', id, ausleihen.labelOf(id));
            if (wId) rueckgabeForm.set('_werkzeugId', wId);
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Rückgabe erfassen */}
      <WizardStep
        label={tx('Rückgabe')}
        description={tx('Rückgabezeitpunkt und Zustand des Werkzeugs festhalten.')}
      >
        {rueckgabeForm.get('_ausleiheId') ? (
          <div className="space-y-6">
            <Field form={rueckgabeForm} name="rueckgabe_erfolgt">
              <DatePicker {...rueckgabeForm.date('rueckgabe_erfolgt')} />
            </Field>
            <Field form={rueckgabeForm} name="zustand_bei_rueckgabe">
              <ChoiceGroup {...rueckgabeForm.choice('zustand_bei_rueckgabe')} />
            </Field>
            <StepNav
              onNext={() => rueckgabeForm.validate(['rueckgabe_erfolgt', 'zustand_bei_rueckgabe'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine offene Ausleihe auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Prüfen & abschliessen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[rueckgabeForm]}
            submit={submit}
            items={[
              {
                key: '_werkzeug',
                keys: ['_ausleiheId'],
                label: tx('Werkzeug'),
                value: werkzeugName || tx('—'),
                step: 1,
                fieldId: '_werkzeug',
              },
              {
                key: '_neuerStatus',
                keys: ['zustand_bei_rueckgabe'],
                label: tx('Neuer Werkzeugstatus'),
                value: neuerStatus === 'defekt' ? tx('Defekt') : tx('Verfügbar'),
                step: 2,
                fieldId: rueckgabeForm.fieldId('zustand_bei_rueckgabe'),
              },
            ]}
            whatHappensNext={tx('Das Werkzeug wird automatisch auf den neuen Status gesetzt.')}
          />
        )}
      </WizardStep>

      {/* Erfolgsanzeige */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[rueckgabeForm]}
          facts={[
            { label: tx('Werkzeug'), value: werkzeugName },
            {
              label: tx('Neuer Status'),
              value: neuerStatus === 'defekt' ? tx('Defekt — Werkzeug zur Wartung einplanen') : tx('Verfügbar'),
            },
          ]}
          whatHappensNext={
            neuerStatus === 'defekt'
              ? tx('Das Werkzeug ist als defekt markiert. Bitte eine Wartung einplanen.')
              : tx('Das Werkzeug steht wieder zur Ausleihe bereit.')
          }
          next={[
            { label: tx('Weitere Rückgabe'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          actions={{ copy: false, print: false }}
        >
          <div className="mt-2">
            <StatusBadge
              statusKey={neuerStatus}
              label={neuerStatus === 'defekt' ? tx('Defekt') : tx('Verfügbar')}
            />
          </div>
        </SuccessStep>
      )}
    </IntentWizardShell>
  );
}
