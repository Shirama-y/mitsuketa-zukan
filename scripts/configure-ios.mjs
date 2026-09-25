import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const plistPath = 'ios/App/App/Info.plist';

if (!existsSync(plistPath)) {
  console.log('iOS project not found yet. Run npm run native:ios:add first.');
  process.exit(0);
}

let plist = await readFile(plistPath, 'utf8');

const entries = [
  {
    key: 'NSCameraUsageDescription',
    value: '<string>図鑑に写真を登録するためにカメラを使用します。</string>',
  },
  {
    key: 'NSPhotoLibraryUsageDescription',
    value: '<string>図鑑に写真を登録するために写真ライブラリを使用します。</string>',
  },
  {
    key: 'ITSAppUsesNonExemptEncryption',
    value: '<false/>',
  },
];

for (const entry of entries) {
  if (plist.includes(`<key>${entry.key}</key>`)) continue;

  const insertion = `  <key>${entry.key}</key>\n  ${entry.value}\n`;
  const pos = plist.lastIndexOf('</dict>');

  if (pos < 0) {
    throw new Error('Could not locate root </dict> in Info.plist');
  }

  plist = plist.slice(0, pos) + insertion + plist.slice(pos);
}

await writeFile(plistPath, plist, 'utf8');
console.log('iOS privacy descriptions configured.');
