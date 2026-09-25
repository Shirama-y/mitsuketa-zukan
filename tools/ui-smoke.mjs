import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.APP_URL || "http://127.0.0.1:8777/";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64"
);
fs.writeFileSync("/tmp/zukan-test.png", png);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

try {
  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.locator(".new-spine").click();
  await page.locator("#new-title").fill("草花図鑑");
  await page.getByRole("button", { name: "この図鑑をつくる" }).click();

  await page.waitForURL(/#\/b\/[^/]+$/);
  await page.locator(".cover-screen").waitFor();
  await page.getByRole("button", { name: /この図鑑をひらく/ }).click();
  await page.waitForURL(/\/list$/);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator(".add-entry-btn").click()
  ]);
  await chooser.setFiles("/tmp/zukan-test.png");
  await page.locator("#new-entry-name").fill("たんぽぽ");
  await page.locator("#new-entry-kanji").fill("蒲公英");
  await page.locator("#new-entry-place").fill("近所の公園");
  await page.locator("#new-entry-tags").fill("花, 春, 黄色");
  await page.getByRole("button", { name: "コレクションに追加" }).click();

  await page.locator(".entry-row").waitFor();
  await page.locator(".entry-open").click();

  await page.getByText("たんぽぽ", { exact: true }).waitFor();
  await page.getByText("蒲公英", { exact: true }).waitFor();

  await page.screenshot({ path: "/tmp/zukan-375.png", fullPage: true });

  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップ" }).click();
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  if (!suggested.endsWith(".json")) throw new Error("Backup download is not JSON");

  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/zukan-430.png", fullPage: true });

  console.log("OK: UI smoke test passed");
} catch (error) {
  await page.screenshot({ path: "/tmp/zukan-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
