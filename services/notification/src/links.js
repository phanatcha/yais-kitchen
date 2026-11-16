/**
 * Links in emails, to pages of the web app. These paths must match the web
 * app's routes.
 * @param {string} webOrigin Such as http://localhost:5173.
 */
export function createLinks(webOrigin) {
  const page = (path) => new URL(path, webOrigin).href;
  return {
    getReady: (bookingId) => page(`/my-classes/${bookingId}/ready`),
    afterClass: (bookingId) => page(`/my-classes/${bookingId}/after`),
    adminApplication: (applicationId) =>
      page(`/admin/applications/${applicationId}`),
    bookAgain: (classId) => page(`/classes/${classId}/book`),
    helperClasses: () => page("/helper"),
    familyBookings: () => page("/family/bookings"),
    familyEarnings: () => page("/family/earnings"),
  };
}
