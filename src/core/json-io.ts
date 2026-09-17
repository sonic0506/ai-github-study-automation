import { readFile } from 'node:fs/promises';

/** CLI 공통: 인자 파일 또는 stdin 에서 JSON 을 읽는다. */
export async function readJsonInput(pathArg?: string): Promise<unknown> {
  if (pathArg && pathArg !== '-') return JSON.parse(await readFile(pathArg, 'utf8'));
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) throw new Error('No JSON input. Pass a file path or pipe JSON via stdin.');
  return JSON.parse(text);
}

export function writeJsonOutput(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function runCli(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
