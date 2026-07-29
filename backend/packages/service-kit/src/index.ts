import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  type RequestHandler,
} from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '@ngois/errors';
import { createLogger, type Logger } from '@ngois/logging';
import { z } from 'zod';

export type RequestContext = {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  role?: string;
  permissions: string[];
  startedAt: number;
};

declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
      log: Logger;
    }
  }
}

export type CreateAppOptions = {
  serviceName: string;
  version?: string;
};

export function createApp(opts: CreateAppOptions): { app: Express; log: Logger } {
  const log = createLogger(opts.serviceName);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((req, _res, next) => {
    const correlationId =
      (req.header('x-correlation-id') ?? '').trim() || randomUUID().replace(/-/g, '');
    const permissionsHeader = req.header('x-permissions') ?? '';
    req.ctx = {
      correlationId,
      tenantId: req.header('x-tenant-id') ?? undefined,
      userId: req.header('x-user-id') ?? undefined,
      role: req.header('x-user-role') ?? undefined,
      permissions: permissionsHeader
        ? permissionsHeader.split(',').map((p) => p.trim()).filter(Boolean)
        : [],
      startedAt: Date.now(),
    };
    req.log = log.child({
      correlation_id: correlationId,
      path: req.path,
      method: req.method,
    });
    next();
  });

  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', (_req, res) => {
    res.status(200).json({ status: 'ready', service: opts.serviceName });
  });

  app.get('/health/startup', (_req, res) => {
    res.status(200).json({ status: 'started', service: opts.serviceName });
  });

  app.get('/version', (_req, res) => {
    res.status(200).json({
      service: opts.serviceName,
      version: opts.version ?? '0.1.0',
      api_version: '1',
    });
  });

  return { app, log };
}

export function ok<T>(
  res: Response,
  req: Request,
  data: T,
  status = 200,
  extraMeta: Record<string, unknown> = {},
): void {
  res.status(status).json({
    success: true,
    data,
    meta: {
      request_id: req.ctx.correlationId,
      timestamp: new Date().toISOString(),
      api_version: '1',
      duration_ms: Date.now() - req.ctx.startedAt,
      ...extraMeta,
    },
    errors: null,
  });
}

export function errorHandler(log: Logger): (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => void {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        log.error(err.message, { code: err.code, correlation_id: req.ctx?.correlationId });
      }
      res.status(err.statusCode).json({
        success: false,
        data: null,
        meta: {
          request_id: req.ctx?.correlationId ?? randomUUID(),
          timestamp: new Date().toISOString(),
          api_version: '1',
          duration_ms: req.ctx ? Date.now() - req.ctx.startedAt : undefined,
        },
        errors: [err.toDetail()],
      });
      return;
    }

    log.error('Unhandled error', {
      correlation_id: req.ctx?.correlationId,
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      success: false,
      data: null,
      meta: {
        request_id: req.ctx?.correlationId ?? randomUUID(),
        timestamp: new Date().toISOString(),
        api_version: '1',
      },
      errors: [
        {
          code: 'NGOIS-API-0500',
          message: 'An unexpected error occurred.',
          documentation_url: 'https://docs.ngointelligence.io/errors/NGOIS-API-0500',
        },
      ],
    });
  };
}

export function validateBody<T extends z.ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      next(
        new AppError({
          code: 'NGOIS-API-0001',
          message: issue?.message ?? 'Validation failed.',
          statusCode: 400,
          field: issue?.path.join('.') || undefined,
          detail: parsed.error.message,
        }),
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function requirePermission(...needed: string[]): RequestHandler {
  return (req, _res, next) => {
    const perms = new Set(req.ctx.permissions);
    // Permissions come from the JWT (expanded from Appendix C). No role bypass —
    // super_admin standing grants are limited; break-glass is a separate path.
    if (needed.some((p) => perms.has(p))) {
      next();
      return;
    }
    next(
      new AppError({
        code: 'NGOIS-AUTH-0003',
        message: 'Insufficient permissions.',
        statusCode: 403,
        detail: `Required one of: ${needed.join(', ')}`,
      }),
    );
  };
}

export async function listen(app: Express, port: number, log: Logger): Promise<void> {
  await new Promise<void>((resolve) => {
    const server = app.listen(port, () => {
      log.info('listening', { port });
      resolve();
    });

    const shutdown = (signal: string) => {
      log.info('shutdown', { signal });
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}
