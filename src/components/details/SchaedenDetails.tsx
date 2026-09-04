import type { Schaeden, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';

export interface SchaedenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Schaeden;
  /** N:1-Ziel „Werkzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  werkzeugeList: Werkzeuge[];
  /** Klick auf die Werkzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenWerkzeuge?: (record: Werkzeuge) => void;
}

export function SchaedenDetails({
  record,
  werkzeugeList,
  onOpenWerkzeuge,
}: SchaedenDetailsProps) {
  const werkzeugTarget = werkzeugeList.find(r => r.record_id === extractRecordId(record.fields.werkzeug));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('schaeden', 'gemeldet_am')} value={record.fields.gemeldet_am} format="date" />
        <RecordField label={fieldLabel('schaeden', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('schaeden', 'foto')} className="md:col-span-2">
          {record.fields.foto ? (
            <MediaThumbnail src={record.fields.foto as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('schaeden', 'werkzeug')}
          name={werkzeugTarget?.fields.bezeichnung ?? '—'}
          meta={[werkzeugTarget?.fields.inventarnummer].filter(Boolean).join(' · ') || undefined}
          onClick={werkzeugTarget && onOpenWerkzeuge ? () => onOpenWerkzeuge!(werkzeugTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.SCHAEDEN} recordId={record.record_id} />
    </>
  );
}
