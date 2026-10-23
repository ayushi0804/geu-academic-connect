import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startJobs } from './services/jobs';

async function main() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build indexes before serving traffic
  const app = createApp();
  const stopJobs = startJobs();
  const server = app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT} (docs: /api/docs)`));
  const shutdown = async () => {
    stopJobs();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\nFailed to start API:', err.message, '\nIs MongoDB running and MONGODB_URI correct? See README > Troubleshooting.\n');
  process.exit(1);
});
