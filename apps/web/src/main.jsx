import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { router } from "./router.jsx";
import { ApiError, refreshSession } from "./lib/api.js";
import "./index.css";

// The access token lives in memory, so a reload starts without one. If the
// refresh cookie is still good, this signs the visitor back in.
refreshSession();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry once for network and server errors. A 4xx answer won't change.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status < 500),
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
