import { useNavigate, useParams } from "react-router";
import LiveRoom from "../../components/live/LiveRoom.jsx";
import { ErrorNotice, Loading } from "../../components/QueryStatus.jsx";
import { useBooking, useRecipe } from "../../lib/booking.js";
import { useJoinTicket } from "../../lib/live.js";
import ui from "../../styles/ui.module.css";

/** Figma 12 Live Class, for the tourist. */
export default function LiveClass() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const bookingQuery = useBooking(bookingId);
  const booking = bookingQuery.data;
  const recipeQuery = useRecipe(booking?.class.id);
  const joinQuery = useJoinTicket(booking?.classTimeId);

  if (bookingQuery.isPending) {
    return (
      <div className={ui.page}>
        <Loading label="Joining your class…" />
      </div>
    );
  }
  if (bookingQuery.isError) {
    return (
      <div className={ui.page}>
        <ErrorNotice error={bookingQuery.error} />
      </div>
    );
  }

  const afterHref = `/my-classes/${bookingId}/after`;

  return (
    <LiveRoom
      classTimeId={booking.classTimeId}
      dish={booking.class.dish}
      yaiName={booking.class.yaiName}
      startsAt={booking.startsAt}
      durationMinutes={booking.class.durationMinutes}
      recipe={recipeQuery.data}
      joinError={joinQuery.error}
      afterHref={afterHref}
      onLeave={() => navigate(afterHref)}
    />
  );
}
