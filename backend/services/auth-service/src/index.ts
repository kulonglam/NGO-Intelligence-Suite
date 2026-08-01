import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { AppError, unauthorized } from '@ngois/errors';
import { expandRoleOrThrow, isRole } from '@ngois/rbac';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  validateBody,
} from '@ngois/service-kit';
import { withTenant } from '@ngois/tenant-context';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('auth-service'),
    PORT: z.coerce.number().default(3001),
    /** dev = password login; oidc = redirect to IdP (ADR-0004) when OIDC_* set */
    AUTH_MODE: z.enum(['dev', 'oidc']).default('dev'),
    OIDC_ISSUER: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_REDIRECT_URI: z.string().optional(),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });
const secret = new TextEncoder().encode(config.JWT_SECRET);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant_slug: z.string().min(1).default('design-partner'),
});

/**
 * Dev-only password login. Production will use Supabase Auth (ADR-0004);
 * this path exists so local Phase 1 work does not depend on an IdP.
 */
app.post('/v1/auth/dev/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    if (config.NODE_ENV === 'production') {
      throw new AppError({
        code: 'NGOIS-AUTH-0010',
        message: 'Dev login is disabled in production.',
        statusCode: 404,
      });
    }

    const { email, password, tenant_slug } = req.body as z.infer<typeof loginSchema>;
    const passwordHash = createHash('sha256').update(password).digest('hex');

    const tenantResult = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM tenants WHERE slug = $1 AND deleted_at IS NULL`,
      [tenant_slug],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant || tenant.status !== 'active') {
      throw unauthorized('Invalid email or password.');
    }

    const user = await withTenant(pool, tenant.id, async (client) => {
      const r = await client.query<{
        id: string;
        email: string;
        display_name: string;
        role: string;
        password_hash: string;
        status: string;
      }>(
        `SELECT id, email, display_name, role, password_hash, status
         FROM users
         WHERE email = $1 AND deleted_at IS NULL`,
        [email.toLowerCase()],
      );
      return r.rows[0];
    });

    if (!user || user.status !== 'active' || user.password_hash !== passwordHash) {
      throw unauthorized('Invalid email or password.');
    }

    if (!isRole(user.role)) {
      throw new AppError({
        code: 'NGOIS-AUTH-0011',
        message: 'User role is not recognised.',
        statusCode: 500,
        detail: user.role,
      });
    }

    const { permissions } = expandRoleOrThrow(user.role);

    const token = await new SignJWT({
      role: user.role,
      permissions,
      tenant_id: tenant.id,
      email: user.email,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(secret);

    ok(res, req, {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 8 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        tenant_id: tenant.id,
        permissions,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * OIDC start — returns authorize URL when AUTH_MODE=oidc and OIDC_* configured.
 * Full code exchange lands in a later IdP wiring PR; this is the staging-ready hook.
 */
app.get('/v1/auth/oidc/start', (req, res, next) => {
  try {
    const issuer = config.OIDC_ISSUER ?? process.env.OIDC_ISSUER;
    const clientId = config.OIDC_CLIENT_ID ?? process.env.OIDC_CLIENT_ID;
    const redirect =
      config.OIDC_REDIRECT_URI ??
      process.env.OIDC_REDIRECT_URI ??
      'http://127.0.0.1:5173/auth/callback';
    if (config.AUTH_MODE !== 'oidc' || !issuer || !clientId) {
      throw new AppError({
        code: 'NGOIS-AUTH-0012',
        message: 'OIDC is not configured. Set AUTH_MODE=oidc and OIDC_ISSUER / OIDC_CLIENT_ID.',
        statusCode: 503,
      });
    }
    const state = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 24);
    const authorize = new URL(`${issuer.replace(/\/$/, '')}/authorize`);
    authorize.searchParams.set('client_id', clientId);
    authorize.searchParams.set('redirect_uri', redirect);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'openid profile email');
    authorize.searchParams.set('state', state);
    ok(res, req, {
      mode: 'oidc',
      authorize_url: authorize.toString(),
      state,
      note: 'Complete token exchange with IdP; map claims to tenant_id + role before issuing NGOIS JWT.',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/v1/auth/me', async (req, res, next) => {
  try {
    if (!req.ctx.userId || !req.ctx.tenantId) {
      throw unauthorized();
    }
    const user = await withTenant(pool, req.ctx.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, email, display_name, role, status
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [req.ctx.userId],
      );
      return r.rows[0] as
        | { id: string; email: string; display_name: string; role: string; status: string }
        | undefined;
    });
    if (!user) throw unauthorized();
    const permissions = isRole(user.role) ? expandRoleOrThrow(user.role).permissions : [];
    ok(res, req, { ...user, tenant_id: req.ctx.tenantId, permissions });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler(log));

await listen(app, config.PORT, log);
