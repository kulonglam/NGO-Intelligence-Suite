import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type SendResult = {
  ok: boolean;
  provider_message_id: string;
  provider_response: Record<string, unknown>;
  permanent_failure?: boolean;
};

export interface ChannelAdapter {
  send(input: {
    to: string;
    subject?: string | null;
    body: string;
    evidenceDir: string;
  }): Promise<SendResult>;
}

export class LocalEmailAdapter implements ChannelAdapter {
  async send(input: {
    to: string;
    subject?: string | null;
    body: string;
    evidenceDir: string;
  }): Promise<SendResult> {
    mkdirSync(input.evidenceDir, { recursive: true });
    const id = `local-email-${randomUUID()}`;
    const path = join(input.evidenceDir, `${id}.json`);
    const payload = {
      channel: 'email',
      to: input.to,
      subject: input.subject,
      body: input.body,
      at: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return {
      ok: true,
      provider_message_id: id,
      provider_response: { adapter: 'local-email', path },
    };
  }
}

export class LocalSmsAdapter implements ChannelAdapter {
  async send(input: {
    to: string;
    subject?: string | null;
    body: string;
    evidenceDir: string;
  }): Promise<SendResult> {
    mkdirSync(input.evidenceDir, { recursive: true });
    const id = `local-sms-${randomUUID()}`;
    const path = join(input.evidenceDir, `${id}.json`);
    const payload = {
      channel: 'sms',
      to: input.to,
      body: input.body,
      provider: 'africas_talking_local_stub',
      at: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return {
      ok: true,
      provider_message_id: id,
      provider_response: { adapter: 'local-sms', path },
    };
  }
}

/** Live SendGrid when SENDGRID_API_KEY is set; otherwise permanent failure. */
export class SendGridAdapter implements ChannelAdapter {
  constructor(private readonly apiKey = process.env.SENDGRID_API_KEY ?? '') {}

  async send(input: {
    to: string;
    subject?: string | null;
    body: string;
    evidenceDir: string;
  }): Promise<SendResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        provider_message_id: '',
        provider_response: { error: 'sendgrid_not_configured', hint: 'Set SENDGRID_API_KEY' },
        permanent_failure: true,
      };
    }
    const from = process.env.SENDGRID_FROM ?? 'noreply@ngointelligence.io';
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.to }] }],
          from: { email: from },
          subject: input.subject ?? 'NGOIS notification',
          content: [{ type: 'text/plain', value: input.body }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const msgId = res.headers.get('x-message-id') ?? `sg-${randomUUID()}`;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          ok: false,
          provider_message_id: msgId,
          provider_response: { status: res.status, body: text.slice(0, 500) },
          permanent_failure: res.status >= 400 && res.status < 500,
        };
      }
      return {
        ok: true,
        provider_message_id: msgId,
        provider_response: { adapter: 'sendgrid', status: res.status },
      };
    } catch (err) {
      return {
        ok: false,
        provider_message_id: '',
        provider_response: { error: String(err instanceof Error ? err.message : err) },
      };
    }
  }
}

/** Africa's Talking SMS when AT_API_KEY + AT_USERNAME set. */
export class AfricasTalkingAdapter implements ChannelAdapter {
  constructor(
    private readonly apiKey = process.env.AT_API_KEY ?? '',
    private readonly username = process.env.AT_USERNAME ?? '',
  ) {}

  async send(input: {
    to: string;
    subject?: string | null;
    body: string;
    evidenceDir: string;
  }): Promise<SendResult> {
    if (!this.apiKey || !this.username) {
      return {
        ok: false,
        provider_message_id: '',
        provider_response: {
          error: 'africas_talking_not_configured',
          hint: 'Set AT_API_KEY and AT_USERNAME',
        },
        permanent_failure: true,
      };
    }
    const from = process.env.AT_SENDER_ID ?? '';
    try {
      const params = new URLSearchParams({
        username: this.username,
        to: input.to,
        message: input.body,
      });
      if (from) params.set('from', from);
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok;
      return {
        ok,
        provider_message_id: String(
          (json as { SMSMessageData?: { Recipients?: Array<{ messageId?: string }> } })
            .SMSMessageData?.Recipients?.[0]?.messageId ?? `at-${randomUUID()}`,
        ),
        provider_response: { adapter: 'africas_talking', status: res.status, body: json },
        permanent_failure: !ok && res.status >= 400 && res.status < 500,
      };
    } catch (err) {
      return {
        ok: false,
        provider_message_id: '',
        provider_response: { error: String(err instanceof Error ? err.message : err) },
      };
    }
  }
}
