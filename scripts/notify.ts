/**
 * npm run notify -- --file <본문.md> [--prefix "..."] [--suffix "..."]
 * npm run notify -- --text "메시지"
 *
 * Telegram 으로 알림을 보낸다. 토큰/chat id 가 없으면 건너뛴다 (종료 코드 0).
 * 실패 알림 예: npm run notify -- --text "실패: ..." 
 */
import { readFile } from 'node:fs/promises';
import { TelegramNotifier, maskBotToken } from '../src/adapters/telegram.js';
import { loadEnv } from '../src/core/env.js';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 없어 알림을 건너뛴다.');
    return;
  }

  const file = arg('--file');
  const body = arg('--text') ?? (file ? await readFile(file, 'utf8') : undefined);
  if (!body) throw new Error('usage: npm run notify -- --file <본문.md> | --text "메시지"');

  const text = [arg('--prefix'), body.trim(), arg('--suffix')].filter(Boolean).join('\n');
  const notifier = new TelegramNotifier({ botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
  const messageId = await notifier.send(text);
  console.log(`Telegram 전송 완료 (bot ${maskBotToken(env.TELEGRAM_BOT_TOKEN)}, message_id ${messageId})`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
