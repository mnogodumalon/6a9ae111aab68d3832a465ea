import type { Wartungen, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';

export interface WartungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Wartungen;
  /** N:1-Ziel „Werkzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  werkzeugeList: Werkzeuge[];
  /** Klick auf die Werkzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenWerkzeuge?: (record: Werkzeuge) => void;
}

export function WartungenDetails({
  record,
  werkzeugeList,
  onOpenWerkzeuge,
}: WartungenDetailsProps) {
  const werkzeugTarget = werkzeugeList.find(r => r.record_id === extractRecordId(record.fields.werkzeug));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('wartungen', 'datum')} value={record.fields.datum} format="date" />
        <RecordField label={fieldLabel('wartungen', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('wartungen', 'kosten')} value={record.fields.kosten} format="text" />
        <RecordField label={fieldLabel('wartungen', 'erledigt')} value={record.fields.erledigt} format="bool" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('wartungen', 'werkzeug')}
          name={werkzeugTarget?.fields.bezeichnung ?? '—'}
          meta={[werkzeugTarget?.fields.inventarnummer].filter(Boolean).join(' · ') || undefined}
          onClick={werkzeugTarget && onOpenWerkzeuge ? () => onOpenWerkzeuge!(werkzeugTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.WARTUNGEN} recordId={record.record_id} />
    </>
  );
}
