import { lazy, Suspense } from 'react';
import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';

import { formatPace, colorFromType } from '@/utils/utils';
import useHover from '@/hooks/useHover';
import { yearStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import { DIST_UNIT, M_TO_DIST, M_TO_ELEV, ELEV_UNIT } from '@/utils/utils';

const YearStat = ({
  year,
  onClick,
  onClickTypeInYear,
}: {
  year: string;
  onClick: (_year: string) => void;
  onClickTypeInYear: (_year: string, _type: string) => void;
}) => {
  let { activities: runs, years } = useActivities();
  // for hover
  const [hovered, eventHandlers] = useHover();
  // lazy Component
  const YearSVG = lazy(() => loadSvgComponent(yearStats, `./year_${year}.svg`));

  if (years.includes(year)) {
    runs = runs.filter((run) => run.start_date_local.slice(0, 4) === year);
  }
  let sumDistance = 0;
  let streak = 0;
  let pace = 0; // eslint-disable-line no-unused-vars
  let paceNullCount = 0; // eslint-disable-line no-unused-vars
  let sumElevationGain = 0;
  let heartRate = 0;
  let heartRateNullCount = 0;
  let totalMetersAvail = 0;
  let totalSecondsAvail = 0;
  const workoutsCounts: { [key: string]: [number, number, number, number] } =
    {};

  runs.forEach((run) => {
    sumDistance += run.distance || 0;
    sumElevationGain += run.elevation_gain || 0;
    // calculate seconds to get pace
    const runDistance = run.distance || 0;
    const runSeconds =
      run.average_speed && runDistance > 0 && run.average_speed > 0
        ? runDistance / run.average_speed
        : 0;

    if (workoutsCounts[run.type]) {
      totalMetersAvail += runDistance;
      totalSecondsAvail += runSeconds;
      var [oriCount, oriSecondsAvail, oriMetersAvail, oriCalories] =
        workoutsCounts[run.type];
      workoutsCounts[run.type] = [
        oriCount + 1,
        oriSecondsAvail + runSeconds,
        oriMetersAvail + runDistance,
        oriCalories + (run.calories || 0),
      ];
    } else {
      workoutsCounts[run.type] = [
        1,
        runSeconds,
        runDistance,
        run.calories || 0,
      ];
    }
    if (run.average_heartrate) {
      heartRate += run.average_heartrate;
    } else {
      heartRateNullCount++;
    }
    if (run.streak) {
      streak = Math.max(streak, run.streak);
    }
  });
  sumDistance = parseFloat((sumDistance / M_TO_DIST).toFixed(0));
  const sumElevationGainStr = (sumElevationGain * M_TO_ELEV).toFixed(0);
  const hasPace = totalSecondsAvail > 0;
  const avgPace = formatPace(totalMetersAvail / totalSecondsAvail);
  const hasHeartRate = !(heartRate === 0);
  const avgHeartRate = (heartRate / (runs.length - heartRateNullCount)).toFixed(
    0
  );

  const workoutsArr = Object.entries(workoutsCounts);
  workoutsArr.sort((a, b) => {
    return b[1][0] - a[1][0];
  });

  return (
    <div
      className="cursor-pointer rounded p-2 transition-all hover:bg-zinc-800/30"
      onClick={() => onClick(year)}
      {...eventHandlers}
    >
      <section>
        <div className="mb-4">
          <Stat value={year} description=" Journey" className="text-4xl" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {sumDistance > 0 && (
            <div className="col-span-2 mb-2 grid grid-cols-2 gap-4 border-b border-zinc-700 pb-4">
              <div className="flex flex-col">
                <span className="text-3xl font-bold italic">{runs.length}</span>
                <span className="text-sm opacity-70">Total Activities</span>
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-bold italic">{sumDistance}</span>
                <span className="text-sm opacity-70">Total KM</span>
              </div>
              {SHOW_ELEVATION_GAIN && sumElevationGain > 0 && (
                <div className="flex flex-col">
                  <span className="text-3xl font-bold italic">
                    {sumElevationGainStr}
                  </span>
                  <span className="text-sm opacity-70">
                    {ELEV_UNIT} Elev Gain
                  </span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-3xl font-bold italic">{streak}</span>
                <span className="text-sm opacity-70">Day Swipe</span>
              </div>
            </div>
          )}

          {workoutsArr.map(([type, count]) => (
            <div
              key={type}
              className="flex flex-col transition-opacity hover:opacity-80"
              onClick={(e) => {
                onClickTypeInYear(year, type);
                e.stopPropagation();
              }}
            >
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold italic">{count[0]}</span>
                <span className="text-xs font-semibold uppercase opacity-70">
                  {type}s
                </span>
              </div>
              <div className="text-xs opacity-50">
                {count[2] > 0 ? (
                  <>{(count[2] / 1000.0).toFixed(0)} KM</>
                ) : (
                  <>{count[3].toFixed(0)} KCAL</>
                )}
              </div>
            </div>
          ))}
        </div>

        {hasPace && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-700 pt-4">
            <div className="flex flex-col">
              <span className="text-2xl font-bold italic">{avgPace}</span>
              <span className="text-sm opacity-70">Avg Pace</span>
            </div>
            {hasHeartRate && (
              <div className="flex flex-col">
                <span className="text-2xl font-bold italic">
                  {avgHeartRate}
                </span>
                <span className="text-sm opacity-70">Avg Heart Rate</span>
              </div>
            )}
          </div>
        )}
      </section>
      {year !== 'Total' && hovered && (
        <Suspense fallback="loading...">
          <YearSVG className="year-svg my-4 h-4/6 w-4/6 border-0 p-0" />
        </Suspense>
      )}
      <hr className="mt-4 border-zinc-700" />
    </div>
  );
};

export default YearStat;
