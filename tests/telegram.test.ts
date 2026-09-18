import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, TelegramError, TelegramNotifier, maskBotToken, truncateMessage } from '../src/adapters/telegram.js';

type Reply = { status?: number; body?: unknown } | Error;

function setup(replies: Reply[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const sleeps: number[] = [];
  const queue = [...replies];
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
    const r = queue.shift() ?? { status: 500 };
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? { ok: true, result: { message_id: 1 } }), { status: r.status ?? 200 });
  }) as typeof fetch;
  const notifier = new TelegramNotifier({
    botToken: '123:ABC',
    chatId: '42',
    fetch: fetchFn,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { notifier, calls, sleeps };
}

describe('TelegramNotifier', () => {
  it('posts plain text to sendMessage and returns the message id', async () => {
    const { notifier, calls } = setup([{ body: { ok: true, result: { message_id: 77 } } }]);
    expect(await notifier.send('AI GitHub Daily — 2026-09-18')).toBe(77);
    expect(calls[0]!.url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    expect(calls[0]!.body).toEqual({
      chat_id: '42',
      text: 'AI GitHub Daily — 2026-09-18',
      disable_web_page_preview: true,
    });
    expect(calls[0]!.body.parse_mode).toBeUndefined();
  });

  it('requires a token and a chat id', () => {
    expect(() => new TelegramNotifier({ botToken: '', chatId: '42' })).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => new TelegramNotifier({ botToken: 't', chatId: '' })).toThrow(/TELEGRAM_CHAT_ID/);
  });

  it('honours retry_after on 429 and retries 5xx with backoff', async () => {
    const limited = setup([{ status: 429, body: { ok: false, description: 'Too Many Requests', parameters: { retry_after: 7 } } }, {}]);
    await limited.notifier.send('x');
    expect(limited.sleeps).toEqual([7000]);

    const flaky = setup([{ status: 502, body: { ok: false, description: 'Bad Gateway' } }, {}]);
    await flaky.notifier.send('x');
    expect(flaky.sleeps).toEqual([1000]);
  });

  it('retries network errors and gives up after maxRetries', async () => {
    const { notifier, sleeps } = setup([new TypeError('fetch failed'), new TypeError('fetch failed'), {}]);
    await notifier.send('x');
    expect(sleeps).toEqual([1000, 2000]);

    const failing = setup([new TypeError('down'), new TypeError('down'), new TypeError('down'), new TypeError('down')]);
    await expect(failing.notifier.send('x')).rejects.toBeInstanceOf(TelegramError);
  });

  it('does not retry a bad chat id', async () => {
    const { notifier, calls } = setup([{ status: 400, body: { ok: false, description: 'Bad Request: chat not found' } }]);
    await expect(notifier.send('x')).rejects.toThrow(/chat not found/);
    expect(calls).toHaveLength(1);
  });

  it('treats ok:false with HTTP 200 as an error', async () => {
    const { notifier } = setup([{ status: 200, body: { ok: false, description: 'Forbidden: bot was blocked by the user' } }]);
    await expect(notifier.send('x')).rejects.toThrow(/bot was blocked/);
  });
});

describe('message helpers', () => {
  it('truncates long messages and trims trailing whitespace', () => {
    expect(truncateMessage('짧은 글\n\n')).toBe('짧은 글');
    const long = 'a'.repeat(MAX_MESSAGE_LENGTH + 100);
    const cut = truncateMessage(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(cut.endsWith('… (생략)')).toBe(true);
  });

  it('masks the bot token', () => {
    expect(maskBotToken('123456:AAEabcdef')).toBe('123456:***');
    expect(maskBotToken(undefined)).toBe('(none)');
  });
});
