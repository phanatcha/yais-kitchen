import { Link, NavLink, useLocation } from "react-router";
import StaffPage from "../StaffPage.jsx";
import { Loading, ErrorNotice } from "../QueryStatus.jsx";
import { ApiError } from "../../lib/api.js";
import { useMe } from "../../lib/auth.js";
import ui from "../../styles/ui.module.css";
import staff from "../StaffPage.module.css";
import styles from "./FamilyPage.module.css";

const TABS = [
  ["/family/times", "Available times"],
  ["/family/bookings", "Bookings"],
  ["/family/earnings", "Earnings"],
];

/**
 * Frame for the Yai's family pages. The family account's `yaiId` comes from
 * GET /auth/me and is passed to the page.
 * @param {{ children: (yaiId: string) => import("react").ReactNode }} props
 */
export default function FamilyPage({ titleMain, titleScript, lead, children }) {
  const location = useLocation();
  const me = useMe();

  let body;
  if (me.isPending) body = <Loading />;
  else if (
    me.isError &&
    me.error instanceof ApiError &&
    [401, 403].includes(me.error.status)
  ) {
    body = (
      <p className={ui.notice} role="alert">
        Please sign in with your family account.{" "}
        <Link
          className={ui.link}
          to="/sign-in"
          state={{ from: location.pathname }}
        >
          Sign in
        </Link>
      </p>
    );
  } else if (me.isError) body = <ErrorNotice error={me.error} />;
  else if (!me.data.yaiId) {
    body = (
      <p className={ui.notice} role="alert">
        This page is for a Yai&apos;s family account.
      </p>
    );
  } else body = children(me.data.yaiId);

  return (
    <StaffPage
      tag="Yai's family"
      titleMain={titleMain}
      titleScript={titleScript}
      lead={lead}
      nav={
        <nav aria-label="Family pages" className={staff.tabs}>
          <ul>
            {TABS.map(([to, label]) => (
              <li key={to}>
                <NavLink to={to} className={styles.tab}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      }
    >
      {body}
    </StaffPage>
  );
}
