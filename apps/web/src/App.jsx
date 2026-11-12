import { Link, Outlet } from "react-router";
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
];

export default function App() {
  return (
    <>
      {/* Temporary dev menu. Replace with Patter's Nav. */}
      <nav aria-label="Dev pages" className={styles.devNav}>
        <ul>
          {devLinks.map(([to, label]) => (
            <li key={to}>
              <Link to={to}>{label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
