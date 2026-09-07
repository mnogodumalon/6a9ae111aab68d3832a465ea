import type { Werkzeuge, Ausleihen, Wartungen, Schaeden } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { MapRouteLinks } from '@/components/widgets/MapWidget';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface WerkzeugeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Werkzeuge;
  /** N:1-Ziel „Werkzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  werkzeugeList: Werkzeuge[];
  /** Klick auf die Werkzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenWerkzeuge?: (record: Werkzeuge) => void;
  /** 1:N „Ausleihen" (werkzeug): VOLLE Liste — der Block filtert auf diesen Record. */
  ausleihenList: Ausleihen[];
  /** Zeilen-Klick → overlay.push auf das Ausleihen-Detail (nie der Edit-Dialog). */
  onOpenAusleihen: (record: Ausleihen) => void;
  /** Kontextuelles „+": öffnet den Ausleihen-Dialog mit diesem Record vorgesetzt. */
  onAddAusleihen: () => void;
  /** 1:N „Wartungen" (werkzeug): VOLLE Liste — der Block filtert auf diesen Record. */
  wartungenList: Wartungen[];
  /** Zeilen-Klick → overlay.push auf das Wartungen-Detail (nie der Edit-Dialog). */
  onOpenWartungen: (record: Wartungen) => void;
  /** Kontextuelles „+": öffnet den Wartungen-Dialog mit diesem Record vorgesetzt. */
  onAddWartungen: () => void;
  /** 1:N „Schäden" (werkzeug): VOLLE Liste — der Block filtert auf diesen Record. */
  schaedenList: Schaeden[];
  /** Zeilen-Klick → overlay.push auf das Schaeden-Detail (nie der Edit-Dialog). */
  onOpenSchaeden: (record: Schaeden) => void;
  /** Kontextuelles „+": öffnet den Schaeden-Dialog mit diesem Record vorgesetzt. */
  onAddSchaeden: () => void;
}

export function WerkzeugeDetails({
  record,
  werkzeugeList,
  onOpenWerkzeuge,
  ausleihenList,
  onOpenAusleihen,
  onAddAusleihen,
  wartungenList,
  onOpenWartungen,
  onAddWartungen,
  schaedenList,
  onOpenSchaeden,
  onAddSchaeden,
}: WerkzeugeDetailsProps) {
  const ersatz_fuerTarget = werkzeugeList.find(r => r.record_id === extractRecordId(record.fields.ersatz_fuer));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('werkzeuge', 'bezeichnung')} value={record.fields.bezeichnung} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'inventarnummer')} value={record.fields.inventarnummer} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'status')} value={record.fields.status} format="pill" />
        <RecordField label={fieldLabel('werkzeuge', 'bestand')} value={record.fields.bestand} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'standort')}>
          {record.fields.standort ? (
            <div className="space-y-1">
              <div>{record.fields.standort.info ?? `${record.fields.standort.lat}, ${record.fields.standort.long}`}</div>
              {/* Directions links — the map popup is hover-fleeting; the overlay
                  is the only mobile-reachable place for navigation. */}
              <MapRouteLinks lat={record.fields.standort.lat} long={record.fields.standort.long} />
            </div>
          ) : '—'}
        </RecordField>
        <RecordField label={fieldLabel('werkzeuge', 'anschaffungspreis')} value={record.fields.anschaffungspreis} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'handbuch')} value={record.fields.handbuch} format="url" />
        <RecordField label={fieldLabel('werkzeuge', 'kategorien')} value={Array.isArray(record.fields.kategorien) ? record.fields.kategorien.map((v: unknown) => (v && typeof v === 'object' && 'label' in v) ? (v as {label: unknown}).label : v).join(', ') : null} format="text" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('werkzeuge', 'ersatz_fuer')}
          name={ersatz_fuerTarget?.fields.bezeichnung ?? '—'}
          meta={[ersatz_fuerTarget?.fields.inventarnummer].filter(Boolean).join(' · ') || undefined}
          onClick={ersatz_fuerTarget && onOpenWerkzeuge ? () => onOpenWerkzeuge!(ersatz_fuerTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={appLabel('ausleihen')}
        items={ausleihenList.filter(r => extractRecordId(r.fields.werkzeug) === record.record_id)}
        map={r => ({ name: appLabel('ausleihen'), meta: r.fields.ausgabe })}
        onOpen={onOpenAusleihen}
        onAdd={onAddAusleihen}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('wartungen')}
        items={wartungenList.filter(r => extractRecordId(r.fields.werkzeug) === record.record_id)}
        map={r => ({ name: appLabel('wartungen'), meta: r.fields.datum })}
        onOpen={onOpenWartungen}
        onAdd={onAddWartungen}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('schaeden')}
        items={schaedenList.filter(r => extractRecordId(r.fields.werkzeug) === record.record_id)}
        map={r => ({ name: appLabel('schaeden'), meta: r.fields.gemeldet_am })}
        onOpen={onOpenSchaeden}
        onAdd={onAddSchaeden}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.WERKZEUGE} recordId={record.record_id} />
    </>
  );
}
