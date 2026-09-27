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

  const createFirst = page.locator(".library-start");
  if (await createFirst.count()) {
    const welcomeArt = page.locator(".library-empty-art");
    await welcomeArt.waitFor();
    const welcomeOk = await welcomeArt.evaluate(img =>
      img instanceof HTMLImageElement &&
      img.complete &&
      img.naturalWidth > 0 &&
      img.getAttribute("src")?.includes("ui-welcome-hero.svg")
    );
    if (!welcomeOk) throw new Error("Welcome artwork failed to load");
    await createFirst.click();
  } else {
    await page.locator(".library-add").click();
  }

  const newBookArt = page.locator(".new-book-art");
  await newBookArt.waitFor();
  const newBookArtOk = await newBookArt.evaluate(img =>
    img instanceof HTMLImageElement &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.getAttribute("src")?.includes("ui-discovery-cluster.svg")
  );
  if (!newBookArtOk) throw new Error("New-book artwork failed to load");

  await page.locator("#new-title").fill("草花図鑑");
  await page.getByRole("button", { name: "この図鑑をつくる" }).click();

  await page.waitForURL(/#\/b\/[^/]+$/);
  await page.locator(".cover-screen").waitFor();
  await page.screenshot({ path: "/tmp/zukan-cover-375.png", fullPage: true });
  await page.getByRole("button", { name: /この図鑑をひらく/ }).click();
  await page.waitForURL(/\/list$/);

  const emptyAlbumArt = page.locator(".empty-art");
  await emptyAlbumArt.waitFor();
  const emptyAlbumOk = await emptyAlbumArt.evaluate(img =>
    img instanceof HTMLImageElement &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.getAttribute("src")?.includes("ui-empty-album.svg")
  );
  if (!emptyAlbumOk) throw new Error("Empty-album artwork failed to load");

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

  await page.goto(BASE + "#/settings", { waitUntil: "networkidle" });
  await page.waitForURL(/#\/settings$/);
  const backupRow = page.locator(".settings-row").filter({ hasText: "バックアップ" }).first();
  const downloadPromise = page.waitForEvent("download");
  await backupRow.getByRole("button", { name: "保存" }).click();
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  if (!suggested.endsWith(".json")) throw new Error("Backup download is not JSON");

  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/zukan-shelf-430.png", fullPage: true });

  // Search screen opens from bottom nav.
  await page.locator("#app-nav button").nth(1).click();
  await page.waitForURL(/#\/search$/);

  const searchArt = page.locator(".search-hero-art");
  await searchArt.waitFor();
  const searchArtOk = await searchArt.evaluate(img =>
    img instanceof HTMLImageElement &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.getAttribute("src")?.includes("ui-discovery-cluster.svg")
  );
  if (!searchArtOk) throw new Error("Search artwork failed to load");

  await page.locator(".global-search input").fill("たんぽぽ");
  await page.getByText("たんぽぽ", { exact: true }).waitFor();

  // Collections screen opens and contains the created book.
  await page.locator("#app-nav button").nth(2).click();
  await page.waitForURL(/#\/collections$/);
  await page.locator(".book-grid-title", { hasText: "草花図鑑" }).first().waitFor();

  // Settings screen exposes backup, restore, and a real-image PRO sheet.
  await page.locator("#app-nav button").nth(3).click();
  await page.waitForURL(/#\/settings$/);
  await page.getByText("バックアップ", { exact: true }).waitFor();
  await page.getByText("復元", { exact: true }).waitFor();

  const proRow = page.locator(".settings-row").filter({ hasText: "PRO" }).first();
  if (await proRow.count()) {
    await proRow.getByRole("button").click();
    const proArt = page.locator(".pro-hero-art");
    await proArt.waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector(".pro-hero-art");
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
    });
    const proArtSrc = await proArt.getAttribute("src");
    if (!proArtSrc?.includes("ui-pro-hero.svg")) {
      throw new Error("PRO artwork source is incorrect");
    }
    await page.getByRole("button", { name: "閉じる" }).last().click();
  }

  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  await page.locator(".spine-card:not(.new-spine)").first().click();
  await page.locator(".cover-screen").waitFor();
  await page.getByRole("button", { name: "デザインを編集" }).click();
  await page.locator(".design-screen").waitFor();

  // Button theme can be changed and persists with the book.
  await page.locator('[data-button-theme="navy"]').click();
  await page.locator(".button-theme-choice.active", { hasText: "ネイビー" }).waitFor();
  await page.screenshot({ path: "/tmp/zukan-design-430.png", fullPage: true });
  await page.getByRole("button", { name: "保存" }).click();
  await page.locator(".cover-screen").waitFor();
  await page.getByRole("button", { name: "デザインを編集" }).click();
  await page.locator(".button-theme-choice.active", { hasText: "ネイビー" }).waitFor();

  // Regression: leather/linen texture must never lock the selected cover color.
  await page.locator(".advanced-toggle").click();
  const previewFace = page.locator(".design-preview .book-face");

  const colorChoices = page.locator("[data-color]");
  if (await colorChoices.count() < 3) {
    throw new Error("Expected at least three cover colors");
  }

  await colorChoices.nth(1).click();
  const firstColor = await previewFace.evaluate(
    el => getComputedStyle(el).backgroundColor
  );

  await page.locator('[data-theme="5"]').click();
  const linenColor = await previewFace.evaluate(
    el => getComputedStyle(el).backgroundColor
  );
  const linenTexture = await previewFace.evaluate(
    el => getComputedStyle(el).backgroundImage
  );

  if (linenColor !== firstColor) {
    throw new Error("Linen texture changed the selected cover color");
  }
  if (!linenTexture || linenTexture === "none" || !linenTexture.includes("texture-linen.webp")) {
    throw new Error("Linen WebP texture is not visible");
  }

  await colorChoices.nth(2).click();
  const secondColor = await previewFace.evaluate(
    el => getComputedStyle(el).backgroundColor
  );
  if (secondColor === firstColor) {
    throw new Error("Changing cover color had no visual effect with linen texture");
  }

  await page.locator('[data-theme="0"]').click();
  const leatherColor = await previewFace.evaluate(
    el => getComputedStyle(el).backgroundColor
  );
  const leatherTexture = await previewFace.evaluate(
    el => getComputedStyle(el).backgroundImage
  );

  if (leatherColor !== secondColor) {
    throw new Error("Leather texture changed the selected cover color");
  }
  if (!leatherTexture || leatherTexture === "none" || leatherTexture === linenTexture || !leatherTexture.includes("texture-leather.webp")) {
    throw new Error("Leather WebP texture is missing or indistinguishable from linen");
  }

  // Save and reopen to verify the independent color/texture choices persist.
  await page.getByRole("button", { name: "保存" }).click();
  await page.locator(".cover-screen").waitFor();
  await page.getByRole("button", { name: "デザインを編集" }).click();
  await page.locator(".advanced-toggle").click();
  await page.locator('[data-theme="0"].active').waitFor();
  await page.locator('[data-color].active').nth(0).waitFor();

  const persistedColor = await page.locator(".design-preview .book-face").evaluate(
    el => getComputedStyle(el).backgroundColor
  );
  if (persistedColor !== secondColor) {
    throw new Error("Cover color did not persist after saving");
  }

  console.log("OK: UI smoke test passed");
} catch (error) {
  await page.screenshot({ path: "/tmp/zukan-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
