import {
  formatPace,
  titleForRun,
  M_TO_DIST,
  M_TO_ELEV,
  Activity,
  RunIds,
} from '@/utils/utils';
import {
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';
import {
  calculateTrimp,
  formatDurationShort,
  getActivityMinutes,
  getElapsedMinutes,
  parseHrZones,
} from '@/utils/workoutAnalytics';
import { CategoryBar } from '@/components/Dashboard/Primitives';

interface ColumnDef {
  key: string;
  label: string;
}

interface IRunRowProperties {
  elementIndex: number;
  locateActivity: (_runIds: RunIds) => void;
  run: Activity;
  runIndex: number;
  setRunIndex: (_index: number) => void;
  columns: ColumnDef[];
  taxonomyMode: TaxonomyMode;
}

const ZONE_COLORS = ['#94a3b8', '#38bdf8', '#10b981', '#f59e0b', '#ef4444'];
const ZONE_LABELS = ['Z1 恢复', 'Z2 有氧', 'Z3 节奏', 'Z4 阈值', 'Z5 极限'];

const formatZoneDuration = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  return `${(sec / 60).toFixed(1)}m`;
};

const RunRow = ({
  elementIndex,
  locateActivity,
  run,
  runIndex,
  setRunIndex,
  columns,
  taxonomyMode,
}: IRunRowProperties) => {
  const isSelected = runIndex === elementIndex;
  const category = getActivityCategory(run, taxonomyMode);
  const meta = getSportMeta(category);
  const minutes = getActivityMinutes(run);
  const elapsedMin = getElapsedMinutes(run);
  const trimp = calculateTrimp(run);
  const km = (run.distance || 0) / M_TO_DIST;
  const elev = (run.elevation_gain ?? 0) * M_TO_ELEV;
  const paceParts =
    run.average_speed && km > 0 ? formatPace(run.average_speed) : null;
  const hrZones = parseHrZones(run);

  const handleClick = () => {
    if (isSelected) {
      setRunIndex(-1);
      if (run.summary_polyline) {
        locateActivity([]);
      }
      return;
    }
    setRunIndex(elementIndex);
    if (run.summary_polyline) {
      locateActivity([run.run_id]);
    }
  };

  const dash = <span style={{ color: 'var(--color-text-muted)' }}>—</span>;

  const renderCell = (col: ColumnDef) => {
    const borderStyle = { borderColor: 'var(--color-border)' };
    switch (col.key) {
      case 'Type':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="border-b px-2 py-2.5 whitespace-nowrap"
            style={borderStyle}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span>{meta.shortLabel}</span>
            </span>
          </td>
        );
      case 'Time':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={borderStyle}
          >
            {formatDurationShort(minutes)}
          </td>
        );
      case 'Kcal':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right font-medium whitespace-nowrap"
            style={borderStyle}
          >
            {run.calories && run.calories > 0 ? Math.round(run.calories) : dash}
          </td>
        );
      case 'BPM':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={borderStyle}
          >
            {run.average_heartrate ? Math.round(run.average_heartrate) : dash}
          </td>
        );
      case 'MaxHR':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={{
              ...borderStyle,
              color:
                run.max_heartrate && run.max_heartrate >= 175
                  ? '#ea580c'
                  : 'var(--color-text)',
              fontWeight:
                run.max_heartrate && run.max_heartrate >= 175 ? 600 : 400,
            }}
          >
            {run.max_heartrate ? Math.round(run.max_heartrate) : dash}
          </td>
        );
      case 'TRIMP':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={{ ...borderStyle, color: 'var(--color-text-muted)' }}
          >
            {trimp > 0 ? trimp : dash}
          </td>
        );
      case 'KM':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={borderStyle}
          >
            {km > 0 ? km.toFixed(2) : dash}
          </td>
        );
      case 'Elev':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={borderStyle}
          >
            {elev > 0 ? elev.toFixed(0) : dash}
          </td>
        );
      case 'Pace':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={borderStyle}
          >
            {paceParts ?? dash}
          </td>
        );
      case 'Date':
        return (
          <td
            key={col.key}
            data-label={col.label}
            className="font-mono-num border-b px-2 py-2.5 text-right whitespace-nowrap"
            style={{ ...borderStyle, color: 'var(--color-text-muted)' }}
          >
            {run.start_date_local.slice(0, 16)}
          </td>
        );
      default:
        return <td key={col.key} />;
    }
  };

  return (
    <>
      <tr
        data-selected={isSelected ? 'true' : undefined}
        className="cursor-pointer"
        onClick={handleClick}
      >
        <th
          scope="row"
          className="max-w-[260px] truncate border-b px-2 py-2.5"
          style={{ borderColor: 'var(--color-border)' }}
          title={run.name}
        >
          {titleForRun(run)}
        </th>
        {columns.map((c) => renderCell(c))}
      </tr>

      {isSelected && (
        <tr
          data-detail-row="true"
          style={{ backgroundColor: 'var(--color-surface-subtle)' }}
        >
          <td
            colSpan={columns.length + 1}
            className="border-b px-3 py-2.5 text-xs"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="font-mono-num">
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {run.suffer_score ? 'TRIMP（Strava RE） ' : 'TRIMP '}
                </span>
                <strong>{trimp}</strong>
              </span>
              {elapsedMin > minutes + 0.5 && (
                <span className="font-mono-num">
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    总耗时{' '}
                  </span>
                  {formatDurationShort(elapsedMin)}（密度{' '}
                  {Math.round((minutes / elapsedMin) * 100)}%）
                </span>
              )}
              {run.device_name && (
                <span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    设备{' '}
                  </span>
                  {run.device_name}
                </span>
              )}
              {run.location_country && (
                <span className="truncate">
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    地点{' '}
                  </span>
                  {run.location_country}
                </span>
              )}
            </div>
            {run.description && (
              <p
                className="mt-1.5 whitespace-pre-wrap"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {run.description}
              </p>
            )}
            {hrZones && hrZones.some((sec) => sec > 0) && (
              <div className="mt-2.5 max-w-2xl space-y-1.5">
                <div
                  className="text-[11px] font-medium"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  心率区间分布（Z1–Z5）
                </div>
                <CategoryBar
                  segments={hrZones.map((sec, idx) => ({
                    key: `z${idx + 1}`,
                    label: `${ZONE_LABELS[idx]} ${formatZoneDuration(sec)}`,
                    value: sec,
                    color: ZONE_COLORS[idx],
                  }))}
                />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

export default RunRow;
