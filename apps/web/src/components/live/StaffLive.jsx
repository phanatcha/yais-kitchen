import { useNavigate, useParams } from "react-router";
import LiveRoom from "./LiveRoom.jsx";
import { ErrorNotice, Loading } from "../QueryStatus.jsx";
import { useClass, useRecipe } from "../../lib/booking.js";
import { useClassTimes } from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";

const LEAVE_TO = { helper: "/helper", family: "/family/bookings" };
const NOT_YOURS = {
  helper: "This class isn't assigned to you.",
  family: "This isn't one of your Yai's classes.",
};

/**
 * The live class for staff, in the same room as the guests. FR-32, FR-33:
 * the helper moves the recipe steps for everyone and ends the class. The
 * Yai's family runs the kitchen camera.
 * @param {{ role: "helper" | "family" }} props
 */
export default function StaffLive({ role }) {
  const { classTimeId } = useParams();
  const navigate = useNavigate();
  // There is no GET for one class time, so find it in this person's list.
  const timesQuery = useClassTimes({ from: "2000-01-01T00:00:00Z" });
  const classTime = timesQuery.data?.items.find((t) => t.id === classTimeId);
  const classQuery = useClass(classTime?.classId);
  const recipeQuery = useRecipe(classTime?.classId);

  if (timesQuery.isPending || (classTime && classQuery.isPending)) {
    return (
      <div className={ui.page}>
        <Loading label="Opening the class…" />
      </div>
    );
  }
  if (timesQuery.isError || classQuery.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={timesQuery.error ?? classQuery.error} />
      </div>
    );
  }
  if (!classTime) {
    return (
      <div className={ui.page}>
        <p className={ui.notice} role="alert">
          {NOT_YOURS[role]}
        </p>
      </div>
    );
  }

  const c = classQuery.data;
  return (
    <LiveRoom
      role={role}
      classTimeId={classTimeId}
      dish={c.dish}
      yaiName={c.yaiName}
      startsAt={classTime.startsAt}
      durationMinutes={c.durationMinutes}
      recipe={recipeQuery.data}
      onLeave={() => navigate(LEAVE_TO[role])}
    />
  );
}
