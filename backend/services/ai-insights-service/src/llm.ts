export type LlmResult = {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
};

export interface LlmAdapter {
  generate(prompt: string): Promise<LlmResult>;
}

/** Local stub — never calls an external provider. */
export class LocalLlmAdapter implements LlmAdapter {
  async generate(prompt: string): Promise<LlmResult> {
    const t0 = Date.now();
    const figures = [...prompt.matchAll(/"total_budget":\s*([\d.]+)/g)].map((m) => m[1]);
    const households = prompt.match(/"households_reached":\s*([\d.]+)/)?.[1] ?? '0';
    const parts = [
      'Draft grant narrative (machine-generated, unapproved).',
      `Active grant reports households_reached ${households}.`,
    ];
    if (figures.length) parts.push(`Budget figure cited: ${figures[0]}.`);
    else parts.push('No budget figure available in structured context.');
    parts.push('This draft must be human-approved before donor use.');
    const text = parts.join(' ');
    return {
      text,
      model: 'local-stub-v1',
      input_tokens: Math.ceil(prompt.length / 4),
      output_tokens: Math.ceil(text.length / 4),
      latency_ms: Date.now() - t0,
    };
  }
}

/**
 * OpenAI-compatible chat completions (OpenAI or Anthropic via gateway).
 * Enabled when AI_LLM_PROVIDER is openai|anthropic and AI_LLM_API_KEY is set.
 */
export class HttpLlmAdapter implements LlmAdapter {
  constructor(
    private readonly opts: {
      provider: 'openai' | 'anthropic';
      apiKey: string;
      model: string;
      baseUrl?: string;
    },
  ) {}

  async generate(prompt: string): Promise<LlmResult> {
    const t0 = Date.now();
    if (this.opts.provider === 'anthropic') {
      return this.anthropic(prompt, t0);
    }
    return this.openai(prompt, t0);
  }

  private async openai(prompt: string, t0: number): Promise<LlmResult> {
    const base = this.opts.baseUrl ?? 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: [
          {
            role: 'system',
            content:
              'Use only figures present in the user message. Do not invent numbers or personal data.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LLM provider error ${res.status}: ${err.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: json.model ?? this.opts.model,
      input_tokens: json.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
      output_tokens: json.usage?.completion_tokens ?? Math.ceil(text.length / 4),
      latency_ms: Date.now() - t0,
    };
  }

  private async anthropic(prompt: string, t0: number): Promise<LlmResult> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.opts.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.opts.model,
        max_tokens: 1024,
        system:
          'Use only figures present in the user message. Do not invent numbers or personal data.',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LLM provider error ${res.status}: ${err.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const text = json.content?.map((c) => c.text ?? '').join('') ?? '';
    return {
      text,
      model: json.model ?? this.opts.model,
      input_tokens: json.usage?.input_tokens ?? Math.ceil(prompt.length / 4),
      output_tokens: json.usage?.output_tokens ?? Math.ceil(text.length / 4),
      latency_ms: Date.now() - t0,
    };
  }
}

/** Select adapter from env: AI_LLM_PROVIDER=local|openai|anthropic */
export function createLlmAdapter(): LlmAdapter {
  const provider = (process.env.AI_LLM_PROVIDER ?? 'local').toLowerCase();
  const key = process.env.AI_LLM_API_KEY ?? '';
  if ((provider === 'openai' || provider === 'anthropic') && key) {
    return new HttpLlmAdapter({
      provider,
      apiKey: key,
      model:
        process.env.AI_LLM_MODEL ??
        (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'),
      baseUrl: process.env.AI_LLM_BASE_URL,
    });
  }
  return new LocalLlmAdapter();
}
