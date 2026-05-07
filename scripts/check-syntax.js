import {readdirSync} from 'fs';
import {join, relative} from 'path';
import {spawnSync} from 'child_process';

const root = process.cwd();
const ignoredDirs = new Set(['.git', '.github', 'coverage', 'dist', 'node_modules']);

function collectJsFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) collectJsFiles(join(dir, entry.name), files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const files = collectJsFiles(join(root, 'src'));
files.push(...collectJsFiles(join(root, 'scripts')));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${relative(root, file)}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Syntax OK (${files.length} files).`);
