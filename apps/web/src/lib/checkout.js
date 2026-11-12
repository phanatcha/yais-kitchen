/**
 * What the visitor has picked so far in Book (07–10), kept for this tab only.
 * The hold ID is a secret, so it stays in sessionStorage and never in the URL.
 * Shape: { classInfo, hold, booking }
 */
const KEY = "yk_checkout";

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
