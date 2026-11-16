import { Navigate, createBrowserRouter } from "react-router";
import App from "./App.jsx";
import NotFound from "./components/NotFound.jsx";
import RouteError from "./components/RouteError.jsx";
import Home from "./pages/Explore/Home.jsx";

const SITE = "Yai's Kitchen";

/** Puts the page's name in the browser tab. React 19 moves <title> to <head>. */
function titled(title, Page) {
  return function TitledPage() {
    return (
      <>
        <title>{`${title} · ${SITE}`}</title>
        <Page />
      </>
    );
  };
}

/**
 * A page downloaded when it is first opened, so guests don't load the
 * admin, helper and family pages. `title` null means the page sets its own
 * (a Yai's or a dish's name).
 */
function page(title, load, handle) {
  return {
    handle,
    lazy: async () => {
      const { default: Page } = await load();
      return { Component: title ? titled(title, Page) : Page };
    },
  };
}

// `footer` shows the site footer under the page; `live` hides the nav for
// the full-screen class.
const withFooter = { footer: true };
const live = { live: true };

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteError />,
    children: [
      {
        // Errors in a page show inside the site frame, under the nav.
        errorElement: <RouteError />,
        children: [
          // Explore (Figma 01–06)
          {
            index: true,
            element: (
              <>
                <title>{`${SITE} · Cook with a real Thai grandma`}</title>
                <Home />
              </>
            ),
            handle: withFooter,
          },
          {
            path: "how-it-works",
            ...page(
              "How it works",
              () => import("./pages/Explore/HowItWorks.jsx"),
              withFooter,
            ),
          },
          {
            path: "yais",
            ...page(
              "Meet the Yais",
              () => import("./pages/Explore/BrowseYais.jsx"),
              withFooter,
            ),
          },
          {
            path: "yais/:yaiId",
            ...page(
              null,
              () => import("./pages/Explore/YaiProfile.jsx"),
              withFooter,
            ),
          },
          {
            path: "classes",
            ...page(
              "Classes",
              () => import("./pages/Explore/BrowseClasses.jsx"),
              withFooter,
            ),
          },
          {
            path: "classes/:classId",
            ...page(
              null,
              () => import("./pages/Explore/ClassDetail.jsx"),
              withFooter,
            ),
          },

          // Book (Figma 07–10)
          {
            path: "classes/:classId/book",
            ...page("Pick a time", () => import("./pages/Book/PickATime.jsx")),
          },
          {
            path: "book/details",
            ...page(
              "Your details",
              () => import("./pages/Book/YourDetails.jsx"),
            ),
          },
          {
            path: "book/payment",
            ...page("Payment", () => import("./pages/Book/Payment.jsx")),
          },
          {
            path: "book/confirmed/:bookingId",
            ...page(
              "Booking confirmed",
              () => import("./pages/Book/BookingConfirmed.jsx"),
            ),
          },

          // Account and Cook (Figma 11–15). Emails link to the ready and
          // after pages, so keep these paths in step with notification's
          // links.js.
          {
            path: "sign-in",
            ...page("Sign in", () => import("./pages/SignIn/SignIn.jsx")),
          },
          {
            path: "my-classes",
            ...page(
              "My classes",
              () => import("./pages/Account/MyClasses.jsx"),
            ),
          },
          {
            path: "my-classes/:bookingId/ready",
            ...page("Get ready", () => import("./pages/Cook/GetReady.jsx")),
          },
          {
            path: "my-classes/:bookingId/live",
            ...page(
              "Live class",
              () => import("./pages/Cook/LiveClass.jsx"),
              live,
            ),
          },
          {
            path: "my-classes/:bookingId/after",
            ...page("After class", () => import("./pages/Cook/AfterClass.jsx")),
          },

          // Help (Figma 16–17)
          {
            path: "become-a-yai",
            ...page(
              "Become a Yai",
              () => import("./pages/Explore/BecomeAYai.jsx"),
              withFooter,
            ),
          },
          {
            path: "help",
            ...page(
              "Help and FAQ",
              () => import("./pages/Explore/HelpFaq.jsx"),
              withFooter,
            ),
          },

          // Helper and Yai's family (new design)
          {
            path: "helper",
            ...page(
              "Your classes",
              () => import("./pages/Helper/HelperClasses.jsx"),
            ),
          },
          {
            path: "helper/classes/:classTimeId/live",
            ...page(
              "Live class",
              () => import("./pages/Helper/HelperLive.jsx"),
              live,
            ),
          },
          {
            path: "family/classes/:classTimeId/live",
            ...page(
              "Live class",
              () => import("./pages/Family/FamilyLive.jsx"),
              live,
            ),
          },
          {
            path: "family/times",
            ...page(
              "Available times",
              () => import("./pages/Family/FamilyTimes.jsx"),
            ),
          },
          {
            path: "family/bookings",
            ...page(
              "Bookings",
              () => import("./pages/Family/FamilyBookings.jsx"),
            ),
          },
          {
            path: "family/earnings",
            ...page(
              "Earnings",
              () => import("./pages/Family/FamilyEarnings.jsx"),
            ),
          },

          // Admin. The notification email links to the application page, so
          // keep it in step with notification's links.js.
          {
            path: "admin",
            element: <Navigate to="/admin/applications" replace />,
          },
          {
            path: "admin/applications",
            ...page(
              "Admin: sign-ups",
              () => import("./pages/Admin/AdminApplications.jsx"),
            ),
          },
          {
            path: "admin/applications/:applicationId",
            ...page(
              "Admin: sign-up",
              () => import("./pages/Admin/AdminApplication.jsx"),
            ),
          },
          {
            path: "admin/yais",
            ...page(
              "Admin: Yais and classes",
              () => import("./pages/Admin/AdminYais.jsx"),
            ),
          },
          {
            path: "admin/yais/:yaiId",
            ...page("Admin: Yai", () => import("./pages/Admin/AdminYai.jsx")),
          },
          {
            path: "admin/classes/:classId",
            ...page(
              "Admin: class",
              () => import("./pages/Admin/AdminClass.jsx"),
            ),
          },
          {
            path: "admin/class-times",
            ...page(
              "Admin: class times",
              () => import("./pages/Admin/AdminClassTimes.jsx"),
            ),
          },
          {
            path: "admin/accounts",
            ...page(
              "Admin: accounts",
              () => import("./pages/Admin/AdminAccounts.jsx"),
            ),
          },
          {
            path: "admin/faq",
            ...page(
              "Admin: help answers",
              () => import("./pages/Admin/AdminFaq.jsx"),
            ),
          },
          {
            path: "admin/money",
            ...page(
              "Admin: money",
              () => import("./pages/Admin/AdminMoney.jsx"),
            ),
          },
          {
            path: "admin/ratings",
            ...page(
              "Admin: ratings",
              () => import("./pages/Admin/AdminRatings.jsx"),
            ),
          },
          {
            path: "admin/activity",
            ...page(
              "Admin: activity",
              () => import("./pages/Admin/AdminActivity.jsx"),
            ),
          },
          {
            path: "admin/failed-events",
            ...page(
              "Admin: failed events",
              () => import("./pages/Admin/AdminFailedEvents.jsx"),
            ),
          },

          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
