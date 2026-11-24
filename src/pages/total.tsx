import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import ActivityList from '@/components/ActivityList';
import Header from '@/components/Header';
import { useTheme } from '@/hooks/useTheme';

const SummaryPage = () => {
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <Helmet>
        <html lang="zh-CN" data-theme={theme} />
        <title>周期汇总 · danran workouts</title>
      </Helmet>
      <Header />
      <main className="mx-auto max-w-[1440px] px-4 pt-6 pb-16 lg:px-16">
        <ActivityList />
      </main>
    </>
  );
};

export default SummaryPage;
