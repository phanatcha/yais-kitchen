/**
 * What the visitor has picked so far in Book (07–10), kept for this tab only.
 * The hold ID is a secret, so it stays in sessionStorage and never in the URL.
 * Shape: { classInfo, hold, booking, details, guestToken, guestTokenExpiresAt }
 */
const KEY = "yk_checkout";

/** The guest checkout token, if this tab has one that hasn't expired. */
export function guestToken() {
  const { guestToken: token, guestTokenExpiresAt } = readCheckout();
  return token && guestTokenExpiresAt > Date.now() ? token : null;
}

export function readCheckout() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function saveCheckout(patch) {
  const next = { ...readCheckout(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full: the flow still works until a reload.
  }
  return next;
}

export function clearCheckout() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
