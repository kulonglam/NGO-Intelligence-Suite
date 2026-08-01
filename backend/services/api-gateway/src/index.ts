import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { loadConfig } from '@ngois/config';
import { unauthorized } from '@ngois/errors';
import { createLogger } from '@ngois/logging';
import { errorHandler, ok } from '@ngois/service-kit';
import { randomUUID } from 'node:crypto';

const config = loadConfig(
  z.object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    SERVICE_NAME: z.string().default('api-gateway'),
    PORT: z.coerce.number().default(3000),
    JWT_ISSUER: z.string().default('https://auth.local.ngointelligence.io'),
    JWT_AUDIENCE: z.string().default('ngois-api'),
    JWT_SECRET: z.string().min(32).default('dev-only-change-me-ngois-jwt-secret!!'),
    AUTH_SERVICE_URL: z.string().default('http://127.0.0.1:3001'),
    GRANT_SERVICE_URL: z.string().default('http://127.0.0.1:3002'),
    TENANT_SERVICE_URL: z.string().default('http://127.0.0.1:3014'),
    FILE_SERVICE_URL: z.string().default('http://127.0.0.1:3010'),
    HR_PAYROLL_SERVICE_URL: z.string().default('http://127.0.0.1:3006'),
    REPORTING_SERVICE_URL: z.string().default('http://127.0.0.1:3008'),
    BENEFICIARY_SERVICE_URL: z.string().default('http://127.0.0.1:3004'),
    FIELD_DATA_SERVICE_URL: z.string().default('http://127.0.0.1:3005'),
    LMS_SERVICE_URL: z.string().default('http://127.0.0.1:3003'),
    NOTIFICATION_SERVICE_URL: z.string().default('http://127.0.0.1:3007'),
    ANALYTICS_SERVICE_URL: z.string().default('http://127.0.0.1:3012'),
    AI_INSIGHTS_SERVICE_URL: z.string().default('http://127.0.0.1:3013'),
    INTEGRATION_SERVICE_URL: z.string().default('http://127.0.0.1:3011'),
  }),
);

const log = createLogger(config.SERVICE_NAME);
const app = express();
app.disable('x-powered-by');

const secret = new TextEncoder().encode(config.JWT_SECRET);

const PUBLIC_PATHS = new Set([
  '/v1/health',
  '/v1/version',
  '/v1/auth/dev/login',
  '/v1/auth/config',
  '/v1/auth/oidc/start',
  '/v1/auth/oidc/callback',
]);

function isPublicAuthPath(path: string): boolean {
  return PUBLIC_PATHS.has(path) || path.startsWith('/v1/auth/dev/');
}

app.use((req, res, next) => {
  // Strip inbound identity headers — clients must not forge tenant context (SDD 6.3.1).
  for (const h of [
    'x-tenant-id',
    'x-user-id',
    'x-user-role',
    'x-permissions',
    'x-request-start',
  ]) {
    delete req.headers[h];
  }

  const correlationId =
    (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id']) ||
    randomUUID().replace(/-/g, '');
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  (req as express.Request & { ctx: { correlationId: string; startedAt: number; permissions: string[] }; log: typeof log }).ctx =
    {
      correlationId,
      startedAt: Date.now(),
      permissions: [],
    };
  (req as express.Request & { log: typeof log }).log = log.child({
    correlation_id: correlationId,
    path: req.path,
  });
  next();
});

app.get('/v1/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

app.get('/v1/version', (req, res) => {
  ok(res, req as never, { service: 'api-gateway', version: '0.1.0', api_version: '1' });
});

app.use(async (req, res, next) => {
  try {
    if (isPublicAuthPath(req.path)) {
      next();
      return;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }
    const token = header.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, secret, {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    });

    const tenantId = typeof payload.tenant_id === 'string' ? payload.tenant_id : undefined;
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    const role = typeof payload.role === 'string' ? payload.role : undefined;
    if (!tenantId || !sub || !role) {
      throw unauthorized('Token is missing required claims.');
    }

    req.headers['x-tenant-id'] = tenantId;
    req.headers['x-user-id'] = sub;
    req.headers['x-user-role'] = role;
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.filter((p): p is string => typeof p === 'string')
      : [];
    req.headers['x-permissions'] = permissions.join(',');
    req.headers['x-request-start'] = String(Date.now());
    (req as express.Request & { ctx: { permissions: string[] } }).ctx.permissions = permissions;
    next();
  } catch (err) {
    // jose JWT/JWS failures must be 401, not NGOIS-API-0500
    const name = err instanceof Error ? err.name : '';
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    const message = err instanceof Error ? err.message : String(err);
    const isJwtFailure =
      name === 'JWTExpired' ||
      name === 'JWSSignatureVerificationFailed' ||
      name === 'JWTClaimValidationFailed' ||
      name === 'JWTInvalid' ||
      code.startsWith('ERR_JWT') ||
      code.startsWith('ERR_JWS') ||
      /signature verification failed|claim validation failed|invalid compact jws/i.test(message);
    if (isJwtFailure) {
      next(unauthorized(name === 'JWTExpired' ? 'Token expired.' : 'Invalid or expired token.'));
      return;
    }
    next(err);
  }
});

/** In-memory per-tenant RPM quota (SDD §29.5). Defaults 600/min. */
const tenantWindows = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_RPM = Number(process.env.GATEWAY_TENANT_RPM ?? 600);

app.use((req, res, next) => {
  if (isPublicAuthPath(req.path)) {
    next();
    return;
  }
  const tenantId = typeof req.headers['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'] : null;
  if (!tenantId) {
    next();
    return;
  }
  const now = Date.now();
  let win = tenantWindows.get(tenantId);
  if (!win || now >= win.resetAt) {
    win = { count: 0, resetAt: now + 60_000 };
    tenantWindows.set(tenantId, win);
  }
  win.count += 1;
  if (win.count > DEFAULT_RPM) {
    const retry = Math.ceil((win.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(Math.max(1, retry)));
    res.status(429).json({
      success: false,
      data: null,
      meta: { timestamp: new Date().toISOString(), api_version: '1' },
      errors: [
        {
          code: 'NGOIS-API-0429',
          message: 'Tenant API quota exceeded.',
          detail: `limit=${DEFAULT_RPM}/min`,
        },
      ],
    });
    return;
  }
  next();
});

function mount(prefix: string, target: string): void {
  app.use(
    prefix,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      proxyTimeout: 30_000,
      // Express strips the mount prefix from req.url; restore it so services
      // keep their full /v1/{service}/... routes.
      pathRewrite: (path) => `${prefix}${path}`,
      on: {
        error(err, _req, res) {
          log.error('upstream error', { path: prefix, err: err.message });
          if ('writeHead' in res && typeof res.writeHead === 'function') {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                data: null,
                meta: { timestamp: new Date().toISOString(), api_version: '1' },
                errors: [
                  {
                    code: 'NGOIS-API-0502',
                    message: 'Upstream service unavailable.',
                  },
                ],
              }),
            );
          }
        },
      },
    }),
  );
}

mount('/v1/auth', config.AUTH_SERVICE_URL);
mount('/v1/grant', config.GRANT_SERVICE_URL);
mount('/v1/hr', config.HR_PAYROLL_SERVICE_URL);
mount('/v1/reporting', config.REPORTING_SERVICE_URL);
mount('/v1/tenant', config.TENANT_SERVICE_URL);
mount('/v1/file', config.FILE_SERVICE_URL);
mount('/v1/beneficiary', config.BENEFICIARY_SERVICE_URL);
mount('/v1/field-data', config.FIELD_DATA_SERVICE_URL);
mount('/v1/lms', config.LMS_SERVICE_URL);
mount('/v1/notifications', config.NOTIFICATION_SERVICE_URL);
mount('/v1/analytics', config.ANALYTICS_SERVICE_URL);
mount('/v1/ai', config.AI_INSIGHTS_SERVICE_URL);
mount('/v1/integrations', config.INTEGRATION_SERVICE_URL);

app.use(errorHandler(log));

app.listen(config.PORT, () => {
  log.info('listening', { port: config.PORT });
});
