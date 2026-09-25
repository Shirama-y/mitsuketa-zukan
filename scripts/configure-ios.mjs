import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import xcode from 'xcode';

const plistPath = 'ios/App/App/Info.plist';
const privacyPath = 'ios/App/App/PrivacyInfo.xcprivacy';
const projectPath = 'ios/App/App.xcodeproj/project.pbxproj';

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

const privacyManifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
</dict>
</plist>
`;

writeFileSync(privacyPath, privacyManifest, 'utf8');

if (existsSync(projectPath)) {
  const project = xcode.project(projectPath);
  project.parseSync();

  const projectText = project.writeSync();
  if (!projectText.includes('PrivacyInfo.xcprivacy')) {
    const appGroupKey =
      project.findPBXGroupKey({ path: 'App' }) ||
      project.findPBXGroupKey({ name: 'App' });

    if (!appGroupKey) {
      throw new Error('Could not find the App PBXGroup in the Xcode project');
    }

    project.addResourceFile(
      'PrivacyInfo.xcprivacy',
      { target: project.getFirstTarget().uuid },
      appGroupKey
    );
    writeFileSync(projectPath, project.writeSync(), 'utf8');
  }
}

console.log('iOS privacy descriptions and PrivacyInfo.xcprivacy configured.');
