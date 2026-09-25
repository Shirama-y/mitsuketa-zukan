import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

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

await build({
  entryPoints: ['scripts/native-bridge.mjs'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['ios16', 'chrome110'],
  outfile: 'www/native-bridge.js',
  minify: false,
  sourcemap: false,
});

const indexPath = 'www/index.html';
let html = await readFile(indexPath, 'utf8');

html = html
  .replace(/<link[^>]+href="https:\/\/fonts\.googleapis\.com[^"]*"[^>]*>\s*/g, '')
  .replace(/<link[^>]+href="https:\/\/fonts\.gstatic\.com[^"]*"[^>]*>\s*/g, '');

if (!html.includes('./native-bridge.js')) {
  html = html.replace(
    '</head>',
    '  <script src="./native-bridge.js"></script>\n</head>'
  );
}

await writeFile(indexPath, html, 'utf8');

console.log('Native web bundle created in ./www');
console.log('Native bridge bundled as ./www/native-bridge.js');
