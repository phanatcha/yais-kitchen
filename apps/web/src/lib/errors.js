import { ApiError } from "./api.js";

/** A sentence about a failed request that is safe to show the user. */
export function errorText(error) {
  if (!error) return "";
  if (!(error instanceof ApiError)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return error.message;
}
