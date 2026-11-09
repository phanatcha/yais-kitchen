import nodemailer from "nodemailer";

/**
 * Sends plain-text email over SMTP. Locally that is Mailpit, which catches
 * everything, so nothing reaches a real inbox.
 * @param {{ host: string, port: number, user?: string, password?: string, from: string }} options
 */
export function createMailer({ host, port, user, password, from }) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    send: ({ to, subject, text }) =>
      transport.sendMail({ from, to, subject, text }),
    close: () => transport.close(),
  };
}
