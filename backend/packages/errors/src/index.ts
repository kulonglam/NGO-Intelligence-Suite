export type ErrorDetail = {
  code: string;
  message: string;
  field?: string;
  detail?: string;
  remediation?: string;
  documentation_url?: string;
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly field?: string;
  readonly detail?: string;
  readonly remediation?: string;
  readonly expose: boolean;

  constructor(opts: {
    code: string;
    message: string;
    statusCode?: number;
    field?: string;
    detail?: string;
    remediation?: string;
    expose?: boolean;
  }) {
    super(opts.message);
    this.name = 'AppError';
    this.code = opts.code;
    this.statusCode = opts.statusCode ?? 400;
    this.field = opts.field;
    this.detail = opts.detail;
    this.remediation = opts.remediation;
    this.expose = opts.expose ?? true;
  }

  toDetail(): ErrorDetail {
    return {
      code: this.code,
      message: this.message,
      ...(this.field ? { field: this.field } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.remediation ? { remediation: this.remediation } : {}),
      documentation_url: `https://docs.ngointelligence.io/errors/${this.code}`,
    };
  }
}

export function notFound(resource: string, id?: string): AppError {
  return new AppError({
    code: 'NGOIS-API-0004',
    message: `${resource} not found.`,
    statusCode: 404,
    detail: id ? `No ${resource} with id ${id}.` : undefined,
  });
}

export function unauthorized(message = 'Authentication required.'): AppError {
  return new AppError({
    code: 'NGOIS-AUTH-0001',
    message,
    statusCode: 401,
  });
}

export function forbidden(message = 'Insufficient permissions.'): AppError {
  return new AppError({
    code: 'NGOIS-AUTH-0003',
    message,
    statusCode: 403,
  });
}

export function validationError(message: string, field?: string, detail?: string): AppError {
  return new AppError({
    code: 'NGOIS-API-0001',
    message,
    statusCode: 400,
    field,
    detail,
  });
}

export function conflict(message: string, code = 'NGOIS-API-0008'): AppError {
  return new AppError({ code, message, statusCode: 409 });
}
