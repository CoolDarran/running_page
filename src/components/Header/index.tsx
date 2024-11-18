import { Link } from 'react-router-dom';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.scss';
import { ReactComponent as StravaSvg } from '@assets/strava.svg';
import { ReactComponent as WatchSvg } from '@assets/watch.svg';

const Header = () => {
  const { logo, siteUrl, navLinks } = useSiteMetadata();

  return (
    <>
      <nav className="mt-12 flex w-full items-center justify-between pl-6 lg:px-16">
        <div className="w-1/4">
          <Link to={siteUrl}>
            <picture>
              <img className="h-16 w-16 rounded-full" alt="logo" src={logo} />
            </picture>
          </Link>
        </div>
        {/* <div className="dib w-75 v-mid tr">
          {navLinks.map((n, i) => (
            <a
              key={i}
              href={n.url}
              className="mr-3 text-lg lg:mr-4 lg:text-base"
            >
              {n.name}
            </a>
          ))}
        </div> */}
        <div className={styles.appsWrapper}>
          <a href="https://developers.strava.com/" rel="noopener noreferrer" target="_blank">
            <picture><StravaSvg className={styles.stravaSVG} /></picture>
          </a>
          <picture><WatchSvg className={styles.watchSVG} /></picture>
        </div>
      </nav>
    </>
  );
};

export default Header;
