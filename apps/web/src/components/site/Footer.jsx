import { NavLink } from "react-router";
import { EXPLORE_LINKS } from "./links.js";
import PraJamYam from "./PraJamYam.jsx";
import styles from "./Footer.module.css";

const HELP_LINKS = [
  ["/help", "Help and FAQ"],
  ["/become-a-yai", "Become a Yai"],
  ["/sign-in", "Sign in"],
];

function Column({ title, links }) {
  return (
    <nav aria-label={title}>
      <h2 className={styles.heading}>{title}</h2>
      <ul className={styles.links}>
        {links.map(([to, label]) => (
          <li key={to}>
            <NavLink to={to} className={styles.link}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Figma "Footer": the pra jam yam band, the name and two columns of links. */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <PraJamYam />
      <div className={styles.inner}>
        <div>
          <p className={styles.name}>Yai&apos;s Kitchen</p>
          <p className={styles.thai} lang="th">
            ครัวยาย
          </p>
          <p className={styles.tagline}>
            Cook with a real Thai grandma, live, whenever you like.
          </p>
        </div>
        <Column title="Explore" links={EXPLORE_LINKS} />
        <Column title="Help" links={HELP_LINKS} />
      </div>
    </footer>
  );
}
