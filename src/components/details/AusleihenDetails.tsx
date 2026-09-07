import type { Ausleihen, Werkzeuge, Mitarbeiter } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';

export interface AusleihenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Ausleihen;
  /** N:1-Ziel „Werkzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  werkzeugeList: Werkzeuge[];
  /** Klick auf die Werkzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenWerkzeuge?: (record: Werkzeuge) => void;
  /** N:1-Ziel „Mitarbeiter": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  mitarbeiterList: Mitarbeiter[];
  /** Klick auf die Mitarbeiter-Relation → overlay.push auf dessen Detail. */
  onOpenMitarbeiter?: (record: Mitarbeiter) => void;
}

export function AusleihenDetails({
  record,
  werkzeugeList,
  onOpenWerkzeuge,
  mitarbeiterList,
  onOpenMitarbeiter,
}: AusleihenDetailsProps) {
  const werkzeugTarget = werkzeugeList.find(r => r.record_id === extractRecordId(record.fields.werkzeug));
  const mitarbeiterTarget = mitarbeiterList.find(r => r.record_id === extractRecordId(record.fields.mitarbeiter));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('ausleihen', 'ausgabe')} value={record.fields.ausgabe} format="datetime" />
        <RecordField label={fieldLabel('ausleihen', 'rueckgabe_geplant')} value={record.fields.rueckgabe_geplant} format="date" />
        <RecordField label={fieldLabel('ausleihen', 'rueckgabe_erfolgt')} value={record.fields.rueckgabe_erfolgt} format="datetime" />
        <RecordField label={fieldLabel('ausleihen', 'zustand_bei_rueckgabe')} value={record.fields.zustand_bei_rueckgabe} format="pill" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('ausleihen', 'werkzeug')}
          name={werkzeugTarget?.fields.bezeichnung ?? '—'}
          meta={[werkzeugTarget?.fields.inventarnummer].filter(Boolean).join(' · ') || undefined}
          onClick={werkzeugTarget && onOpenWerkzeuge ? () => onOpenWerkzeuge!(werkzeugTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('ausleihen', 'mitarbeiter')}
          name={mitarbeiterTarget?.fields.vorname ?? '—'}
          meta={[mitarbeiterTarget?.fields.mobil].filter(Boolean).join(' · ') || undefined}
          onClick={mitarbeiterTarget && onOpenMitarbeiter ? () => onOpenMitarbeiter!(mitarbeiterTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.AUSLEIHEN} recordId={record.record_id} />
    </>
  );
}
