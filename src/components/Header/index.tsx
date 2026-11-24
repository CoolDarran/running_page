import { Link, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import getSiteMetadata from '@/hooks/useSiteMetadata';
import { useTheme, Theme } from '@/hooks/useTheme';
import styles from './style.module.css';
import { ReactComponent as StravaSvg } from '@assets/strava.svg';
import { ReactComponent as WatchSvg } from '@assets/watch.svg';

const Header = () => {
  const { navLinks } = getSiteMetadata();
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();

  const icons: Record<Theme, ReactElement> = {
    dark: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 22 23"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M21.7519 15.0137C20.597 15.4956 19.3296 15.7617 18 15.7617C12.6152 15.7617 8.25 11.3965 8.25 6.01171C8.25 4.68211 8.51614 3.41468 8.99806 2.25977C5.47566 3.72957 3 7.20653 3 11.2617C3 16.6465 7.36522 21.0117 12.75 21.0117C16.8052 21.0117 20.2821 18.536 21.7519 15.0137Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    light: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 3.00464V5.25464M18.364 5.64068L16.773 7.23167M21 12.0046H18.75M18.364 18.3686L16.773 16.7776M12 18.7546V21.0046M7.22703 16.7776L5.63604 18.3686M5.25 12.0046H3M7.22703 7.23167L5.63604 5.64068M15.75 12.0046C15.75 14.0757 14.0711 15.7546 12 15.7546C9.92893 15.7546 8.25 14.0757 8.25 12.0046C8.25 9.93357 9.92893 8.25464 12 8.25464C14.0711 8.25464 15.75 9.93357 15.75 12.0046Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  };

  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
  const nextThemeLabel =
    nextTheme === 'dark' ? '切换为深色主题' : '切换为浅色主题';

  const handleToggle = () => {
    setTheme(nextTheme);
  };

  const isHome = pathname === '/' || pathname === '';

  return (
    <header className="border-b" style={{ borderColor: 'var(--color-border)' }}>
      <nav
        aria-label="主导航"
        className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 lg:px-16"
      >
        <div className="flex items-center gap-5">
          <Link
            to="/"
            aria-label="返回首页"
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
            style={{ color: 'var(--color-text)' }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M 54.2 32 L 9.8 32 L 47.2 14 L 20.9 32 L 9.8 32 L 40.3 50 L 25.1 14 L 9.8 32 L 40.3 50"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              to="/"
              aria-current={isHome ? 'page' : undefined}
              className="py-1 font-medium transition-colors"
              style={{
                color: isHome ? 'var(--color-text)' : 'var(--color-text-muted)',
                borderBottom: isHome
                  ? '2px solid var(--color-brand)'
                  : '2px solid transparent',
              }}
            >
              首页
            </Link>
            {navLinks.map((n) => {
              const active = !n.url.startsWith('http') && pathname === n.url;
              return n.url.startsWith('http') ? (
                <a
                  key={n.url}
                  href={n.url}
                  className="py-1 font-medium transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {n.name}
                </a>
              ) : (
                <Link
                  key={n.url}
                  to={n.url}
                  aria-current={active ? 'page' : undefined}
                  className="py-1 font-medium transition-colors"
                  style={{
                    color: active
                      ? 'var(--color-text)'
                      : 'var(--color-text-muted)',
                    borderBottom: active
                      ? '2px solid var(--color-brand)'
                      : '2px solid transparent',
                  }}
                >
                  {n.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center sm:flex">
            <a
              href="https://developers.strava.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              <picture>
                <StravaSvg className={styles.stravaSVG} />
              </picture>
            </a>
            <picture>
              <WatchSvg className={styles.watchSVG} />
            </picture>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            className={`${styles.themeButton} ${styles.themeButtonActive}`}
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
          >
            <div className={styles.iconWrapper}>{icons[theme]}</div>
          </button>
        </div>
      </nav>
    </header>
  );
};

export default Header;
