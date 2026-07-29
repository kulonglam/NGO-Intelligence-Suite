import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { createApp, errorHandler, listen } from '@ngois/service-kit';
import { registerReportingRoutes } from './routes.js';
import { registerQueueRoutes } from './queue-routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('reporting-service'),
    PORT: z.coerce.number().default(3008),
    REPORT_STORAGE_ROOT: z.string().default(join(root, '.data', 'reports')),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

registerReportingRoutes(app, pool, config);
registerQueueRoutes(app, pool, config);

app.use(errorHandler(log));

await listen(app, config.PORT, log);
