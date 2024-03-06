import { Link } from 'react-router-dom';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.scss';
import { ReactComponent as StravaSvg } from '@assets/strava.svg';
import { ReactComponent as WatchSvg } from '@assets/watch.svg';

const Header = () => {
  const { logo, siteUrl, navLinks } = useSiteMetadata();

  return (
    <>
      <nav
        className="db flex justify-between w-100 ph5-l"
        style={{ marginTop: '3rem' }}
      >
        <div className="dib w-25 v-mid">
          <Link to={siteUrl} className="link dim">
            <picture>
              <img className="dib w3 h3 br-100" alt="logo" src={logo} />
            </picture>
          </Link>
        </div>
        {/* <div className="dib w-75 v-mid tr">
          {navLinks.map((n, i) => (
            <a
              key={i}
              href={n.url}
              className="light-gray link dim f6 f5-l mr3 mr4-l"
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
