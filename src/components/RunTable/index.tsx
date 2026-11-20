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

  const columns = useMemo(() => {
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

    return cols;
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
    <section className="pt-2">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2
            id="activities-table-heading"
            className="text-sm font-semibold tracking-tight"
          >
            训练记录
          </h2>
          <span
            className="font-mono-num text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {displayedRuns.length}
          </span>
        </div>
        <input
          type="search"
          aria-label="搜索训练记录"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleLimit(25);
          }}
          placeholder="搜索名称、项目或城市"
          className="w-full border-b bg-transparent py-1 text-xs focus:outline-none sm:w-56"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      {/* Responsive accessible table container (modern-web-guidance: responsive-table) */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="activities-table-heading"
        className="mwg-table-wrapper"
      >
        <table className="mwg-table">
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b px-2 py-2 text-left text-xs font-medium"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                名称
              </th>
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
                    scope="col"
                    aria-sort={
                      sortState?.key === col.key
                        ? sortState.direction
                        : undefined
                    }
                    className={`border-b px-2 py-2 text-xs font-medium whitespace-nowrap ${
                      col.key === 'Type' ? 'text-left' : 'text-right'
                    }`}
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSortClick(col.key)}
                      className="inline-flex items-center gap-0.5 hover:opacity-100"
                    >
                      {col.label}
                      {arrow}
                    </button>
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
                  />
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-8 text-center text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  无匹配记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {displayedRuns.length > 0 && (
        <div
          className="mt-3 flex items-center justify-between text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span className="font-mono-num">
            {visibleRows.length} / {displayedRuns.length}
          </span>
          {hasMore && (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setVisibleLimit((n) => n + 30)}
                className="underline underline-offset-4 hover:opacity-80"
                style={{ color: 'var(--color-text)' }}
              >
                加载更多
              </button>
              <button
                type="button"
                onClick={() => setVisibleLimit(displayedRuns.length)}
                className="hover:opacity-80"
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
