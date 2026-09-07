import type { Mitarbeiter, Ausleihen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface MitarbeiterDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Mitarbeiter;
  /** 1:N „Ausleihen" (mitarbeiter): VOLLE Liste — der Block filtert auf diesen Record. */
  ausleihenList: Ausleihen[];
  /** Zeilen-Klick → overlay.push auf das Ausleihen-Detail (nie der Edit-Dialog). */
  onOpenAusleihen: (record: Ausleihen) => void;
  /** Kontextuelles „+": öffnet den Ausleihen-Dialog mit diesem Record vorgesetzt. */
  onAddAusleihen: () => void;
}

export function MitarbeiterDetails({
  record,
  ausleihenList,
  onOpenAusleihen,
  onAddAusleihen,
}: MitarbeiterDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('mitarbeiter', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'personalnummer')} value={record.fields.personalnummer} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'abteilung')} value={record.fields.abteilung} format="pill" />
        <RecordField label={fieldLabel('mitarbeiter', 'mobil')} value={record.fields.mobil} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'aktiv')} value={record.fields.aktiv} format="bool" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('ausleihen')}
        items={ausleihenList.filter(r => extractRecordId(r.fields.mitarbeiter) === record.record_id)}
        map={r => ({ name: appLabel('ausleihen'), meta: r.fields.ausgabe })}
        onOpen={onOpenAusleihen}
        onAdd={onAddAusleihen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.MITARBEITER} recordId={record.record_id} />
    </>
  );
}
