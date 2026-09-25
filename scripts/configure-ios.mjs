import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

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

await writeFile(privacyPath, privacyManifest, 'utf8');

if (existsSync(projectPath)) {
  let project = await readFile(projectPath, 'utf8');

  project = project
    .replace(/MARKETING_VERSION = [^;]+;/g, 'MARKETING_VERSION = 1.0.0;')
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, 'CURRENT_PROJECT_VERSION = 1;');

  if (!project.includes('PrivacyInfo.xcprivacy')) {
    const id = seed =>
      createHash('sha1').update(seed).digest('hex').slice(0, 24).toUpperCase();

    const fileRef = id('mitsuketa-zukan PrivacyInfo.xcprivacy file');
    const buildRef = id('mitsuketa-zukan PrivacyInfo.xcprivacy build');

    project = project.replace(
      '/* Begin PBXBuildFile section */\n',
      `/* Begin PBXBuildFile section */\n\t\t${buildRef} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* PrivacyInfo.xcprivacy */; };\n`
    );

    project = project.replace(
      '/* Begin PBXFileReference section */\n',
      `/* Begin PBXFileReference section */\n\t\t${fileRef} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`
    );

    const groupStart = project.indexOf('/* Begin PBXGroup section */');
    const groupEnd = project.indexOf('/* End PBXGroup section */');

    if (groupStart < 0 || groupEnd < 0) {
      throw new Error('Could not locate PBXGroup section');
    }

    const groupSection = project.slice(groupStart, groupEnd);
    const appGroupMatch = groupSection.match(
      /([A-F0-9]{24}) \/\* App \*\/ = \{\n\s*isa = PBXGroup;\n\s*children = \(\n/
    );

    if (!appGroupMatch) {
      throw new Error('Could not locate App PBXGroup');
    }

    const appGroupNeedle = appGroupMatch[0];
    const appGroupReplacement =
      appGroupNeedle +
      `\t\t\t\t${fileRef} /* PrivacyInfo.xcprivacy */,\n`;

    project =
      project.slice(0, groupStart) +
      groupSection.replace(appGroupNeedle, appGroupReplacement) +
      project.slice(groupEnd);

    const resourcesStart = project.indexOf('/* Begin PBXResourcesBuildPhase section */');
    const resourcesEnd = project.indexOf('/* End PBXResourcesBuildPhase section */');

    if (resourcesStart < 0 || resourcesEnd < 0) {
      throw new Error('Could not locate PBXResourcesBuildPhase section');
    }

    const resourcesSection = project.slice(resourcesStart, resourcesEnd);
    const filesNeedle = /files = \(\n/;

    if (!filesNeedle.test(resourcesSection)) {
      throw new Error('Could not locate Resources files list');
    }

    const resourcesReplacement = resourcesSection.replace(
      filesNeedle,
      `files = (\n\t\t\t\t${buildRef} /* PrivacyInfo.xcprivacy in Resources */,\n`
    );

    project =
      project.slice(0, resourcesStart) +
      resourcesReplacement +
      project.slice(resourcesEnd);

    await writeFile(projectPath, project, 'utf8');
  }
}

console.log('iOS privacy descriptions and PrivacyInfo.xcprivacy configured.');
