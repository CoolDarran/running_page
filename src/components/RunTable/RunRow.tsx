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
  showDistanceCols: boolean;
}

const ZONE_COLORS = ['#94a3b8', '#38bdf8', '#10b981', '#f59e0b', '#ef4444'];

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

  const renderCell = (colKey: string) => {
    switch (colKey) {
      case 'Type':
        return (
          <td key={colKey} className="px-2.5 py-2.5 whitespace-nowrap">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${meta.color}1f`,
                color: meta.color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              {meta.shortLabel}
            </span>
          </td>
        );
      case 'Time':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
          >
            {formatDurationShort(minutes)}
          </td>
        );
      case 'Kcal':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right font-medium whitespace-nowrap tabular-nums"
          >
            {run.calories && run.calories > 0 ? Math.round(run.calories) : dash}
          </td>
        );
      case 'BPM':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
          >
            {run.average_heartrate ? Math.round(run.average_heartrate) : dash}
          </td>
        );
      case 'MaxHR':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
          >
            {run.max_heartrate && run.max_heartrate >= 175 ? (
              <span
                className="rounded px-1.5 py-0.5 font-semibold"
                style={{
                  backgroundColor: 'rgba(249,115,22,0.16)',
                  color: '#f97316',
                }}
              >
                {Math.round(run.max_heartrate)}
              </span>
            ) : run.max_heartrate ? (
              Math.round(run.max_heartrate)
            ) : (
              dash
            )}
          </td>
        );
      case 'TRIMP':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {trimp > 0 ? trimp : dash}
          </td>
        );
      case 'KM':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
          >
            {km > 0 ? km.toFixed(2) : dash}
          </td>
        );
      case 'Elev':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
          >
            {elev > 0 ? elev.toFixed(0) : dash}
          </td>
        );
      case 'Pace':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
          >
            {paceParts ?? dash}
          </td>
        );
      case 'Date':
        return (
          <td
            key={colKey}
            className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {run.start_date_local.slice(0, 16)}
          </td>
        );
      default:
        return <td key={colKey} />;
    }
  };

  return (
    <>
      <tr
        className="cursor-pointer border-b transition-colors"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: isSelected
            ? 'var(--color-run-row-hover-background)'
            : 'transparent',
        }}
        onClick={handleClick}
      >
        <td
          className="max-w-[260px] truncate px-2.5 py-2.5 font-medium"
          title={run.name}
        >
          {titleForRun(run)}
        </td>
        {columns.map((c) => renderCell(c.key))}
      </tr>

      {isSelected && (
        <tr
          className="border-b"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface-subtle)',
          }}
        >
          <td colSpan={columns.length + 1} className="px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="tabular-nums">
                <strong style={{ color: 'var(--color-text-muted)' }}>
                  训练负荷 TRIMP：
                </strong>
                {trimp}
              </span>
              {elapsedMin > minutes + 0.5 && (
                <span className="tabular-nums">
                  <strong style={{ color: 'var(--color-text-muted)' }}>
                    总耗时 / 密度：
                  </strong>
                  {formatDurationShort(elapsedMin)}（
                  {Math.round((minutes / elapsedMin) * 100)}%）
                </span>
              )}
              {run.suffer_score ? (
                <span className="tabular-nums">
                  <strong style={{ color: 'var(--color-text-muted)' }}>
                    Strava Relative Effort：
                  </strong>
                  {Math.round(run.suffer_score)}
                </span>
              ) : null}
              {run.device_name && (
                <span>
                  <strong style={{ color: 'var(--color-text-muted)' }}>
                    设备：
                  </strong>
                  {run.device_name}
                </span>
              )}
              {run.location_country && (
                <span className="truncate">
                  <strong style={{ color: 'var(--color-text-muted)' }}>
                    地点：
                  </strong>
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
            {hrZones && (
              <div className="mt-2 flex h-2 w-full max-w-md overflow-hidden rounded-full">
                {hrZones.map((sec, idx) => {
                  const total = hrZones.reduce((a, b) => a + b, 0) || 1;
                  return (
                    <div
                      key={ZONE_COLORS[idx]}
                      title={`Z${idx + 1}: ${Math.round(sec / 60)}m`}
                      style={{
                        width: `${(sec / total) * 100}%`,
                        backgroundColor: ZONE_COLORS[idx],
                      }}
                    />
                  );
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

export default RunRow;
