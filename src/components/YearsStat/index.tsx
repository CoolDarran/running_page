import { useMemo } from 'react';
import YearStat from '@/components/YearStat';
import useActivities from '@/hooks/useActivities';
import type { TaxonomyMode } from '@/utils/workoutTaxonomy';

const YearsStat = ({
  year,
  selectedSport,
  taxonomyMode,
  onTaxonomyChange,
  onClick,
  onClickTypeInYear,
}: {
  year: string;
  selectedSport?: string | null;
  taxonomyMode?: TaxonomyMode;
  onTaxonomyChange?: (_mode: TaxonomyMode) => void;
  onClick: (_year: string) => void;
  onClickTypeInYear: (_year: string, _type: string) => void;
}) => {
  const { years } = useActivities();

  const yearsArrayUpdate = useMemo(() => {
    let updatedYears = years.slice();
    updatedYears.push('Total');
    updatedYears = updatedYears.filter((x) => x !== year);
    updatedYears.unshift(year);
    return updatedYears;
  }, [years, year]);

  return (
    <div className="w-full space-y-2.5 pb-10">
      {yearsArrayUpdate.map((yearItem) => (
        <YearStat
          key={yearItem}
          year={yearItem}
          isActiveYear={yearItem === year}
          selectedSport={yearItem === year ? selectedSport : null}
          taxonomyMode={taxonomyMode}
          onTaxonomyChange={onTaxonomyChange}
          onClick={onClick}
          onClickTypeInYear={onClickTypeInYear}
        />
      ))}
    </div>
  );
};

export default YearsStat;
