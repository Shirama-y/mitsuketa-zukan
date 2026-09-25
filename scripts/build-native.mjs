import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const sourceFiles = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'app-icon.svg',
];

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });

for (const file of sourceFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
  await cp(file, `www/${file}`);
}

if (!existsSync('assets')) {
  throw new Error('Missing required assets directory');
}
await cp('assets', 'www/assets', { recursive: true });

console.log('Native web bundle created in ./www');
