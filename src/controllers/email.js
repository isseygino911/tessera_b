import * as mailer from '../services/mailer.js';

const sendTest = async (req, res) => {
  res.json(await mailer.sendTestEmail(req.body));
};

export { sendTest };
