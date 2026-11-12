import { Link, Outlet } from "react-router";

const devLinks = [
  ["/", "Home"],
  ["/classes/demo/book", "07 Pick a Time"],
  ["/book/details", "08 Your Details"],
  ["/book/payment", "09 Payment"],
  ["/book/confirmed/demo", "10 Confirmed"],
  ["/my-classes/demo/ready", "11 Get Ready"],
  ["/my-classes/demo/live", "12 Live Class"],
  ["/my-classes/demo/after", "13 After Class"],
  ["/sign-in", "14 Sign In"],
  ["/my-classes", "15 My Classes"],
  ["/helper", "Helper"],
  ["/family/bookings", "Family"],
];

export default function App() {
  return (
    <>
      {/* Temporary dev menu. Replace with Patter's Nav. */}
      <nav aria-label="Dev pages">
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
