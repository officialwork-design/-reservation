import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const roots = ['src', 'gas'];
const errors = [];

function collectFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return [path];
  });
}

function checkModuleSyntax(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${file}\n${result.stderr || result.stdout}`.trim());
  }
}

function checkScriptSyntax(file) {
  try {
    new vm.Script(readFileSync(file, 'utf8'), { filename: file });
  } catch (error) {
    errors.push(`${file}\n${error.message}`);
  }
}

for (const root of roots) {
  for (const file of collectFiles(root)) {
    const ext = extname(file);
    if (ext === '.js' || ext === '.mjs') checkModuleSyntax(file);
    if (ext === '.gs') checkScriptSyntax(file);
  }
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exit(1);
}

console.log(`Lint passed (${roots.join(', ')})`);
