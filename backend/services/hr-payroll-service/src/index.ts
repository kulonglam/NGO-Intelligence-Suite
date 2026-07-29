import { z } from 'zod';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { createApp, errorHandler, listen } from '@ngois/service-kit';
import { registerHrRoutes } from './hr-routes.js';
import { registerLeaveRoutes } from './leave-routes.js';
import { registerOnboardingRoutes } from './onboarding-routes.js';
import { registerPayrollRoutes } from './payroll-routes.js';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('hr-payroll-service'),
    PORT: z.coerce.number().default(3006),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

registerHrRoutes(app, pool, config);
registerLeaveRoutes(app, pool, config);
registerOnboardingRoutes(app, pool, config);
registerPayrollRoutes(app, pool, config);

app.use(errorHandler(log));

await listen(app, config.PORT, log);
