import { Link, NavLink } from "react-router";
import logo from "../../assets/logo.svg";
import ui from "../../styles/ui.module.css";
import { EXPLORE_LINKS } from "./links.js";
import styles from "./Nav.module.css";

/** Figma "Nav": the logo, the Explore links and Sign in. */
export default function Nav() {
  return (
    <header className={styles.bar}>
      <nav className={styles.nav} aria-label="Main">
        <Link to="/" className={styles.logo}>
          <img src={logo} alt="" width="42" height="54" />
          <span className={styles.name}>Yai&apos;s Kitchen</span>
          <span className={styles.thai} lang="th">
            ครัวยาย
          </span>
        </Link>
        <ul className={styles.links}>
          {EXPLORE_LINKS.map(([to, label]) => (
            <li key={to}>
              <NavLink to={to} className={styles.link}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <Link to="/sign-in" className={`${ui.outline} ${styles.signIn}`}>
          Sign in
        </Link>
      </nav>
    </header>
  );
}
