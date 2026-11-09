/**
 * Links in emails, to pages of the web app. These paths must match the web
 * app's routes.
 * @param {string} webOrigin Such as http://localhost:5173.
 */
export function createLinks(webOrigin) {
  const page = (path) => new URL(path, webOrigin).href;
  return {
    getReady: (bookingId) => page(`/bookings/${bookingId}/get-ready`),
    afterClass: (bookingId) => page(`/bookings/${bookingId}/after-class`),
    adminApplication: (applicationId) =>
      page(`/admin/applications/${applicationId}`),
  };
}
