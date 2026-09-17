/**
 * 사용법:
 *   node scripts/analyze.mjs input.json > output.json
 *   cat input.json | node scripts/analyze.mjs
 *
 * input:  AnalyzerInput  (date, current, previousSnapshot, firstSeen?, options?)
 * output: AnalyzerOutput (date, repositories, rankings, snapshot)
 */
import { readJsonInput, runCli, writeJsonOutput } from '../../../src/core/json-io.js';
import { analyzeStars, type AnalyzerInput } from './analyze.js';

runCli(async () => {
  const input = (await readJsonInput(process.argv[2])) as AnalyzerInput;
  writeJsonOutput(analyzeStars(input));
});
