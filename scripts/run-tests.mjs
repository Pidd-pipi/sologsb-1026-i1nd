// 轻量测试运行器：用 esbuild（vite 自带）把 TS 测试即时编译为 ESM，再交给 node:test。
// 不引入额外依赖；运行：node scripts/run-tests.mjs [file.test.ts ...]
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const files = process.argv.slice(2);
const entryPoints = files.length
  ? files.map((name) => new URL(name, import.meta.url).pathname)
  : [new URL('./governance.test.ts', import.meta.url).pathname, new URL('./store.test.ts', import.meta.url).pathname];

const dir = mkdtempSync(join(tmpdir(), 'course-tests-'));

for (const entry of entryPoints) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    sourcemap: 'inline'
  });
  const file = join(dir, basename(entry).replace(/\.ts$/, '.mjs'));
  writeFileSync(file, result.outputFiles[0].text);
  await import(pathToFileURL(file).href);
}
