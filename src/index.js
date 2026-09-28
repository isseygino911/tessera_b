import dotenv from 'dotenv';
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Fill in server/.env first.');
  process.exit(1);
}

import { createApp } from './app.js';

const app = createApp();
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
