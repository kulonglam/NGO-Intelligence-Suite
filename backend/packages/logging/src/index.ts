export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

/** Fields that must never appear in logs (PII allowlist inverse). */
const BLOCKED = new Set([
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'ssn',
  'national_id',
  'phone',
  'email',
  'full_name',
  'date_of_birth',
  'gps',
  'location_precise',
]);

function scrub(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (BLOCKED.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export type Logger = {
  child(bindings: LogFields): Logger;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
};

function write(level: LogLevel, service: string, msg: string, fields?: LogFields): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    service,
    msg,
    ...scrub(fields),
  };
  const payload = JSON.stringify(line);
  if (level === 'error') {
    console.error(payload);
  } else if (level === 'warn') {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

export function createLogger(service: string, bindings: LogFields = {}): Logger {
  const base = { service, ...bindings };
  const log =
    (level: LogLevel) =>
    (msg: string, fields?: LogFields): void => {
      write(level, service, msg, { ...base, ...fields });
    };
  return {
    child(extra) {
      return createLogger(service, { ...base, ...extra });
    },
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
  };
}
