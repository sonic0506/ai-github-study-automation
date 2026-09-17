import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * JSON Schema 검증기.
 * 스키마 객체를 주입받는 createValidator() 와, 디렉터리에서 로드하는
 * loadValidator() 를 분리하여 파일 시스템 없이도 사용할 수 있게 한다.
 */

export const SCHEMA_BASE_URI = 'https://ai-github-study.local/schemas/';

export type SchemaName = 'repository' | 'ranking' | 'study-queue' | 'daily-bundle' | 'snapshot';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SchemaValidator {
  validate(name: SchemaName | string, data: unknown): ValidationResult;
  assert(name: SchemaName | string, data: unknown): void;
}

export function createValidator(schemas: object[]): SchemaValidator {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schema of schemas) ajv.addSchema(schema);

  const cache = new Map<string, ValidateFunction>();
  const resolve = (name: string): ValidateFunction => {
    const id = name.includes('://') ? name : `${SCHEMA_BASE_URI}${name.includes('.json') ? name : `${name}.schema.json`}`;
    let fn = cache.get(id);
    if (!fn) {
      fn = ajv.getSchema(id);
      if (!fn) throw new Error(`Unknown schema: ${name}`);
      cache.set(id, fn);
    }
    return fn;
  };

  const validate = (name: string, data: unknown): ValidationResult => {
    const fn = resolve(name);
    const valid = fn(data) as boolean;
    return { valid, errors: valid ? [] : formatErrors(fn.errors) };
  };

  return {
    validate,
    assert(name, data) {
      const r = validate(name, data);
      if (!r.valid) throw new Error(`Schema "${name}" validation failed:\n  ${r.errors.join('\n  ')}`);
    },
  };
}

export async function loadSchemas(dir: string): Promise<object[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.schema.json')).sort();
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8')) as object));
}

export async function loadValidator(dir: string): Promise<SchemaValidator> {
  return createValidator(await loadSchemas(dir));
}

/** ajv-formats(CJS)를 ESM(NodeNext/esbuild)에서 import 할 때의 default 차이 흡수 */
type FormatsPlugin = (ajv: Ajv2020) => Ajv2020;
const addFormats: FormatsPlugin =
  (addFormatsModule as unknown as { default?: FormatsPlugin }).default ??
  (addFormatsModule as unknown as FormatsPlugin);

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`);
}
