// みつけた図鑑：リロードでデータが残るかを、実際の index.html を操作して確かめる。
// Chrome を DevTools プロトコルで直接動かす（ヘッドレスの仮想時間では IndexedDB が動かないため）。
//
//   node reload-test.mjs <port> <mode> <画像のパス>
//   mode = run     … TEST 1〜7 を通す
//   mode = verify  … 何も書かずに、残っている中身だけを読む（ブラウザ再起動後の確認用）

const PORT = Number(process.argv[2] || 9333);
const MODE = process.argv[3] || "run";
const IMG = process.argv[4];
const APP = "http://localhost:8777/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((x) => x.type === "page");
    } catch (e) { /* まだ起動中 */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error("Chrome に接続できない");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map(), listeners = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) listeners.slice().forEach((fn) => fn(m));
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, on: (fn) => listeners.push(fn), off: (fn) => listeners.splice(listeners.indexOf(fn), 1), close: () => ws.close() };
}

async function ev(c, expr) {
  const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("評価エラー: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(c, expr, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await ev(c, expr)) return; } catch (e) { /* 描画中 */ }
    await sleep(80);
  }
  throw new Error("待ちきれない: " + expr);
}

/* 画面の表示とは別に、IndexedDB の中身を直接読む（正本の確認） */
const DUMP = `new Promise((res) => {
  const q = indexedDB.open("ishi-no-wakusei");
  q.onsuccess = () => {
    const d = q.result, out = { version: d.version, stores: [...d.objectStoreNames] };
    const t = d.transaction(["books", "entries"]);
    t.objectStore("books").getAll().onsuccess = (e) => {
      out.books = e.target.result.map((b) => ({ id: b.id, title: b.title, nextNo: b.nextNo, count: b.count }))
        .sort((a, b) => a.title.localeCompare(b.title));
    };
    t.objectStore("entries").getAll().onsuccess = (e) => {
      out.entries = e.target.result.map((x) => ({ bookId: x.bookId, no: x.no, name: x.name,
        photoBytes: x.photoBuf ? x.photoBuf.byteLength : 0, photoType: x.photoType }));
    };
    t.oncomplete = () => { d.close(); res(out); };
  };
  q.onerror = () => res({ error: String(q.error) });
})`;

const READY = `document.readyState === "complete" && !document.body.innerText.includes("よみこんでいます")
  && !!(document.querySelector(".masthead") || document.querySelector(".tome"))`;

async function reload(c) {
  await c.send("Page.reload", {});
  await sleep(300);
  await waitFor(c, READY);
}
async function goShelf(c) {
  await ev(c, `location.hash = "#/"; true`);
  await waitFor(c, `!!document.querySelector(".masthead") && !!document.querySelector(".shelf")`);
}
async function shelfTitles(c) {
  await goShelf(c);
  return ev(c, `[...document.querySelectorAll(".bk .cvplate .t")].map((e) => e.textContent)`);
}
async function createBook(c, title) {
  await goShelf(c);
  await ev(c, `document.querySelector(".newbk").click(); true`);
  await waitFor(c, `!!document.getElementById("nb-title")`);
  await ev(c, `(() => { const i = document.getElementById("nb-title"); i.value = ${JSON.stringify(title)}; return true; })()`);
  await ev(c, `[...document.querySelectorAll("#veil .acts .go")].find((b) => b.textContent.includes("つくる")).click(); true`);
  await waitFor(c, `location.hash.startsWith("#/b/") && !!document.querySelector(".tome")`);
  return ev(c, `decodeURIComponent(location.hash.split("/")[2])`);
}
async function entriesOnPage(c, bookId) {
  await ev(c, `location.hash = "#/b/${bookId}"; true`);
  await waitFor(c, `!!document.querySelector(".pagegrid")`);
  return ev(c, `({
    filled: [...document.querySelectorAll(".st:not(.blank)")].map((s) => s.querySelector(".no").textContent + " " + s.querySelector(".nm").textContent),
    next: (document.querySelector(".slot.blank.next .ghost") || {}).textContent || null,
    pager: (document.querySelector(".pager .pnum") || {}).textContent || null,
    cells: document.querySelectorAll(".pagegrid .cell").length
  })`);
}
async function addEntry(c, bookId, name) {
  await ev(c, `location.hash = "#/b/${bookId}"; true`);
  await waitFor(c, `!!document.querySelector(".slot.blank.next")`);
  /* 空きマスを押すと、アプリは記録先の図鑑を覚えてからファイル選択を開く。
     スクリプトの click にはユーザー操作の扱いが付かず選択画面は開かないので、
     写真は入力欄に直接渡す（change が発火し、アプリの本来の処理が走る）。 */
  await ev(c, `document.querySelector(".slot.blank.next").click(); true`);
  const root = await c.send("DOM.getDocument", {});
  const q = await c.send("DOM.querySelector", { nodeId: root.root.nodeId, selector: "#pick" });
  await c.send("DOM.setFileInputFiles", { files: [IMG], nodeId: q.nodeId });
  for (let i = 0; i < 6; i++) {
    await waitFor(c, `[...document.querySelectorAll("#veil .acts button")].some((b) => b.textContent.trim() === "とばす")`);
    await ev(c, `[...document.querySelectorAll("#veil .acts button")].find((b) => b.textContent.trim() === "とばす").click(); true`);
  }
  await waitFor(c, `!!document.getElementById("f-name")`);
  await ev(c, `(() => { const i = document.getElementById("f-name"); i.value = ${JSON.stringify(name)}; return true; })()`);
  await ev(c, `[...document.querySelectorAll("#veil .acts .go")].find((b) => b.textContent.includes("くわえる")).click(); true`);
  await waitFor(c, `document.getElementById("veil").hidden && !!document.querySelector(".pagegrid")`);
}
async function deleteEntry(c, bookId, no) {
  await ev(c, `location.hash = "#/b/${bookId}/e/${no}"; true`);
  await waitFor(c, `!!document.querySelector(".acts .del")`);
  await ev(c, `document.querySelector(".acts .del").click(); true`);
  await ev(c, `document.querySelector(".acts .del").click(); true`);
  await waitFor(c, `location.hash === "#/b/${bookId}" && !!document.querySelector(".pagegrid")`);
}
async function photoShown(c, bookId, no) {
  await ev(c, `location.hash = "#/b/${bookId}/e/${no}"; true`);
  await waitFor(c, `!!document.querySelector(".recphoto img")`);
  await waitFor(c, `(() => { const i = document.querySelector(".recphoto img"); return i.complete && i.naturalWidth > 0; })()`);
  return ev(c, `(() => { const i = document.querySelector(".recphoto img"); return { src: i.src.slice(0, 5), w: i.naturalWidth, h: i.naturalHeight }; })()`);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "  PASS " : "  FAIL ") + name + (detail ? "  — " + detail : ""));
}

setTimeout(() => { console.error("全体の時間切れ"); process.exit(3); }, 140000).unref();

(async () => {
  const c = await connect();
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await c.send("DOM.enable");
  await c.send("Page.navigate", { url: APP });
  await waitFor(c, READY);

  if (MODE === "verify") {
    console.log(JSON.stringify(await ev(c, DUMP), null, 2));
    console.log("本だな:", JSON.stringify(await shelfTitles(c)));
    c.close();
    return;
  }

  console.log("起動直後の IndexedDB:", JSON.stringify(await ev(c, DUMP)));

  // TEST 1
  console.log("\nTEST 1  図鑑を作って reload");
  const cap = await createBook(c, "キャップ図鑑");
  await reload(c);
  let t = await shelfTitles(c);
  check("キャップ図鑑 が残る", t.includes("キャップ図鑑"), JSON.stringify(t));

  // TEST 2
  console.log("\nTEST 2  001 を追加して reload");
  await addEntry(c, cap, "あおいキャップ");
  await reload(c);
  let e = await entriesOnPage(c, cap);
  check("図鑑と 001 の両方が残る", t.includes("キャップ図鑑") && e.filled.includes("001 あおいキャップ"), JSON.stringify(e));

  // TEST 6（写真）
  console.log("\nTEST 6  写真つきの記録を reload");
  const ph = await photoShown(c, cap, 1);
  check("写真が表示される", ph.src === "blob:" && ph.w > 0, JSON.stringify(ph));

  // TEST 3
  console.log("\nTEST 3  001 を削除して reload");
  await deleteEntry(c, cap, 1);
  await reload(c);
  e = await entriesOnPage(c, cap);
  check("001 が消えたまま", !e.filled.some((x) => x.startsWith("001")), JSON.stringify(e));

  // TEST 4
  console.log("\nTEST 4  削除後に追加。番号は nextNo どおり（消した 001 を使い回さない）");
  await addEntry(c, cap, "あかいキャップ");
  await reload(c);
  e = await entriesOnPage(c, cap);
  check("新しい記録は 002（001 を使い回さない）", e.filled.includes("002 あかいキャップ") && !e.filled.some((x) => x.startsWith("001")), JSON.stringify(e));
  check("次の空きマスは 003", e.next === "003", "next=" + e.next);

  // TEST 5
  console.log("\nTEST 5  複数の図鑑を作って reload");
  await createBook(c, "花図鑑");
  await createBook(c, "レゴ図鑑");
  await reload(c);
  t = await shelfTitles(c);
  check("3冊とも残る", ["キャップ図鑑", "花図鑑", "レゴ図鑑"].every((x) => t.includes(x)), JSON.stringify(t));

  // TEST 7
  console.log("\nTEST 7  何度か reload しても同じ状態");
  const before = JSON.stringify(await ev(c, DUMP));
  for (let i = 0; i < 5; i++) await reload(c);
  const after = JSON.stringify(await ev(c, DUMP));
  check("5回 reload しても IndexedDB の中身が同じ", before === after);

  console.log("\n最終の IndexedDB:", after);
  const ng = results.filter((r) => !r.ok).length;
  console.log(`\n結果: ${results.length - ng} / ${results.length} 合格`);
  c.close();
  process.exit(ng ? 1 : 0);
})().catch((err) => { console.error("中断:", err.message); process.exit(2); });
