/**
 * Telegram Bot 알림.
 * 서식 오류로 전송이 실패하지 않도록 parse_mode 없이 평문으로 보낸다.
 * fetch / sleep 를 주입받아 네트워크 없이 테스트할 수 있다.
 */

export interface TelegramOptions {
  botToken: string;
  chatId: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class TelegramError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Telegram ${status}: ${message}`);
    this.name = 'TelegramError';
  }
}

/** Telegram 메시지 상한 (4096자). 넘으면 잘라서 보낸다 */
export const MAX_MESSAGE_LENGTH = 4096;

export function truncateMessage(text: string, max = MAX_MESSAGE_LENGTH): string {
  const trimmed = text.trimEnd();
  if (trimmed.length <= max) return trimmed;
  const suffix = '\n… (생략)';
  return `${trimmed.slice(0, max - suffix.length).trimEnd()}${suffix}`;
}

export class TelegramNotifier {
  private readonly o: Required<Omit<TelegramOptions, 'botToken' | 'chatId'>> & Pick<TelegramOptions, 'botToken' | 'chatId'>;
  requestCount = 0;

  constructor(options: TelegramOptions) {
    if (!options.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
    if (!options.chatId) throw new Error('TELEGRAM_CHAT_ID is required');
    this.o = {
      botToken: options.botToken,
      chatId: options.chatId,
      baseUrl: options.baseUrl ?? 'https://api.telegram.org',
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 3,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    };
  }

  /** 성공하면 message_id 를 반환한다 */
  async send(text: string, options: { disablePreview?: boolean } = {}): Promise<number> {
    const body = {
      chat_id: this.o.chatId,
      text: truncateMessage(text),
      disable_web_page_preview: options.disablePreview ?? true,
    };
    const url = `${this.o.baseUrl.replace(/\/$/, '')}/bot${this.o.botToken}/sendMessage`;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        this.requestCount++;
        res = await this.o.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
      } catch (err) {
        if (attempt >= this.o.maxRetries) throw new TelegramError(0, `network error: ${(err as Error).message}`);
        await this.o.sleep(1000 * 2 ** attempt);
        continue;
      }

      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { message_id?: number };
        description?: string;
        parameters?: { retry_after?: number };
      };
      if (res.ok && payload.ok) return payload.result?.message_id ?? 0;

      const description = payload.description ?? res.statusText;
      const retryAfter = payload.parameters?.retry_after;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.o.maxRetries) {
        await this.o.sleep(retryAfter ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new TelegramError(res.status, description);
    }
  }
}

/** 토큰이 로그에 남지 않도록 가린다 */
export const maskBotToken = (token: string | undefined): string => {
  if (!token) return '(none)';
  const [id] = token.split(':');
  return id ? `${id}:***` : '***';
};
