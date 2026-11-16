import { Link, Outlet, useMatches } from "react-router";
import Footer from "./components/site/Footer.jsx";
import Nav from "./components/site/Nav.jsx";
import styles from "./App.module.css";

// The mock server only accepts 24-character hex IDs, so the demo links use
// the example ID from openapi.yaml.
const DEMO_ID = "6650a1f2c3d4e5f6a7b8c9d0";

const devLinks = [
  ["/", "Home"],
  [`/classes/${DEMO_ID}/book`, "07 Pick a Time"],
  ["/book/details", "08 Your Details"],
  ["/book/payment", "09 Payment"],
  [`/book/confirmed/${DEMO_ID}`, "10 Confirmed"],
  [`/my-classes/${DEMO_ID}/ready`, "11 Get Ready"],
  [`/my-classes/${DEMO_ID}/live`, "12 Live Class"],
  [`/my-classes/${DEMO_ID}/after`, "13 After Class"],
  ["/sign-in", "14 Sign In"],
  ["/my-classes", "15 My Classes"],
  ["/helper", "Helper"],
  [`/helper/classes/${DEMO_ID}/live`, "Helper live"],
  ["/family/times", "Family times"],
  ["/family/bookings", "Family bookings"],
  ["/family/earnings", "Family earnings"],
  ["/admin", "Admin"],
];

/**
 * The site frame: Nav on every page but the live class, and the Footer on
 * the pages whose route sets `handle: { footer: true }`.
 */
export default function App() {
  const matches = useMatches();
  const live = matches.some((m) => m.handle?.live);
  const footer = matches.some((m) => m.handle?.footer);

  return (
    <>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      {!live && <Nav />}
      <main id="main">
        <Outlet />
      </main>
      {footer && <Footer />}
      {import.meta.env.DEV && (
        // Pages without a link from the designed pages yet. Dev builds only.
        <nav aria-label="Dev pages" className={styles.devNav}>
          <ul>
            {devLinks.map(([to, label]) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
