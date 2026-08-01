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
    OIDC_CLIENT_SECRET: z.string().optional(),
    OIDC_REDIRECT_URI: z.string().optional(),
    /** Local/staging: complete OIDC without a real IdP (never in production). */
    OIDC_STUB: z.coerce.boolean().default(false),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });
const secret = new TextEncoder().encode(config.JWT_SECRET);

const pendingOidc = new Map<string, number>();
const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

function oidcRedirectUri(): string {
  return (
    config.OIDC_REDIRECT_URI ??
    process.env.OIDC_REDIRECT_URI ??
    'http://127.0.0.1:5173/auth/callback'
  );
}

function oidcConfigured(): boolean {
  const issuer = config.OIDC_ISSUER ?? process.env.OIDC_ISSUER;
  const clientId = config.OIDC_CLIENT_ID ?? process.env.OIDC_CLIENT_ID;
  return Boolean(issuer && clientId);
}

function pruneOidcState() {
  const now = Date.now();
  for (const [state, created] of pendingOidc) {
    if (now - created > OIDC_STATE_TTL_MS) pendingOidc.delete(state);
  }
}

async function issueSessionForUser(
  tenantId: string,
  user: { id: string; email: string; display_name: string; role: string },
) {
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
    tenant_id: tenantId,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 8 * 60 * 60,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      tenant_id: tenantId,
      permissions,
    },
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant_slug: z.string().min(1).default('design-partner'),
});

const oidcCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  tenant_slug: z.string().min(1).default('design-partner'),
  email: z.string().email().optional(),
});

app.get('/v1/auth/config', (req, res) => {
  const mode = config.AUTH_MODE;
  const oidcReady = mode === 'oidc' && oidcConfigured();
  const stub = config.OIDC_STUB && config.NODE_ENV !== 'production';
  ok(res, req, {
    auth_mode: mode,
    dev_login_enabled: config.NODE_ENV !== 'production',
    oidc_enabled: oidcReady || stub,
    oidc_stub: stub,
    redirect_uri: oidcRedirectUri(),
  });
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

    ok(res, req, await issueSessionForUser(tenant.id, user));
  } catch (err) {
    next(err);
  }
});

app.get('/v1/auth/oidc/start', (req, res, next) => {
  try {
    const issuer = config.OIDC_ISSUER ?? process.env.OIDC_ISSUER;
    const clientId = config.OIDC_CLIENT_ID ?? process.env.OIDC_CLIENT_ID;
    const redirect = oidcRedirectUri();
    const stub =
      config.OIDC_STUB && config.NODE_ENV !== 'production';

    if (config.AUTH_MODE !== 'oidc' && !stub) {
      throw new AppError({
        code: 'NGOIS-AUTH-0012',
        message: 'OIDC is not configured. Set AUTH_MODE=oidc and OIDC_ISSUER / OIDC_CLIENT_ID.',
        statusCode: 503,
      });
    }
    if (!issuer || !clientId) {
      if (stub) {
        const state = createHash('sha256')
          .update(`${Date.now()}-${Math.random()}`)
          .digest('hex')
          .slice(0, 24);
        pendingOidc.set(state, Date.now());
        ok(res, req, {
          mode: 'oidc_stub',
          state,
          redirect_uri: redirect,
          note: 'OIDC_STUB enabled — complete via POST /v1/auth/oidc/callback with state.',
        });
        return;
      }
      throw new AppError({
        code: 'NGOIS-AUTH-0012',
        message: 'OIDC is not configured. Set AUTH_MODE=oidc and OIDC_ISSUER / OIDC_CLIENT_ID.',
        statusCode: 503,
      });
    }

    pruneOidcState();
    const state = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 24);
    pendingOidc.set(state, Date.now());
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
    });
  } catch (err) {
    next(err);
  }
});

app.post('/v1/auth/oidc/callback', validateBody(oidcCallbackSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof oidcCallbackSchema>;
    const created = pendingOidc.get(body.state);
    if (!created || Date.now() - created > OIDC_STATE_TTL_MS) {
      throw unauthorized('Invalid or expired sign-in session. Start again from login.');
    }
    pendingOidc.delete(body.state);

    const tenantResult = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM tenants WHERE slug = $1 AND deleted_at IS NULL`,
      [body.tenant_slug],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant || tenant.status !== 'active') {
      throw unauthorized('Tenant is not available for sign-in.');
    }

    let email: string | undefined = body.email?.toLowerCase();

    const stub =
      config.OIDC_STUB && config.NODE_ENV !== 'production' && !body.code;
    if (!stub && body.code) {
      const issuer = config.OIDC_ISSUER ?? process.env.OIDC_ISSUER;
      const clientId = config.OIDC_CLIENT_ID ?? process.env.OIDC_CLIENT_ID;
      const clientSecret = config.OIDC_CLIENT_SECRET ?? process.env.OIDC_CLIENT_SECRET;
      if (!issuer || !clientId || !clientSecret) {
        throw new AppError({
          code: 'NGOIS-AUTH-0013',
          message: 'OIDC token exchange is not configured (missing client secret).',
          statusCode: 503,
        });
      }
      const tokenUrl = `${issuer.replace(/\/$/, '')}/oauth/token`;
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: body.code,
        redirect_uri: oidcRedirectUri(),
        client_id: clientId,
        client_secret: clientSecret,
      });
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw unauthorized('Identity provider rejected the sign-in.');
      }
      const userinfoUrl = `${issuer.replace(/\/$/, '')}/userinfo`;
      const uiRes = await fetch(userinfoUrl, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const ui = (await uiRes.json()) as { email?: string; sub?: string };
      if (!uiRes.ok) {
        throw unauthorized('Could not read identity from provider.');
      }
      if (typeof ui.email === 'string') email = ui.email.toLowerCase();
      else if (typeof ui.sub === 'string') email = ui.sub.toLowerCase();
    }

    if (!email) {
      email = 'admin@design-partner.example';
    }

    const user = await withTenant(pool, tenant.id, async (client) => {
      const r = await client.query<{
        id: string;
        email: string;
        display_name: string;
        role: string;
        status: string;
      }>(
        `SELECT id, email, display_name, role, status
         FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [email],
      );
      return r.rows[0];
    });

    if (!user || user.status !== 'active') {
      throw unauthorized('No active user for this identity in the tenant.');
    }

    ok(res, req, await issueSessionForUser(tenant.id, user));
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
