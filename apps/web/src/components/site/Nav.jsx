import { Link, NavLink } from "react-router";
import logo from "../../assets/logo.svg";
import { ACCOUNT_LINKS, useMe } from "../../lib/auth.js";
import ui from "../../styles/ui.module.css";
import { EXPLORE_LINKS } from "./links.js";
import styles from "./Nav.module.css";

/** Figma "Nav": the logo, the Explore links, and Sign in or your account. */
export default function Nav() {
  // Signed out (401) or a guest checkout leaves this on Sign in.
  const me = useMe();
  const [accountTo, accountLabel] = ACCOUNT_LINKS[me.data?.role] ?? [
    "/sign-in",
    "Sign in",
  ];

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
        <Link to={accountTo} className={`${ui.outline} ${styles.signIn}`}>
          {accountLabel}
        </Link>
      </nav>
    </header>
  );
}
