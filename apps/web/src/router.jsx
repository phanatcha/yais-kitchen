import { createBrowserRouter } from "react-router";
import App from "./App.jsx";
import PagePlaceholder from "./components/PagePlaceholder.jsx";
import NotFound from "./components/NotFound.jsx";
import SignIn from "./pages/SignIn/SignIn.jsx";
import PickATime from "./pages/Book/PickATime.jsx";
import YourDetails from "./pages/Book/YourDetails.jsx";
import Payment from "./pages/Book/Payment.jsx";
import BookingConfirmed from "./pages/Book/BookingConfirmed.jsx";
import MyClasses from "./pages/Account/MyClasses.jsx";
import GetReady from "./pages/Cook/GetReady.jsx";
import LiveClass from "./pages/Cook/LiveClass.jsx";
import AfterClass from "./pages/Cook/AfterClass.jsx";
import HelperClasses from "./pages/Helper/HelperClasses.jsx";
import HelperLive from "./pages/Helper/HelperLive.jsx";
import FamilyTimes from "./pages/Family/FamilyTimes.jsx";

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
      { path: "book/payment", element: <Payment /> },
      { path: "book/confirmed/:bookingId", element: <BookingConfirmed /> },

      // Account and Cook (Figma 11–15)
      { path: "sign-in", element: <SignIn /> },
      { path: "my-classes", element: <MyClasses /> },
      { path: "my-classes/:bookingId/ready", element: <GetReady /> },
      { path: "my-classes/:bookingId/live", element: <LiveClass /> },
      { path: "my-classes/:bookingId/after", element: <AfterClass /> },

      // Helper and Yai's family (new design)
      { path: "helper", element: <HelperClasses /> },
      { path: "helper/classes/:classTimeId/live", element: <HelperLive /> },
      { path: "family/times", element: <FamilyTimes /> },
      { path: "family/bookings", element: page("Family: bookings") },
      { path: "family/earnings", element: page("Family: earnings") },

      { path: "*", element: <NotFound /> },
    ],
  },
]);
