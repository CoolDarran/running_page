import { useState, useMemo, useCallback } from 'react';
import {
  sortDateFunc,
  sortDateFuncReverse,
  convertMovingTime2Sec,
  DIST_UNIT,
  Activity,
  RunIds,
} from '@/utils/utils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import {
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';
import { calculateTrimp } from '@/utils/workoutAnalytics';

import RunRow from './RunRow';

interface IRunTableProperties {
  runs: Activity[];
  locateActivity: (_runIds: RunIds) => void;
  runIndex: number;
  setRunIndex: (_index: number) => void;
  taxonomyMode?: TaxonomyMode;
  selectedSport?: string | null;
}

type SortDirection = 'ascending' | 'descending';
type SortKey =
  | 'Type'
  | 'KM'
  | 'Elev'
  | 'Pace'
  | 'BPM'
  | 'MaxHR'
  | 'Kcal'
  | 'TRIMP'
  | 'Time'
  | 'Date';

interface SortState {
  direction: SortDirection;
  key: SortKey;
}

const RunTable = ({
  runs,
  locateActivity,
  runIndex,
  setRunIndex,
  taxonomyMode = 'sub',
  selectedSport = null,
}: IRunTableProperties) => {
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [search, setSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);

  const filteredRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) ||
        getActivityCategory(r, taxonomyMode).toLowerCase().includes(q) ||
        (r.location_country || '').toLowerCase().includes(q)
    );
  }, [runs, search, taxonomyMode]);

  // Adaptive columns: hide 0.00 km / Elev / Pace noise on pure indoor views
  const { showDistanceCols, columns } = useMemo(() => {
    const hasDistance = filteredRuns.some((r) => (r.distance || 0) > 0);
    const isPureIndoor =
      (selectedSport && getSportMeta(selectedSport).indoor) || !hasDistance;
    const isPureOutdoor = selectedSport && !getSportMeta(selectedSport).indoor;

    const cols: Array<{ key: SortKey; label: string }> = isPureIndoor
      ? [
          { key: 'Type', label: '项目' },
          { key: 'Time', label: '时长' },
          { key: 'Kcal', label: 'Kcal' },
          { key: 'BPM', label: '均心率' },
          { key: 'MaxHR', label: '峰值' },
          { key: 'TRIMP', label: '负荷' },
          { key: 'Date', label: '日期' },
        ]
      : isPureOutdoor
        ? [
            { key: 'Type', label: '项目' },
            { key: 'KM', label: DIST_UNIT.toUpperCase() },
            ...(SHOW_ELEVATION_GAIN
              ? [{ key: 'Elev' as SortKey, label: '爬升' }]
              : []),
            { key: 'Pace', label: '配速' },
            { key: 'BPM', label: '均心率' },
            { key: 'Kcal', label: 'Kcal' },
            { key: 'Time', label: '时长' },
            { key: 'Date', label: '日期' },
          ]
        : [
            { key: 'Type', label: '项目' },
            { key: 'Time', label: '时长' },
            { key: 'Kcal', label: 'Kcal' },
            { key: 'BPM', label: '均心率' },
            { key: 'MaxHR', label: '峰值' },
            { key: 'KM', label: DIST_UNIT.toUpperCase() },
            { key: 'Date', label: '日期' },
          ];

    return { showDistanceCols: !isPureIndoor, columns: cols };
  }, [filteredRuns, selectedSport]);

  const displayedRuns = useMemo(() => {
    if (!sortState) return filteredRuns;
    const mult = sortState.direction === 'ascending' ? 1 : -1;
    const k = sortState.key;

    return filteredRuns.slice().sort((a, b) => {
      if (k === 'KM') return ((a.distance || 0) - (b.distance || 0)) * mult;
      if (k === 'Elev') {
        return ((a.elevation_gain ?? 0) - (b.elevation_gain ?? 0)) * mult;
      }
      if (k === 'Pace') {
        return ((a.average_speed ?? 0) - (b.average_speed ?? 0)) * mult;
      }
      if (k === 'BPM') {
        return ((a.average_heartrate ?? 0) - (b.average_heartrate ?? 0)) * mult;
      }
      if (k === 'MaxHR') {
        return ((a.max_heartrate ?? 0) - (b.max_heartrate ?? 0)) * mult;
      }
      if (k === 'Kcal') return ((a.calories ?? 0) - (b.calories ?? 0)) * mult;
      if (k === 'TRIMP') {
        return (calculateTrimp(a) - calculateTrimp(b)) * mult;
      }
      if (k === 'Time') {
        return (
          (convertMovingTime2Sec(a.moving_time) -
            convertMovingTime2Sec(b.moving_time)) *
          mult
        );
      }
      if (k === 'Type') {
        return (
          getActivityCategory(a, taxonomyMode).localeCompare(
            getActivityCategory(b, taxonomyMode)
          ) * mult
        );
      }
      return sortState.direction === 'ascending'
        ? sortDateFuncReverse(a, b)
        : sortDateFunc(a, b);
    });
  }, [filteredRuns, sortState, taxonomyMode]);

  const runIndexById = useMemo(
    () => new Map(runs.map((run, index) => [run.run_id, index])),
    [runs]
  );

  const handleSortClick = useCallback(
    (key: SortKey) => {
      setRunIndex(-1);
      setSortState((cur) => {
        if (cur?.key === key) {
          return {
            key,
            direction:
              cur.direction === 'descending' ? 'ascending' : 'descending',
          };
        }
        return {
          key,
          direction: key === 'Date' ? 'ascending' : 'descending',
        };
      });
    },
    [setRunIndex]
  );

  const visibleRows = displayedRuns.slice(0, visibleLimit);
  const hasMore = visibleRows.length < displayedRuns.length;

  return (
    <section
      className="mt-4 rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">训练明细</h3>
          <span
            className="rounded-full border px-2 py-0.5 text-xs tabular-nums"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface-subtle)',
              color: 'var(--color-text-muted)',
            }}
          >
            {displayedRuns.length} 条
          </span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleLimit(25);
          }}
          placeholder="搜索名称 / 项目 / 城市（如 CrossFit、Hyrox、羽毛球）"
          className="w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none sm:w-72"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface-subtle)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr
              className="border-b"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              <th className="px-2.5 py-2 font-medium">名称</th>
              {columns.map((col) => {
                const arrow =
                  sortState?.key === col.key
                    ? sortState.direction === 'ascending'
                      ? ' ↑'
                      : ' ↓'
                    : '';
                return (
                  <th
                    key={col.key}
                    aria-sort={
                      sortState?.key === col.key
                        ? sortState.direction
                        : undefined
                    }
                    className={`cursor-pointer px-2.5 py-2 font-medium whitespace-nowrap select-none ${
                      col.key === 'Type' ? 'text-left' : 'text-right'
                    }`}
                    onClick={() => handleSortClick(col.key)}
                  >
                    {col.label}
                    {arrow}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((run) => {
                const sourceIndex = runIndexById.get(run.run_id) ?? -1;
                return (
                  <RunRow
                    key={run.run_id}
                    elementIndex={sourceIndex}
                    locateActivity={locateActivity}
                    run={run}
                    runIndex={runIndex}
                    setRunIndex={setRunIndex}
                    columns={columns}
                    taxonomyMode={taxonomyMode}
                    showDistanceCols={showDistanceCols}
                  />
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-8 text-center"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  没有匹配的训练记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {displayedRuns.length > 0 && (
        <div
          className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span className="tabular-nums">
            显示 {visibleRows.length} / {displayedRuns.length} 条
          </span>
          {hasMore && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((n) => n + 30)}
                className="rounded-lg border px-3 py-1 font-medium transition-opacity hover:opacity-80"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-surface-subtle)',
                  color: 'var(--color-text)',
                }}
              >
                加载更多
              </button>
              <button
                type="button"
                onClick={() => setVisibleLimit(displayedRuns.length)}
                className="rounded-lg border px-3 py-1 font-medium transition-opacity hover:opacity-80"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-surface-subtle)',
                  color: 'var(--color-text)',
                }}
              >
                显示全部
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default RunTable;
