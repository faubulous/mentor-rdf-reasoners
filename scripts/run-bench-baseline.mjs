import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repeats = Number.parseInt(process.env.BENCH_REPEATS ?? '3', 10);
if (!Number.isFinite(repeats) || repeats <= 0) {
  throw new Error('BENCH_REPEATS must be a positive integer');
}

const benchmarkDir = 'benchmarks';
mkdirSync(benchmarkDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = join(benchmarkDir, `baseline-${timestamp}.txt`);

const chunks = [];
chunks.push(`# Statement serializer baseline\n`);
chunks.push(`# generatedAt=${new Date().toISOString()}\n`);
chunks.push(`# repeats=${repeats}\n\n`);

for (let i = 1; i <= repeats; i++) {
  const result = spawnSync('npx', ['vitest', 'bench', '--run'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  chunks.push(`\n===== RUN ${i}/${repeats} =====\n`);
  chunks.push(output);

  if (result.status !== 0) {
    writeFileSync(outFile, chunks.join(''));
    process.stderr.write(`Benchmark run ${i} failed. Partial output written to ${outFile}\n`);
    process.exit(result.status ?? 1);
  }
}

writeFileSync(outFile, chunks.join(''));
process.stdout.write(`Baseline benchmark report written to ${outFile}\n`);
