import { app } from './app.js';
import { database } from './db/database.js';

try {
  await database;
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
} catch (error) {
  console.error('Unable to start API', error);
  process.exitCode = 1;
}
