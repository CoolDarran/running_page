import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import LocationStat from '@/components/LocationStat';
import RunMap from '@/components/RunMap';
import RunTable from '@/components/RunTable';
import WeeklyStat from '@/components/WeeklyStat';
import YearsStat from '@/components/YearsStat';
import ActivityHeatmap from '@/components/Dashboard/ActivityHeatmap';
import TrainingInsights from '@/components/Dashboard/TrainingInsights';
import WeeklyCoachBar from '@/components/Dashboard/WeeklyCoachBar';
import useActivities from '@/hooks/useActivities';
import getSiteMetadata from '@/hooks/useSiteMetadata';
import { useInterval } from '@/hooks/useInterval';
import { INFO_MESSAGE, IS_CHINESE } from '@/utils/const';
import {
  Activity,
  filterAndSortRuns,
  filterCityRuns,
  filterTitleRuns,
  filterYearRuns,
  scrollToMap,
  sortDateFunc,
  titleForShow,
  RunIds,
} from '@/utils/utils';
import {
  geoJsonForRuns,
  getBoundsForGeoData,
  type IViewState,
} from '@/utils/geoUtils';
import { useTheme, useThemeChangeCounter } from '@/hooks/useTheme';
import {
  getSportMeta,
  isOutdoorSport,
  matchesCategoryFilter,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';

type MainViewTab = 'overview' | 'insights' | 'map';
const TAB_ORDER: MainViewTab[] = ['overview', 'insights', 'map'];

const HASH_RUN_CHANGE_EVENT = 'running-page-hash-run-change';

const getRunIdFromHash = () => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace('#', '');
  if (!hash.startsWith('run_')) return null;
  const runId = parseInt(hash.replace('run_', ''), 10);
  return Number.isNaN(runId) ? null : runId;
};

const subscribeToRunHash = (onStoreChange: () => void) => {
  window.addEventListener('hashchange', onStoreChange);
  window.addEventListener(HASH_RUN_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('hashchange', onStoreChange);
    window.removeEventListener(HASH_RUN_CHANGE_EVENT, onStoreChange);
  };
};

const notifyRunHashChange = () => {
  window.dispatchEvent(new Event(HASH_RUN_CHANGE_EVENT));
};

const clearRunHash = () => {
  if (window.location.hash) {
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    notifyRunHashChange();
  }
};

const setRunHash = (runId: number) => {
  const newHash = `#run_${runId}`;
  if (window.location.hash !== newHash) {
    window.history.pushState(null, '', newHash);
    notifyRunHashChange();
  }
};

const useRunHashId = () =>
  useSyncExternalStore(subscribeToRunHash, getRunIdFromHash, () => null);

const Index = () => {
  const { siteTitle, siteUrl } = getSiteMetadata();
  const { activities, thisYear, years } = useActivities();
  const themeChangeCounter = useThemeChangeCounter();
  const [year, setYear] = useState(thisYear);
  const [taxonomyMode, setTaxonomyMode] = useState<TaxonomyMode>('sub');
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainViewTab>('overview');
  const tabElementsRef = useRef<Record<MainViewTab, HTMLButtonElement | null>>({
    overview: null,
    insights: null,
    map: null,
  });

  const infoMessage = useMemo(
    () => INFO_MESSAGE(years.length, year),
    [years.length, year]
  );
  const [runIndex, setRunIndex] = useState(-1);
  const [title, setTitle] = useState('');
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAnimationIndex, setCurrentAnimationIndex] = useState(0);
  const [animationRuns, setAnimationRuns] = useState<Activity[]>([]);
  const [currentFilter, setCurrentFilter] = useState<{
    item: string;
    func: (_run: Activity, _value: string) => boolean;
    item2?: string | null;
    func2?: ((_run: Activity, _value: string) => boolean) | null;
  }>({ item: thisYear, func: filterYearRuns, item2: null, func2: null });

  const singleRunId = useRunHashId();
  const [animationTrigger, setAnimationTrigger] = useState(0);

  const filterByCategory = useCallback(
    (run: Activity, category: string) =>
      matchesCategoryFilter(run, category, taxonomyMode),
    [taxonomyMode]
  );

  const runs = useMemo(() => {
    return filterAndSortRuns(
      activities,
      currentFilter.item,
      currentFilter.func,
      sortDateFunc,
      currentFilter.item2 ?? null,
      currentFilter.func2 ?? null
    );
  }, [
    activities,
    currentFilter.item,
    currentFilter.func,
    currentFilter.item2,
    currentFilter.func2,
  ]);

  const tableRuns = useMemo(() => {
    if (!selectedDate) return runs;
    return runs.filter((r) => r.start_date_local.slice(0, 10) === selectedDate);
  }, [runs, selectedDate]);

  const gpsCount = useMemo(
    () => runs.filter((r) => Boolean(r.summary_polyline)).length,
    [runs]
  );

  const geoData = useMemo(() => {
    void themeChangeCounter;
    return geoJsonForRuns(runs);
  }, [runs, themeChangeCounter]);

  const bounds = useMemo(() => getBoundsForGeoData(geoData), [geoData]);

  const [viewState, setViewState] = useState<IViewState>(() => ({
    ...bounds,
  }));

  const [animatedGeoData, setAnimatedGeoData] = useState(geoData);

  useInterval(
    () => {
      if (!isAnimating || currentAnimationIndex >= animationRuns.length) {
        setIsAnimating(false);
        setAnimatedGeoData(geoData);
        return;
      }

      const runsNum = animationRuns.length;
      const sliceNum = runsNum >= 8 ? Math.ceil(runsNum / 8) : 1;
      const nextIndex = Math.min(currentAnimationIndex + sliceNum, runsNum);
      const tempRuns = animationRuns.slice(0, nextIndex);
      setAnimatedGeoData(geoJsonForRuns(tempRuns));
      setCurrentAnimationIndex(nextIndex);

      if (nextIndex >= runsNum) {
        setIsAnimating(false);
        setAnimatedGeoData(geoData);
      }
    },
    isAnimating ? 300 : null
  );

  const startAnimation = useCallback(
    (runsToAnimate: Activity[]) => {
      if (runsToAnimate.length === 0) {
        setAnimatedGeoData(geoData);
        return;
      }

      const sliceNum =
        runsToAnimate.length >= 8 ? Math.ceil(runsToAnimate.length / 8) : 1;
      setAnimationRuns(runsToAnimate);
      setCurrentAnimationIndex(sliceNum);
      setIsAnimating(true);
    },
    [geoData]
  );

  const selectTab = useCallback((nextTab: MainViewTab, shouldFocus = false) => {
    setActiveTab(nextTab);
    const el = tabElementsRef.current[nextTab];
    if (el) {
      if (shouldFocus) el.focus();
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const idx = TAB_ORDER.indexOf(activeTab);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length], true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectTab(
          TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length],
          true
        );
      } else if (e.key === 'Home') {
        e.preventDefault();
        selectTab(TAB_ORDER[0], true);
      } else if (e.key === 'End') {
        e.preventDefault();
        selectTab(TAB_ORDER[TAB_ORDER.length - 1], true);
      }
    },
    [activeTab, selectTab]
  );

  const changeByItem = useCallback(
    (
      item: string,
      name: string,
      func: (_run: Activity, _value: string) => boolean
    ) => {
      scrollToMap();
      if (name != 'Year') {
        setYear(thisYear);
      }
      setCurrentFilter({ item, func, item2: null, func2: null });
      setSelectedSport(null);
      setSelectedDate(null);
      setRunIndex(-1);
      setTitle(
        name === 'Year'
          ? item === 'Total'
            ? '全部户外轨迹'
            : `${item} 年户外轨迹`
          : `${item} 轨迹`
      );
      clearRunHash();
    },
    [thisYear]
  );

  const changeTypeInYear = useCallback(
    (targetYear: string, sport: string) => {
      if (selectedSport === sport && year === targetYear) {
        setSelectedSport(null);
        setSelectedDate(null);
        setCurrentFilter({
          item: targetYear,
          func: filterYearRuns,
          item2: null,
          func2: null,
        });
        setRunIndex(-1);
        setTitle(
          targetYear === 'Total' ? '全部户外轨迹' : `${targetYear} 年户外轨迹`
        );
        clearRunHash();
        return;
      }

      scrollToMap();
      setYear(targetYear);
      setSelectedSport(sport);
      setSelectedDate(null);
      if (targetYear !== 'Total') {
        setCurrentFilter({
          item: targetYear,
          func: filterYearRuns,
          item2: sport,
          func2: filterByCategory,
        });
      } else {
        setCurrentFilter({
          item: sport,
          func: filterByCategory,
          item2: null,
          func2: null,
        });
      }
      if (isOutdoorSport(sport)) {
        setActiveTab('map');
      }
      setRunIndex(-1);
      setTitle(
        `${targetYear === 'Total' ? '全部' : `${targetYear} 年`} · ${sport} 轨迹`
      );
      clearRunHash();
    },
    [selectedSport, year, filterByCategory]
  );

  const changeYear = useCallback(
    (y: string) => {
      setYear(y);

      if ((viewState.zoom ?? 0) > 3 && bounds) {
        setViewState({ ...bounds });
      }

      changeByItem(y, 'Year', filterYearRuns);
      setIsAnimating(false);
    },
    [viewState.zoom, bounds, changeByItem]
  );

  const changeCity = useCallback(
    (city: string) => {
      setActiveTab('map');
      changeByItem(city, 'City', filterCityRuns);
    },
    [changeByItem]
  );

  const changeTitle = useCallback(
    (newTitle: string) => {
      changeByItem(newTitle, 'Title', filterTitleRuns);
    },
    [changeByItem]
  );

  const changeType = useCallback(
    (type: string) => {
      setSelectedSport(type);
      setSelectedDate(null);
      setCurrentFilter({
        item: type,
        func: filterByCategory,
        item2: null,
        func2: null,
      });
      if (isOutdoorSport(type)) {
        setActiveTab('map');
      }
      setRunIndex(-1);
      setTitle(`${type} 轨迹`);
      clearRunHash();
    },
    [filterByCategory]
  );

  const handleTaxonomyChange = useCallback(
    (mode: TaxonomyMode) => {
      setTaxonomyMode(mode);
      if (selectedSport) {
        setSelectedSport(null);
        setCurrentFilter({
          item: year,
          func: filterYearRuns,
          item2: null,
          func2: null,
        });
      }
    },
    [selectedSport, year]
  );

  const locateActivity = useCallback(
    (runIds: RunIds) => {
      const ids = new Set(runIds);
      const selectedRuns = !runIds.length
        ? runs
        : runs.filter((run: Activity) => ids.has(run.run_id));

      if (!selectedRuns.length) return;

      const lastRun = selectedRuns.slice().sort(sortDateFunc)[0];
      if (!lastRun) return;

      if (runIds.length === 1) {
        const runId = runIds[0];
        const runIdx = runs.findIndex((run) => run.run_id === runId);
        setRunIndex(runIdx);
        setRunHash(runId);
        if (lastRun.summary_polyline) {
          setActiveTab('map');
        }
      } else {
        setRunIndex(-1);
        clearRunHash();
      }

      const selectedGeoData = geoJsonForRuns(selectedRuns);
      const selectedBounds = getBoundsForGeoData(selectedGeoData);

      setIsAnimating(false);
      setAnimatedGeoData(selectedGeoData);

      if (runIds.length === 1) {
        setAnimationTrigger((prev) => prev + 1);
      }

      setViewState({ ...selectedBounds });
      setTitle(titleForShow(lastRun));
      if (lastRun.summary_polyline) {
        scrollToMap();
      }
    },
    [runs]
  );

  useEffect(() => {
    if (singleRunId !== null && activities.length > 0) {
      const frameId = requestAnimationFrame(() => {
        const targetRun = activities.find((run) => run.run_id === singleRunId);
        if (targetRun) {
          const runYear = targetRun.start_date_local.slice(0, 4);
          if (year !== runYear) {
            setYear(runYear);
            setCurrentFilter({ item: runYear, func: filterYearRuns });
          }
          if (targetRun.summary_polyline) {
            setActiveTab('map');
          }
        } else {
          window.history.replaceState(null, '', window.location.pathname);
          notifyRunHashChange();
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [singleRunId, activities, year]);

  useEffect(() => {
    if (singleRunId !== null && runs.length > 0) {
      const frameId = requestAnimationFrame(() => {
        const runExistsInCurrentRuns = runs.some(
          (run) => run.run_id === singleRunId
        );
        if (runExistsInCurrentRuns) {
          locateActivity([singleRunId]);
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [runs, singleRunId, locateActivity]);

  useEffect(() => {
    if (singleRunId === null) {
      const frameId = requestAnimationFrame(() => {
        setViewState((prev) => ({ ...prev, ...bounds }));
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [bounds, singleRunId]);

  useEffect(() => {
    if (singleRunId === null) {
      const frameId = requestAnimationFrame(() => startAnimation(runs));
      return () => cancelAnimationFrame(frameId);
    }
  }, [runs, startAnimation, singleRunId]);

  const { theme } = useTheme();
  void changeTitle;

  const resetFilters = () => {
    setSelectedSport(null);
    setSelectedDate(null);
    setCurrentFilter({
      item: year,
      func: filterYearRuns,
      item2: null,
      func2: null,
    });
    setRunIndex(-1);
    clearRunHash();
  };

  return (
    <Layout>
      <Helmet>
        <html lang="zh-CN" data-theme={theme} />
      </Helmet>

      {/* Left Sidebar */}
      <aside
        className={`relative w-full lg:shrink-0 ${desktopSidebarOpen ? 'lg:w-[290px] lg:pr-8 xl:w-[310px]' : 'lg:w-10'}`}
      >
        <button
          type="button"
          className="absolute top-0 right-2 hidden h-7 w-7 items-center justify-center rounded-md opacity-60 hover:opacity-100 lg:inline-flex"
          aria-expanded={desktopSidebarOpen}
          aria-controls="sidebar-content"
          aria-label={desktopSidebarOpen ? '收起侧栏' : '展开侧栏'}
          onClick={() => setDesktopSidebarOpen((open) => !open)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d={desktopSidebarOpen ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
          </svg>
        </button>

        <div className="flex items-center justify-between gap-3 lg:block">
          <h1
            className={`my-3 min-w-0 text-3xl font-bold tracking-tight break-words lg:my-1 lg:mb-2 ${desktopSidebarOpen ? '' : 'lg:hidden'}`}
          >
            <a href={siteUrl}>{siteTitle}</a>
          </h1>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border opacity-75 hover:opacity-100 lg:hidden"
            style={{ borderColor: 'var(--color-border)' }}
            aria-label={mobileSidebarOpen ? '收起年度筛选' : '展开年度筛选'}
            aria-expanded={mobileSidebarOpen}
            aria-controls="sidebar-content"
            onClick={() => setMobileSidebarOpen((open) => !open)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d={mobileSidebarOpen ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} />
            </svg>
          </button>
        </div>

        <div className={desktopSidebarOpen ? 'mb-5' : 'lg:hidden'}>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {infoMessage}
          </p>
        </div>

        <div
          id="sidebar-content"
          className={`${mobileSidebarOpen ? 'block' : 'hidden'} ${desktopSidebarOpen ? 'lg:block' : 'lg:hidden'}`}
        >
          {activeTab === 'map' && (viewState.zoom ?? 0) <= 3 && IS_CHINESE ? (
            <LocationStat
              changeYear={changeYear}
              changeCity={changeCity}
              changeType={changeType}
              onClickTypeInYear={changeTypeInYear}
            />
          ) : (
            <YearsStat
              year={year}
              selectedSport={selectedSport}
              taxonomyMode={taxonomyMode}
              onTaxonomyChange={handleTaxonomyChange}
              onClick={changeYear}
              onClickTypeInYear={changeTypeInYear}
            />
          )}
        </div>
      </aside>

      {/* Right Main Workspace */}
      <div className="w-full min-w-0 space-y-6 lg:flex-1" id="map-container">
        {/* Accessible Single-Row Underline Tabs + Inline Filter Readout */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div
            role="tablist"
            aria-label="训练视图"
            className="mwg-tablist"
            onKeyDown={handleTabKeyDown}
          >
            {(
              [
                ['overview', '训练看板'],
                ['insights', '深度分析'],
                ['map', `轨迹地图 (${gpsCount})`],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                ref={(el) => {
                  tabElementsRef.current[tabKey] = el;
                }}
                id={`tab-${tabKey}`}
                type="button"
                role="tab"
                tabIndex={activeTab === tabKey ? 0 : -1}
                aria-selected={activeTab === tabKey}
                onClick={() => selectTab(tabKey)}
                className="mwg-tab"
              >
                {label}
              </button>
            ))}
          </div>

          {(selectedSport || selectedDate) && (
            <div
              className="flex flex-wrap items-center gap-3 pb-1.5 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {selectedSport && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: getSportMeta(selectedSport).color,
                    }}
                  />
                  <span style={{ color: 'var(--color-text)' }}>
                    {getSportMeta(selectedSport).label}
                  </span>
                </span>
              )}
              {selectedDate && (
                <span
                  className="font-mono-num"
                  style={{ color: 'var(--color-text)' }}
                >
                  {selectedDate}
                </span>
              )}
              <button
                type="button"
                onClick={resetFilters}
                className="underline underline-offset-4 hover:opacity-80"
              >
                清除筛选
              </button>
            </div>
          )}
        </div>

        {/* Active Tab Panels */}
        {activeTab === 'overview' && (
          <div
            role="tabpanel"
            aria-labelledby="tab-overview"
            className="space-y-6"
          >
            {(year === thisYear || year === 'Total') && !selectedSport && (
              <WeeklyCoachBar
                allActivities={activities}
                onOpenInsights={() => selectTab('insights')}
              />
            )}
            <ActivityHeatmap
              activities={runs}
              year={year}
              taxonomyMode={taxonomyMode}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            <WeeklyStat runs={runs} taxonomyMode={taxonomyMode} />
          </div>
        )}

        {activeTab === 'insights' && (
          <div role="tabpanel" aria-labelledby="tab-insights">
            <TrainingInsights
              allActivities={activities}
              filteredActivities={runs}
              taxonomyMode={taxonomyMode}
              year={year}
            />
          </div>
        )}

        {activeTab === 'map' && (
          <div role="tabpanel" aria-labelledby="tab-map" className="space-y-6">
            <RunMap
              title={title}
              viewState={viewState}
              geoData={animatedGeoData}
              setViewState={setViewState}
              changeYear={changeYear}
              thisYear={year}
              animationTrigger={animationTrigger}
            />
            <WeeklyStat runs={runs} taxonomyMode={taxonomyMode} />
          </div>
        )}

        {/* Activity Table */}
        <RunTable
          runs={tableRuns}
          locateActivity={locateActivity}
          runIndex={runIndex}
          setRunIndex={setRunIndex}
          taxonomyMode={taxonomyMode}
          selectedSport={selectedSport}
        />
      </div>

      {import.meta.env.VERCEL && <Analytics />}
    </Layout>
  );
};

export default Index;
