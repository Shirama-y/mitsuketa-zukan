import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.APP_URL || "http://127.0.0.1:8777/";

const samplePhoto = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675" viewBox="0 0 900 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f7041"/>
      <stop offset="1" stop-color="#173c2e"/>
    </linearGradient>
    <radialGradient id="petal" cx=".5" cy=".45" r=".7">
      <stop offset="0" stop-color="#fffdf5"/>
      <stop offset="1" stop-color="#e8e3cf"/>
    </radialGradient>
  </defs>
  <rect width="900" height="675" fill="url(#bg)"/>
  <g opacity=".22" fill="#b8d19b">
    <circle cx="120" cy="100" r="95"/><circle cx="780" cy="145" r="120"/><circle cx="650" cy="600" r="130"/>
  </g>
  <path d="M450 620 C430 500,470 420,450 325" fill="none" stroke="#487f42" stroke-width="22" stroke-linecap="round"/>
  <g transform="translate(450 280)">
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(0) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(45) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(90) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(135) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(180) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(225) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(270) translate(0 -85)"/>
    <ellipse rx="74" ry="155" fill="url(#petal)" transform="rotate(315) translate(0 -85)"/>
    <circle r="88" fill="#d9a72e"/>
    <circle r="58" fill="#9f741b"/>
  </g>
</svg>`;
fs.writeFileSync("/tmp/zukan-test.svg", samplePhoto);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

try {
  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.locator(".new-spine").click();
  await page.locator("#new-title").fill("草花図鑑");
  await page.getByRole("button", { name: "この図鑑をつくる" }).click();

  await page.waitForURL(/#\/b\/[^/]+$/);
  await page.locator(".cover-screen").waitFor();
  await page.screenshot({ path: "/tmp/zukan-cover-375.png", fullPage: true });
  await page.getByRole("button", { name: /この図鑑をひらく/ }).click();
  await page.waitForURL(/\/list$/);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator(".add-entry-btn").click()
  ]);
  await chooser.setFiles("/tmp/zukan-test.svg");
  await page.locator("#new-entry-name").fill("たんぽぽ");
  await page.locator("#new-entry-kanji").fill("蒲公英");
  await page.locator("#new-entry-place").fill("近所の公園");
  await page.locator("#new-entry-tags").fill("花, 春, 黄色");
  await page.getByRole("button", { name: "コレクションに追加" }).click();

  await page.locator(".entry-row").waitFor();
  await page.locator(".entry-open").click();

  await page.getByText("たんぽぽ", { exact: true }).waitFor();
  await page.getByText("蒲公英", { exact: true }).waitFor();

  await page.screenshot({ path: "/tmp/zukan-detail-375.png", fullPage: true });

  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップ" }).click();
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  if (!suggested.endsWith(".json")) throw new Error("Backup download is not JSON");

  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/zukan-shelf-430.png", fullPage: true });

  // Search screen opens from bottom nav.
  await page.locator("#app-nav button").nth(1).click();
  await page.waitForURL(/#\/search$/);
  await page.locator(".global-search input").fill("たんぽぽ");
  await page.getByText("たんぽぽ", { exact: true }).waitFor();

  // Collections screen opens and contains the created book.
  await page.locator("#app-nav button").nth(2).click();
  await page.waitForURL(/#\/collections$/);
  await page.locator(".book-grid-title", { hasText: "草花図鑑" }).first().waitFor();

  // Settings screen exposes backup and restore.
  await page.locator("#app-nav button").nth(3).click();
  await page.waitForURL(/#\/settings$/);
  await page.getByText("バックアップ", { exact: true }).waitFor();
  await page.getByText("復元", { exact: true }).waitFor();

  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  await page.locator(".spine-card:not(.new-spine)").first().click();
  await page.locator(".cover-screen").waitFor();
  await page.getByRole("button", { name: "デザインを編集" }).click();
  await page.locator(".design-screen").waitFor();

  // Button theme can be changed and persists with the book.
  await page.getByRole("button", { name: "ネイビー" }).click();
  await page.locator(".button-theme-choice.active", { hasText: "ネイビー" }).waitFor();
  await page.screenshot({ path: "/tmp/zukan-design-430.png", fullPage: true });
  await page.getByRole("button", { name: "保存" }).click();
  await page.locator(".cover-screen").waitFor();
  await page.getByRole("button", { name: "デザインを編集" }).click();
  await page.locator(".button-theme-choice.active", { hasText: "ネイビー" }).waitFor();

  console.log("OK: UI smoke test passed");
} catch (error) {
  await page.screenshot({ path: "/tmp/zukan-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
