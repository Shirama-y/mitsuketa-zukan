import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.APP_URL || "http://127.0.0.1:8777/";

function flowerSvg(bg, petal, center) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675" viewBox="0 0 900 675">
    <rect width="900" height="675" fill="${bg}"/>
    <circle cx="180" cy="120" r="120" fill="#ffffff" opacity=".07"/>
    <circle cx="760" cy="560" r="170" fill="#ffffff" opacity=".05"/>
    <path d="M450 640C430 510 468 430 450 330" fill="none" stroke="#3f7548" stroke-width="24" stroke-linecap="round"/>
    <g transform="translate(450 280)">
      ${[0,45,90,135,180,225,270,315].map(a=>`<ellipse rx="72" ry="148" fill="${petal}" transform="rotate(${a}) translate(0 -82)"/>`).join("")}
      <circle r="84" fill="${center}"/>
    </g>
  </svg>`;
}

fs.writeFileSync("/tmp/appstore-flower-1.svg", flowerSvg("#315d46","#fffaf0","#d5a52c"));
fs.writeFileSync("/tmp/appstore-flower-2.svg", flowerSvg("#6d4156","#f4c4cc","#d8a13b"));
fs.writeFileSync("/tmp/appstore-flower-3.svg", flowerSvg("#33556f","#d9e7ff","#e3ba4c"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3
});

async function createBook(title, preset, subtitle="") {
  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  const first = page.locator(".library-start");
  if (await first.count()) await first.click();
  else await page.locator(".library-add").click();

  await page.locator("#new-title").fill(title);
  if (subtitle) await page.locator("#new-subtitle").fill(subtitle);

  const presetCard = page.locator(".preset-card").filter({ hasText: preset }).first();
  if (await presetCard.count()) await presetCard.click();

  await page.getByRole("button", { name: "この図鑑をつくる" }).click();
  await page.locator(".cover-screen").waitFor();
  return page.url().match(/#\/b\/([^/]+)/)?.[1];
}

async function addEntry(file, name, kanji, place, tags) {
  await page.getByRole("button", { name: /この図鑑をひらく/ }).click();
  await page.waitForURL(/\/list$/);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator(".add-entry-btn").click()
  ]);
  await chooser.setFiles(file);

  await page.locator("#new-entry-name").fill(name);
  await page.locator("#new-entry-kanji").fill(kanji);
  await page.locator("#new-entry-place").fill(place);
  await page.locator("#new-entry-tags").fill(tags);
  await page.getByRole("button", { name: "コレクションに追加" }).click();
  await page.locator(".entry-row").first().waitFor();
}

try {
  const mainBook = await createBook("草花図鑑", "Nature", "Nature");

  await page.screenshot({
    path: "/tmp/appstore-02-cover.png",
    fullPage: false
  });

  await addEntry("/tmp/appstore-flower-1.svg", "マーガレット", "木春菊", "近所の公園", "花, 春, 白");
  await page.goto(BASE + "#/b/" + mainBook, { waitUntil: "networkidle" });
  await addEntry("/tmp/appstore-flower-2.svg", "さくら", "桜", "散歩道", "花, 春, ピンク");
  await page.goto(BASE + "#/b/" + mainBook, { waitUntil: "networkidle" });
  await addEntry("/tmp/appstore-flower-3.svg", "あじさい", "紫陽花", "庭", "花, 初夏, 青");

  await page.goto(BASE + "#/b/" + mainBook + "/list", { waitUntil: "networkidle" });
  await page.screenshot({
    path: "/tmp/appstore-03-collection.png",
    fullPage: false
  });

  await page.locator(".entry-open").first().click();
  await page.locator(".detail-screen").waitFor();
  await page.screenshot({
    path: "/tmp/appstore-04-detail.png",
    fullPage: false
  });

  await page.goto(BASE + "#/b/" + mainBook + "/design", { waitUntil: "networkidle" });
  await page.locator(".design-screen").waitFor();
  await page.screenshot({
    path: "/tmp/appstore-05-design.png",
    fullPage: false
  });

  await createBook("シール図鑑", "Sticker", "Sticker");
  await createBook("ぬいぐるみ図鑑", "Plush", "Plush");
  await createBook("星・宇宙図鑑", "Night Library", "Space");

  await page.goto(BASE + "#/", { waitUntil: "networkidle" });
  await page.screenshot({
    path: "/tmp/appstore-01-home.png",
    fullPage: false
  });

  for (const p of [
    "/tmp/appstore-01-home.png",
    "/tmp/appstore-02-cover.png",
    "/tmp/appstore-03-collection.png",
    "/tmp/appstore-04-detail.png",
    "/tmp/appstore-05-design.png"
  ]) {
    const stat = fs.statSync(p);
    if (stat.size < 20_000) throw new Error("Screenshot looks too small: " + p);
  }

  console.log("OK: App Store screenshots generated at 1290x2796");
} finally {
  await browser.close();
}
