import { lazy, Suspense } from 'react';
import Stat from '@/components/Stat';
import WorkoutStat from '@/components/WorkoutStat';
import useActivities from '@/hooks/useActivities';
// eslint-disable-next-line no-unused-vars
import { formatPace, colorFromType } from '@/utils/utils';
import useHover from '@/hooks/useHover';
import { yearStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';

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
  const workoutsCounts: { [key: string]: [number, number, number] } = {};

  runs.forEach((run) => {
    sumDistance += run.distance || 0;
    sumElevationGain += run.elevation_gain || 0;
    if (run.average_speed) {
      if (workoutsCounts[run.type]) {
        totalMetersAvail += run.distance || 0;
        totalSecondsAvail += (run.distance || 0) / run.average_speed;
        var [oriCount, oriSecondsAvail, oriMetersAvail] =
          workoutsCounts[run.type];
        workoutsCounts[run.type] = [
          oriCount + 1,
          oriSecondsAvail + (run.distance || 0) / run.average_speed,
          oriMetersAvail + (run.distance || 0),
        ];
      } else {
        workoutsCounts[run.type] = [
          1,
          (run.distance || 0) / run.average_speed,
          run.distance,
        ];
      }
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
  const sumElevationGainStr = sumElevationGain.toFixed(0);
  sumDistance = parseFloat((sumDistance / 1000.0).toFixed(1));
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
    <div className="cursor-pointer" onClick={() => onClick(year)}>
      <section {...eventHandlers}>
        <Stat value={year} description=" Journey" />
        {sumDistance > 0 && (
          <WorkoutStat
            key="total"
            value={runs.length}
            description={' Total'}
            distance={(sumDistance / 1000.0).toFixed(0)}
          />
        )}
        {workoutsArr.map(([type, count]) => (
          <WorkoutStat
            key={type}
            value={count[0]}
            description={` ${type}` + 's'}
            pace={formatPace(count[2] / count[1])}
            distance={(count[2] / 1000.0).toFixed(0)}
            // color={colorFromType(type)}
            onClick={(e: Event) => {
              onClickTypeInYear(year, type);
              e.stopPropagation();
            }}
          />
        ))}
        {hasPace && <Stat value={avgPace} description=" Avg Pace" />}
        {SHOW_ELEVATION_GAIN && sumElevationGain > 0 && (
          <Stat
            value={`${sumElevationGainStr} `}
            description="M Elev Gain"
            className="pb-2"
          />
        )}
        <Stat value={`${streak} day`} description=" Streak" className="pb-2" />
        {hasHeartRate && (
          <Stat value={avgHeartRate} description=" Avg Heart Rate" />
        )}
      </section>
      {year !== 'Total' && hovered && (
        <Suspense fallback="loading...">
          <YearSVG className="year-svg my-4 h-4/6 w-4/6 border-0 p-0" />
        </Suspense>
      )}
      <hr />
    </div>
  );
};

export default YearStat;
