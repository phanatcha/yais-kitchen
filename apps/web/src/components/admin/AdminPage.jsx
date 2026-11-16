import { Link, NavLink, useLocation } from "react-router";
import StaffPage from "../StaffPage.jsx";
import { ErrorNotice, Loading } from "../QueryStatus.jsx";
import { ApiError } from "../../lib/api.js";
import { useMe } from "../../lib/auth.js";
import ui from "../../styles/ui.module.css";
import staff from "../StaffPage.module.css";
import tabs from "../family/FamilyPage.module.css";

const TABS = [
  ["/admin/applications", "Sign-ups"],
  ["/admin/yais", "Yais and classes"],
  ["/admin/class-times", "Class times"],
  ["/admin/accounts", "Accounts"],
  ["/admin/faq", "Help answers"],
  ["/admin/money", "Money"],
  ["/admin/ratings", "Ratings"],
  ["/admin/activity", "Activity"],
  ["/admin/failed-events", "Failed events"],
];

/**
 * Frame for the Admin pages, in the Helper and Family style: the tag, the
 * heading, the tabs, and a check that the account is an admin.
 */
export default function AdminPage({ titleMain, titleScript, lead, children }) {
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
        Please sign in with an admin account.{" "}
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
  else if (me.data.role !== "admin") {
    body = (
      <p className={ui.notice} role="alert">
        These pages are for Yai&apos;s Kitchen admins.
      </p>
    );
  } else body = children;

  return (
    <StaffPage
      tag="Admin"
      titleMain={titleMain}
      titleScript={titleScript}
      lead={lead}
      nav={
        <nav aria-label="Admin pages" className={staff.tabs}>
          <ul>
            {TABS.map(([to, label]) => (
              <li key={to}>
                <NavLink to={to} className={tabs.tab}>
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
