import nodemailer from 'nodemailer';
import { HttpError } from '../lib/http.js';

// Every email is sent from the SMTP mailbox (SMTP_USER), e.g. the Titan business
// address, shown in inboxes as "Tessera".
const send = (mail) => {
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer
    .createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 is TLS from the start; 587 upgrades via STARTTLS
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    .sendMail({ from: { name: 'Tessera', address: process.env.SMTP_USER }, ...mail });
};

// Admin test email. Unlike order mail, a failure is the point of the test, so
// the SMTP error (e.g. "Invalid login") goes back to the admin as a 502.
const sendTestEmail = async ({ to, message }) => {
  try {
    await send({ to, subject: 'Tessera test email', text: message });
  } catch (err) {
    throw new HttpError(502, `Email not sent: ${err.message}`);
  }
  return { from: process.env.SMTP_USER, to };
};

export { send, sendTestEmail };
