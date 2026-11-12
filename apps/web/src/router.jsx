import { createBrowserRouter } from "react-router";
import App from "./App.jsx";
import PagePlaceholder from "./components/PagePlaceholder.jsx";
import NotFound from "./components/NotFound.jsx";
import SignIn from "./pages/SignIn/SignIn.jsx";
import PickATime from "./pages/Book/PickATime.jsx";
import YourDetails from "./pages/Book/YourDetails.jsx";

const page = (title) => <PagePlaceholder title={title} />;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: page("Home (Patter)") },

      // Book (Figma 07–10)
      { path: "classes/:classId/book", element: <PickATime /> },
      { path: "book/details", element: <YourDetails /> },
      { path: "book/payment", element: page("09 Payment") },
      {
        path: "book/confirmed/:bookingId",
        element: page("10 Booking Confirmed"),
      },

      // Account and Cook (Figma 11–15)
      { path: "sign-in", element: <SignIn /> },
      { path: "my-classes", element: page("15 My Classes") },
      { path: "my-classes/:bookingId/ready", element: page("11 Get Ready") },
      { path: "my-classes/:bookingId/live", element: page("12 Live Class") },
      { path: "my-classes/:bookingId/after", element: page("13 After Class") },

      // Helper and Yai's family (new design)
      { path: "helper", element: page("Helper: my classes") },
      {
        path: "helper/classes/:classTimeId/live",
        element: page("Helper: live class"),
      },
      { path: "family/times", element: page("Family: available times") },
      { path: "family/bookings", element: page("Family: bookings") },
      { path: "family/earnings", element: page("Family: earnings") },

      { path: "*", element: <NotFound /> },
    ],
  },
]);
