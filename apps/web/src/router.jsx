import { Navigate, createBrowserRouter } from "react-router";
import App from "./App.jsx";
import NotFound from "./components/NotFound.jsx";
import Home from "./pages/Explore/Home.jsx";
import HowItWorks from "./pages/Explore/HowItWorks.jsx";
import BrowseYais from "./pages/Explore/BrowseYais.jsx";
import YaiProfile from "./pages/Explore/YaiProfile.jsx";
import BrowseClasses from "./pages/Explore/BrowseClasses.jsx";
import ClassDetail from "./pages/Explore/ClassDetail.jsx";
import BecomeAYai from "./pages/Explore/BecomeAYai.jsx";
import HelpFaq from "./pages/Explore/HelpFaq.jsx";
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
import FamilyBookings from "./pages/Family/FamilyBookings.jsx";
import FamilyEarnings from "./pages/Family/FamilyEarnings.jsx";
import AdminApplications from "./pages/Admin/AdminApplications.jsx";
import AdminApplication from "./pages/Admin/AdminApplication.jsx";
import AdminYais from "./pages/Admin/AdminYais.jsx";
import AdminYai from "./pages/Admin/AdminYai.jsx";
import AdminClass from "./pages/Admin/AdminClass.jsx";
import AdminClassTimes from "./pages/Admin/AdminClassTimes.jsx";
import AdminAccounts from "./pages/Admin/AdminAccounts.jsx";
import AdminFaq from "./pages/Admin/AdminFaq.jsx";
import AdminMoney from "./pages/Admin/AdminMoney.jsx";
import AdminRatings from "./pages/Admin/AdminRatings.jsx";

// `footer` shows the site footer under the page; `live` hides the nav for
// the full-screen class.
const withFooter = { footer: true };
const live = { live: true };

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      // Explore (Figma 01–06)
      { index: true, element: <Home />, handle: withFooter },
      { path: "how-it-works", element: <HowItWorks />, handle: withFooter },
      { path: "yais", element: <BrowseYais />, handle: withFooter },
      { path: "yais/:yaiId", element: <YaiProfile />, handle: withFooter },
      { path: "classes", element: <BrowseClasses />, handle: withFooter },
      {
        path: "classes/:classId",
        element: <ClassDetail />,
        handle: withFooter,
      },

      // Book (Figma 07–10)
      { path: "classes/:classId/book", element: <PickATime /> },
      { path: "book/details", element: <YourDetails /> },
      { path: "book/payment", element: <Payment /> },
      { path: "book/confirmed/:bookingId", element: <BookingConfirmed /> },

      // Account and Cook (Figma 11–15). Emails link to the ready and after
      // pages, so keep these paths in step with notification's links.js.
      { path: "sign-in", element: <SignIn /> },
      { path: "my-classes", element: <MyClasses /> },
      { path: "my-classes/:bookingId/ready", element: <GetReady /> },
      {
        path: "my-classes/:bookingId/live",
        element: <LiveClass />,
        handle: live,
      },
      { path: "my-classes/:bookingId/after", element: <AfterClass /> },

      // Help (Figma 16–17)
      { path: "become-a-yai", element: <BecomeAYai />, handle: withFooter },
      { path: "help", element: <HelpFaq />, handle: withFooter },

      // Helper and Yai's family (new design)
      { path: "helper", element: <HelperClasses /> },
      {
        path: "helper/classes/:classTimeId/live",
        element: <HelperLive />,
        handle: live,
      },
      { path: "family/times", element: <FamilyTimes /> },
      { path: "family/bookings", element: <FamilyBookings /> },
      { path: "family/earnings", element: <FamilyEarnings /> },

      // Admin. The notification email links to the application page, so
      // keep it in step with notification's links.js.
      { path: "admin", element: <Navigate to="/admin/applications" replace /> },
      { path: "admin/applications", element: <AdminApplications /> },
      {
        path: "admin/applications/:applicationId",
        element: <AdminApplication />,
      },
      { path: "admin/yais", element: <AdminYais /> },
      { path: "admin/yais/:yaiId", element: <AdminYai /> },
      { path: "admin/classes/:classId", element: <AdminClass /> },
      { path: "admin/class-times", element: <AdminClassTimes /> },
      { path: "admin/accounts", element: <AdminAccounts /> },
      { path: "admin/faq", element: <AdminFaq /> },
      { path: "admin/money", element: <AdminMoney /> },
      { path: "admin/ratings", element: <AdminRatings /> },

      { path: "*", element: <NotFound /> },
    ],
  },
]);
