import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/);

if (!match) {
  console.error("NG: index.html に script が見つかりません");
  process.exit(1);
}

try {
  new Function(match[1]);
} catch (error) {
  console.error("NG: JavaScript の構文に問題があります");
  console.error(error);
  process.exit(1);
}

const required = [
  "function renderShelf",
  "function renderBookCover",
  "function renderBook",
  "function renderEntry",
  "function renderDesign",
  "function openEntryForm",
  "function openEditForm",
  "IndexedDB",
  "BOOK_PRESETS",
  "nameMode",
  "function exportBackup",
  "restoreBackup: restoreBackupData",
  "BOOK_PRESETS",
  "serviceWorker.register"
];

for (const marker of required) {
  if (!html.includes(marker)) {
    console.error("NG: 必要な機能が見つかりません: " + marker);
    process.exit(1);
  }
}

const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
if (!manifest.name || manifest.display !== "standalone") {
  console.error("NG: manifest.webmanifest の設定を確認してください");
  process.exit(1);
}

for (const file of ["service-worker.js", "app-icon.svg"]) {
  if (!fs.existsSync(new URL("../" + file, import.meta.url))) {
    console.error("NG: " + file + " が見つかりません");
    process.exit(1);
  }
}

console.log("OK: 基本チェックを通過しました");
