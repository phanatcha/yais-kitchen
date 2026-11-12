import { useNavigate, useParams } from "react-router";
import LiveRoom from "../../components/live/LiveRoom.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { useClass, useRecipe } from "../../lib/booking.js";
import { useJoinTicket } from "../../lib/live.js";
import { useClassTimes } from "../../lib/staff.js";
import ui from "../../styles/ui.module.css";

/**
 * FR-32, FR-33: the live class seen by the helper, who moves the recipe
 * steps for everyone and ends the class. Same room as the tourist's.
 */
export default function HelperLive() {
  const { classTimeId } = useParams();
  const navigate = useNavigate();
  // There is no GET for one class time, so find it in the helper's list.
  const timesQuery = useClassTimes({ from: "2000-01-01T00:00:00Z" });
  const classTime = timesQuery.data?.items.find((t) => t.id === classTimeId);
  const classQuery = useClass(classTime?.classId);
  const recipeQuery = useRecipe(classTime?.classId);
  const joinQuery = useJoinTicket(classTime ? classTimeId : null);

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
          This class isn&apos;t assigned to you.
        </p>
      </div>
    );
  }

  const c = classQuery.data;
  return (
    <LiveRoom
      isHelper
      classTimeId={classTimeId}
      dish={c.dish}
      yaiName={c.yaiName}
      startsAt={classTime.startsAt}
      durationMinutes={c.durationMinutes}
      recipe={recipeQuery.data}
      joinError={joinQuery.error}
      onLeave={() => navigate("/helper")}
    />
  );
}
