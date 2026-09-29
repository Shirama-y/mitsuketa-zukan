
(function () {
  "use strict";

  var DB_NAME = "ishi-no-wakusei";   /* 旧方針からの名残。CLAUDE.md 参照 */
  var DB_VER = 4;
  var MAX_PX = 900;
  var QUALITY = 0.75;

  /* ================= 収益化 =================
     PWA版だけでWeb決済を案内する。App Store版では外部決済CTAを出さない。
     Stripe接続とPRO機能が完成するまでは enabled:false のまま公開する。 */
  var MONETIZATION = {
    enabled: true,
    testMode: true,
    supporterEnabled: true,
    proName: "PRO ライフタイム",
    proPriceLabel: "¥1,480 / 買い切り",
    proCheckoutUrl: "https://buy.stripe.com/test_5kQ7sKerQfDf8Sg9kUeZ200",
    verifyEndpoint: "https://watashi-no-zukan-verifier-7fp4p1.v2.appdeploy.ai/api/verify",
    supporterOptions: [
      { label: "¥500で応援", url: "https://donate.stripe.com/test_8x2bJ083s4YB5G4cx6eZ201" },
      { label: "¥1,000で応援", url: "https://donate.stripe.com/test_4gM4gy83s0Il5G468IeZ202" }
    ],
    features: [
      "図鑑をPDF・画像で高画質書き出し",
      "PRO限定の表紙・テーマパック",
      "共有用のコレクションカード",
      "今後追加するPRO機能を同じライセンスで利用"
    ]
  };

  function canShowWebMonetization(){return false;
    var nativeApp=window.NativeZukan&&window.NativeZukan.isNative;
    return !!MONETIZATION.enabled&&!nativeApp
  }

  function openExternalPurchase(url){
    if(!url)return false;
    window.open(url,"_blank","noopener,noreferrer");
    return true
  }

  function getProEntitlement(){
    try{
      var raw=localStorage.getItem("wz_pro_entitlement");
      if(!raw)return null;
      var data=JSON.parse(raw);
      return data&&data.entitled&&data.plan==="pro_lifetime"?data:null
    }catch(e){return null}
  }

  function saveProEntitlement(sessionId){
    var data={
      entitled:true,
      plan:"pro_lifetime",
      mode:MONETIZATION.testMode?"test":"live",
      sessionId:sessionId,
      verifiedAt:new Date().toISOString()
    };
    localStorage.setItem("wz_pro_entitlement",JSON.stringify(data));
    return data
  }

  function verifyProPurchase(sessionId){
    if(!sessionId||!MONETIZATION.verifyEndpoint){
      return Promise.reject(new Error("verification_unavailable"))
    }
    var url=MONETIZATION.verifyEndpoint+"?session_id="+encodeURIComponent(sessionId);
    return fetch(url,{method:"GET",cache:"no-store",credentials:"omit"}).then(function(res){
      return res.json().then(function(body){
        if(!res.ok||!body||body.entitled!==true){
          throw new Error((body&&body.error)||"verification_failed")
        }
        saveProEntitlement(sessionId);
        return body
      })
    })
  }

  function storedProSessionId(){
    var entitlement=getProEntitlement();
    if(entitlement&&entitlement.sessionId)return entitlement.sessionId;
    try{return localStorage.getItem("wz_pending_checkout_session")||""}catch(e){return""}
  }

  function ensureProEntitlement(){
    var sid=storedProSessionId();
    if(!sid)return Promise.resolve(false);
    return verifyProPurchase(sid).then(function(){return true},function(){
      try{localStorage.removeItem("wz_pro_entitlement")}catch(e){}
      return false
    })
  }

  function entryDataUrl(e){
    return new Promise(function(resolve){
      var blob=null;
      try{
        if(e.photoBuf)blob=new Blob([e.photoBuf],{type:e.photoType||"image/jpeg"});
        else if(e.photo)blob=e.photo
      }catch(err){blob=null}
      if(!blob){resolve("");return}
      var fr=new FileReader();
      fr.onload=function(){resolve(String(fr.result||""))};
      fr.onerror=function(){resolve("")};
      fr.readAsDataURL(blob)
    })
  }

  function escapePrintText(value){
    return String(value==null?"":value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;")
  }

  function exportBookPrintable(bookId){
    var sid=storedProSessionId();
    if(!sid){openProSheet();return}

    var popup=window.open("","_blank");
    if(!popup){
      var blocked=h("div","card");
      blocked.append(h("h2","display","書き出しを開けませんでした"),h("p","note","Safariのポップアップを許可して、もう一度お試しください。"));
      var close=h("button","go","閉じる");close.type="button";close.addEventListener("click",closeSheet);blocked.append(close);openSheet(blocked);
      return
    }
    popup.document.write("<!doctype html><meta charset='utf-8'><title>確認中…</title><body style='font-family:system-ui;padding:32px'>PRO購入を確認しています…</body>");
    popup.document.close();

    ensureProEntitlement().then(function(ok){
      if(!ok){
        popup.close();
        openProSheet();
        return
      }
      return Promise.all([store.book(bookId),store.entries(bookId)]).then(function(out){
        var book=out[0],entries=out[1]||[];
        if(!book){popup.close();return}
        return Promise.all(entries.map(function(e){
          return entryDataUrl(e).then(function(src){return{entry:e,src:src}})
        })).then(function(items){
          var co=cover(book.color);
          var cards=items.map(function(item){
            var e=item.entry;
            var tags=Array.isArray(e.tags)&&e.tags.length?'<div class="tags">'+e.tags.map(function(t){return"<span>"+escapePrintText(t)+"</span>"}).join("")+"</div>":"";
            var photo=item.src?'<img src="'+item.src+'" alt="">':'<div class="no-photo">NO PHOTO</div>';
            return '<article class="entry">'+photo+
              '<div class="number">No.'+escapePrintText(pad(e.no))+'</div>'+
              '<h2>'+escapePrintText(e.name||"")+'</h2>'+
              (e.kanji?'<div class="alias">'+escapePrintText(e.kanji)+'</div>':"")+
              '<dl><div><dt>日付</dt><dd>'+escapePrintText(showDate(e.date))+'</dd></div>'+
              '<div><dt>場所</dt><dd>'+escapePrintText(e.place||"——")+'</dd></div></dl>'+
              tags+
              (e.observed?'<p class="note"><strong>気づいたこと</strong><br>'+escapePrintText(e.observed)+'</p>':"")+
              (e.imagined?'<p class="note"><strong>ストーリー</strong><br>'+escapePrintText(e.imagined)+'</p>':"")+
              '</article>'
          }).join("");

          var html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapePrintText(book.title)+' - わたしの図鑑</title>'+
            '<style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#f4f1eb;color:#0F172A;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif}.toolbar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:12px;background:#0F172A}.toolbar button{border:0;border-radius:999px;padding:11px 18px;background:#C77B7B;color:#FAF7F2;font-weight:700}.page{width:min(100%,210mm);margin:0 auto;background:#fff;padding:15mm}.cover{padding:18mm 10mm;margin-bottom:12mm;background:'+co.bg+';color:'+co.ink+';border:3px solid '+co.ink+';text-align:center}.cover .eyebrow{font-size:10px;letter-spacing:.18em}.cover h1{margin:12px 0 4px;font-size:30px}.cover p{margin:0;font-size:12px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7mm}.entry{break-inside:avoid;border:1px solid #d8d3ca;padding:4mm;background:#fff}.entry img,.no-photo{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#e7e2d9}.no-photo{display:grid;place-items:center;font-size:9px;color:#827b70}.number{margin-top:3mm;font-size:9px;color:#7d756b}.entry h2{margin:1mm 0 0;font-size:15px;line-height:1.35}.alias{font-size:10px;color:#756d63}.entry dl{margin:3mm 0 0;border-top:1px solid #e4dfd6}.entry dl div{display:grid;grid-template-columns:34px 1fr;gap:4px;padding:1.5mm 0;border-bottom:1px solid #eee9e0;font-size:9px}.entry dt{color:#81796f}.entry dd{margin:0}.tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:2mm}.tags span{font-size:8px;border:1px solid #d6d0c7;border-radius:999px;padding:1px 5px}.note{font-size:9px;line-height:1.55}.footer{margin-top:12mm;text-align:center;font-size:8px;color:#8b8378}@media print{body{background:#fff}.toolbar{display:none}.page{padding:0;width:auto}.grid{gap:5mm}}</style></head><body>'+
            '<div class="toolbar"><button onclick="window.print()">PDFとして保存 / 印刷</button><button onclick="window.close()">閉じる</button></div>'+
            '<main class="page"><section class="cover"><div class="eyebrow">WATASHI NO ZUKAN · PRO EXPORT</div><h1>'+escapePrintText(book.title)+'</h1><p>'+escapePrintText(book.subtitle||((book.count||entries.length)+"件のコレクション"))+'</p></section>'+
            '<section class="grid">'+cards+'</section><div class="footer">わたしの図鑑 · PRO</div></main></body></html>';

          popup.document.open();
          popup.document.write(html);
          popup.document.close();
          nativeHaptic("success")
        })
      })
    })["catch"](function(){
      try{popup.close()}catch(e){}
      var failCard=h("div","card");
      failCard.append(h("h2","display","書き出しできませんでした"),h("p","note","通信状態を確認して、もう一度お試しください。"));
      var close=h("button","go","閉じる");close.type="button";close.addEventListener("click",closeSheet);failCard.append(close);openSheet(failCard)
    })
  }

  /* 表紙の色の組み合わせ（9つ）。3つずつ3段に並ぶ。
     似て見えないよう、組ごとに主役の色相を変え、差し色も組ごとに変える。
     それぞれ「主役の色 / その淡い色 / 差し色」の3色。
     ももいろ・ラベンダー は鮮やかな黄色と組ませない（ぶつかるため）。
     bg はボタンに使う代表色、ink はその上の文字色。淡い主役は濃い文字にする。
     番号は既存の図鑑の color と対応しているので、並べ替えないこと。 */
  var COVERS = [
    {name:"フォレスト",bg:"#315b47",ink:"#f4e7bd",set:["#315b47","#234436","#d4b56b"]},
    {name:"ゴールド",bg:"#9b7648",ink:"#fff3d2",set:["#9b7648","#6e5233","#ead7aa"]},
    {name:"セージ",bg:"#687b66",ink:"#f8f1dc",set:["#687b66","#495b49","#d7c89a"]},
    {name:"ネイビー",bg:"#355b80",ink:"#f6ead2",set:["#355b80","#223e5b","#d9bb7a"]},
    {name:"テラコッタ",bg:"#9a5c4d",ink:"#fff0dc",set:["#9a5c4d","#704238","#e1b08e"]},
    {name:"ボルドー",bg:"#7b4149",ink:"#f9e8e5",set:["#7b4149","#552c33","#d9b86d"]},
    {name:"ローズ",bg:"#aa6e7a",ink:"#fff2ef",set:["#aa6e7a","#7e505b","#efd1d3"]},
    {name:"ラベンダー",bg:"#6e698f",ink:"#f5efff",set:["#6e698f","#4e4a6c","#cfc7e6"]},
    {name:"ティール",bg:"#4e7a73",ink:"#edf8f4",set:["#4e7a73","#355850","#bdd9cf"]},
    {name:"アイボリー",bg:"#b49a78",ink:"#2d2118",set:["#b49a78","#e7dac5","#7c6450"]},
    {name:"オリーブ",bg:"#677052",ink:"#f4edd6",set:["#677052","#465039","#cdbb78"]},
    {name:"スレート",bg:"#536b78",ink:"#edf4f7",set:["#536b78","#394d59","#d2bd8a"]}
  ];

  function cover(i) { return COVERS[(Number(i) || 0) % COVERS.length]; }

  /* 表紙の柄。book.theme（0〜3）に保存する。 */
  /* 既存の図鑑の theme と対応しているので、0〜3 は動かさない。
     足すときは必ず末尾に。並べ替えると、作った図鑑の柄が変わってしまう。 */
  var PATTERNS = [
    { key: "stripe", name: "レザー", note: "革のような細かな質感" },
    { key: "argyle", name: "クラシック", note: "落ち着いた織りの質感" },
    { key: "tartan", name: "クロス", note: "布のような質感" },
    { key: "plain", name: "マット", note: "装飾を抑えた一色" },
    { key: "dots", name: "グレイン", note: "細かな粒の質感" },
    { key: "gingham", name: "リネン", note: "やわらかな布目" },
    { key: "komon", name: "エンボス", note: "小さな凹凸の質感" },
    { key: "border", name: "スムース", note: "なめらかな仕上げ" }
  ];
  function pattern(i) { return PATTERNS[(Number(i) || 0) % PATTERNS.length]; }

  /* タイトルの札の ふち。book.frame（0〜3）に保存する。
     持っていない図鑑は 0（ギザギザ）として扱うので、移行はいらない。
     表紙と、図鑑の中の見出しで、同じふちを使う。外と中をそろえるため。 */
  var FRAMES = [
    { key: "zig", name: "ギザギザ", note: "切りっぱなし" },
    { key: "kazari", name: "かざりわく", note: "二重の罫と すみ飾り" },
    { key: "simple", name: "シンプル", note: "ふちなし" },
    { key: "line", name: "ライン", note: "細い線だけ" }
  ];
  function frameOf(i) { return FRAMES[(Number(i) || 0) % FRAMES.length]; }
  var BOOK_FONTS=[
    {name:"手書き",css:"var(--klee)"},
    {name:"明朝",css:"var(--font-display)"},
    {name:"丸ゴシック",css:"var(--maru)"},
    {name:"ゴシック",css:"var(--kaku)"},
    {name:"楷書",css:'"Kaisei Opti",var(--font-display)'}
  ];
  var BOOK_ICONS=[
    {name:"花",src:"./assets/attraction/category-flower.png"},
    {name:"生きもの",src:"./assets/attraction/category-butterfly.png"},
    {name:"ブロック",src:"./assets/attraction/category-blocks.png"},
    {name:"シール",src:"./assets/attraction/category-sticker.png"},
    {name:"ぬいぐるみ",src:"./assets/attraction/category-plush.png"},
    {name:"もの",src:"./assets/attraction/category-object.png"},
    {name:"カフェ",src:"./assets/attraction/category-cafe.png"},
    {name:"なし",src:""},
    {name:"葉っぱ",src:"./assets/attraction/category-leaf.png"},
    {name:"鳥",src:"./assets/attraction/category-bird.png"},
    {name:"カメラ",src:"./assets/attraction/category-camera.png"}
  ];
  var BUTTON_THEMES=[
    {key:"navy",name:"ネイビー",primary:"#0F172A",primaryInk:"#FAF7F2",secondary:"#FAF7F2",secondaryInk:"#0F172A",border:"#C77B7B"},
    {key:"pink",name:"ピンク",primary:"#C77B7B",primaryInk:"#FAF7F2",secondary:"#0F172A",secondaryInk:"#FAF7F2",border:"#C77B7B"},
    {key:"ivory",name:"アイボリー",primary:"#FAF7F2",primaryInk:"#0F172A",secondary:"#0F172A",secondaryInk:"#FAF7F2",border:"#C77B7B"}
  ];
  function bookFont(i){return BOOK_FONTS[(Number(i)||0)%BOOK_FONTS.length]}
  function bookIcon(i){var n=(i==null||i==="")?5:Number(i);if(isNaN(n))n=5;return BOOK_ICONS[n%BOOK_ICONS.length]}
  function buttonTheme(key){
    var k=key||"pink";
    if(k==="rose")k="pink";
    for(var i=0;i<BUTTON_THEMES.length;i++)if(BUTTON_THEMES[i].key===k)return BUTTON_THEMES[i];
    return BUTTON_THEMES[1]
  }
  function applyButtonTheme(node,b){
    var t=buttonTheme(b&&b.buttonTheme);
    node.style.setProperty("--ui-primary",t.primary);
    node.style.setProperty("--ui-primary-ink",t.primaryInk);
    node.style.setProperty("--ui-secondary",t.secondary);
    node.style.setProperty("--ui-secondary-ink",t.secondaryInk);
    node.style.setProperty("--ui-border",t.border);
    return node
  }
  function maskIcon(src,cls){
    var key=(src.split('/').pop()||'').replace(/\.(png|webp|svg)$/,'');
    var controls={'icon-camera':'camera','icon-back':'back','icon-more':'more','icon-heart':'heart','icon-share':'share','icon-edit':'edit','icon-trash':'trash','icon-plus':'plus','icon-sliders':'sliders','icon-bookmark':'bookmark','nav-search':'search'};
    if(controls[key]){var ui=lIcon(controls[key]);ui.setAttribute('class',(cls?cls+' ':'')+'mask-icon ui-icon');return ui}
    // Illustrated book emblems and stickers remain image assets.
    var n=document.createElement("img");
    n.className=(cls?cls+" ":"")+"mask-icon generated-icon";
    n.src=src;n.alt="";n.width=160;n.height=160;n.decoding="async";
    n.draggable=false;n.setAttribute("aria-hidden","true");
    return n
  }
  COVERS.push({name:"ミルクホワイト",bg:"#f3eddf",ink:"#715c34",set:["#f3eddf","#b69a62","#263345"]},{name:"さくらピンク",bg:"#dec4c2",ink:"#57434a",set:["#dec4c2","#b69a62","#57434a"]},{name:"リーフグリーン",bg:"#a4af98",ink:"#2c4439",set:["#a4af98","#b69a62","#2c4439"]});
  BUTTON_THEMES.push({key:"gold",name:"ゴールド",primary:"#af8e4c",primaryInk:"#ffffff",secondary:"#faf8f3",secondaryInk:"#80632e",border:"#af8e4c"});
  var BOOK_PRESETS=[
    {name:"Night Library",art:"./assets/attraction/poster-memory.webp",note:"アイボリーの、やさしい一冊。",image:"./assets/attraction/poster-memory.webp",color:3,theme:0,frame:1,font:0,icon:5,layout:"normal",titleSize:"medium",titleAlign:"center",buttonTheme:"pink"},
    {name:"Nature",art:"./assets/attraction/poster-welcome.webp",note:"草花や生きもの、自然の記録に。",image:"./assets/attraction/poster-welcome.webp",color:2,theme:5,frame:2,font:1,icon:0,layout:"relaxed",titleSize:"medium",titleAlign:"center",buttonTheme:"pink"},
    {name:"Block",art:"./assets/attraction/poster-discover.webp",note:"ブロックやミニチュアをすっきり整理。",image:"./assets/attraction/category-blocks.png",color:3,theme:3,frame:2,font:3,icon:2,layout:"compact",titleSize:"large",titleAlign:"left",buttonTheme:"navy"},
    {name:"Sticker",art:"./assets/attraction/poster-discover.webp",note:"シールや紙ものをやさしく可愛く。",image:"./assets/attraction/category-sticker.png",color:6,theme:3,frame:2,font:2,icon:3,layout:"normal",titleSize:"medium",titleAlign:"center",buttonTheme:"pink"},
    {name:"Plush",art:"./assets/attraction/poster-discover.webp",note:"ぬいぐるみや小物の思い出に。",image:"./assets/attraction/category-plush.png",color:9,theme:5,frame:1,font:0,icon:4,layout:"relaxed",titleSize:"small",titleAlign:"center",buttonTheme:"ivory"},
    {name:"Classic",art:"./assets/attraction/poster-discover.webp",note:"集めるものを選ばない定番の装丁。",image:"./assets/attraction/poster-discover.webp",color:0,theme:0,frame:1,font:1,icon:5,layout:"normal",titleSize:"medium",titleAlign:"center",buttonTheme:"navy"}
  ];



  BOOK_PRESETS[0].name="Ivory Library";BOOK_PRESETS[0].color=12;BOOK_PRESETS[0].theme=5;BOOK_PRESETS[0].font=1;BOOK_PRESETS[0].icon=0;BOOK_PRESETS[0].buttonTheme="gold";
  BOOK_PRESETS.forEach(function(p,i){if(i===0||i===1||i===5){p.image=i===1?"./assets/library/blossom.png":i===0?"./assets/library/botanical.png":"./assets/library/library.jpg.png";p.art=p.image}});
  /* 旧データの置きかえ表。version 3 への更新で一度だけ使う。
     色：0みずいろ 1きいろ 2みどり 3あお 4むらさき 5だいだい 6ピンク → 当時の6つ
     柄：ザクザク / ふわふわ / キラキラ → すべて 柄0（いまの ストライプ） */
  var OLD_COLOR = [0, 1, 2, 3, 3, 4, 4];

  function seedOf(s) {
    var hash = 2166136261, i;
    for (i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
    return hash >>> 0;
  }

  function svgFrom(str) {
    var doc = new DOMParser().parseFromString(str, "image/svg+xml");
    return document.importNode(doc.documentElement, true);
  }

  /* ふちがギザギザの白い札 */
  function pinked(x, y, w, hh, tooth) {
    var nx = Math.max(4, Math.round(w / tooth)), ny = Math.max(3, Math.round(hh / tooth));
    var tx = w / nx, ty = hh / ny, d = tooth * 0.42, p = [], i;
    for (i = 0; i < nx; i++) p.push([x + i * tx, y], [x + (i + 0.5) * tx, y + d]);
    for (i = 0; i < ny; i++) p.push([x + w, y + i * ty], [x + w - d, y + (i + 0.5) * ty]);
    for (i = nx; i > 0; i--) p.push([x + i * tx, y + hh], [x + (i - 0.5) * tx, y + hh - d]);
    for (i = ny; i > 0; i--) p.push([x, y + i * ty], [x + d, y + (i - 0.5) * ty]);
    return p.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ");
  }
  function edgeClip(nx, ny, dx, dy) {
    var p = [], i;
    for (i = 0; i < nx; i++) p.push([100 * i / nx, 0], [100 * (i + 0.5) / nx, dy]);
    for (i = 0; i < ny; i++) p.push([100, 100 * i / ny], [100 - dx, 100 * (i + 0.5) / ny]);
    for (i = nx; i > 0; i--) p.push([100 * i / nx, 100], [100 * (i - 0.5) / nx, 100 - dy]);
    for (i = ny; i > 0; i--) p.push([0, 100 * i / ny], [dx, 100 * (i - 0.5) / ny]);
    return "polygon(" + p.map(function (q) {
      return q[0].toFixed(2) + "% " + q[1].toFixed(2) + "%";
    }).join(",") + ")";
  }

  /* ---- 柄 ---- */

  var CW = 300, CH = 400;
  function rct(x, y, w, hh, fill, op) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
      '" height="' + hh.toFixed(1) + '" fill="' + fill + '"' +
      (op != null ? ' opacity="' + op + '"' : "") + "/>";
  }

  /* たての しま。太い帯・細い線・中くらいの帯 をくり返す */
  function drawStripe(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[0])];
    var unit = [[30, 0], [7, 2], [16, 1], [7, 2]], total = 60;
    var x = -total + (ph * 9) % total, i;
    while (x < W) {
      for (i = 0; i < unit.length; i++) {
        if (unit[i][1] !== 0) out.push(rct(x, 0, unit[i][0], H, c[unit[i][1]]));
        x += unit[i][0];
      }
    }
    return out.join("");
  }

  /* ひし形と ななめの線 */
  function drawArgyle(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[0])];
    var dx = W / 4, dy = H / 4, i, j;
    for (i = -1; i <= H / dy + 1; i++) {
      for (j = -1; j <= W / dx + 1; j++) {
        var cx = j * dx + (i % 2 ? dx / 2 : 0) + ph * 6, cy = i * dy;
        out.push('<polygon points="' +
          cx + "," + (cy - dy / 2) + " " + (cx + dx / 2) + "," + cy + " " +
          cx + "," + (cy + dy / 2) + " " + (cx - dx / 2) + "," + cy +
          '" fill="' + (((i + j) % 2) ? c[1] : c[2]) + '"/>');
      }
    }
    var g = ['<g stroke="' + c[0] + '" stroke-width="2.2" opacity="0.7" stroke-dasharray="7 6">'];
    for (i = -8; i < 14; i++) {
      g.push('<line x1="' + (i * dx) + '" y1="0" x2="' + (i * dx + W) + '" y2="' + H + '"/>');
      g.push('<line x1="' + (i * dx) + '" y1="0" x2="' + (i * dx - W) + '" y2="' + H + '"/>');
    }
    g.push("</g>");
    return out.join("") + g.join("");
  }

  /* たてよこの帯がかさなる */
  function drawTartan(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[0])];
    var band = [[0, 30, 1, 0.55], [38, 10, 2, 0.75], [52, 4, 2, 0.45], [64, 20, 1, 0.3], [90, 6, 2, 0.6]];
    var u = 100, off = ph * 11, i, k;
    for (i = -1; i * u < W + u; i++) {
      for (k = 0; k < band.length; k++) {
        out.push(rct(i * u + band[k][0] + off, 0, band[k][1], H, c[band[k][2]], band[k][3]));
      }
    }
    for (i = -1; i * u < H + u; i++) {
      for (k = 0; k < band.length; k++) {
        out.push(rct(0, i * u + band[k][0] + off, W, band[k][1], c[band[k][2]], band[k][3]));
      }
    }
    return out.join("");
  }

  /* 一色に、帯を一本 */
  function drawPlain(c, ph, W, H) {
    return rct(0, 0, W, H, c[0]) +
      rct(0, H * 0.295, W, H * 0.41, c[1]) +
      rct(0, H * 0.275, W, H * 0.018, c[2]) +
      rct(0, H * 0.708, W, H * 0.018, c[2]);
  }

  /* まるい てん。大小2種を ずらして置く */
  function drawDots(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[0])], u = 48, off = ph * 7, r, cc;
    for (r = -1; r * u < H + u; r++) {
      for (cc = -1; cc * u < W + u; cc++) {
        var x = cc * u + (r % 2 ? u / 2 : 0) + off, y = r * u;
        out.push('<circle cx="' + x + '" cy="' + y + '" r="11" fill="' + c[1] + '"/>');
        out.push('<circle cx="' + (x + u / 2) + '" cy="' + (y + u / 2) + '" r="4" fill="' + c[2] + '"/>');
      }
    }
    return out.join("");
  }

  /* やわらかい こうし。同じ幅の帯を たてよこに 半透明で重ねる */
  function drawGingham(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[1])], u = 34, off = (ph * 8) % u, i;
    for (i = -1; i * u < W + u; i++) out.push(rct(i * u + off, 0, u / 2, H, c[0], 0.55));
    for (i = -1; i * u < H + u; i++) out.push(rct(0, i * u + off, W, u / 2, c[0], 0.55));
    for (i = -1; i * u < W + u; i++) out.push(rct(i * u + off + u / 2, 0, 2, H, c[2], 0.5));
    return out.join("");
  }

  /* 小さな もよう を ならべた 小紋。菱と点だけの抽象 */
  function drawKomon(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[0])], u = 40, off = ph * 5, r, cc;
    for (r = -1; r * u < H + u; r++) {
      for (cc = -1; cc * u < W + u; cc++) {
        var x = cc * u + (r % 2 ? u / 2 : 0) + off, y = r * u, d = 7;
        out.push('<polygon points="' + x + "," + (y - d) + " " + (x + d) + "," + y + " " +
          x + "," + (y + d) + " " + (x - d) + "," + y + '" fill="' + c[1] + '"/>');
        out.push('<circle cx="' + (x + u / 2) + '" cy="' + (y + u / 2) + '" r="2.6" fill="' + c[2] + '"/>');
      }
    }
    return out.join("");
  }

  /* よこの しま。太い帯と細い線をくり返す */
  function drawBorder(c, ph, W, H) {
    var out = [rct(0, 0, W, H, c[0])];
    var unit = [[26, 0], [6, 2], [14, 1], [6, 2]], total = 52;
    var y = -total + (ph * 8) % total, i;
    while (y < H) {
      for (i = 0; i < unit.length; i++) {
        if (unit[i][1] !== 0) out.push(rct(0, y, W, unit[i][0], c[unit[i][1]]));
        y += unit[i][0];
      }
    }
    return out.join("");
  }

  var DRAW = {
    stripe: drawStripe, dots: drawDots, gingham: drawGingham, argyle: drawArgyle,
    komon: drawKomon, tartan: drawTartan, border: drawBorder, plain: drawPlain
  };

  function patternSVG(colorIdx, themeIdx, seed, W, H) {
    var c = cover(colorIdx).set, key = pattern(themeIdx).key;
    return '<clipPath id="cp' + seed + '"><rect width="' + W + '" height="' + H + '"/></clipPath>' +
      '<g clip-path="url(#cp' + seed + ')">' + DRAW[key](c, seed % 4, W, H) + "</g>";
  }

  var PLATE_X = 38, PLATE_Y = 140, PLATE_W = 224, PLATE_H = 120;
  var PLATE_FILL = "#fcfaf4", PLATE_RULE = "#9a8e7c";

  function plateShape(frameIdx, x, y, w, hh) {
    var key = frameOf(frameIdx).key;
    var box = function (ins, rx, fill, stroke, sw) {
      return '<rect x="' + (x + ins) + '" y="' + (y + ins) + '" width="' + (w - ins * 2) +
        '" height="' + (hh - ins * 2) + '" rx="' + rx + '" fill="' + (fill || "none") + '"' +
        (stroke ? ' stroke="' + stroke + '" stroke-width="' + sw + '"' : "") + "/>";
    };
    if (key === "kazari") {
      var d = 9, out = box(0, 4, PLATE_FILL) + box(7, 2, null, PLATE_RULE, 1.6) + box(11, 1, null, PLATE_RULE, 0.8);
      [[x + d, y + d], [x + w - d, y + d], [x + d, y + hh - d], [x + w - d, y + hh - d]].forEach(function (q) {
        out += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="2.4" fill="' + PLATE_RULE + '"/>';
      });
      return out;
    }
    if (key === "simple") return box(0, 4, PLATE_FILL);
    if (key === "line") return box(0, 3, PLATE_FILL) + box(8, 1, null, PLATE_RULE, 1.1);
    return '<polygon points="' + pinked(x, y, w, hh, 13) + '" fill="' + PLATE_FILL + '"/>';
  }

  function coverArt(book) {
    var seed = seedOf(String(book.id || "") + "|" + String(book.title || "")) % 1000;
    return svgFrom('<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      patternSVG(book.color, book.theme, seed, CW, CH) +
      plateShape(book.frame, PLATE_X, PLATE_Y, PLATE_W, PLATE_H) +
      "</svg>");
  }

  /* ふちえらびの見本。札だけを大きく見せる。 */
  function frameChip(frameIdx) {
    return svgFrom('<svg viewBox="0 0 120 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect width="120" height="62" fill="#e8ddcb"/>' +
      plateShape(frameIdx, 9, 9, 102, 44) + "</svg>");
  }

  /* 柄えらびの見本。角から地の色がのぞかないよう、角丸は外側の枠でつける。 */
  function patternChip(themeIdx, colorIdx) {
    return svgFrom('<svg viewBox="0 0 150 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      patternSVG(colorIdx, themeIdx, 1, 150, 112) + "</svg>");
  }

  /* 観察でえらぶ色。12個を4つずつ3段にならべる。
     clear は とうめい で、市松模様で表す。 */
  var COLORS = [
    { name: "あか", bg: "#d2382c" }, { name: "だいだい", bg: "#e07b1f" },
    { name: "きいろ", bg: "#e8c22a" }, { name: "みどり", bg: "#43913f" },
    { name: "あお", bg: "#2f6bb5" }, { name: "むらさき", bg: "#7a4fa8" },
    { name: "ピンク", bg: "#de6fa1" }, { name: "ちゃいろ", bg: "#8a5a34" },
    { name: "しろ", bg: "#f7f5f0" }, { name: "はいいろ", bg: "#9a9690" },
    { name: "くろ", bg: "#2b2824" }, { name: "とうめい", clear: true }
  ];

  /* 観察の問いかけ。ここだけ直せば、質問の追加・変更・並べ替えができる。
     ask   … 画面に大きく出る問いかけ
     label … 保存するときの行頭（「いろ：あか」の「いろ」）
     pick  … "color" は色見本、"word" は言葉のボタン、なしは自由入力だけ */
  var QUESTIONS = [
    { key: "color", label: "いろ", ask: "いろは？", pick: "color", ph: "ほかにも あれば" },
    { key: "shape", label: "かたち", ask: "かたちは？", pick: "word",
      choices: ["まる", "しかく", "さんかく", "ながい", "とがってる", "でこぼこ"], ph: "ほかにも あれば" },
    { key: "touch", label: "さわった かんじ", ask: "さわると どんな かんじ？", ph: "ざらざら、つるつる…" },
    { key: "sound", label: "おと", ask: "おとは？", ph: "かたかた、しずか…" },
    { key: "smell", label: "におい", ask: "においは？", ph: "いいにおい、しない…" },
    { key: "size", label: "おおきさ", ask: "おおきさは？", ph: "てのひらくらい…" }
  ];

  /* 答えを「見て わかったこと」の文にする。とばした質問は行を作らない。 */
  function composeObserved(answers) {
    var lines = [];
    QUESTIONS.forEach(function (q) {
      var parts = answers[q.key];
      if (parts && parts.length) lines.push(q.label + "：" + parts.join("、"));
    });
    return lines.join("\n");
  }

  var app = document.getElementById("app");
  var bar = document.getElementById("bar"), barBtn = document.getElementById("barBtn");
  var veil = document.getElementById("veil"), pick = document.getElementById("pick");

  var db = null;
  var urls = Object.create(null);   /* entry id -> objectURL */
  var pendingBookId = null;
  var lastFocus = null;

  /* ================= 保存庫 ================= */

  /* 開く。データを消す処理はどこにもない。起動のたびに行うのは「開いて読む」だけ。
     ここで失敗すると画面は空になるので、開けるのに諦める道を残さない。 */
  function openStore() {
    return openAt(DB_VER)["catch"](function (err) {
      /* 保存されている DB が、このページより新しい版だった。
         古い版のページが表示されているときに起きる。版を指定せずに開けば、
         いまの版のまま読める。版を下げたり消したりはしない。 */
      if (err && err.name === "VersionError") return openAt(0);
      throw err;
    }).then(function (d) {
      /* 別の場所で新しい版のページが開かれたら、この接続を閉じて道をあける。
         持ったままだと、向こうは開けずに止まり、空の画面になる。 */
      d.onversionchange = function () {
        d.close();
        db = null;
        noticeReload();
      };
      return d;
    });
  }

  function openAt(ver) {
    return new Promise(function (res, rej) {
      var rq = ver ? indexedDB.open(DB_NAME, ver) : indexedDB.open(DB_NAME);
      rq.onupgradeneeded = function (ev) {
        var idb = rq.result, txn = rq.transaction;
        if (!idb.objectStoreNames.contains("books")) {
          idb.createObjectStore("books", { keyPath: "id" });
        }
        if (!idb.objectStoreNames.contains("entries")) {
          idb.createObjectStore("entries", { keyPath: "id" })
             .createIndex("bookId", "bookId", { unique: false });
        }
        /* 旧方針の単一図鑑を「はじめての図鑑」へ複写する。
           このトランザクション内で完結するので、失敗すればバージョンは上がらない。 */
        if (ev.oldVersion < 2 && idb.objectStoreNames.contains("planets")) {
          carryOver(txn);
        }
        /* 色と柄の選択肢を作り直したので、古い番号を新しい番号に置きかえる。
           記録は触らない。 */
        if (ev.oldVersion >= 2 && ev.oldVersion < 4) restyle(txn, ev.oldVersion);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
      /* 別の場所の古い接続が閉じるのを待っている、という知らせで、失敗ではない。
         要求は生きていて、相手が閉じれば onsuccess が来る。ここで諦めると、
         少し待てば開けるのに空の画面が出てしまう。 */
      rq.onblocked = function () { noticeWaiting(); };
    });
  }

  function noticeWaiting() {
    var l = app.querySelector(".lead");
    if (l) l.textContent = "ほかの ページで この ずかんが ひらいています。そちらが とじると ひらきます…";
  }
  function noticeReload() {
    if (document.getElementById("reload-note")) return;
    var n = h("div", "reload-note");
    n.id = "reload-note";
    n.setAttribute("role", "status");
    n.append(h("span", null, "べつの ところで あたらしい はんが ひらかれました。"));
    var b = h("button", null, "よみこみなおす");
    b.type = "button";
    b.addEventListener("click", function () { location.reload(); });
    n.append(b);
    document.body.append(n);
  }

  function carryOver(txn) {
    var rq = txn.objectStore("planets").getAll();
    rq.onsuccess = function () {
      var rows = (rq.result || []).slice().sort(function (a, b) {
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      if (!rows.length) return;
      var books = txn.objectStore("books"), entries = txn.objectStore("entries");
      var bookId = "b-hajimete";
      rows.forEach(function (r, i) {
        var e = {};
        for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) e[k] = r[k];
        e.bookId = bookId;
        e.no = i + 1;
        entries.put(e);
      });
      books.put({
        id: bookId,
        title: "はじめての図鑑",
        color: 3,
        createdAt: rows[0].createdAt || Date.now(),
        nextNo: rows.length + 1,
        count: rows.length
      });
    };
  }

  /* 置きかえは1回のカーソルでまとめて行う。同じストアに2本のカーソルを
     走らせると、片方の書きこみをもう片方が古い値で上書きしうるため。 */
  function restyle(txn, from) {
    var books = txn.objectStore("books");
    books.openCursor().onsuccess = function (e) {
      var cur = e.target.result;
      if (!cur) return;
      var b = cur.value;
      if (from < 3) {
        /* version 3：7色 → 6色、ザクザク / ふわふわ / キラキラ → 柄0 */
        var old = Number(b.color) || 0;
        b.color = OLD_COLOR[old] != null ? OLD_COLOR[old] : 0;
        b.theme = 0;
      }
      if (from < 4) {
        /* version 4：番号5 が ふかみどり から あか に変わったので、みどり へ */
        if (Number(b.color) === 5) b.color = 2;
      }
      cur.update(b);
      cur.continue();
    };
  }

  function done(txn, value) {
    return new Promise(function (res, rej) {
      txn.oncomplete = function () { res(value); };
      txn.onerror = function () { rej(txn.error); };
      txn.onabort = function () { rej(txn.error || new Error("abort")); };
    });
  }
  function ask(rq) {
    return new Promise(function (res, rej) {
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  function listBooks() {
    return ask(db.transaction("books", "readonly").objectStore("books").getAll())
      .then(function (rows) {
        return (rows || []).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      });
  }
  function getBook(id) {
    return ask(db.transaction("books", "readonly").objectStore("books").get(id));
  }
  function listEntries(bookId) {
    return ask(db.transaction("entries", "readonly").objectStore("entries")
      .index("bookId").getAll(bookId))
      .then(function (rows) {
        return (rows || []).sort(function (a, b) { return (a.no || 0) - (b.no || 0); });
      });
  }

  function createBook(title, color, themeIdx, frameIdx, settings) {
    var b = {
      id: "b-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
      title: title, color: color, theme: themeIdx, frame: frameIdx,
      subtitle:"", font:0, icon:0, layout:"normal", nameMode:"both", titleSize:"medium", titleAlign:"center", buttonTheme:"pink",
      createdAt: Date.now(), nextNo: 1, count: 0
    };
    Object.keys(settings||{}).forEach(function(key){if(!['id','createdAt','nextNo','count'].includes(key))b[key]=settings[key]});
    var t = db.transaction("books", "readwrite");
    t.objectStore("books").put(b);
    return done(t, b);
  }

  /* 番号の採番と記録の保存を、ひとつのトランザクションで行う。 */
  function addEntry(bookId, data) {
    var t = db.transaction(["books", "entries"], "readwrite");
    var bs = t.objectStore("books"), es = t.objectStore("entries");
    var out = null;
    bs.get(bookId).onsuccess = function (ev) {
      var b = ev.target.result;
      if (!b) { t.abort(); return; }
      data.bookId = bookId;
      data.no = b.nextNo || 1;
      es.put(data);
      b.nextNo = data.no + 1;
      b.count = (b.count || 0) + 1;
      bs.put(b);
      out = data;
    };
    return done(t).then(function () { return out; });
  }

  /* 記録を書きかえる。番号・写真・図鑑は動かさない。 */
  function updateEntry(rec) {
    var t = db.transaction("entries", "readwrite");
    t.objectStore("entries").put(rec);
    return done(t, rec);
  }

  /* 消しても nextNo は戻さない。欠番はそのまま残る。 */
  function dropEntry(bookId, id) {
    var t = db.transaction(["books", "entries"], "readwrite");
    var bs = t.objectStore("books");
    t.objectStore("entries").delete(id);
    bs.get(bookId).onsuccess = function (ev) {
      var b = ev.target.result;
      if (!b) return;
      b.count = Math.max(0, (b.count || 1) - 1);
      bs.put(b);
    };
    return done(t);
  }

  function dropBook(bookId) {
    var t = db.transaction(["books", "entries"], "readwrite");
    var es = t.objectStore("entries");
    es.index("bookId").openCursor(IDBKeyRange.only(bookId)).onsuccess = function (ev) {
      var cur = ev.target.result;
      if (!cur) return;
      es.delete(cur.primaryKey);
      cur.continue();
    };
    t.objectStore("books").delete(bookId);
    return done(t);
  }

  function updateBook(bookId,patch){
    var t=db.transaction("books","readwrite"),bs=t.objectStore("books"),out=null;
    bs.get(bookId).onsuccess=function(ev){
      var b=ev.target.result;if(!b){t.abort();return}
      Object.keys(patch||{}).forEach(function(k){b[k]=patch[k]});bs.put(b);out=b
    };
    return done(t).then(function(){return out})
  }


  function restoreBackupData(payload){
    var stamp=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),map=new Map();
    var books=payload.books.map(function(src,i){var b=Object.assign({},src,{id:'b-restore-'+stamp+'-'+i,createdAt:Date.now()+i});map.set(src.id,b.id);return b});
    var entries=payload.entries.map(function(src,i){return Object.assign({},src,{id:'e-restore-'+stamp+'-'+i,bookId:map.get(src.bookId)})});
    var tx=db.transaction(['books','entries'],'readwrite'),result=done(tx);try{books.forEach(function(b){tx.objectStore('books').put(b)});entries.forEach(function(e){tx.objectStore('entries').put(e)})}catch(e){tx.abort()}return result
  }

  /* 保存の窓口。画面はここだけを呼び、IndexedDB を直接さわらない。
     将来サーバーに移すときは、この中身を差し替えれば済む。 */
  var store = {
    open: openStore,
    books: listBooks,
    book: getBook,
    entries: listEntries,
    countEntries: function () {
      return ask(db.transaction("entries", "readonly").objectStore("entries").count());
    },
    createBook: createBook,
    addEntry: addEntry,
    updateEntry: updateEntry,
    dropEntry: dropEntry,
    dropBook: dropBook,
    updateBook: updateBook,
    restoreBackup: restoreBackupData,
    info: function () {
      return { name: DB_NAME, version: db ? db.version : null, expected: DB_VER };
    }
  };

  /* ================= 写真 ================= */

  function toBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" })["catch"](function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("decode")); };
      img.src = url;
    });
  }
  function squeeze(file) {
    return decode(file).then(function (src) {
      var s = Math.min(1, MAX_PX / Math.max(src.width, src.height));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(src.width * s));
      c.height = Math.max(1, Math.round(src.height * s));
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      return new Promise(function (res) {
        if (c.toBlob) c.toBlob(function (b) { res(b || file); }, "image/jpeg", QUALITY);
        else res(file);
      });
    });
  }
  function urlFor(e) {
    if (urls[e.id] === undefined) {
      var blob = null;
      try {
        if (e.photoBuf) blob = new Blob([e.photoBuf], { type: e.photoType || "image/jpeg" });
        else if (e.photo) blob = e.photo;   /* 旧形式：Blob のまま入っている記録 */
      } catch (err) { blob = null; }
      urls[e.id] = blob ? URL.createObjectURL(blob) : "";
    }
    return urls[e.id];
  }

  /* ================= 小道具 ================= */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return String(n).padStart(3, "0"); }
  function bufferToBase64(buf){
    if(!buf)return"";
    var bytes=new Uint8Array(buf),parts=[],step=0x8000;
    for(var i=0;i<bytes.length;i+=step){
      parts.push(String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+step,bytes.length))))
    }
    return btoa(parts.join(""))
  }
  function base64ToBuffer(str){
    var bin=atob(str||""),bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    return bytes.buffer
  }
  function downloadBlob(blob,name){
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},1200)
  }

  /* 傾き・ずれ・重なり順は、すべて番号から決まる。毎回おなじ見え方になる。 */
  /* 傾きは番号から決まる。毎回おなじ角度になる。
     ずらしと重なり順は、シール同士が接触するのでやめた。 */
  function tilt(no) { return (((no * 37) % 7) - 3) * 0.9; }
  function todayISO() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function showDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? Number(m[1]) + "年" + Number(m[2]) + "月" + Number(m[3]) + "日" : (iso || "——");
  }
  function field(label, tag, opts) {
    var l = h("label", "fld");
    l.append(h("span", "lb", label));
    var input = document.createElement(tag);
    if (opts.type) input.type = opts.type;
    if (opts.cls) input.className = opts.cls;
    if (opts.value) input.value = opts.value;
    if (opts.ph) input.placeholder = opts.ph;
    if (opts.max) input.maxLength = opts.max;
    input.id = opts.id;
    l.append(input);
    return { label: l, input: input };
  }
  function cameraIcon() {
    return maskIcon("./assets/attraction/icon-camera.png","action-art");
  }

  /* かたちの選択肢に出す図形。抽象的な形だけで、題材の絵は描かない。 */
  var SHAPES = {
    "まる": '<circle cx="24" cy="24" r="15"/>',
    "しかく": '<rect x="10" y="10" width="28" height="28" rx="2"/>',
    "さんかく": '<path d="M24 8 40 39H8Z"/>',
    "ながい": '<rect x="5" y="19" width="38" height="10" rx="5"/>',
    "とがってる": '<path d="M24 6c4 13 10 16 10 22a10 10 0 0 1-20 0c0-6 6-9 10-22z"/>',
    "でこぼこ": '<path d="M13 17c-4-6 2-11 7-8 2-6 11-5 12 1 7-2 10 5 6 9 5 5 1 13-5 11-2 6-10 7-12 1-6 4-12-2-9-8-5-1-5-5-1-6z"/>'
  };
  function shapeIcon(name) {
    return svgFrom('<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"' +
      ' fill="currentColor" aria-hidden="true">' + (SHAPES[name] || SHAPES["まる"]) + "</svg>");
  }

  /* 標本ラベルらしい、手で引いたような波打つ罫 */
  function waveRule() {
    var w = h("div", "wave");
    w.append(svgFrom('<svg viewBox="0 0 240 7" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"' +
      ' fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">' +
      '<path d="M0 4.6q6-3.4 12 0t12 0q6-3.4 12 0t12 0q6-3.4 12 0t12 0q6-3.4 12 0t12 0q6-3.4 12 0t12 0' +
      'q6-3.4 12 0t12 0q6-3.4 12 0t12 0q6-3.4 12 0t12 0q6-3.4 12 0t12 0"/></svg>'));
    return w;
  }

  function picture(src) {
    var p = h("span", "pic");
    var img = document.createElement("img");
    img.src = src; img.alt = "";
    p.append(img);
    return p;
  }
  function go(hash){if(hash===location.hash)return;if(designDirty&&!confirm('表紙の変更がまだ保存されていません。変更を破棄して移動しますか？'))return;designDirty=false;location.hash=hash}
  function setCover(co) {
    var root = document.documentElement.style;
    root.setProperty("--cover", co.bg);
    root.setProperty("--cover-ink", co.ink || "#ffffff");
  }

  /* シートを開くあいだ履歴を1つ積む。iPhone の戻る操作で、
     後ろの画面だけが変わってシートが浮いたまま残るのを防ぐ。 */
  var sheetGuard = false, sheetDirty=false, sheetBusy=false, designDirty=false;
  var lastRenderedHash=location.hash||"#/";

  function openSheet(node){
    var fresh=veil.hidden;if(fresh)lastFocus=document.activeElement;
    if(veil.firstElementChild&&veil.firstElementChild._cleanup)veil.firstElementChild._cleanup();
    veil.replaceChildren(node);veil.hidden=false;sheetDirty=false;sheetBusy=false;
    app.inert=true;var nav=document.getElementById('app-nav');if(nav)nav.inert=true;
    node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');var title=node.querySelector('h2');if(title){title.id='sheet-title';node.setAttribute('aria-labelledby','sheet-title')}
    if(fresh&&!sheetGuard){sheetGuard=true;try{history.pushState({sheet:true},'')}catch(_){sheetGuard=false}}
    var f=node.querySelector('input,textarea,button');if(f)f.focus();veil.scrollTop=0
  }
  function closeSheet(force){
    var forced=force===true;if(sheetBusy&&!forced){toast('保存が終わるまでお待ちください');return false}
    if(sheetDirty&&!forced&&!confirm('入力した内容がまだ保存されていません。破棄して閉じますか？'))return false;
    if(veil.firstElementChild&&veil.firstElementChild._cleanup)veil.firstElementChild._cleanup();
    veil.hidden=true;veil.replaceChildren();sheetDirty=false;sheetBusy=false;app.inert=false;var nav=document.getElementById('app-nav');if(nav)nav.inert=false;
    var had=sheetGuard;sheetGuard=false;
    if(had&&history.state&&history.state.sheet){if(forced)history.replaceState({},'');else history.back()}
    if(lastFocus&&lastFocus.isConnected&&lastFocus.focus)lastFocus.focus();return true
  }
  window.addEventListener("popstate", function () {
    if(!veil.hidden){
      if(sheetBusy||(sheetDirty&&!confirm("入力した内容を破棄して閉じますか？"))){history.pushState({sheet:true},"",lastRenderedHash);return}
      closeSheet(true)
    }
  });
  veil.addEventListener("input",function(){sheetDirty=true});
  veil.addEventListener("change",function(){sheetDirty=true});
  veil.addEventListener("keydown",function(e){if(e.key!=="Tab")return;var nodes=Array.from(veil.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')).filter(function(n){return n.getClientRects().length});if(!nodes.length)return;var first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
  app.addEventListener("input",function(e){if(e.target.closest('.design-screen'))designDirty=true});
  app.addEventListener("change",function(e){if(e.target.closest('.design-screen'))designDirty=true});
  app.addEventListener("click",function(e){if(e.target.closest('.design-screen [data-font],.design-screen [data-color],.design-screen [data-theme],.design-screen [data-preset],.design-screen [data-icon],.design-screen [data-frame],.design-screen [data-layout],.design-screen [data-name-mode],.design-screen [data-button-theme],.design-screen [data-title-size],.design-screen [data-title-align],.design-screen .color-reset'))designDirty=true});
  window.addEventListener("beforeunload",function(e){if(hasUnsavedChanges()){e.preventDefault();e.returnValue=""}});
  pick.addEventListener("cancel",function(){pendingBookId=null});
  veil.addEventListener("click", function (e) { if (e.target === veil) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !veil.hidden) closeSheet(); });

  /* 演出。短く、じゃまにならない長さに。動きを減らす設定では静かに出す。 */
  function calm() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* はじめての1件。シールが貼られ、紙吹雪が少しだけ舞う。 */
  function celebrate(entry) {
    var party = h("div", "party");
    party.id = "party";
    party.setAttribute("role", "status");

    var card = h("div", "party-card");
    var seal = h("div", "seal");
    var img = document.createElement("img");
    img.src = urlFor(entry); img.alt = "";
    seal.append(img, h("div", "cap", entry.name));
    card.append(seal);
    card.append(h("div", "ttl", "はじめての はっけん！"));
    card.append(h("div", "sub", "ずかんの 1ページめが うまりました"));
    party.append(card);

    if (!calm()) {
      var tone = [cover(0).set[0], "#edc55e", "#e8a7bd", "#7dbed2", "#a9d6b4"];
      for (var i = 0; i < 26; i++) {
        var f = h("i", "conf");
        f.style.left = (Math.random() * 100).toFixed(1) + "%";
        f.style.background = tone[i % tone.length];
        f.style.animationDuration = (1.1 + Math.random() * 0.7).toFixed(2) + "s";
        f.style.animationDelay = (Math.random() * 0.35).toFixed(2) + "s";
        f.style.setProperty("--spin", (360 + Math.random() * 540).toFixed(0) + "deg");
        party.append(f);
      }
    }

    function shut() {
      if (party.parentNode) party.remove();
      clearTimeout(timer);
    }
    party.addEventListener("click", shut);
    var timer = setTimeout(shut, calm() ? 1400 : 2400);
    document.body.append(party);
  }

  /* 5こ、10こ、と区切りのたびに、小さく知らせる。 */
  var MILESTONES = [5, 10, 20, 30, 50, 100];
  function milestone(count) {
    if (MILESTONES.indexOf(count) < 0) return;
    var t = h("div", "badge-toast");
    t.setAttribute("role", "status");
    t.append(h("span", null, count + "こ あつめた！"));
    document.body.append(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 2400);
  }

  /* ================= 画面 ================= */

  

  

  

  var PER_PAGE = 9;   /* 1ページ 3×3。紙の図鑑らしい密度にそろえる */

  

  /* どのページを開いているかは、図鑑ごとに覚えておく（保存はしない） */
  var bookPage = Object.create(null);

  function turnTo(bookId, page, dir) {
    bookPage[bookId] = page;
    var t = app.querySelector(".tome");
    if (t && !calm()) {
      t.classList.add(dir === "back" ? "turn-back" : "turn-fwd");
      setTimeout(function () { render(); }, 180);
      return;
    }
    render();
  }

  

  /* 保存場所の診断。#/storage で開く。記録が残らない端末で、原因を確かめるため。
     何も書きかえない。 */
  function renderStorage(){
    app.replaceChildren();renderAppNav('settings');app.append(lHeader('保存状態','大切な記録を、安心して残すために。'));var panel=h('main','l-panel'),rows=h('div','settings-list');panel.append(rows);app.append(panel);
    function row(label,value){var node=h('div','settings-row'),copy=h('div');copy.append(h('strong',null,label),h('small',null,value));node.append(copy);rows.append(node)}
    var st=navigator.storage||{};return Promise.all([store.books(),store.countEntries(),st.persisted?st.persisted().catch(function(){return null}):null,st.estimate?st.estimate().catch(function(){return null}):null]).then(function(x){row('この端末の記録',x[0].length+'冊の図鑑・'+x[1]+'件の記録');row('保存先','このブラウザ・端末内。ほかの端末とは自動同期しません。');row('保存の保護',x[2]===true?'ブラウザの保存保護が有効です。':'ブラウザのデータ消去に備え、定期的にバックアップしてください。');if(x[3])row('使用容量',((x[3].usage||0)/1048576).toFixed(1)+' MB');panel.append(lButton('バックアップを書き出す',exportBackup,'go'),h('p','l-note','写真・表紙・コメントをまとめて保存します。'),lButton('マイページへ',function(){go('#/settings')},'secondary-pill'))})
  }

  /* ================= 図鑑をつくる ================= */

  

  /* ================= 記録をくわえる ================= */

  function nativeApi(){
    var n=window.NativeZukan;
    return n&&n.isNative?n:null
  }

  function nativeHaptic(kind){
    var n=nativeApi();
    if(n&&n.haptic){
      n.haptic(kind||"light")["catch"](function(){})
    }
  }

  function shareEntry(book,entry){
    var title=(book&&book.title?book.title+' / ':'')+(entry.name||'記録'),text=[entry.name,entry.kanji,showDate(entry.date),entry.place,entry.observed].filter(Boolean).join('\n'),n=nativeApi();
    var shared=n&&n.shareText?n.shareText(title,text):navigator.share?navigator.share({title:title,text:text}):navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(title+'\n'+text).then(function(){toast('記録の文章をコピーしました')}):null;
    if(shared)return shared.catch(function(e){if(e&&e.name==='AbortError')return;showShareText(title,text)});showShareText(title,text)
  }

  function openCapturedPhoto(bookId,file){
    if(!file)return;if(file.size>40*1024*1024){showError('写真のサイズが大きすぎます','40MB以下の写真を選んでください。');return}
    toast('写真を読み込んでいます…');return squeeze(file).then(function(blob){openEntryForm(bookId,blob)},function(){showError('写真を読み込めませんでした','別の写真を選ぶか、JPEG・PNG形式に変換してお試しください。記録は変更していません。')})
  }

  function startCapture(bookId) {
    pendingBookId = bookId;
    var n=nativeApi();
    if(n&&n.pickPhoto){
      nativeHaptic("light");
      n.pickPhoto().then(function(file){
        if(!file||!pendingBookId)return;
        var id=pendingBookId;
        pendingBookId=null;
        openCapturedPhoto(id,file)
      })["catch"](function(e){
        pendingBookId=null;if(!e||e.name!=="AbortError")toast("写真を選べませんでした。もう一度お試しください。")
      });
      return
    }
    pick.click();
  }

  pick.addEventListener("change", function () {
    var file = pick.files && pick.files[0];
    pick.value = "";
    if (!file || !pendingBookId) return;
    var bookId = pendingBookId;
    pendingBookId = null;
    openCapturedPhoto(bookId,file);
  });

  



  function exportBackup(){
    toast('バックアップを準備しています…');var tx=db.transaction(['books','entries'],'readonly');
    return Promise.all([ask(tx.objectStore('books').getAll()),ask(tx.objectStore('entries').getAll())]).then(function(rows){return Promise.all(rows[1].map(function(src){var e={};Object.keys(src).forEach(function(k){if(k!=='photoBuf'&&k!=='photo')e[k]=src[k]});return (src.photoBuf?Promise.resolve(src.photoBuf):src.photo?toBuffer(src.photo):Promise.reject(new Error('missing photo'))).then(function(buf){e.photoBase64=bufferToBase64(buf);return e})})).then(function(es){return{type:'mitsuketa-zukan-backup',version:1,createdAt:new Date().toISOString(),books:rows[0],entries:es}})}).then(function(data){var name='zukan-backup-'+todayISO()+'.json',json=JSON.stringify(data),n=nativeApi();return Promise.resolve(n&&n.shareBackup?n.shareBackup(name,json):downloadBlob(new Blob([json],{type:'application/json'}),name)).then(function(){toast('バックアップを書き出しました。保存先をご確認ください。');return true})}).catch(function(e){if(e&&e.name==='AbortError')return false;showError('バックアップを作成できませんでした','記録はこの端末に残っています。空き容量などを確認し、もう一度お試しください。');return false})
  }

  function chooseRestoreFile(){
    var input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',function(){var file=input.files&&input.files[0];if(!file)return;if(file.size>128*1024*1024){showError('バックアップが大きすぎます','この版で読み込めるファイルは128MBまでです。');return}file.text().then(function(text){return validateBackup(JSON.parse(text))}).then(openRestoreConfirm).catch(function(){showError('このファイルは読み込めません','このアプリで書き出した、内容が欠けていないバックアップを選んでください。今ある記録は変更していません。')})});input.click()
  }

  function openRestoreConfirm(data){
    var c=h("div","card");c.append(h("h2","display","バックアップを復元"));
    c.append(h("p","note","図鑑 "+data.books.length+"冊、記録 "+data.entries.length+"件を追加します。"));
    c.append(h("p","note","今この端末にある図鑑や写真は消しません。同じバックアップを2回読み込むと、同じ図鑑がもう一度追加されます。"));
    var acts=h("div","acts"),goBtn=h("button","go","追加して復元する"),cancel=h("button",null,"やめる");
    goBtn.type=cancel.type="button";cancel.addEventListener("click",closeSheet);
    goBtn.addEventListener("click",function(){
      sheetBusy=true;goBtn.disabled=true;cancel.disabled=true;goBtn.textContent="復元しています…";
      store.restoreBackup(data).then(function(){closeSheet(true);toast("バックアップから復元しました");go("#/");render()},function(){
        sheetBusy=false;goBtn.disabled=false;cancel.disabled=false;goBtn.textContent="もう一度ためす"
      })
    });
    acts.append(goBtn,cancel);c.append(acts);openSheet(c)
  }

  /* ================= 夜の図書館 UI（共同制作ブランチ） ================= */
  var bookFilterMode=Object.create(null);
  var bookSearchText=Object.create(null);
  function applyPreset(draft,p){
    draft.color=p.color;draft.theme=p.theme;draft.frame=p.frame;draft.font=p.font;draft.icon=p.icon;draft.layout=p.layout;draft.titleSize=p.titleSize||"medium";draft.titleAlign=p.titleAlign||"center";draft.buttonTheme=p.buttonTheme||"pink";
    draft.customBg="";draft.customAccent="";draft.customInk="";
  }


  function textureCss(themeIdx){
    var files=[
      "./assets/texture-leather.webp",
      "./assets/texture-crosshatch.webp",
      "./assets/texture-woven.webp",
      "./assets/texture-paper.webp",
      "./assets/texture-grain.webp",
      "./assets/texture-linen.webp",
      "./assets/texture-emboss.webp",
      "./assets/texture-smooth.webp"
    ];
    var n=(Number(themeIdx)||0)%files.length;
    return 'url("'+new URL(files[n],document.baseURI).href+'")'
  }
  function styleBookNode(node,b){
    var co=cover(b.color);
    node.style.setProperty("--book-bg",b.customBg||co.bg);
    node.style.setProperty("--book-font",bookFont(b.font).css);
    node.style.setProperty("--book-texture",textureCss(b.theme));
    node.style.setProperty("--book-accent",b.customAccent||(Number(b.color)>=12?"#715c34":"#e6c579"));
    node.style.setProperty("--book-ink",b.customInk||co.ink);
    return node
  }
  function displayNames(book,e){
    var mode=(book&&book.nameMode)||"both",main=e.name||"",alt=e.kanji||"";
    if(mode==="alt"&&alt)return{main:alt,sub:main};
    if(mode==="name")return{main:main,sub:""};
    return{main:main,sub:alt}
  }

  function makeCoverPhotoEditor(draft,onChange,onBusy){
    var box=h('section','cover-photo-editor'),status=h('p','l-note');status.setAttribute('role','status');box.append(h('h2',null,'表紙の写真'));
    var pick=lButton('写真を選ぶ',function(){var input=document.createElement('input');input.type='file';input.accept='image/*';input.addEventListener('change',function(){var file=input.files&&input.files[0];if(!file)return;if(file.size>30*1024*1024){status.textContent='30MB以下の写真を選んでください。';return}pick.disabled=true;if(onBusy)onBusy(true);status.textContent='写真を準備しています…';decode(file).then(function(src){var scale=Math.min(1,1000/Math.max(src.width,src.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(src.width*scale));canvas.height=Math.max(1,Math.round(src.height*scale));var ctx=canvas.getContext('2d');ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(src,0,0,canvas.width,canvas.height);if(src.close)src.close();var data=canvas.toDataURL('image/jpeg',.84);if(data.length>2000000)throw new Error('large');if(!box.isConnected)return;draft.coverPhoto=data;draft.coverSource='photo';draft.coverPhotoY=50;position.value=50;status.textContent='写真を選びました。保存すると表紙に反映されます。';change()}).catch(function(){if(box.isConnected)status.textContent='写真を読み込めませんでした。JPEG・PNGなどの写真を選び直してください。'}).finally(function(){pick.disabled=false;if(onBusy)onBusy(false)})});input.click()},'secondary-pill'),remove=lButton('写真を外す',function(){draft.coverPhoto='';draft.coverPhotoY=50;status.textContent='保存すると写真を外せます。';change()},'secondary-pill');
    var actions=h('div','cover-photo-actions');actions.append(pick,remove);var lab=h('label','cover-photo-position');lab.append(h('span',null,'写真の位置（上 ↔ 下）'));var position=document.createElement('input');position.type='range';position.min=0;position.max=100;position.value=draft.coverPhotoY==null?50:draft.coverPhotoY;position.setAttribute('aria-label','表紙写真の上下位置');position.addEventListener('input',function(){draft.coverPhotoY=Number(position.value);change()});lab.append(position);box.append(actions,lab,status,h('p','l-note','写真はこの端末に保存されます。表紙のバックアップにも含まれます。'));
    var effects=h('div','page-customize');[['写真の加工','coverFilter',[['original','オリジナル'],['warm','あたたかく'],['mono','モノクロ'],['soft','やわらかく']],'original'],['タイトルの仕上げ','titleEffect',[['plain','すっきり'],['outline','文字にフチ'],['shadow','浮き彫りの影']],'plain']].forEach(function(x){var label=h('label'),select=document.createElement('select');select.setAttribute('aria-label',x[0]);label.append(h('span',null,x[0]));x[2].forEach(function(o){var op=document.createElement('option');op.value=o[0];op.textContent=o[1];select.append(op)});select.value=draft[x[1]]||x[3];select.addEventListener('change',function(){draft[x[1]]=select.value;change()});label.append(select);effects.append(label)});var zoomLabel=h('label','cover-photo-position'),zoom=document.createElement('input');zoom.type='range';zoom.min=100;zoom.max=180;zoom.value=draft.coverZoom||100;zoom.setAttribute('aria-label','表紙写真の拡大');zoomLabel.append(h('span',null,'写真の拡大'),zoom);zoom.addEventListener('input',function(){draft.coverZoom=Number(zoom.value);change()});box.append(effects,zoomLabel);function change(){refresh();onChange()}function refresh(){position.value=draft.coverPhotoY==null?50:draft.coverPhotoY;if(zoom)zoom.value=draft.coverZoom||100;remove.hidden=!draft.coverPhoto;lab.hidden=!coverImageSource(draft);if(zoomLabel)zoomLabel.hidden=!coverImageSource(draft);pick.textContent=draft.coverPhoto?'写真を変更':'写真を選ぶ'}box._refresh=refresh;refresh();return box
  }

  var COVER_ARTS=[
    {key:'starlight',name:'ほしぞら探検記',src:'./assets/covers/starlight.webp',bg:'#172b3d'},
    {key:'woodland',name:'ひみつの森',src:'./assets/covers/woodland.webp',bg:'#233e32'},
    {key:'ocean',name:'海の底のふしぎ',src:'./assets/covers/ocean.webp',bg:'#164951'}
  ];
  var COVER_STYLE_KEYS=['coverArt','coverSource','coverComposition','coverOrnament','coverTitlePosition','coverTitleTreatment','coverShade','coverTracking','coverSticker','coverStickerSize','coverStickerPosition'];
  function coverArtInfo(key){return COVER_ARTS.find(function(a){return a.key===key})}
  function coverImageSource(b){var art=coverArtInfo(b.coverArt);return b.coverSource==='art'&&art?art.src:b.coverPhoto||(art&&art.src)||''}
  function coverStylePatch(b){var out={};COVER_STYLE_KEYS.forEach(function(k){if(b[k]!==undefined)out[k]=b[k]});return out}
  function setStoryCover(draft,art){draft.coverArt=art?art.key:'';draft.coverSource=art?'art':'photo';draft.coverComposition=art?'full':'inset';draft.coverOrnament=art?'antique':'none';draft.coverTitlePosition=art?'top':'center';draft.coverTitleTreatment='plain';draft.coverShade=art?12:0;draft.customBg=art?art.bg:'';draft.customAccent=art?'#f5d79c':'';draft.customInk=art?'#e9cf97':'';draft.font=1;draft.frame=1;draft.coverFilter='original';draft.coverZoom=100;draft.coverPhotoY=50;draft.titleEffect=art?'shadow':'plain'}
  function makeBookFace(b,small){
    var composition=['full','oval'].includes(b.coverComposition)?b.coverComposition:'inset',source=coverImageSource(b),face=h('div','book-face frame-'+frameOf(b.frame).key+(small?' small':'')+' title-'+(b.titleSize||'medium')+' align-'+(b.titleAlign||'center')+' cover-composition-'+composition);styleBookNode(face,b);
    var inner=h('div','book-face-inner'),ic=bookIcon(b.icon);
    if(source){face.classList.add('has-cover-photo');var photo=document.createElement('img');photo.className='book-cover-photo';photo.src=source;photo.alt='';photo.draggable=false;photo.style.objectPosition='50% '+(b.coverPhotoY==null?50:b.coverPhotoY)+'%';photo.style.filter=({original:'none',warm:'sepia(.22) saturate(.85)',mono:'grayscale(1)',soft:'saturate(.65) contrast(.9)'}[b.coverFilter]||'none');photo.style.transform='scale('+Math.max(1,Math.min(1.8,(Number(b.coverZoom)||100)/100))+')';var windowPhoto=h('div','cover-image-window');windowPhoto.append(photo);if(composition==='full'){face.append(windowPhoto);var shade=h('span','cover-shade');shade.style.opacity=String(Math.max(0,Math.min(65,Number(b.coverShade)||0))/100);face.append(shade)}else inner.append(windowPhoto)}else if(ic.src)inner.append(maskIcon(ic.src,'book-face-icon'));
    face.classList.add('title-effect-'+(['plain','outline','shadow'].includes(b.titleEffect)?b.titleEffect:'plain'));
    face.dataset.titlePosition=['top','center','bottom'].includes(b.coverTitlePosition)?b.coverTitlePosition:'top';face.dataset.titleTreatment=b.coverTitleTreatment==='plate'?'plate':'plain';
    var copy=h('div','book-cover-copy');copy.style.letterSpacing=Math.max(0,Math.min(18,Number(b.coverTracking)||0))/100+'em';copy.append(h('div','book-face-title',b.title||'わたしの図鑑'));if(b.subtitle)copy.append(h('div','book-face-sub',b.subtitle));inner.append(copy);face.append(inner);
    if(b.coverOrnament==='antique'){face.classList.add('cover-ornament-antique');var ornament=document.createElement('img');ornament.src='./assets/covers/antique-frame.webp';ornament.alt='';ornament.className='cover-ornament';ornament.draggable=false;face.append(ornament)}
    var sticker=BOOK_ICONS[Number(b.coverSticker)-1];if(sticker&&sticker.src){var badge=document.createElement('img');badge.src=sticker.src;badge.alt='';badge.draggable=false;badge.className='cover-sticker';badge.dataset.position=['left','right'].includes(b.coverStickerPosition)?b.coverStickerPosition:'center';badge.style.width=(Math.max(70,Math.min(140,Number(b.coverStickerSize)||100))*.22)+'%';face.append(badge)}return face
  }

  function clearAppNav(){var n=document.getElementById("app-nav");if(n)n.remove()}

  function route(){
    var hash=location.hash.replace(/^#/,""),m=/^\/b\/([^/]+)\/e\/(\d+)$/.exec(hash);
    if(m)return{view:"entry",bookId:m[1],no:Number(m[2])};
    if(hash==="/new"||hash==="/new/record")return{view:"design",recordAfterCreate:hash==="/new/record"};
    m=/^\/b\/([^/]+)\/design$/.exec(hash);if(m)return{view:"design",bookId:m[1]};
    m=/^\/b\/([^/]+)\/list$/.exec(hash);if(m)return{view:"book",bookId:m[1]};
    m=/^\/b\/([^/]+)$/.exec(hash);if(m)return{view:"cover",bookId:m[1]};
    m=/^\/library\/([^/]+)$/.exec(hash);if(m)return{view:"public",sharedId:m[1]};if(hash==="/library")return{view:"public"};m=/^\/group\/([^/]+)$/.exec(hash);if(m)return{view:"groups",sharedId:m[1]};if(hash==="/groups")return{view:"groups"};if(hash==="/memories")return{view:"memories"};if(hash==="/search")return{view:"search"};if(hash==="/collections")return{view:"collections"};if(hash==="/settings")return{view:"settings"};if(hash==="/storage")return{view:"storage"};return{view:"shelf"}
  }
  function render(){
    if(!db)return Promise.resolve();var r=route();document.documentElement.setAttribute("data-view",r.view);bar.hidden=true;
    var nativeChrome=window.NativeZukan;
    if(nativeChrome&&nativeChrome.isNative&&nativeChrome.setChromeTheme){
      var lightNativeViews={book:1,entry:1,design:1,search:1,collections:1,settings:1};
      nativeChrome.setChromeTheme("light")["catch"](function(){})
    }
    if(r.view==="public")return renderPublicLibrary(r.sharedId);if(r.view==="groups")return renderGroups(r.sharedId);if(r.view==="memories")return renderMemories();if(r.view==="cover")return renderBookCover(r.bookId);
    if(r.view==="book")return renderBook(r.bookId);
    if(r.view==="entry")return renderEntry(r.bookId,r.no);
    if(r.view==="design")return renderDesign(r.bookId,{recordAfterCreate:r.recordAfterCreate});
    if(r.view==="search")return renderGlobalSearch();if(r.view==="collections")return renderCollections();if(r.view==="settings")return renderSettings();if(r.view==="storage")return renderStorage();return renderShelf()
  }

  

  function renderBookCover(bookId){
    return store.book(bookId).then(function(b){
      app.replaceChildren();renderAppNav("collections");app.append(lHeader("わたしの図鑑","想いをつめこんで、とっておきの一冊に。"));if(!b){go("#/");return}setCover(cover(b.color));
      var screen=h("section","cover-screen");applyButtonTheme(screen,b);var back=h("a","back","← 本棚");back.href="#/";screen.append(back);
      var stage=h("div","cover-stage entering");stage.append(makeBookFace(b,false));screen.append(stage);
      var acts=h("div","cover-actions"),open=h("button","primary-pill","この図鑑をひらく　→"),design=h("button","secondary-pill","デザインを編集");
      open.type=design.type="button";open.addEventListener("click",function(){go("#/b/"+b.id+"/list")});design.addEventListener("click",function(){go("#/b/"+b.id+"/design")});
      var del=h("button","danger-link","この図鑑を削除");del.type="button";del.addEventListener("click",function(){confirmDelete("図鑑を削除しますか？","「"+b.title+"」と中の記録"+(b.count||0)+"件を削除します。この操作は取り消せません。",function(){return store.dropBook(b.id).then(function(){go("#/")})})});
      var favorite=lButton(b.favorite?"お気に入りを外す":"お気に入りに追加",function(){favorite.disabled=true;store.updateBook(b.id,{favorite:!b.favorite}).then(render,function(){favorite.disabled=false})},"secondary-pill");favorite.setAttribute("aria-pressed",String(!!b.favorite));acts.append(open,design,lButton("中のページを編集",function(){openPageLayout(b.id)},"secondary-pill"),favorite,del);screen.append(acts);app.append(screen)
    })
  }

  function renderBook(bookId){
    return Promise.all([store.book(bookId),store.entries(bookId)]).then(function(out){
      var b=out[0],list=out[1];app.replaceChildren();renderAppNav("collections");app.append(lHeader("図鑑の記録","見つけたものを、ひとつずつ。"));if(!b){go("#/");return}setCover(cover(b.color));
      var mode=bookFilterMode[bookId]||"all",shown=list.slice(),query=(bookSearchText[bookId]||"").trim().toLowerCase();
      if(mode==="fav")shown=shown.filter(function(e){return!!e.favorite});
      if(mode==="recent")shown.sort(function(a,z){return(z.createdAt||0)-(a.createdAt||0)});
      var screen=h("section","collection-screen");applyButtonTheme(screen,b);screen.style.setProperty("--book-font",bookFont(b.font).css);
      var head=h("div","collection-head"),back=h("button","round-btn");back.type="button";back.setAttribute("aria-label","表紙へ戻る");back.append(maskIcon("./assets/attraction/icon-back.png","round-mask"));back.addEventListener("click",function(){go("#/b/"+b.id)});
      var title=h("div","collection-title");title.append(h("h1",null,b.title),h("p",null,(b.count||0)+"件のコレクション"));
      var edit=h("button","round-btn");edit.type="button";edit.setAttribute("aria-label","デザインを編集");edit.append(maskIcon("./assets/attraction/icon-more.png","round-mask"));edit.addEventListener("click",function(){go("#/b/"+b.id+"/design")});head.append(back,title,edit);screen.append(head,lButton("中のページを編集 · "+pageLayoutName(b.pageLayout),function(){openPageLayout(b.id)},"page-edit-entry secondary-pill"));
      var search=h("label","collection-search"),mag=maskIcon("./assets/attraction/nav-search.png","search-mask"),searchInput=document.createElement("input");
      searchInput.type="search";searchInput.placeholder="名前・タグ・メモから探す";searchInput.value=bookSearchText[bookId]||"";
      searchInput.setAttribute("aria-label","コレクションを検索");
      search.append(mag,searchInput);screen.append(search);
      var filters=h("div","filter-row");[["all","すべて"],["fav","♡ お気に入り"],["recent","新しい順"]].forEach(function(x){var bt=h("button","filter-chip"+(mode===x[0]?" active":""),x[1]);bt.type="button";bt.setAttribute("aria-pressed",String(mode===x[0]));bt.addEventListener("click",function(){bookFilterMode[bookId]=x[0];render()});filters.append(bt)});screen.append(filters);
      var emptyState=h("div","empty-collection");
      if(!shown.length){
        emptyState.classList.add("rich");
        if(mode==="fav"){
          emptyState.textContent="お気に入りは、まだありません。"
        }else{
          var art=document.createElement("img");art.className="empty-art";art.src="./assets/attraction/poster-empty.webp";art.alt="これから写真が並ぶ図鑑のイラスト";
          emptyState.append(art,h("div",null,"写真を一枚追加して、最初の発見を記録しましょう。"))
        }
        screen.append(emptyState)
      }else{
        var ln=makeEntryCollection(b,shown,false);screen.append(ln);
        emptyState.textContent="条件に合う記録が見つかりません。";
        emptyState.hidden=true;screen.append(emptyState);

        function applySearch(){
          var q=(searchInput.value||"").trim().toLowerCase(),visible=0;
          bookSearchText[bookId]=searchInput.value||"";
          if(ln.filterRecords){visible=ln.filterRecords(q);emptyState.hidden=visible!==0;return}Array.prototype.forEach.call(ln.children,function(row){
            var hit=matchesSearch(row.dataset.search,q);
            row.hidden=!hit;if(hit)visible+=1
          });
          emptyState.hidden=visible!==0
        }
        searchInput.addEventListener("input",applySearch);
        applySearch()
      }
      var exportBtn=h("button","secondary-pill pro-export-btn","PRO　PDF / 印刷用に書き出す");
      exportBtn.type="button";
      exportBtn.addEventListener("click",function(){nativeHaptic("light");exportBookPrintable(b.id)});
      if(canShowWebMonetization())screen.append(exportBtn);
      var add=h("button","add-entry-btn","新しく登録する");add.type="button";add.prepend(maskIcon("./assets/attraction/icon-camera.png","action-art"));add.addEventListener("click",function(){startCapture(b.id)});screen.append(add);app.append(screen)
    })
  }

  function renderEntry(bookId,no){
    return Promise.all([store.book(bookId),store.entries(bookId)]).then(function(out){
      var b=out[0],list=out[1],e=list.filter(function(x){return x.no===no})[0];app.replaceChildren();renderAppNav("collections");app.append(lHeader("わたしの図鑑","好きが、わたしをつくっていく。"));if(!b||!e){go("#/b/"+bookId+"/list");return}
      var screen=h("section","detail-screen");applyButtonTheme(screen,b);screen.style.setProperty("--book-font",bookFont(b.font).css);
      var top=h("div","detail-top"),back=h("a","back","← "+b.title);back.href="#/b/"+b.id+"/list";
      var fav=h("button","heart-btn"+(e.favorite?" on":""));fav.type="button";fav.setAttribute("aria-label",e.favorite?"お気に入りを外す":"お気に入りに追加");fav.append(maskIcon("./assets/attraction/icon-heart.png","heart-mask"));fav.addEventListener("click",function(){nativeHaptic("light");e.favorite=!e.favorite;store.updateEntry(e).then(render)});top.append(back,fav);screen.append(top);
      var img=document.createElement("img");img.className="detail-photo";img.alt="";img.src=urlFor(e);var names=displayNames(b,e);screen.append(img,h("div","detail-no","No."+pad(e.no)),h("h1","detail-name",names.main));if(names.sub)screen.append(h("div","detail-alias",names.sub));
      var meta=h("div","detail-meta");[["見つけた日",showDate(e.date)],["見つけたところ",e.place||"——"]].forEach(function(x){var r=h("div","detail-meta-row");r.append(h("span",null,x[0]),h("span",null,x[1]));meta.append(r)});screen.append(meta);
      if(e.tags&&e.tags.length){var tagList=h("div","tag-list");e.tags.forEach(function(t){tagList.append(h("span","tag-pill",t))});screen.append(tagList)}
      var notes=h("div","detail-notes");
      [["見て気づいたこと",e.observed],["思ったこと・ストーリー",e.imagined]].forEach(function(x){
        if(!x[1])return;var n=h("section","detail-note");n.append(h("h3",null,x[0]),h("p",null,x[1]));notes.append(n)
      });
      if(notes.children.length)screen.append(notes);
      var acts=h("div","detail-actions native-detail-actions"),share=h("button",null,"共有"),ed=h("button",null,"編集する"),del=h("button",null,"削除する"),armed=false;
      share.type=ed.type=del.type="button";
      share.prepend(maskIcon("./assets/attraction/icon-share.png","action-art"));
      ed.prepend(maskIcon("./assets/attraction/icon-edit.png","action-art"));
      del.prepend(maskIcon("./assets/attraction/icon-trash.png","action-art"));
      share.addEventListener("click",function(){shareEntry(b,e)});
      ed.addEventListener("click",function(){openEditForm(bookId,e)});
      del.addEventListener("click",function(){confirmDelete("記録を削除しますか？","「"+e.name+"」の写真と記録を削除します。この操作は取り消せません。",function(){return store.dropEntry(bookId,e.id).then(function(){if(urls[e.id])URL.revokeObjectURL(urls[e.id]);delete urls[e.id];go("#/b/"+bookId+"/list")})})});
      acts.append(share,ed,del);screen.append(lButton("フォトカードをつくる",function(){openPhotoCard([{book:b,entry:e}],e.name)},"photo-card-entry secondary-pill"),acts);appendRelated(screen,b,e,list);appendComments(screen,e);app.append(screen)
    })
  }

  function parseTags(text){
    var seen=Object.create(null),out=[];
    String(text||"").split(/[,、\n]/).forEach(function(v){
      var t=v.trim();if(!t||seen[t])return;seen[t]=true;out.push(t)
    });
    return out.slice(0,12)
  }

  function openEditForm(bookId,e){
    var c=h("div","card");c.setAttribute("role","dialog");c.setAttribute("aria-modal","true");c.append(h("h2","display","記録を編集"));
    var nm=field("名前","input",{id:"ed-name",cls:"big",max:24});
    var kn=field("漢字・別名（任意）","input",{id:"ed-kanji",max:32,ph:"蒲公英 / 宇宙飛行士 など"});
    var dt=field("日付","input",{id:"ed-date",type:"date"});
    var pl=field("見つけた・入手した場所","input",{id:"ed-place",max:40});
    var tg=field("タグ","input",{id:"ed-tags",max:120,ph:"花, 春, 公園"});
    var ob=field("見て気づいたこと（任意）","textarea",{id:"ed-observed",max:500});
    var im=field("思ったこと・ストーリー（任意）","textarea",{id:"ed-imagined",max:300});
    nm.input.value=e.name||"";kn.input.value=e.kanji||"";dt.input.value=e.date||todayISO();pl.input.value=e.place||"";
    tg.input.value=(e.tags||[]).join(", ");ob.input.value=e.observed||"";im.input.value=e.imagined||"";
    c.append(nm.label,kn.label,dt.label,pl.label,tg.label,h("p","tag-help","タグは「花, 春, 公園」のように区切って入力できます。"),ob.label,im.label);
    var acts=h("div","acts"),save=h("button","go","保存する"),cancel=h("button",null,"やめる");
    save.type=cancel.type="button";cancel.addEventListener("click",closeSheet);acts.append(save,cancel);c.append(acts);
    save.addEventListener("click",function(){
      var name=nm.input.value.trim();if(!name){nm.input.focus();return}
      save.disabled=true;
      sheetBusy=true;e=Object.assign({},e);e.name=name;e.kanji=kn.input.value.trim();e.date=dt.input.value||todayISO();e.place=pl.input.value.trim();e.tags=parseTags(tg.input.value);
      if(e.observed!==ob.input.value.trim())delete e.answers;e.observed=ob.input.value.trim();e.imagined=im.input.value.trim();
      store.updateEntry(e).then(function(){closeSheet(true);toast("記録を保存しました");render()},function(){sheetBusy=false;save.disabled=false;save.textContent="もう一度ためす"})
    });
    openSheet(c)
  }

  function renderDesign(bookId,options){
    var isNew=!bookId,recordAfterCreate=!!(options&&options.recordAfterCreate);
    var initial={title:'',subtitle:'',color:12,theme:5,frame:1,font:1,icon:0,buttonTheme:'gold'};
    return (isNew?Promise.resolve([initial,[]]):Promise.all([store.book(bookId),store.entries(bookId)])).then(function(data){
      var original=data[0],previewEntries=data[1],selectedTool=0;
      app.replaceChildren();renderAppNav("collections");app.append(lHeader("テーマ編集","お気に入りのデザインで、あなただけの一冊に。"));if(!original){go("#/");return}
      var draft={};Object.keys(original).forEach(function(k){draft[k]=original[k]});if(draft.font==null)draft.font=0;if(draft.icon==null)draft.icon=0;if(!draft.layout)draft.layout="normal";if(!draft.nameMode)draft.nameMode="both";if(!draft.titleSize)draft.titleSize="medium";if(!draft.titleAlign)draft.titleAlign="center";if(!draft.buttonTheme)draft.buttonTheme="pink";if(draft.buttonTheme==="rose")draft.buttonTheme="pink";if(draft.subtitle==null)draft.subtitle="";if(draft.customBg==null)draft.customBg="";if(draft.customAccent==null)draft.customAccent="";if(draft.customInk==null)draft.customInk="";
      var history=[],historyIndex=-1,replaying=false,inputGroup=null,lastGroup=null,photoBusy=false,saving=false;
      var screen=h("section","design-screen story-studio"),head=h("div","design-head"),back=h("button","round-btn","‹"),save=h("button","save-design","保存");back.type=save.type="button";back.textContent="";back.setAttribute("aria-label",isNew?"本棚へ戻る":"表紙へ戻る");back.append(lIcon("back"));back.addEventListener("click",function(){go(isNew?"#/":"#/b/"+bookId)});save.textContent=isNew?"つくる":"保存";head.append(back,h("h1",null,isNew?"新しい図鑑の装丁":"わたしの装丁室"),save);screen.append(head);
      var preview=h("div","design-preview");screen.append(preview);
      var photoEditor=makeCoverPhotoEditor(draft,function(){designDirty=true;repaint()},function(busy){photoBusy=busy;save.disabled=busy||saving;if(undo){undo.disabled=busy||historyIndex<1;redo.disabled=busy||historyIndex>=history.length-1}});screen.append(photoEditor);
      function sec(name){var n=h("section","design-section");n.append(h("h2",null,name));return n}
      var ps=sec("デザインテーマ"),pg=h("div","preset-grid palette-presets");ps.append(h("p","l-note","表紙・文字・差し色の組み合わせから選べます。"));
      BOOK_PRESETS.forEach(function(p,i){
        var bt=h("button","preset-card");bt.type="button";bt.dataset.preset=i;
        var thumb=h('span','theme-palette');thumb.setAttribute('aria-hidden','true');
        [cover(p.color).bg,Number(p.color)>=12?'#715c34':'#e6c579',cover(p.color).ink,buttonTheme(p.buttonTheme).primary].forEach(function(color){var swatch=h('span','theme-swatch');swatch.style.backgroundColor=color;thumb.append(swatch)});
        bt.append(thumb,h("span","preset-name",p.name),h("span","preset-note",p.note));
        bt.addEventListener("click",function(){
          applyPreset(draft,p);
          if(typeof freeCg!=="undefined"){var ins=freeCg.querySelectorAll('input[type="color"]');if(ins[0])ins[0].value=cover(draft.color).bg;if(ins[1])ins[1].value="#e6c579";if(ins[2])ins[2].value=cover(draft.color).ink}
          repaint()
        });
        pg.append(bt)
      });
      ps.append(pg);screen.append(ps);
      var ts=sec("タイトル"),ti=document.createElement("input"),si=document.createElement("input");ti.className=si.className="design-input";ti.maxLength=24;si.maxLength=48;ti.value=draft.title||"";si.value=draft.subtitle||"";ti.placeholder="図鑑のタイトル";si.placeholder="サブタイトル（任意）";ts.append(ti,si);screen.append(ts);
      function repaint(){
        screen.querySelectorAll('[data-cover-choice]').forEach(function(n){if(n.dataset.coverChoice==='coverSource')n.disabled=n.dataset.value==='photo'?!draft.coverPhoto:!coverArtInfo(draft.coverArt);n.setAttribute('aria-pressed',String(String(draft[n.dataset.coverChoice]==null?n.dataset.fallback:draft[n.dataset.coverChoice])===n.dataset.value))});screen.querySelectorAll('[data-art]').forEach(function(n){n.setAttribute('aria-pressed',String(n.dataset.art===(draft.coverArt||'')))});
        screen.querySelectorAll('[data-page-layout]').forEach(function(n){n.setAttribute('aria-pressed',String(n.dataset.pageLayout===(draft.pageLayout||'folio')))});
        draft.title=ti.value;draft.subtitle=si.value;screen.querySelectorAll('.custom-color-row input').forEach(function(n,i){n.value=[draft.customBg||cover(draft.color).bg,draft.customAccent||(Number(draft.color)>=12?'#715c34':'#e6c579'),draft.customInk||cover(draft.color).ink][i]});screen.querySelectorAll('[data-cover-field]').forEach(function(n){if(n.type==='checkbox')n.checked=draft[n.dataset.coverField]!==false;else n.value=draft[n.dataset.coverField]==null?n.dataset.fallback:draft[n.dataset.coverField]});remember();applyButtonTheme(screen,draft);paintPreview();
        [["font",draft.font],["color",draft.color],["theme",draft.theme],["icon",draft.icon],["frame",draft.frame]].forEach(function(p){Array.prototype.forEach.call(screen.querySelectorAll("[data-"+p[0]+"]"),function(n){n.classList.toggle("active",Number(n.dataset[p[0]])===Number(p[1]||0))})});
        Array.prototype.forEach.call(screen.querySelectorAll("[data-layout]"),function(n){n.classList.toggle("active",n.dataset.layout===draft.layout)});Array.prototype.forEach.call(screen.querySelectorAll("[data-name-mode]"),function(n){n.classList.toggle("active",n.dataset.nameMode===draft.nameMode)});Array.prototype.forEach.call(screen.querySelectorAll("[data-button-theme]"),function(n){n.classList.toggle("active",n.dataset.buttonTheme===draft.buttonTheme)});Array.prototype.forEach.call(screen.querySelectorAll("[data-title-size]"),function(n){n.classList.toggle("active",n.dataset.titleSize===draft.titleSize)});Array.prototype.forEach.call(screen.querySelectorAll("[data-title-align]"),function(n){n.classList.toggle("active",n.dataset.titleAlign===draft.titleAlign)});
        Array.prototype.forEach.call(screen.querySelectorAll("[data-preset]"),function(n){
          var p=BOOK_PRESETS[Number(n.dataset.preset)];
          var same=p&&Number(draft.color||0)===p.color&&Number(draft.theme||0)===p.theme&&Number(draft.frame||0)===p.frame&&Number(draft.font||0)===p.font&&Number(draft.icon||0)===p.icon&&draft.layout===p.layout&&draft.titleSize===(p.titleSize||"medium")&&draft.titleAlign===(p.titleAlign||"center")&&draft.buttonTheme===(p.buttonTheme||"pink")&&!draft.customBg&&!draft.customAccent&&!draft.customInk;
          n.classList.toggle("active",!!same);n.setAttribute("aria-pressed",String(!!same))
        });
        Array.prototype.forEach.call(screen.querySelectorAll("[data-theme]"),function(n){var base=draft.customBg||cover(draft.color).bg;n.style.setProperty("--tex-bg",base);n.style.setProperty("--tex-img",textureCss(Number(n.dataset.theme)));n.style.backgroundColor=base;n.style.backgroundImage=textureCss(Number(n.dataset.theme))})
      }
      function patchPreview(current,next){
        Array.from(current.attributes).forEach(function(a){if(!next.hasAttribute(a.name))current.removeAttribute(a.name)});Array.from(next.attributes).forEach(function(a){if(current.getAttribute(a.name)!==a.value)current.setAttribute(a.name,a.value)});
        var children=Array.from(next.childNodes);children.forEach(function(n,i){var old=current.childNodes[i];if(!old){current.append(n);return}if(old.nodeType!==n.nodeType||old.nodeName!==n.nodeName){old.replaceWith(n);return}if(n.nodeType===3){if(old.nodeValue!==n.nodeValue)old.nodeValue=n.nodeValue}else patchPreview(old,n)});while(current.childNodes.length>children.length)current.lastChild.remove()
      }
      function paintPreview(){
        if(selectedTool!==7){var face=makeBookFace(draft,true);if(preview.firstElementChild&&preview.firstElementChild.classList.contains('book-face')){patchPreview(preview.firstElementChild,face);face=preview.firstElementChild}else preview.replaceChildren(face);requestAnimationFrame(function(){if(!face.isConnected)return;var inner=face.querySelector('.book-face-inner'),title=face.querySelector('.book-face-title'),sub=face.querySelector('.book-face-sub'),photo=face.querySelector('.cover-image-window');if(face.classList.contains('cover-composition-full')){face.dataset.compositionFit='full';var copy=face.querySelector('.book-cover-copy');for(var j=0;j<12&&copy.offsetHeight>inner.clientHeight*.45;j++){title.style.fontSize=Math.max(10,parseFloat(getComputedStyle(title).fontSize)*.93)+'px';if(sub)sub.style.fontSize=Math.max(7,parseFloat(getComputedStyle(sub).fontSize)*.93)+'px'}}for(var i=0;i<14&&face.dataset.compositionFit!=='full'&&inner.scrollHeight>inner.clientHeight+1;i++){title.style.fontSize=Math.max(9,parseFloat(getComputedStyle(title).fontSize)*.92)+'px';if(sub)sub.style.fontSize=Math.max(6,parseFloat(getComputedStyle(sub).fontSize)*.92)+'px';if(photo)photo.style.height=Math.max(48,photo.offsetHeight-3)+'px'}});return}
        var samples=previewEntries.length?previewEntries.slice(0,1):[{id:'preview',no:1,name:'小さな季節の発見',date:todayISO(),place:'いつもの散歩道',observed:'光に透ける葉っぱの色。',imagined:'季節を少しずつ集めたい。',previewSrc:'./assets/library/blossom.png'}];
        var proof=h('div','editor-page-proof');proof.inert=true;proof.append(makeEntryCollection(draft,samples,true));preview.replaceChildren(proof);requestAnimationFrame(function(){if(!proof.isConnected)return;var scale=Math.min((preview.clientWidth-40)/360,(preview.clientHeight-24)/proof.offsetHeight,1);proof.style.transform='translate(-50%,-50%) scale('+scale+')'})
      }
      function remember(){if(replaying)return;var last=history[historyIndex];if(last&&Object.keys(draft).every(function(k){return draft[k]===last[k]})&&Object.keys(last).every(function(k){return draft[k]===last[k]}))return;if(historyIndex>=0)designDirty=true;history=history.slice(0,historyIndex+1);if(inputGroup&&lastGroup===inputGroup&&historyIndex>0)history[historyIndex]=Object.assign({},draft);else{history.push(Object.assign({},draft));if(history.length>48)history.shift();historyIndex=history.length-1}lastGroup=inputGroup;if(undo){undo.disabled=photoBusy||historyIndex<1;redo.disabled=true}}
      function restoreStep(delta){if(photoBusy||saving)return;inputGroup=lastGroup=null;var index=historyIndex+delta;if(index<0||index>=history.length)return;historyIndex=index;Object.keys(draft).forEach(function(k){delete draft[k]});Object.assign(draft,history[index]);photoEditor._refresh();ti.value=draft.title||'';si.value=draft.subtitle||'';screen.querySelectorAll('[data-cover-field]').forEach(function(n){n.value=draft[n.dataset.coverField]==null?n.dataset.fallback:draft[n.dataset.coverField]});screen.querySelectorAll('.custom-color-row input').forEach(function(n,i){n.value=[draft.customBg||cover(draft.color).bg,draft.customAccent||'#e6c579',draft.customInk||cover(draft.color).ink][i]});replaying=true;designDirty=true;repaint();replaying=false;undo.disabled=historyIndex<1;redo.disabled=historyIndex>=history.length-1}
      ti.addEventListener("input",repaint);si.addEventListener("input",repaint);

      var fs=sec("フォント"),fg=h("div","design-grid");BOOK_FONTS.forEach(function(f,i){var bt=h("button","design-choice font-choice","あ　"+f.name);bt.type="button";bt.dataset.font=i;bt.style.fontFamily=f.css;bt.addEventListener("click",function(){draft.font=i;repaint()});fg.append(bt)});fs.append(fg);screen.append(fs);
      var titleSizeSec=sec("タイトルの大きさ"),titleSizeGrid=h("div","design-grid");titleSizeSec.classList.add("advanced-option");
      [["small","小さめ"],["medium","標準"],["large","大きめ"]].forEach(function(x){
        var bt=h("button","design-choice density-choice",x[1]);bt.type="button";bt.dataset.titleSize=x[0];
        bt.addEventListener("click",function(){draft.titleSize=x[0];repaint()});titleSizeGrid.append(bt)
      });
      titleSizeSec.append(titleSizeGrid);screen.append(titleSizeSec);

      var titleAlignSec=sec("タイトルの位置"),titleAlignGrid=h("div","design-grid");titleAlignSec.classList.add("advanced-option");
      [["left","左"],["center","中央"],["right","右"]].forEach(function(x){
        var bt=h("button","design-choice density-choice",x[1]);bt.type="button";bt.dataset.titleAlign=x[0];
        bt.addEventListener("click",function(){draft.titleAlign=x[0];repaint()});titleAlignGrid.append(bt)
      });
      titleAlignSec.append(titleAlignGrid);screen.append(titleAlignSec);
      var cs=sec("カラー"),cg=h("div","design-grid");COVERS.forEach(function(co,i){var bt=h("button","design-choice color-choice");bt.type="button";bt.dataset.color=i;bt.style.setProperty("--swatch",co.bg);bt.setAttribute("aria-label",co.name);bt.addEventListener("click",function(){draft.color=i;draft.customBg="";draft.customAccent="";draft.customInk="";if(typeof freeCg!=="undefined"){var ins=freeCg.querySelectorAll('input[type="color"]');if(ins[0])ins[0].value=co.bg;if(ins[1])ins[1].value="#e6c579";if(ins[2])ins[2].value=co.ink}repaint()});cg.append(bt)});cs.append(cg);screen.append(cs);
      var advancedToggle=h("button","advanced-toggle","こだわり設定を開く");advancedToggle.type="button";
      advancedToggle.addEventListener("click",function(){
        var open=screen.classList.toggle("advanced-open");
        advancedToggle.textContent=open?"こだわり設定を閉じる":"こだわり設定を開く"
      });
      screen.append(advancedToggle);
      var freeCs=sec("好きな色を使う"),freeCg=h("div","custom-color-row");freeCs.classList.add("advanced-option");
      function colorField(label,prop,fallback){
        var lab=h("label","color-field");lab.append(h("span",null,label));
        var inp=document.createElement("input");inp.type="color";inp.value=draft[prop]||fallback;
        inp.addEventListener("input",function(){draft[prop]=inp.value;repaint()});lab.append(inp);return lab
      }
      freeCg.append(
        colorField("表紙", "customBg", cover(draft.color).bg),
        colorField("文字・飾り", "customAccent", "#e6c579"),
        colorField("背表紙の文字", "customInk", cover(draft.color).ink)
      );
      freeCs.append(freeCg,h("p","color-help","プリセットを土台にして、好きな色へ少しずつ変えられます。"));
      var resetColor=h("button","color-reset","プリセットの色に戻す");resetColor.type="button";
      resetColor.addEventListener("click",function(){draft.customBg="";draft.customAccent="";draft.customInk="";Array.prototype.forEach.call(freeCg.querySelectorAll('input[type="color"]'),function(inp,j){inp.value=j===0?cover(draft.color).bg:j===1?"#e6c579":cover(draft.color).ink});repaint()});
      freeCs.append(resetColor);screen.append(freeCs);
      var xs=sec("表紙の質感"),xg=h("div","design-grid");PATTERNS.forEach(function(pt,i){var bt=h("button","design-choice texture-choice");bt.type="button";bt.dataset.theme=i;bt.setAttribute("aria-label",pt.name);bt.append(h("span","texture-label",pt.name));bt.addEventListener("click",function(){draft.theme=i;repaint()});xg.append(bt)});xs.append(xg);screen.append(xs);
      var rs=sec("装丁"),rg=h("div","design-grid");rs.classList.add("advanced-option");FRAMES.forEach(function(fr,i){var bt=h("button","design-choice",fr.name);bt.type="button";bt.dataset.frame=i;bt.addEventListener("click",function(){draft.frame=i;draft.coverOrnament='none';repaint()});rg.append(bt)});rs.append(rg);screen.append(rs);
      var bs=sec("ボタンテーマ"),bg=h("div","button-theme-grid");
      BUTTON_THEMES.forEach(function(t){
        var bt=h("button","button-theme-choice",t.name);bt.type="button";bt.dataset.buttonTheme=t.key;
        bt.style.setProperty("--sample-bg",t.primary);bt.style.setProperty("--sample-ink",t.primaryInk);bt.style.setProperty("--sample-border",t.border);
        bt.addEventListener("click",function(){draft.buttonTheme=t.key;repaint()});bg.append(bt)
      });
      bs.append(bg);screen.append(bs);
      var isec=sec("アイコン"),ig=h("div","design-grid");isec.classList.add("advanced-option");BOOK_ICONS.forEach(function(ic,i){var bt=h("button","design-choice icon-choice");bt.type="button";bt.dataset.icon=i;bt.setAttribute("aria-label",ic.name);if(ic.src)bt.append(maskIcon(ic.src,"choice-icon"));else bt.textContent="—";bt.addEventListener("click",function(){draft.icon=i;repaint()});ig.append(bt)});isec.append(ig);screen.append(isec);
      var ds=sec("一覧の表示"),dg=h("div","design-grid");ds.classList.add("advanced-option");[["relaxed","ゆったり"],["normal","標準"],["compact","コンパクト"]].forEach(function(x){var bt=h("button","design-choice density-choice",x[1]);bt.type="button";bt.dataset.layout=x[0];bt.addEventListener("click",function(){draft.layout=x[0];repaint()});dg.append(bt)});ds.append(dg);screen.append(ds);
      var ns=sec("名前の表示"),ng=h("div","design-grid");ns.classList.add("advanced-option");
      [["both","名前＋漢字・別名"],["name","名前だけ"],["alt","漢字・別名を大きく"]].forEach(function(x){
        var bt=h("button","design-choice density-choice",x[1]);bt.type="button";bt.dataset.nameMode=x[0];
        bt.addEventListener("click",function(){draft.nameMode=x[0];repaint()});ng.append(bt)
      });
      ns.append(ng);screen.append(ns);

      save.addEventListener("click",function(){if(photoBusy||saving)return;if(isNew&&!ti.value.trim()){tabs.children[1].click();toast('図鑑のタイトルを入れてください。');setTimeout(function(){ti.focus()},350);return}saving=true;save.disabled=true;undo.disabled=redo.disabled=true;save.textContent="保存中…";var patch=Object.assign(coverStylePatch(draft),{
        pagePattern:draft.pagePattern||'field',pagePaper:draft.pagePaper||'ivory',pageLayout:draft.pageLayout||'folio',pagePhotoShape:draft.pagePhotoShape||'square',pageFont:draft.pageFont==null?3:draft.pageFont,pageTextSize:draft.pageTextSize||'normal',pageDate:draft.pageDate!==false,pagePlace:draft.pagePlace!==false,pageNotes:draft.pageNotes!==false,
        coverFilter:draft.coverFilter||'original',coverZoom:draft.coverZoom||100,titleEffect:draft.titleEffect||'plain',coverPhoto:draft.coverPhoto||"",coverPhotoY:draft.coverPhotoY==null?50:draft.coverPhotoY,
        title:(ti.value||"").trim()||"わたしの図鑑",subtitle:(si.value||"").trim(),font:Number(draft.font)||0,icon:Number(draft.icon)||0,
        color:Number(draft.color)||0,theme:Number(draft.theme)||0,frame:Number(draft.frame)||0,layout:draft.layout||"normal",nameMode:draft.nameMode||"both",titleSize:draft.titleSize||"medium",titleAlign:draft.titleAlign||"center",buttonTheme:draft.buttonTheme||"pink",customBg:draft.customBg||"",customAccent:draft.customAccent||"",customInk:draft.customInk||""
      });var write=Promise.resolve().then(function(){return isNew?store.createBook(patch.title,patch.color,patch.theme,patch.frame,patch):store.updateBook(bookId,patch)});
      write.then(function(book){designDirty=false;nativeHaptic("success");toast(isNew?"新しい図鑑をつくりました":"図鑑のデザインを保存しました");var id=isNew?book.id:bookId;go("#/b/"+id);if(isNew&&recordAfterCreate){var next=h('div','card');next.append(h('h2',null,'最初のページをつくろう'),h('p','l-note','「'+book.title+'」を本棚に追加しました。写真を選んで記録を続けられます。'),lButton('写真を選んで記録する',function(){startCapture(id)},'primary-pill'),lButton('あとで記録する',function(){closeSheet(true)},'secondary-pill'));setTimeout(function(){openSheet(next)},100)}},function(){saving=false;save.disabled=false;undo.disabled=historyIndex<1;redo.disabled=historyIndex>=history.length-1;save.textContent=isNew?"つくる":"保存";toast("保存できませんでした。編集内容は残っています。もう一度お試しください。")})});
      ti.setAttribute('aria-label','図鑑のタイトル');si.setAttribute('aria-label','サブタイトル');
      var tabs=h('div','editor-tools'),panes=h('div','editor-panes');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','編集ツール');panes.setAttribute('aria-label','横にスワイプして編集ツールを切り替え');
      fs.append(photoEditor.querySelector('[aria-label="タイトルの仕上げ"]').closest('label'));
      var pageSection=sec('中のページ');function pageChanged(){designDirty=true;repaint()}
      pageSection.append(makeLayoutChoices(draft,pageChanged));appendFolioOptions(pageSection,draft,pageChanged);
      var pageTypes=h('div','page-customize');[['写真のかたち','pagePhotoShape',[['square','正方形'],['portrait','縦長'],['original','写真全体を見せる']],'square'],['ページの書体','pageFont',BOOK_FONTS.map(function(f,i){return[String(i),f.name]}),'3'],['文字の大きさ','pageTextSize',[['normal','標準'],['large','大きめ']],'normal']].forEach(function(x){var lab=h('label'),select=document.createElement('select');lab.append(h('span',null,x[0]));select.setAttribute('aria-label',x[0]);x[2].forEach(function(o){var op=document.createElement('option');op.value=o[0];op.textContent=o[1];select.append(op)});select.value=draft[x[1]]==null?x[3]:draft[x[1]];select.addEventListener('change',function(){draft[x[1]]=x[1]==='pageFont'?Number(select.value):select.value;pageChanged()});lab.append(select);pageTypes.append(lab)});pageSection.append(pageTypes);
      var visibility=h('div','page-visibility');[['pageDate','日付を表示'],['pagePlace','場所を表示'],['pageNotes','観察・ストーリーを表示']].forEach(function(x){var lab=h('label'),input=document.createElement('input');input.type='checkbox';input.dataset.coverField=x[0];input.checked=draft[x[0]]!==false;input.addEventListener('change',function(){draft[x[0]]=input.checked;pageChanged()});lab.append(input,document.createTextNode(x[1]));visibility.append(lab)});pageSection.append(visibility,h('p','l-note',previewEntries.length?'上のプレビューは、あなたの最初の記録です。':'上のプレビューは見本です。記録は追加されません。'));
      function chooseRow(parent,label,key,options,fallback){var section=sec(label),row=h('div','studio-choice-row');options.forEach(function(x){var btn=lButton(x[1],function(){draft[key]=x[0];designDirty=true;repaint()},'studio-choice');btn.dataset.coverChoice=key;btn.dataset.value=String(x[0]);btn.dataset.fallback=String(fallback);row.append(btn)});section.append(row);parent.append(section)}
      function slider(parent,label,key,min,max,fallback){var lab=h('label','studio-slider'),input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.value=draft[key]==null?fallback:draft[key];input.dataset.coverField=key;input.dataset.fallback=fallback;input.setAttribute('aria-label',label);lab.append(h('span',null,label),input);input.addEventListener('input',function(){draft[key]=Number(input.value);designDirty=true;repaint()});parent.append(lab)}
      var templates=sec('一冊の世界を選ぶ'),templateRow=h('div','story-template-row');[null].concat(COVER_ARTS).forEach(function(art){var sample=Object.assign({},draft,{title:art?art.name:'わたしの図鑑',subtitle:''});setStoryCover(sample,art);sample.coverPhoto='';var btn=lButton('',function(){setStoryCover(draft,art);photoEditor._refresh();designDirty=true;repaint()},'story-template');btn.dataset.art=art?art.key:'';btn.append(makeBookFace(sample,true),h('span',null,art?art.name:'無地からつくる'));templateRow.append(btn)});templates.append(templateRow,h('p','l-note','タイトルや写真は残したまま、表紙の世界を着せ替えます。'));
      var composition=sec('写真とイラストの使い方');chooseRow(composition,'レイアウト','coverComposition',[['inset','写真を飾る'],['full','全面に広げる'],['oval','丸い窓']],'inset');chooseRow(composition,'表紙に使う画像','coverSource',[['photo','自分の写真'],['art','テンプレートの絵']],'photo');slider(composition,'背景を暗くして文字を読みやすく','coverShade',0,65,0);
      var titleStyle=sec('タイトルのデザイン');chooseRow(titleStyle,'文字の位置（全面レイアウト）','coverTitlePosition',[['top','上'],['center','中央'],['bottom','下']],'top');chooseRow(titleStyle,'タイトルの背景','coverTitleTreatment',[['plain','そのまま'],['plate','ラベルを敷く']],'plain');slider(titleStyle,'文字の間隔','coverTracking',0,18,0);
      var decorations=sec('飾りとステッカー');chooseRow(decorations,'飾り枠','coverOrnament',[['none','基本の枠'],['antique','金の飾り枠']],'none');var stickers=h('div','studio-stickers');var none=lButton('なし',function(){draft.coverSticker=0;designDirty=true;repaint()},'studio-choice');none.dataset.coverChoice='coverSticker';none.dataset.value='0';none.dataset.fallback='0';stickers.append(none);BOOK_ICONS.forEach(function(ic,i){if(!ic.src)return;var bt=lButton('',function(){draft.coverSticker=i+1;designDirty=true;repaint()},'studio-choice');bt.dataset.coverChoice='coverSticker';bt.dataset.value=String(i+1);bt.dataset.fallback='0';bt.setAttribute('aria-label',ic.name+'のステッカー');bt.append(maskIcon(ic.src,'choice-icon'));stickers.append(bt)});decorations.append(h('h3',null,'ステッカー'),stickers);chooseRow(decorations,'ステッカーの位置','coverStickerPosition',[['left','左下'],['center','中央下'],['right','右下']],'center');slider(decorations,'ステッカーの大きさ','coverStickerSize',70,140,100);
      var undo=lButton('もどす',function(){restoreStep(-1)},'studio-history-button'),redo=lButton('やりなおす',function(){restoreStep(1)},'studio-history-button'),historyBar=h('div','studio-history');undo.disabled=redo.disabled=true;undo.prepend(lIcon('undo'));redo.prepend(lIcon('redo'));historyBar.append(undo,h('span',null,'好きな組み合わせで、あなたの一冊に。'),redo);
      var toolGroups=[['template','テンプレート',[templates]],['title','タイトル',[ts,fs,titleSizeSec,titleAlignSec,titleStyle]],['color','カラー',[cs,freeCs]],['photo','写真・背景',[photoEditor,composition]],['binding','フレーム',[xs,rs,isec]],['decor','飾り',[decorations]],['theme','テーマ',[ps,bs]],['pages','ページ',[pageSection,ds,ns]]];
      toolGroups.forEach(function(tool,i){var pane=h('div','editor-pane');pane.id='editor-panel-'+tool[0];pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','editor-tab-'+tool[0]);tool[2].forEach(function(n){n.classList.remove('advanced-option');pane.append(n)});var tab=lButton(tool[1],function(){panes.scrollTo({left:panes.clientWidth*i,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})},'editor-tool');tab.prepend(lIcon(['book','type','palette','image','frame','star','sliders','book'][i]));tab.id='editor-tab-'+tool[0];tab.setAttribute('role','tab');tab.setAttribute('aria-controls',pane.id);tab.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();var j=(i+(e.key==='ArrowRight'?1:-1)+toolGroups.length)%toolGroups.length;tabs.children[j].click();tabs.children[j].focus()}});tabs.append(tab);panes.append(pane)});
      function syncTool(){var selected=Math.round(panes.scrollLeft/Math.max(1,panes.clientWidth));if(selectedTool!==selected){selectedTool=selected;paintPreview()}Array.from(tabs.children).forEach(function(tab,i){tab.setAttribute('aria-selected',String(i===selected));tab.tabIndex=i===selected?0:-1;panes.children[i].inert=i!==selected;if(i===selected){var left=tab.offsetLeft-tabs.offsetLeft;if(left<tabs.scrollLeft||left+tab.offsetWidth>tabs.scrollLeft+tabs.clientWidth)tabs.scrollTo({left:Math.max(0,left-24),behavior:'auto'})}})}
      photoEditor.querySelectorAll('input[type=range]').forEach(function(n){n.dataset.coverField=n===photoEditor.querySelector('[aria-label="表紙写真の拡大"]')?'coverZoom':'coverPhotoY';n.dataset.fallback=n.value});panes.querySelectorAll('select').forEach(function(n){var key={'写真の加工':'coverFilter','タイトルの仕上げ':'titleEffect','紙の色':'pagePaper','ページの組み方':'pagePattern','写真のかたち':'pagePhotoShape','ページの書体':'pageFont','文字の大きさ':'pageTextSize'}[n.getAttribute('aria-label')];if(key){n.dataset.coverField=key;n.dataset.fallback=n.value}});screen.addEventListener('input',function(e){if(e.target.matches('input:not([type=checkbox]):not([type=file]),textarea'))inputGroup=e.target},true);['change','focusout','pointerdown'].forEach(function(event){screen.addEventListener(event,function(){inputGroup=lastGroup=null},true)});panes.addEventListener('scroll',syncTool,{passive:true});screen.replaceChildren(head,preview,tabs,panes,historyBar);app.append(screen);repaint();syncTool();

    })
  }


  function openNewBook(options){
    if(!veil.hidden&&!closeSheet(true))return;
    go(options&&options.recordAfterCreate?'#/new/record':'#/new')
  }

  function openEntryForm(bookId,photo){
    var url=URL.createObjectURL(photo);
    var c=h("div","card");c.setAttribute("role","dialog");c.setAttribute("aria-modal","true");
    c.append(h("h2","display","コレクションに追加"));
    var img=document.createElement("img");img.className="record-sheet-photo";img.src=url;img.alt="選んだ写真";c.append(img);

    var nm=field("名前","input",{id:"new-entry-name",cls:"big",ph:"お気に入りの名前",max:24});
    var kn=field("漢字・別名（任意）","input",{id:"new-entry-kanji",ph:"蒲公英 / 宇宙飛行士 など",max:32});
    var dt=field("日付","input",{id:"new-entry-date",type:"date",value:todayISO()});
    var pl=field("見つけた・入手した場所","input",{id:"new-entry-place",ph:"公園 / お店 / 旅行先 など",max:40});
    var tg=field("タグ","input",{id:"new-entry-tags",ph:"花, 春, ピンク",max:120});
    var ob=field("見て気づいたこと（任意）","textarea",{id:"new-entry-observed",max:500});
    var im=field("思ったこと・ストーリー（任意）","textarea",{id:"new-entry-imagined",max:300});
    c.append(nm.label,kn.label,dt.label,pl.label,tg.label,h("p","tag-help","タグは自由です。レゴ、限定、旅行、推し、春など、自分が探しやすい言葉を付けられます。"),ob.label,im.label);

    var acts=h("div","acts"),save=h("button","go","コレクションに追加"),cancel=h("button",null,"やめる");
    save.type=cancel.type="button";
    c._cleanup=function(){URL.revokeObjectURL(url)};cancel.addEventListener("click",function(){closeSheet()});
    acts.append(save,cancel);c.append(acts);

    save.addEventListener("click",function(){
      var name=nm.input.value.trim();if(!name){nm.input.focus();return}
      sheetBusy=true;save.disabled=true;cancel.disabled=true;save.textContent="保存しています…";
      toBuffer(photo).then(function(buf){
        return store.addEntry(bookId,{
          id:"e-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),
          name:name,kanji:kn.input.value.trim(),date:dt.input.value||todayISO(),place:pl.input.value.trim(),
          tags:parseTags(tg.input.value),observed:ob.input.value.trim(),imagined:im.input.value.trim(),
          photoBuf:buf,photoType:photo.type||"image/jpeg",createdAt:Date.now()
        })
      }).then(function(){
        nativeHaptic("success");
        closeSheet(true);toast("記録を保存しました");render()
      })["catch"](function(err){
        sheetBusy=false;save.disabled=false;cancel.disabled=false;save.textContent="コレクションに追加";
        var w=c.querySelector(".warn")||h("div","warn");
        w.textContent=err&&err.name==="QuotaExceededError"?"この端末の保存容量がいっぱいです。":"保存できませんでした。もう一度お試しください。";
        if(!w.parentNode)c.insertBefore(w,acts)
      })
    });
    openSheet(c)
  }

  

  

  function openPrivacySheet(){
    var c=h("div","card");
    c.setAttribute("role","dialog");c.setAttribute("aria-modal","true");
    c.append(h("h2","display","プライバシー"));

    var body=h("div","privacy-copy");
    [
      ["保存場所","図鑑・写真・記録は、現行版では原則としてこの端末内に保存されます。"],
      ["写真","写真登録のために、利用者の操作時だけカメラまたは写真ライブラリを使用します。"],
      ["位置情報","GPS位置情報は自動取得しません。場所欄へ入力した文字だけを記録します。"],
      ["広告・追跡","現行版では広告SDKや広告目的のトラッキング機能を使用しません。"],
      ["バックアップ","バックアップを共有した後のファイルは、利用者が選んだ保存先・共有先で管理されます。"],
      ["決済","Web版でPRO等の決済を利用する場合はStripeの決済画面を使用します。カード番号などの完全な決済情報を本アプリ側では保存しません。購入確認のためCheckout Session ID、支払い状態、金額、通貨、購入プラン等を確認します。"],
      ["削除","記録や図鑑はアプリ内から削除できます。アプリ削除前には必要に応じてバックアップしてください。"]
    ].forEach(function(x){
      var sec=h("section","detail-note");
      sec.append(h("h3",null,x[0]),h("p",null,x[1]));
      body.append(sec)
    });
    c.append(body);

    var acts=h("div","acts"),close=h("button","go","閉じる");
    close.type="button";close.addEventListener("click",closeSheet);acts.append(close);c.append(acts);
    openSheet(c)
  }

  function openProSheet(){
    if(!canShowWebMonetization())return;
    var c=h("div","card");
    c.setAttribute("role","dialog");
    c.setAttribute("aria-modal","true");
    c.append(h("p","pro-kicker","WATASHI NO ZUKAN PRO"),h("h2","display",MONETIZATION.proName));
    if(MONETIZATION.testMode){
      var test=h("p","note","現在はStripeのテスト決済です。実際のお金は動きません。");
      test.style.color="#C77B7B";test.style.fontWeight="700";c.append(test)
    }

    var proArt=document.createElement("img");
    proArt.className="pro-hero-art";
    proArt.src="./assets/attraction/poster-memory.webp";
    proArt.alt="PROの書き出しとプレミアム機能のイラスト";
    c.append(proArt);

    var box=h("section","pro-card");
    var entitlement=getProEntitlement();
    box.append(
      h("p","note","無料版の基本機能はそのまま。もっと残す・見せるための追加機能です。"),
      h("div","pro-price",entitlement?"PRO 有効":MONETIZATION.proPriceLabel)
    );

    var ul=h("ul","pro-features");
    MONETIZATION.features.forEach(function(x){ul.append(h("li",null,x))});
    box.append(ul);

    if(!entitlement){
      var buy=h("button","pro-buy","PROを購入する");
      buy.type="button";
      buy.addEventListener("click",function(){
        if(!openExternalPurchase(MONETIZATION.proCheckoutUrl)){
          buy.textContent="決済準備中";
          buy.disabled=true
        }
      });
      box.append(buy,h("p","pro-note","購入画面はStripeの安全な決済ページで開きます。App Store版では別の購入方式を使用します。"))
    }else{
      box.append(h("p","pro-note","この端末ではPRO購入が確認済みです。"))
    }
    c.append(box);

    if(MONETIZATION.supporterEnabled&&Array.isArray(MONETIZATION.supporterOptions)){
      var supportTitle=h("p","note","機能購入とは別に、開発を応援できます。");
      c.append(supportTitle);
      var acts2=h("div","acts");
      MONETIZATION.supporterOptions.forEach(function(opt){
        var support=h("button",null,opt.label);
        support.type="button";
        support.addEventListener("click",function(){openExternalPurchase(opt.url)});
        acts2.append(support)
      });
      c.append(acts2)
    }

    var acts=h("div","acts"),close=h("button",null,"閉じる");
    close.type="button";close.addEventListener("click",closeSheet);acts.append(close);c.append(acts);
    openSheet(c)
  }

  function handlePaymentReturn(){
    var params=new URLSearchParams(location.search||"");
    var purchase=params.get("purchase");
    var support=params.get("support");
    if(purchase==="success"){
      var sid=params.get("session_id")||"";
      try{if(sid)localStorage.setItem("wz_pending_checkout_session",sid)}catch(e){}
      history.replaceState(null,"",location.pathname+location.hash);
      setTimeout(function(){
        var c=h("div","card");
        c.setAttribute("role","dialog");c.setAttribute("aria-modal","true");
        c.append(h("h2","display","購入を確認しています"),h("p","note","Stripeの支払い情報を安全に確認しています。"));
        var status=h("p","note","確認中…");c.append(status);
        var close=h("button","go","閉じる");close.type="button";close.disabled=true;close.addEventListener("click",closeSheet);c.append(close);
        openSheet(c);
        verifyProPurchase(sid).then(function(){
          status.textContent="支払いを確認しました。PROが有効になりました。";
          close.disabled=false;
          nativeHaptic("success")
        })["catch"](function(){
          status.textContent="購入確認を完了できませんでした。少し時間をおいてもう一度開いてください。";
          close.disabled=false
        })
      },350)
    }else if(support==="thanks"){
      history.replaceState(null,"",location.pathname+location.hash);
      setTimeout(function(){
        var c=h("div","card");
        c.setAttribute("role","dialog");c.setAttribute("aria-modal","true");
        c.append(h("h2","display","ありがとうございます"),h("p","note","開発サポートのテスト決済が完了しました。"));
        var close=h("button","go","閉じる");close.type="button";close.addEventListener("click",closeSheet);
        c.append(close);openSheet(c)
      },350)
    }
  }

  function openSupportSheet(){
    var c=h("div","card");
    c.setAttribute("role","dialog");c.setAttribute("aria-modal","true");
    c.append(h("h2","display","サポート"));
    c.append(h("p","note","不具合のご連絡では、iPhoneの機種、iOSのバージョン、起きた画面、操作内容があると確認しやすくなります。"));
    var mail=document.createElement("a");
    mail.className="primary-pill support-mail";
    mail.href="mailto:suganotatsuki@gmail.com?subject="+encodeURIComponent("わたしの図鑑 サポート");
    mail.textContent="メールで問い合わせる";
    c.append(mail);
    var acts=h("div","acts"),close=h("button",null,"閉じる");
    close.type="button";close.addEventListener("click",closeSheet);acts.append(close);c.append(acts);
    openSheet(c)
  }

  function renderSettings(){
    renderAppNav("settings");app.replaceChildren();app.append(lHeader("わたしの書斎","つくる時間も、集める楽しさも。"));
    var head=h("div","screen-head"),copy=h("div");copy.append(h("h1",null,"わたしの制作机"),h("p",null,"個人の図鑑と、共同編集の管理"));head.append(copy);app.append(head);
    var list=h("div","settings-list");
    function row(title,desc,label,fn){
      var r=h("div","settings-row"),c=h("div");c.append(h("strong",null,title),h("small",null,desc));var b=h("button",null,label);b.type="button";b.addEventListener("click",fn);r.append(c,b);list.append(r)
    }
    row("マイ図鑑","個人の図鑑をつくる・編集する","開く",function(){go("#/collections")});
    row("共同編集","招待した人と図鑑をつくる","開く",function(){go("#/groups")});
    row("公開図書館","作品の公開と共有","開く",function(){go("#/library")});
    row("ふりかえり","月ごとの発見からフォトカードをつくる","開く",function(){go("#/memories")});
    row("バックアップ","図鑑・記録・写真をJSONに保存","保存",function(){exportBackup()});
    row("ホーム画面に追加","アプリのようにすぐ開けます","手順",showInstallHelp);
    row("復元","バックアップを追加として読み込む","選ぶ",chooseRestoreFile);
    row("保存状態","この端末の保存状況を確認","確認",function(){go("#/storage")});
    if(canShowWebMonetization()){
      var proEntitlement=getProEntitlement();
      row("PRO","PDF書き出し・限定テーマなどの追加機能",proEntitlement?"有効":MONETIZATION.proPriceLabel,openProSheet)
    }
    row("プライバシー","保存する情報と端末内データについて","見る",openPrivacySheet);
    row("サポート","使い方や不具合について問い合わせ","開く",openSupportSheet);
    app.append(list,h("p","l-note","v37 · 記録はこの端末内に保存されます。"),h("div","app-nav-spacer"))
  }

  /* Library UI v23. Storage APIs and all existing native integrations remain unchanged. */
  var lBookMode="all";
  function lIcon(name){
    var paths={home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',book:'<path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',plus:'<path d="M12 4v16M4 12h16"/>',search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 6 6"/>',compass:'<circle cx="12" cy="12" r="10"/><path d="m16 8-3 5-5 3 3-5Z"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 9 0 0 1 18 0v3Z"/>',bookmark:'<path d="M6 3h12v19l-6-4-6 4Z"/>',back:'<path d="m15 3-9 9 9 9"/>'};
    Object.assign(paths,{camera:'<path d="M8 5 9.5 3h5L16 5h4a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="4"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',heart:'<path d="M20 5c-2-2-5-2-8 1-3-3-6-3-8-1-5 5 2 11 8 15 6-4 13-10 8-15Z"/>',share:'<path d="M12 15V3m-4 4 4-4 4 4M5 12v9h14v-9"/>',edit:'<path d="m15 4 5 5M4 15 16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L9 20l-6 1Z"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',sliders:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',undo:'<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',redo:'<path d="m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12h3"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',palette:'<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-4-5-6-9-6Z"/><path d="M7 8h.01M12 6h.01M6 13h.01M16 8h.01"/>',type:'<path d="M4 6V3h16v3M12 3v18M8 21h8"/>',frame:'<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="6" y="6" width="12" height="12" rx="1"/>',star:'<path d="m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1Z"/>'});
    var wrap=document.createElement('span');wrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.book)+'</svg>';return wrap.firstChild
  }
  function lButton(text,fn,cls){var b=h('button',cls||'',text);b.type='button';b.addEventListener('click',fn);return b}
  function lHeader(title,subtitle){var n=h('header','l-header'),bar=h('div','l-brand'),logo=lIcon('book');logo.classList.add('l-logo');bar.append(logo);var search=lButton('',function(){go('#/search')},'icon-button');search.setAttribute('aria-label','図鑑や記録を検索');search.append(lIcon('search'));bar.append(search);bar.append(h('span','demo-label','この端末に保存'));n.append(bar,h('h1',null,title),h('p',null,subtitle));return n}
  function lFeature(title,action){var b=lButton('',action,'l-feature'),img=document.createElement('img');img.src='./assets/library/botanical.png';img.alt='図書館のテーブルに広げた植物図鑑';b.append(img,h('span','l-badge','小さな発見のヒント'),h('h2',null,title),h('p',null,'足もとに広がる、小さな季節の図鑑。'),h('span','l-feature-action','見つけにいこう →'));return b}
  function lSection(title,link,label){var sec=h('section','l-section'),head=h('div','l-section-head');head.append(h('h2',null,title));if(link){var a=h('a',null,label||'すべて見る →');a.href=link;head.append(a)}sec.append(head);return sec}
  function lGroups(){return store.books().then(function(bs){return Promise.all(bs.map(function(b){return store.entries(b.id).then(function(es){return{book:b,entries:es}})}))})}
  function lRecordCard(b,e){var card=h('article','l-card'),open=lButton('',function(){go('#/b/'+b.id+'/e/'+e.no)},'l-card-open'),img=document.createElement('img');img.className='l-card-photo';img.src=urlFor(e);img.alt=e.name||'記録写真';img.loading='lazy';var copy=h('div','l-card-copy');copy.append(h('span','l-card-title',displayNames(b,e).main),h('small',null,showDate(e.date)),h('span','tag-pill',e.tags&&e.tags[0]||b.title));open.append(img,copy);card.append(open);return card}
  function lBookCard(g){var b=g.book,card=h('article','l-card'),open=lButton('',function(){go('#/b/'+b.id+'/list')},'l-card-open');if(g.entries.length){var img=document.createElement('img');img.src=urlFor(g.entries[g.entries.length-1]);img.alt=b.title;img.className='l-card-photo';open.append(img)}else{var thumb=h('div','l-book-cover-thumb');thumb.append(makeBookFace(b,true));open.append(thumb)}var copy=h('div','l-card-copy');copy.append(h('span','l-card-title',b.title),h('small',null,(b.count||0)+'件の記録'),h('p',null,b.subtitle||'好きなものを、少しずつ。'));open.append(copy);var fav=lButton('',function(){fav.disabled=true;store.updateBook(b.id,{favorite:!b.favorite}).then(render,function(){fav.disabled=false})},'bookmark');fav.setAttribute('aria-label',b.favorite?'図鑑のお気に入りを外す':'図鑑をお気に入りに追加');fav.setAttribute('aria-pressed',String(!!b.favorite));fav.append(lIcon('bookmark'));card.append(open,fav);return card}
  function renderAppNav(active){if(active==='collections')active='home';var old=document.getElementById('app-nav');if(old)old.remove();var n=h('nav','app-nav');n.id='app-nav';n.setAttribute('aria-label','メインメニュー');[['home','book','本棚','#/'],['record','plus','記録する',null],['search','compass','公開図書館','#/library'],['settings','user','書斎','#/settings']].forEach(function(x){var b=lButton('',function(){if(x[0]==='record')openRecordPicker();else go(x[3])},x[0]===active?'active':'');if(x[0]===active)b.setAttribute('aria-current','page');var icon=lIcon(x[1]);if(x[0]==='record'){var circle=h('span','record-circle');circle.append(icon);b.append(circle)}else b.append(icon);b.append(h('span',null,x[2]));n.append(b)});document.body.append(n)}
  function openRecordPicker(){return store.books().then(function(bs){var c=h('div','card record-picker');c.setAttribute('role','dialog');c.setAttribute('aria-modal','true');c.append(h('h2',null,'発見を、どの一冊に？'),h('p','l-note','今ある図鑑に記録するか、新しい図鑑から始められます。'),lButton('新しい図鑑をつくって記録',function(){openNewBook({recordAfterCreate:true})},'primary-pill'));var list=h('div','l-chooser');bs.forEach(function(b){list.append(lButton(b.title,function(){startCapture(b.id)}))});c.append(list,lButton('閉じる',closeSheet,'secondary-pill'));openSheet(c)})}
  function lEmpty(title,copy,action,label){var e=h('div','l-empty');e.append(h('h3',null,title),h('p',null,copy));if(action)e.append(lButton(label||'図鑑をつくる',action,'primary-pill'));return e}


  function makeMyLibrary(books){
    var root=h('section','my-bookshelf focus-bookshelf scroll-bookshelf motion-bookshelf');root.setAttribute('aria-label','横スクロールの本棚');
    if(!books.length){root.append(lEmpty('あなたの一冊を、本棚に。','タイトル、表紙、中のページ。好きな組み合わせで図鑑をつくりましょう。',openNewBook,'図鑑をつくる'));return root}
    var id='';try{id=localStorage.getItem('zukan-selected-book')||''}catch(_){}var selected=Math.max(0,books.findIndex(function(b){return b.id===id})),step=68,coverWidth=160,depth=44,gap=24,frame=0,drag=null,blocked=0,requested=null;
    var stage=h('div','focus-shelf-stage'),rail=h('div','focus-shelf-rail'),track=h('div','shelf-scroll-track'),layer=h('div','shelf-motion-layer'),info=h('div','focus-shelf-info'),controls=h('div','focus-shelf-controls'),counter=h('span','l-note');rail.tabIndex=0;rail.setAttribute('aria-label','左右にスクロールして図鑑を選ぶ');counter.setAttribute('role','status');
    var previous=lButton('',function(){choose((requested==null?selected:requested)-1,true)},'round-btn'),next=lButton('',function(){choose((requested==null?selected:requested)+1,true)},'round-btn');previous.append(lIcon('back'));var arrow=lIcon('back');arrow.style.transform='rotate(180deg)';next.append(arrow);previous.setAttribute('aria-label','前の図鑑を選ぶ');next.setAttribute('aria-label','次の図鑑を選ぶ');controls.append(previous,counter,next);track.append(layer);rail.append(track);stage.append(rail);root.append(h('p','shelf-instruction','左右にスクロールして選ぶ · 中央の表紙でひらく'),stage,controls,info);
    var volumes=books.map(function(b,i){var node=lButton('',function(){if(Date.now()<blocked)return;if(Math.abs(rail.scrollLeft/step-i)<.04)go('#/b/'+b.id+'/list');else choose(i,true)},'shelf-volume'),model=h('span','shelf-book-model'),spine=h('span','volume-spine');node.dataset.bookId=b.id;styleBookNode(spine,b);spine.append(h('span','spine-title',b.title),h('span','spine-count',String(b.count||0)));styleBookNode(model,b);model.append(makeBookFace(b,false),spine);['back','fore','top','bottom'].forEach(function(side){var surface=h('span','book-solid-'+side);surface.setAttribute('aria-hidden','true');model.append(surface)});node.append(model);layer.append(node);var snap=h('span','shelf-snap');snap.setAttribute('aria-hidden','true');track.append(snap);return{node:node,model:model,snap:snap}});
    function describe(){var b=books[selected];counter.textContent=(selected+1)+' / '+books.length+'冊';previous.disabled=selected===0;next.disabled=selected===books.length-1;volumes.forEach(function(v,i){v.node.setAttribute('aria-label',books[i].title+(i===selected?'をひらく':'を選ぶ'));v.node.setAttribute('aria-current',String(i===selected));v.node.tabIndex=i===selected?0:-1;v.node.classList.toggle('is-selected',i===selected);v.node.classList.toggle('shelf-cover-open',i===selected)});try{localStorage.setItem('zukan-selected-book',b.id)}catch(_){}info.replaceChildren(h('h3',null,b.title),h('p','l-note',(b.count||0)+'件の記録'+(b.subtitle?' · '+b.subtitle:'')));var actions=h('div','shelf-book-actions');actions.append(lButton('この本をひらく',function(){go('#/b/'+b.id+'/list')},'primary-pill'),lButton('図鑑を編集',function(){go('#/b/'+b.id+'/design')},'secondary-pill'),lButton('中のページを編集',function(){openPageLayout(b.id)},'secondary-pill'));info.append(actions)}
    function paint(){frame=0;if(!rail.isConnected)return;var p=Math.max(0,Math.min(books.length-1,rail.scrollLeft/step)),lo=Math.floor(p),t=p-lo,centers=[],widths=[],angles=[],opens=[],cursor=0;
      books.forEach(function(_,i){var proximity=Math.max(0,1-Math.abs(i-p)),open=(1-Math.cos(Math.PI*proximity))/2,angle=(1-open)*Math.PI/2,width=coverWidth*Math.cos(angle)+depth*Math.sin(angle);angles[i]=angle;opens[i]=open;widths[i]=width;centers[i]=cursor+width/2;cursor+=width+gap});var origin=centers[lo]*(1-t)+(centers[Math.min(lo+1,books.length-1)]||centers[lo])*t;
      volumes.forEach(function(v,i){var x=rail.clientWidth/2+centers[i]-origin,w=widths[i],visible=x+w> -80&&x-w<rail.clientWidth+80;v.node.style.visibility=visible?'visible':'hidden';if(!visible)return;v.node.style.width=w+'px';v.node.style.left=(x-w/2)+'px';v.node.style.bottom=(38+opens[i]*7)+'px';var centerOffset=coverWidth*Math.cos(angles[i])/2;v.model.style.transform='translateX('+(-centerOffset)+'px) rotateY('+(angles[i]*180/Math.PI)+'deg)';v.node.style.zIndex=String(10+Math.round(opens[i]*10));v.node.dataset.openness=opens[i].toFixed(4)});
      stage.style.backgroundPosition=(-rail.scrollLeft*.45)+'px center';var nearest=Math.round(p);if(nearest!==selected){selected=nearest;describe()}}
    function schedule(){if(!frame)frame=requestAnimationFrame(paint)}
    function choose(index,focus){if(index<0||index>=books.length)return;requested=index;rail.scrollTo({left:index*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});if(focus)rail.focus({preventScroll:true});schedule()}
    function measure(){if(!root.isConnected){observer.disconnect();cancelAnimationFrame(frame);return}var progress=rail.scrollLeft/step,style=getComputedStyle(root);coverWidth=parseFloat(style.getPropertyValue('--shelf-cover-width'))||160;depth=parseFloat(style.getPropertyValue('--shelf-spine-width'))||44;gap=parseFloat(style.getPropertyValue('--shelf-scroll-gap'))||24;step=depth+gap;track.style.width=(rail.clientWidth+(books.length-1)*step)+'px';layer.style.width=rail.clientWidth+'px';root.style.setProperty('--motion-cover-width',coverWidth+'px');root.style.setProperty('--motion-depth',depth+'px');volumes.forEach(function(v,i){v.snap.style.left=(rail.clientWidth/2+i*step-.5)+'px'});rail.scrollTo({left:progress*step,behavior:'instant'});paint()}
    rail.addEventListener('scroll',schedule,{passive:true});rail.addEventListener('scrollend',function(){requested=null;paint()});rail.addEventListener('pointerdown',function(e){requested=null;if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,left:rail.scrollLeft,moved:false}});rail.addEventListener('pointermove',function(e){if(!drag)return;var dx=e.clientX-drag.x;if(Math.abs(dx)>5){if(!drag.moved){rail.setPointerCapture(e.pointerId);rail.classList.add('is-dragging')}drag.moved=true;rail.scrollLeft=drag.left-dx}});function endDrag(){if(!drag)return;var moved=drag.moved;drag=null;rail.classList.remove('is-dragging');if(moved){blocked=Date.now()+450;choose(Math.round(rail.scrollLeft/step),false)}}rail.addEventListener('pointerup',endDrag);rail.addEventListener('pointercancel',endDrag);rail.addEventListener('click',function(e){if(Date.now()<blocked){e.preventDefault();e.stopPropagation()}},true);
    rail.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();choose(e.key==='Home'?0:e.key==='End'?books.length-1:(requested==null?selected:requested)+(e.key==='ArrowRight'?1:-1),true)}});var observer=new ResizeObserver(measure),initialIndex=selected;describe();requestAnimationFrame(function(){measure();rail.scrollTo({left:initialIndex*step,behavior:'instant'});paint();observer.observe(rail)});return root
  }
  function renderShelf(){return lGroups().then(function(groups){
    app.replaceChildren();renderAppNav('home');app.append(lHeader('わたしの図鑑','好きが、わたしをつくっていく。'));
    var panel=h('main','l-panel my-library-home'),library=lSection('Myライブラリ');
    var seg=h('div','l-segment');[['all','すべて'],['fav','お気に入り'],['recent','最近']].forEach(function(x){var bt=lButton(x[1],function(){lBookMode=x[0];render()},'filter-chip'+(lBookMode===x[0]?' active':''));bt.setAttribute('aria-pressed',String(lBookMode===x[0]));seg.append(bt)});library.append(seg);
    var filtered=groups.slice();if(lBookMode==='fav')filtered=filtered.filter(function(g){return g.book.favorite});if(lBookMode==='recent')filtered.sort(function(a,b){return(b.book.createdAt||0)-(a.book.createdAt||0)});
    var toolbar=h('div','my-library-toolbar');toolbar.append(h('p','l-note',groups.length+'冊の、わたしだけの世界。'),lButton('新しい図鑑',openNewBook,'secondary-pill'));
    library.append(toolbar,filtered.length||lBookMode!=='fav'?makeMyLibrary(filtered.map(function(g){return g.book})):lEmpty('お気に入りの図鑑はまだありません','図鑑を開いて、お気に入りに追加できます。'));panel.append(library);
    var recent=lSection('最近の記録','#/search'),records=[];groups.forEach(function(g){g.entries.forEach(function(e){records.push({book:g.book,entry:e})})});records.sort(function(a,b){return(b.entry.createdAt||0)-(a.entry.createdAt||0)});
    if(records.length){var row=h('div','l-scroll');records.slice(0,8).forEach(function(x){row.append(lRecordCard(x.book,x.entry))});recent.append(row)}else recent.append(lEmpty('小さな発見を記録しよう','写真一枚から、図鑑のページが増えていきます。',openRecordPicker,'記録する'));
    appendMemoryHome(panel,groups);panel.append(recent,lFeature('身近な好きに、\n出会おう。',function(){go('#/search')}));app.append(panel)
  })}
  function renderCollections(){return renderShelf()}

  var lDiscoverCategory='すべて',lDiscoverQuery='';
  function searchText(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-96)})}
  function matchesSearch(hay,query){return searchText(query).trim().split(/\s+/).every(function(word){return searchText(hay).indexOf(word)>=0})}
  function confirmDelete(title,message,action){var c=h('div','card');c.append(h('h2',null,title),h('p',null,message));var acts=h('div','acts'),cancel=lButton('やめる',closeSheet),del=lButton('削除する',function(){sheetBusy=true;del.disabled=true;cancel.disabled=true;Promise.resolve().then(action).then(function(){closeSheet(true);toast('削除しました')},function(){sheetBusy=false;del.disabled=false;cancel.disabled=false;error.textContent='削除できませんでした。もう一度お試しください。'})},'danger-button'),error=h('p','l-error');error.setAttribute('role','status');acts.append(cancel,del);c.append(acts,error);openSheet(c)}
  function renderGlobalSearch(){return lGroups().then(function(groups){app.replaceChildren();renderAppNav('search');app.append(lHeader('発見する','まだ知らない、すてきな世界に出会おう。'));var panel=h('main','l-panel'),box=h('label','global-search'),input=document.createElement('input');input.type='search';input.value=lDiscoverQuery;input.placeholder='キーワードで図鑑・記録を検索';input.setAttribute('aria-label','図鑑・記録を検索');box.append(lIcon('search'),input);panel.append(box);var cats=h('div','l-categories');['すべて','植物','動物','空・天気','暮らし','場所','その他'].forEach(function(x){var b=lButton(x,function(){lDiscoverCategory=x;Array.from(cats.children).forEach(function(n){n.classList.toggle('active',n.textContent===x);n.setAttribute('aria-pressed',String(n.textContent===x))});draw()},x===lDiscoverCategory?'active':'');b.setAttribute('aria-pressed',String(x===lDiscoverCategory));cats.append(b)});panel.append(cats);var categoryPhotos=h('div','category-photo-grid');[['植物','blossom.png'],['動物','bird.webp'],['空・天気','sky.webp'],['暮らし','botanical.png'],['場所','library.jpg.png'],['その他','treasures.webp']].forEach(function(x){var bt=lButton('',function(){lDiscoverCategory=x[0];draw();sec.scrollIntoView({block:'start',behavior:'smooth'})},'category-photo'),img=document.createElement('img');img.src='./assets/library/'+x[1];img.alt='';img.loading='lazy';bt.dataset.category=x[0];bt.setAttribute('aria-pressed',String(x[0]===lDiscoverCategory));bt.append(img,h('span',null,x[0]));categoryPhotos.append(bt)});panel.append(categoryPhotos);var feat=lFeature('身近なふしぎを\n見つけよう。',function(){showPrompt('今日の発見','身のまわりの草花や葉っぱを、いつもより近くで見てみましょう。色、形、手ざわり。どんな違いが見つかるかな？')});panel.append(feat);var sec=lSection('あなたの発見'),status=h('p','l-result-count'),results=h('div','l-grid');status.setAttribute('role','status');sec.append(status,results);panel.append(sec);var hints=lSection('次に見つけたいもの');hints.append(h('p','l-samples-label','記録のヒント'));var hg=h('div','l-grid');[['植物','草花のかたち','blossom.png'],['暮らし','お気に入りの時間','botanical.png'],['場所','本のある風景','library.jpg.png'],['動物','小さな生きもの','bird.webp'],['空・天気','今日の空の色','sky.webp'],['その他','小さなたからもの','treasures.webp']].forEach(function(x){var c=lButton('',function(){showPrompt(x[1],x[0]==='植物'?'気になる花を一枚。花びらの色や葉っぱの形も一緒に残してみよう。':x[0]==='動物'?'少し離れて、そっと観察。姿や動き、聞こえた声も残してみよう。':x[0]==='空・天気'?'見上げた空を一枚。雲の形や色、感じたことを記録してみよう。':x[0]==='その他'?'気になる小さなものを集めて、あなただけのたからもの図鑑をつくろう。':x[0]==='暮らし'?'いつもの時間にある小さな好き。写真と言葉で残してみよう。':'好きな場所の光や雰囲気を、あなたの言葉で記録してみよう。')},'l-card');var img=document.createElement('img');img.src='./assets/library/'+x[2];img.className='l-card-photo';img.alt=x[1];var cp=h('div','l-card-copy');cp.append(h('span','l-card-title',x[1]),h('span','tag-pill',x[0]));c.append(img,cp);hg.append(c)});hints.append(hg);panel.append(hints);app.append(panel);
    function draw(){Array.from(cats.children).forEach(function(n){n.classList.toggle('active',n.textContent===lDiscoverCategory);n.setAttribute('aria-pressed',String(n.textContent===lDiscoverCategory))});Array.from(categoryPhotos.children).forEach(function(n){n.setAttribute('aria-pressed',String(n.dataset.category===lDiscoverCategory))});lDiscoverQuery=input.value;var q=input.value.trim(),all=[];groups.forEach(function(g){g.entries.forEach(function(e){all.push({book:g.book,entry:e})})});var words={'植物':/花|草|植物|葉|木|桜|サクラ/,'動物':/動物|猫|ねこ|犬|鳥|虫|いきもの/,'空・天気':/空|雲|雨|天気|星|夕焼け/,'暮らし':/暮らし|カフェ|小物|食|本|ぬいぐるみ/,'場所':/旅|場所|街|景色|公園/};var hits=all.filter(function(x){var e=x.entry,hay=[e.name,e.kanji,e.place,(e.tags||[]).join(' '),x.book.title,e.observed,e.imagined].join(' ').toLowerCase();return matchesSearch(hay,q)&&(lDiscoverCategory==='すべて'||(words[lDiscoverCategory]?words[lDiscoverCategory].test(hay):!Object.keys(words).some(function(k){return words[k].test(hay)})))});results.replaceChildren();hits.sort(function(a,b){return(b.entry.createdAt||0)-(a.entry.createdAt||0)}).forEach(function(x){results.append(lRecordCard(x.book,x.entry))});status.textContent=hits.length+'件の記録';if(!hits.length){results.style.display='block';results.append(lEmpty('記録が見つかりません','キーワードやカテゴリを変えるか、新しい発見を記録しましょう。'))}else results.style.display='';feat.hidden=!!q;hints.hidden=!!q}input.addEventListener('input',draw);draw()})}
  function showPrompt(title,copy){var c=h('div','card');c.setAttribute('role','dialog');c.setAttribute('aria-modal','true');c.append(h('h2',null,title),h('p',null,copy));var acts=h('div','acts');acts.append(lButton('記録する',openRecordPicker,'go'),lButton('閉じる',closeSheet));c.append(acts);openSheet(c)}
  function appendRelated(screen,b,e,list){var related=list.filter(function(x){return x.id!==e.id}).slice(-6);if(!related.length)return;var sec=lSection('関連の記録','#/b/'+b.id+'/list'),row=h('div','l-scroll');related.forEach(function(x){row.append(lRecordCard(b,x))});sec.append(row);screen.append(sec)}
  function appendComments(screen,e){var sec=h('section','l-comments');sec.append(h('h2',null,'コメント'),h('p','l-note','この端末に保存される、あなたのコメントです。'));var list=h('div');(e.comments||[]).forEach(function(c){var row=h('div','l-comment');row.append(h('small',null,'わたし　'+showDate(c.date)),h('p',null,c.text));list.append(row)});sec.append(list);var form=h('form','l-comment-form'),input=document.createElement('input'),send=h('button','go','残す'),error=h('p','l-error');error.setAttribute('role','status');input.placeholder='コメントをのこす…';input.setAttribute('aria-label','コメント');input.maxLength=500;input.required=true;send.type='submit';form.append(input,send);form.addEventListener('submit',function(ev){ev.preventDefault();var text=input.value.trim();if(!text)return;send.disabled=true;var next=Object.assign({},e,{comments:(e.comments||[]).concat([{text:text,date:todayISO(),createdAt:Date.now()}])});store.updateEntry(next).then(render,function(){send.disabled=false;error.textContent='保存できませんでした。もう一度お試しください。'})});sec.append(form,error);screen.append(sec)}


  function seedDemo(){
    return store.books().then(function(bs){
      if(bs.length||localStorage.getItem("zukan-demo-seeded"))return;
      return Promise.all(["blossom.png","botanical.png","library.jpg.png"].map(function(n){return fetch("./assets/library/"+n).then(function(r){if(!r.ok)throw new Error("image");return r.arrayBuffer()})})).then(function(images){
        var tx=db.transaction(["books","entries"],"readwrite"),books=tx.objectStore("books"),entries=tx.objectStore("entries");
        ["草花の図鑑","暮らしの図鑑","旅と風景の図鑑"].forEach(function(title,i){books.put({id:"demo-"+i,title:title,subtitle:["季節のかけらを集めて。","日々の、小さな好き。","心に残る場所。 "][i],color:[12,13,14][i],theme:5,frame:1,font:1,icon:[0,6,10][i],buttonTheme:"gold",count:2,nextNo:3,createdAt:100+i,favorite:i===0});for(var j=0;j<2;j++){entries.put({id:"demo-e-"+i+"-"+j,bookId:"demo-"+i,no:j+1,name:[["ソメイヨシノ","春のひかり"],["お気に入りの時間","植物図鑑をひらいて"],["本のある風景","静かな図書館"]][i][j],date:"2026-04-0"+(j+1),place:["散歩道の公園","自宅","旅先の図書館"][i],tags:[["植物","春"],["暮らし","本"],["場所","図書館"]][i],observed:["淡いピンクの花びら。光を透かすと、とてもきれい。","好きな本をひらいて、ひと息つく時間。","窓から入る光と、本に囲まれる静けさが好き。"][i],imagined:"サンプルの記録です。編集して試してみてください。",photoBuf:images[i],photoType:"image/png",createdAt:1000+i*10+j,favorite:j===0})}});
        return done(tx).then(function(){localStorage.setItem("zukan-demo-seeded","1")})
      })
    }).catch(function(){})
  }


function toast(message){var old=document.getElementById('app-toast');if(old)old.remove();var node=h('div','app-toast',message);node.id='app-toast';node.setAttribute('role','status');document.body.append(node);setTimeout(function(){node.remove()},4500)}

function showError(title,message){var c=h('div','card');c.append(h('h2',null,title),h('p','note',message),lButton('閉じる',closeSheet,'go'));openSheet(c)}

function hasUnsavedChanges(){return sheetDirty||designDirty}

function showShareText(title,text){var c=h('div','card'),area=document.createElement('textarea');area.value=title+'\n'+text;area.readOnly=true;area.setAttribute('aria-label','共有する文章');c.append(h('h2',null,'記録を共有'),h('p','note','文章を選択してコピーできます。'),area,lButton('閉じる',closeSheet,'go'));openSheet(c);area.select()}

function validateBackup(data){
    function invalid(){throw new Error('バックアップの内容を確認できませんでした。元のファイルを選び直してください。')}
    if(!data||data.type!=='mitsuketa-zukan-backup'||data.version!==1||!Array.isArray(data.books)||!Array.isArray(data.entries)||data.books.length>2000||data.entries.length>20000)invalid();
    var ids=new Set(),entryIds=new Set(),numbers=Object.create(null);
    var bookKeys=COVER_STYLE_KEYS.concat(['title','subtitle','color','theme','frame','font','icon','layout','pageLayout','pageDate','pagePlace','pageNotes','pagePattern','pagePaper','coverFilter','coverZoom','titleEffect','pagePhotoShape','pageFont','pageTextSize','coverPhoto','coverPhotoY','nameMode','titleSize','titleAlign','buttonTheme','customBg','customAccent','customInk','favorite','createdAt']);
    var books=data.books.map(function(b){if(!b||typeof b.id!=='string'||!b.id||ids.has(b.id)||typeof b.title!=='string'||!b.title.trim())invalid();ids.add(b.id);numbers[b.id]=new Set();var out={id:b.id};bookKeys.forEach(function(k){if(b[k]!==undefined){if(typeof b[k]==='object')invalid();out[k]=b[k]}});['color','theme','frame','font','icon'].forEach(function(k){if(out[k]!==undefined&&(!Number.isInteger(out[k])||out[k]<0))invalid()});['customBg','customAccent','customInk'].forEach(function(k){if(out[k]&&!/^#[0-9a-f]{6}$/i.test(out[k]))invalid()});if(out.coverPhoto!==undefined&&(typeof out.coverPhoto!=="string"||out.coverPhoto.length>2000000||(out.coverPhoto&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(out.coverPhoto))))invalid();if(out.coverPhotoY!==undefined&&(!Number.isFinite(out.coverPhotoY)||out.coverPhotoY<0||out.coverPhotoY>100))invalid();Object.entries({coverArt:['','starlight','woodland','ocean'],coverSource:['photo','art'],coverComposition:['inset','full','oval'],coverOrnament:['none','antique'],coverTitlePosition:['top','center','bottom'],coverTitleTreatment:['plain','plate'],coverStickerPosition:['left','center','right']}).forEach(function(x){if(out[x[0]]!==undefined&&!x[1].includes(out[x[0]]))invalid()});[['coverShade',0,65],['coverTracking',0,18],['coverSticker',0,20],['coverStickerSize',70,140]].forEach(function(x){if(out[x[0]]!==undefined&&(!Number.isFinite(out[x[0]])||out[x[0]]<x[1]||out[x[0]]>x[2]))invalid()});out.count=0;out.nextNo=1;return out});
    var map=new Map(books.map(function(b){return[b.id,b]}));
    var entries=data.entries.map(function(e){if(!e||typeof e.id!=='string'||entryIds.has(e.id)||!ids.has(e.bookId)||!Number.isInteger(e.no)||e.no<1||numbers[e.bookId].has(e.no)||typeof e.name!=='string'||!e.name.trim())invalid();entryIds.add(e.id);numbers[e.bookId].add(e.no);
      var out={id:e.id,bookId:e.bookId,no:e.no};['name','kanji','date','place','observed','imagined','photoType'].forEach(function(k){if(e[k]!==undefined&&typeof e[k]!=='string')invalid();if(e[k]!==undefined)out[k]=e[k]});
      if(e.tags!==undefined&&(!Array.isArray(e.tags)||e.tags.some(function(t){return typeof t!=='string'})))invalid();out.tags=e.tags||[];if(e.answers!==undefined){if(!e.answers||Array.isArray(e.answers)||typeof e.answers!=='object')invalid();out.answers=Object.create(null);Object.keys(e.answers).forEach(function(k){if(!Array.isArray(e.answers[k])||e.answers[k].some(function(v){return typeof v!=='string'}))invalid();out.answers[k]=e.answers[k].slice()})}out.favorite=!!e.favorite;out.createdAt=Number(e.createdAt)||0;
      if(e.comments!==undefined&&(!Array.isArray(e.comments)||e.comments.some(function(c){return !c||typeof c.text!=='string'||typeof c.date!=='string'})))invalid();out.comments=(e.comments||[]).map(function(c){return{text:c.text,date:c.date,createdAt:Number(c.createdAt)||0}});
      if(typeof e.photoBase64!=='string'||!e.photoBase64||e.photoBase64.length>56000000||!/^[-A-Za-z0-9+/]*={0,2}$/.test(e.photoBase64))invalid();
      try{out.photoBuf=base64ToBuffer(e.photoBase64);if(!out.photoBuf.byteLength)invalid()}catch(_){invalid()}
      if(!/^image\/(jpeg|png|webp|gif|avif|heic|heif|bmp)$/i.test(out.photoType||'image/jpeg'))invalid();
      var b=map.get(e.bookId);b.count++;b.nextNo=Math.max(b.nextNo,e.no+1);return out
    });return Promise.all(books.filter(function(b){return b.coverPhoto}).map(function(b){return decode(new Blob([base64ToBuffer(b.coverPhoto.split(',')[1])],{type:'image/jpeg'})).then(function(img){if(img.close)img.close()})})).then(function(){return{type:data.type,version:1,books:books,entries:entries}})
  }

function showInstallHelp(){var c=h('div','card');c.append(h('h2',null,'ホーム画面から開く'),h('p',null,'iPhone・iPadでは、Safariの共有メニューから「ホーム画面に追加」を選びます。\n\nAndroidでは、ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。'),h('p','note','初回は通信が必要です。保存した記録は、この端末・ブラウザで開けます。'),lButton('閉じる',closeSheet,'go'));openSheet(c)}

  var journalMonth='',journalFavorite=false;
  function allRecords(groups){var out=[];groups.forEach(function(g){g.entries.forEach(function(e){out.push({book:g.book,entry:e})})});return out.sort(function(a,b){return String(b.entry.date||'').localeCompare(String(a.entry.date||''))||(b.entry.createdAt||0)-(a.entry.createdAt||0)})}
  function monthLabel(key){return /^\d{4}-\d{2}$/.test(key)?Number(key.slice(0,4))+'年'+Number(key.slice(5))+'月':'日付未設定'}
  function recordMonth(e){return /^\d{4}-\d{2}-\d{2}$/.test(e.date||'')?e.date.slice(0,7):'undated'}
  function appendMemoryHome(panel,groups){
    var records=allRecords(groups),month=todayISO().slice(0,7),now=records.filter(function(x){return recordMonth(x.entry)===month}),card=h('section','memory-home');
    var copy=h('div');copy.append(h('p','memory-eyebrow',monthLabel(month)),h('h2',null,now.length?now.length+'個の発見が、集まりました。':'今日は、何を見つけよう。'),h('p','l-note',records.length?'これまでに '+records.length+'件の記録。お気に入りを一枚のカードに。':'身近な「好き」を一枚。あなたの図鑑が育ちはじめます。'));
    var actions=h('div','memory-actions');actions.append(lButton('記録する',openRecordPicker,'primary-pill'));if(records.length)actions.append(lButton('ふりかえり',function(){go('#/memories')},'secondary-pill'));
    card.append(copy,actions);panel.append(card)
  }
  function renderMemories(){return lGroups().then(function(groups){
    var all=allRecords(groups),months=Array.from(new Set(all.map(function(x){return recordMonth(x.entry)}))).sort().reverse();
    if(!months.includes(journalMonth))journalMonth=months[0]||todayISO().slice(0,7);
    app.replaceChildren();renderAppNav('home');app.append(lHeader('わたしのふりかえり','集めた好きが、思い出になる。'));
    var panel=h('main','l-panel memory-screen'),back=h('a','back','← ホームに戻る');back.href='#/';panel.append(back);
    if(!all.length){panel.append(lEmpty('最初の発見から、はじめよう','写真を記録すると、月ごとにふりかえることができます。',openRecordPicker,'記録する'));app.append(panel);return}
    var controls=h('div','memory-controls'),label=h('label');label.append(h('span',null,'ふりかえる月'));var select=document.createElement('select');select.setAttribute('aria-label','ふりかえる月');months.forEach(function(m){var op=document.createElement('option');op.value=m;op.textContent=monthLabel(m);select.append(op)});select.value=journalMonth;label.append(select);
    var fav=lButton('お気に入りだけ',function(){journalFavorite=!journalFavorite;draw()},'secondary-pill');controls.append(label,fav);panel.append(controls);
    var summary=h('div','memory-summary'),selection=h('section','memory-selection'),heading=h('div','l-section-head');heading.append(h('h2',null,'カードにする写真'));
    var choose=h('p','l-note','1〜4枚選べます。番号順にカードに並びます。'),grid=h('div','memory-grid'),footer=h('div','memory-footer'),status=h('p','l-note'),make=lButton('フォトカードをつくる',function(){var selected=chosen.map(function(id){return visible.find(function(x){return x.entry.id===id})}).filter(Boolean);openPhotoCard(selected,monthLabel(journalMonth)+'の発見')},'primary-pill');status.setAttribute('role','status');footer.append(status,make);selection.append(heading,choose,grid,footer);panel.append(summary,selection);app.append(panel);
    var visible=[],chosen=[];
    function draw(){visible=all.filter(function(x){return recordMonth(x.entry)===journalMonth&&(!journalFavorite||x.entry.favorite)});chosen=[];fav.setAttribute('aria-pressed',String(journalFavorite));fav.classList.toggle('active',journalFavorite);summary.replaceChildren();var count=h('div');count.append(h('strong',null,String(visible.length)),h('span',null,'件の発見'));var days=new Set(visible.map(function(x){return x.entry.date}).filter(Boolean)).size,day=h('div');day.append(h('strong',null,String(days)),h('span',null,'日分の思い出'));summary.append(count,day);grid.replaceChildren();
      if(!visible.length){grid.append(lEmpty('お気に入りはまだありません','記録のハートを押すと、ここに集まります。'));choose.hidden=true}else choose.hidden=false;
      visible.forEach(function(x){var b=lButton('',function(){var pos=chosen.indexOf(x.entry.id);if(pos>=0)chosen.splice(pos,1);else if(chosen.length<4)chosen.push(x.entry.id);else{toast('写真は4枚まで選べます。選んだ写真を押すと外せます。');return}update()},'memory-pick');b.dataset.entryId=x.entry.id;b.setAttribute('aria-label',x.entry.name+'を選択');var img=document.createElement('img');img.src=urlFor(x.entry);img.alt='';img.loading='lazy';var name=h('span','memory-pick-name',x.entry.name),badge=h('span','memory-pick-badge');badge.setAttribute('aria-hidden','true');b.append(img,name,badge);grid.append(b)});update()}
    function update(){Array.from(grid.querySelectorAll('.memory-pick')).forEach(function(b){var index=chosen.indexOf(b.dataset.entryId);b.setAttribute('aria-pressed',String(index>=0));b.querySelector('.memory-pick-badge').textContent=index>=0?String(index+1):'＋'});status.textContent=chosen.length+' / 4枚 選択中';make.disabled=!chosen.length}
    select.addEventListener('change',function(){journalMonth=select.value;draw()});draw()
  })}
  function photoImage(entry){return new Promise(function(resolve,reject){var img=new Image();img.onload=function(){resolve(img)};img.onerror=function(){reject(new Error('photo'))};img.src=urlFor(entry)})}
  function cardFit(ctx,text,x,y,max,size,font,color){ctx.fillStyle=color;ctx.textAlign='left';var value=String(text||'');while(size>24){ctx.font='500 '+size+'px '+font;if(ctx.measureText(value).width<=max)break;size-=2}while(value.length&&ctx.measureText(value).width>max){value=Array.from(value).slice(0,-2).join('')+'…'}ctx.fillText(value,x,y)}
  function drawPhotoCard(items,options){
    var fonts=document.fonts?Promise.all([document.fonts.load('500 64px "Shippori Mincho"',options.title),document.fonts.load('500 32px "Zen Kaku Gothic New"',items.map(function(x){return x.entry.name}).join(''))]):Promise.resolve();
    return Promise.all([fonts,Promise.all(items.map(function(x){return photoImage(x.entry)}))]).then(function(result){
      var imgs=result[1],canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1600;var ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas');var themes={ivory:['#faf8f3','#263345','#80632e','#e8e3da'],navy:['#263345','#fffdf6','#ddc994','#526073'],sage:['#e5ece2','#263b31','#526948','#b9c6b3']},t=themes[options.theme]||themes.ivory;
      ctx.fillStyle=t[0];ctx.fillRect(0,0,1200,1600);ctx.fillStyle=t[2];ctx.font='500 23px "Zen Kaku Gothic New",sans-serif';ctx.fillText('MY DISCOVERIES',80,100);cardFit(ctx,options.title||'わたしの発見',80,198,1040,64,'"Shippori Mincho",serif',t[1]);ctx.strokeStyle=t[3];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,236);ctx.lineTo(1120,236);ctx.stroke();
      var count=imgs.length,cols=count===1?1:2,rows=count>2?2:1,gap=24,cellW=(1040-gap*(cols-1))/cols,cellH=(1040-gap*(rows-1))/rows,labelH=options.names?76:0;
      imgs.forEach(function(img,i){var x=80+(i%cols)*(cellW+gap),y=284+Math.floor(i/cols)*(cellH+gap),ph=cellH-labelH,scale=Math.max(cellW/img.naturalWidth,ph/img.naturalHeight),sw=cellW/scale,sh=ph/scale;ctx.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,x,y,cellW,ph);if(options.names)cardFit(ctx,items[i].entry.name,x,y+ph+48,cellW,30,'"Zen Kaku Gothic New",sans-serif',t[1])});
      if(count===3){ctx.fillStyle=t[2];ctx.font='500 32px "Shippori Mincho",serif';ctx.fillText('小さな好きの、コレクション。',80+cellW+gap,284+cellH+gap+cellH/2)}
      if(options.dates){var dates=items.map(function(x){return x.entry.date}).filter(Boolean).sort();if(dates.length)cardFit(ctx,showDate(dates[0])+(dates[0]!==dates[dates.length-1]?' — '+showDate(dates[dates.length-1]):''),80,1416,1040,28,'"Zen Kaku Gothic New",sans-serif',t[2])}
      ctx.fillStyle=t[2];ctx.font='500 27px "Shippori Mincho",serif';ctx.fillText('わたしの図鑑',80,1510);ctx.textAlign='right';ctx.font='400 23px "Zen Kaku Gothic New",sans-serif';ctx.fillText(count+' DISCOVER'+(count===1?'Y':'IES'),1120,1510);
      return new Promise(function(resolve,reject){canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('encode'))},'image/jpeg',.94)})
    })
  }
  function openPhotoCard(items,title){
    if(!items||!items.length)return;items=items.slice(0,4);var c=h('div','card photo-studio');c.append(h('h2',null,'発見を、フォトカードに。'),h('p','l-note','写真と言葉を組み合わせて、自分だけの一枚に。'));
    var preview=h('div','photo-studio-preview'),img=document.createElement('img');img.alt='フォトカードのプレビュー';preview.append(img);var status=h('p','l-note');status.setAttribute('role','status');c.append(preview,status);
    var titleField=field('カードのタイトル','input',{id:'card-title',max:32});titleField.input.value=title||'わたしの発見';c.append(titleField.label);
    var themes=h('div','photo-themes');themes.setAttribute('role','group');themes.setAttribute('aria-label','カードの色');var theme='ivory';[['ivory','アイボリー'],['navy','ネイビー'],['sage','セージ']].forEach(function(x){var b=lButton(x[1],function(){theme=x[0];Array.from(themes.children).forEach(function(n){n.setAttribute('aria-pressed',String(n===b))});sheetDirty=true;schedule()},'photo-theme '+x[0]);b.setAttribute('aria-pressed',String(x[0]===theme));themes.append(b)});c.append(themes);
    var privacy=h('div','photo-options');function toggle(text,value){var label=h('label'),input=document.createElement('input');input.type='checkbox';input.checked=value;label.append(input,document.createTextNode(text));privacy.append(label);input.addEventListener('change',schedule);return input}
    var names=toggle('記録の名前を入れる',true),dates=toggle('見つけた日を入れる',false);c.append(privacy,h('p','l-note','場所・メモ・コメントは画像に入りません。写真とタイトルは、共有前にご確認ください。'));
    var acts=h('div','acts'),save=lButton('画像を保存',function(){if(!blob)return;var href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='watashi-no-zukan-'+todayISO()+'.jpg';document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(href)},60000);sheetDirty=false;toast('画像の保存を開始しました。端末のダウンロードをご確認ください。')},'primary-pill'),share=lButton('画像を共有',function(){if(!blob)return;var file=new File([blob],'watashi-no-zukan.jpg',{type:'image/jpeg'});if(!navigator.canShare||!navigator.canShare({files:[file]})||!navigator.share){toast('このブラウザでは「画像を保存」からダウンロードできます。');return}sheetBusy=true;share.disabled=true;navigator.share({files:[file],title:titleField.input.value||'わたしの発見'}).then(function(){sheetDirty=false},function(e){if(e.name!=='AbortError')toast('共有できませんでした。「画像を保存」をお試しください。')}).finally(function(){sheetBusy=false;share.disabled=!blob})},'secondary-pill'),close=lButton('閉じる',closeSheet,'secondary-pill');share.hidden=!(navigator.share&&navigator.canShare);acts.append(save,share,close);c.append(acts);
    var blob=null,currentUrl=null,revision=0,timer=null,closed=false;save.disabled=share.disabled=true;
    function schedule(){clearTimeout(timer);save.disabled=share.disabled=true;blob=null;var seq=++revision;status.textContent='プレビューを作成しています…';timer=setTimeout(function(){drawPhotoCard(items,{title:titleField.input.value,theme:theme,names:names.checked,dates:dates.checked}).then(function(value){if(closed||seq!==revision)return;blob=value;if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(blob);img.src=currentUrl;save.disabled=share.disabled=false;status.textContent='1200 × 1600 px · JPEG'},function(){if(closed||seq!==revision)return;status.textContent='画像を作れませんでした。写真を選び直してお試しください。'})},120)}
    titleField.input.addEventListener('input',schedule);c._cleanup=function(){closed=true;revision++;clearTimeout(timer);if(currentUrl)URL.revokeObjectURL(currentUrl)};openSheet(c);schedule()
  }


function pageLayoutName(key){return !key||key==='folio'?'本をめくる':key==='gallery'?'写真アルバム':key==='journal'?'観察日記':'図鑑リスト'}
function makeLayoutChoices(draft,onChange){var group=h('div','page-layout-choices');group.setAttribute('role','group');group.setAttribute('aria-label','中のページのレイアウト');[['folio','本をめくる','一つずつ、ページをめくって読む。'],['list','図鑑リスト','写真と名前を、すっきり一覧に。'],['gallery','写真アルバム','お気に入りの写真を並べて。'],['journal','観察日記','写真と気づきを、ゆっくり読む。']].forEach(function(x){var b=lButton('',function(){draft.pageLayout=x[0];Array.from(group.children).forEach(function(n){n.setAttribute('aria-pressed',String(n===b))});if(onChange)onChange()},'page-layout-choice');b.dataset.pageLayout=x[0];b.setAttribute('aria-pressed',String((draft.pageLayout||'folio')===x[0]));b.append(h('strong',null,x[1]),h('span',null,x[2]));group.append(b)});return group}
function makeEntryCollection(b,entries,preview){
  var kind=['list','gallery','journal','folio'].includes(b.pageLayout)?b.pageLayout:'folio',list=h('div','entry-list page-layout-'+kind);if(kind==='folio')return makeFolioReader(b,entries,preview?null:function(e){go('#/b/'+b.id+'/e/'+e.no)});if(preview)list.classList.add('page-layout-preview');list.dataset.photoShape=['square','portrait','original'].includes(b.pagePhotoShape)?b.pagePhotoShape:'square';list.dataset.textSize=b.pageTextSize==='large'?'large':'normal';list.style.setProperty('--page-font',b.pageFont==null?'var(--font-body)':bookFont(b.pageFont).css);
  entries.forEach(function(e){var row=h('article','entry-row '+(b.layout==='compact'?'compact':b.layout==='relaxed'?'relaxed':''));row.dataset.search=[e.name,e.kanji,e.place,(e.tags||[]).join(' '),e.observed,e.imagined].join(' ');var img=document.createElement('img');img.className='entry-photo';img.src=e.previewSrc||urlFor(e);img.alt='';img.loading='lazy';var photo=preview?h('div','entry-photo-open'):lButton('',function(){go('#/b/'+b.id+'/e/'+e.no)},'entry-photo-open');if(!preview)photo.setAttribute('aria-label',e.name+'の写真と記録を開く');photo.append(img);
    var names=displayNames(b,e),copy=preview?h('div','entry-open'):lButton('',function(){go('#/b/'+b.id+'/e/'+e.no)},'entry-open');copy.append(h('span','entry-page-number','No.'+pad(e.no)),h('div','entry-name',names.main));if(names.sub)copy.append(h('div','entry-alias',names.sub));var meta=[];if(b.pageDate!==false&&e.date)meta.push(showDate(e.date));if(b.pagePlace!==false&&e.place)meta.push(e.place);if(meta.length)copy.append(h('div','entry-meta',meta.join(' · ')));row.append(photo,copy);
    if(!preview){var fav=lButton('',function(){fav.disabled=true;store.updateEntry(Object.assign({},e,{favorite:!e.favorite})).then(render,function(){fav.disabled=false;toast('保存できませんでした。もう一度お試しください。')})},'heart-btn'+(e.favorite?' on':''));fav.setAttribute('aria-label',e.favorite?'お気に入りを外す':'お気に入りに追加');fav.setAttribute('aria-pressed',String(!!e.favorite));fav.append(maskIcon('./assets/attraction/icon-heart.png','heart-mask'));row.append(fav)}
    if(kind==='journal'&&b.pageNotes!==false){var notes=h('div','entry-page-notes');[['見て気づいたこと',e.observed],['思ったこと・ストーリー',e.imagined]].forEach(function(x){if(x[1]){var n=h('section');n.append(h('h3',null,x[0]),h('p',null,x[1]));notes.append(n)}});if(notes.children.length)row.append(notes)}list.append(row)
  });return list
}
function openPageLayout(bookId){return Promise.all([store.book(bookId),store.entries(bookId)]).then(function(out){var book=out[0],entries=out[1];if(!book)return;var draft=Object.assign({},book),c=h('div','card page-editor');c.append(h('h2',null,'中のページをつくる'),h('p','l-note','「'+book.title+'」の読み心地を、あなた好みに。'));
  var choices=makeLayoutChoices(draft,function(){sheetDirty=true;paint()}),settings=h('div','page-layout-settings');c.append(choices,settings);var notesToggle;
  [['pageDate','見つけた日を表示'],['pagePlace','場所を表示'],['pageNotes','観察とストーリーを表示（日記）']].forEach(function(x){var lab=h('label'),inp=document.createElement('input');inp.type='checkbox';inp.checked=draft[x[0]]!==false;if(x[0]==='pageNotes')notesToggle=inp;inp.addEventListener('change',function(){draft[x[0]]=inp.checked;paint()});lab.append(inp,document.createTextNode(x[1]));settings.append(lab)});
  var typography=h('div','page-customize');function option(label,key,choices,fallback){var lab=h('label');lab.append(h('span',null,label));var select=document.createElement('select');select.setAttribute('aria-label',label);choices.forEach(function(x){var o=document.createElement('option');o.value=x[0];o.textContent=x[1];select.append(o)});select.value=draft[key]==null?fallback:draft[key];select.addEventListener('change',function(){draft[key]=key==='pageFont'?Number(select.value):select.value;sheetDirty=true;paint()});lab.append(select);typography.append(lab)}
  option('写真のかたち','pagePhotoShape',[['square','正方形'],['portrait','縦長'],['original','写真全体を見せる']],'square');option('ページの書体','pageFont',BOOK_FONTS.map(function(f,i){return[String(i),f.name]}),'3');option('文字の大きさ','pageTextSize',[['normal','標準'],['large','大きめ']],'normal');option('ページの余白','layout',[['compact','コンパクト'],['normal','標準'],['relaxed','ゆったり']],'normal');c.append(typography);appendFolioOptions(c,draft,function(){sheetDirty=true;paint()});
  var preview=h('div','page-live-preview'),caption=h('p','l-note',entries.length?'あなたの記録でプレビュー（先頭2件）':'レイアウトの見本です。記録は追加されません。');c.append(caption,preview);var error=h('p','l-error');error.setAttribute('role','status');var acts=h('div','acts'),cancel=lButton('やめる',closeSheet),save=lButton('このページで保存',function(){sheetBusy=true;save.disabled=cancel.disabled=true;store.updateBook(bookId,{pagePattern:draft.pagePattern||'field',pagePaper:draft.pagePaper||'ivory',pagePhotoShape:draft.pagePhotoShape||'square',pageFont:draft.pageFont==null?3:draft.pageFont,pageTextSize:draft.pageTextSize||'normal',layout:draft.layout||'normal',pageLayout:draft.pageLayout||'folio',pageDate:draft.pageDate!==false,pagePlace:draft.pagePlace!==false,pageNotes:draft.pageNotes!==false}).then(function(){closeSheet(true);toast('中のページを保存しました');render()},function(){sheetBusy=false;save.disabled=cancel.disabled=false;error.textContent='保存できませんでした。もう一度お試しください。'})},'primary-pill');acts.append(save,cancel);c.append(error,acts);
  function paint(){notesToggle.disabled=draft.pageLayout!=='journal'&&draft.pageLayout!=='folio'&&!!draft.pageLayout;var samples=entries.length?entries.slice(0,2):[{id:'preview',no:1,name:'小さな季節の発見',date:todayISO(),place:'いつもの散歩道',observed:'光に透ける葉っぱの色がきれい。',imagined:'季節の変化を、少しずつ集めたい。',previewSrc:'./assets/library/blossom.png'}];preview.replaceChildren(makeEntryCollection(draft,samples,true))}openSheet(c);paint()
})}

  function makeFolioReader(book,entries,onEdit){
    var root=h('section','folio-reader paper-'+(book.pagePaper||'ivory')+' pattern-'+(book.pagePattern||'field')),page=h('article','folio-page'),controls=h('div','folio-controls'),counter=h('span'),index=0,shown=entries.slice();root.tabIndex=0;root.setAttribute('aria-label','ページをめくる図鑑');counter.setAttribute('aria-live','polite');root.style.setProperty('--page-font',book.pageFont==null?'var(--font-body)':bookFont(book.pageFont).css);root.dataset.textSize=book.pageTextSize||'normal';
    var previous=lButton('',function(){turn(-1)},'round-btn'),next=lButton('',function(){turn(1)},'round-btn');previous.append(lIcon('back'));var arrow=lIcon('back');arrow.style.transform='rotate(180deg)';next.append(arrow);previous.setAttribute('aria-label','前のページ');next.setAttribute('aria-label','次のページ');controls.append(previous,counter,next);var stage=h('div','folio-stage');stage.append(page);root.append(stage,controls);var turning=false,turnAnimation=null,turnOverlay=null;function finishTurn(){if(turnAnimation){turnAnimation.cancel();turnAnimation=null}if(turnOverlay){turnOverlay.remove();turnOverlay=null}if(turning)draw();turning=false;stage.style.minHeight='';previous.disabled=index<=0;next.disabled=index>=shown.length-1;root.removeAttribute('aria-busy')}
    function draw(){page.replaceChildren();previous.disabled=index<=0;next.disabled=index>=shown.length-1;counter.textContent=shown.length?(index+1)+' / '+shown.length+' ページ':'0 ページ';if(!shown.length){page.append(h('p','l-note','条件に合う記録がありません。'));return}var e=shown[index],img=document.createElement('img');img.src=e.previewSrc||urlFor(e);img.alt=e.name;img.className='folio-photo shape-'+(book.pagePhotoShape||'square');var copy=h('div','folio-copy');copy.append(h('p','folio-number','No. '+pad(e.no||index+1)),h('h2',null,e.name));if(e.kanji)copy.append(h('p','entry-alias',e.kanji));var meta=[];if(book.pageDate!==false&&e.date)meta.push(showDate(e.date));if(book.pagePlace!==false&&e.place)meta.push(e.place);if(meta.length)copy.append(h('p','entry-meta',meta.join(' · ')));page.append(img,copy);if(book.pageNotes!==false)[['見て気づいたこと',e.observed],['思ったこと・ストーリー',e.imagined]].forEach(function(x){if(x[1]){var note=h('section','folio-note');note.append(h('h3',null,x[0]),h('p',null,x[1]));page.append(note)}});if(onEdit)page.append(lButton('このページを編集',function(){onEdit(e)},'secondary-pill'));}
    function turn(delta){var nextIndex=index+delta;if(turning||nextIndex<0||nextIndex>=shown.length)return;var old=page.cloneNode(true),oldHeight=page.offsetHeight;index=nextIndex;draw();if(matchMedia('(prefers-reduced-motion: reduce)').matches||!page.animate)return;turning=true;root.setAttribute('aria-busy','true');previous.disabled=next.disabled=true;stage.style.minHeight=Math.max(oldHeight,page.offsetHeight)+'px';turnOverlay=delta>0?old:page.cloneNode(true);turnOverlay.classList.add('folio-turn-sheet');turnOverlay.inert=true;turnOverlay.setAttribute('aria-hidden','true');turnOverlay.style.height=(delta>0?oldHeight:page.offsetHeight)+'px';stage.append(turnOverlay);if(delta<0)page.replaceChildren(...Array.from(old.children));turnAnimation=turnOverlay.animate(delta>0?[{transform:'rotateY(0deg)',filter:'brightness(1)'},{transform:'rotateY(-85deg)',filter:'brightness(.85)',offset:.55},{transform:'rotateY(-165deg)',filter:'brightness(.96)'}]:[{transform:'rotateY(-165deg)',filter:'brightness(.96)'},{transform:'rotateY(-85deg)',filter:'brightness(.85)',offset:.45},{transform:'rotateY(0deg)',filter:'brightness(1)'}],{duration:650,easing:'cubic-bezier(.22,.65,.3,1)',fill:'forwards'});turnAnimation.onfinish=finishTurn}

    root.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();turn(e.key==='ArrowRight'?1:-1)}});var x;page.addEventListener('pointerdown',function(e){x={x:e.clientX,y:e.clientY}});page.addEventListener('pointercancel',function(){x=null});page.addEventListener('pointerup',function(e){if(!x)return;var dx=e.clientX-x.x,dy=e.clientY-x.y;x=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1)});root.filterRecords=function(query){finishTurn();shown=entries.filter(function(e){return matchesSearch([e.name,e.kanji,e.place,(e.tags||[]).join(' '),e.observed,e.imagined].join(' '),query)});index=0;draw();return shown.length};draw();return root
  }
  function cloudApi(path,options){return fetch('./api/'+path,Object.assign({credentials:'same-origin',cache:'no-store'},options&&{method:options.method||'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options.body||{})})).then(async function(r){var data;try{data=await r.json()}catch(_){throw new Error('この公開先では共同編集に接続できません。更新デモでお試しください。')}if(!r.ok)throw new Error(data.error||'接続できませんでした');return data})}
  function cloudSignIn(container){var a=h('a','primary-pill','ChatGPTでログイン');a.href='/signin-with-chatgpt?return_to='+encodeURIComponent('/'+location.hash);a.target='_top';container.append(h('p','l-note','共同編集や公開の管理にはログインが必要です。個人の図鑑はこの端末で引き続き使えます。'),a)}
  function cloudLink(hash){return new URL('./'+hash,location.href).href}
  function shareCloudLink(hash){var value=cloudLink(hash);var c=h('div','card');c.append(h('h2',null,'リンクを共有'));var field=document.createElement('input');field.value=value;field.readOnly=true;field.setAttribute('aria-label','共有リンク');c.append(field,h('p','l-note',hash.indexOf('/group/')>=0?'招待したメールアドレスのアカウントでログインすると編集できます。招待メールは自動送信されません。':'このリンクから、公開した図鑑を読むことができます。'),lButton('リンクをコピー',function(){if(!navigator.clipboard||!navigator.clipboard.writeText){field.select();toast('リンクを選択してコピーしてください');return}navigator.clipboard.writeText(value).then(function(){toast('リンクをコピーしました')},function(){field.select();toast('リンクを選択してコピーしてください')})},'primary-pill'),lButton('閉じる',closeSheet));openSheet(c)}
  function cloudShell(title,subtitle,active){app.replaceChildren();renderAppNav(active||'settings');app.append(lHeader(title,subtitle));var panel=h('main','l-panel cloud-panel');app.append(panel);return panel}
  function renderPublicLibrary(id){var panel=cloudShell('公開図書館','みんなの「好き」を、一冊ずつ。','search');panel.append(h('p','l-note','読み込み中…'));return cloudApi(id?'public/'+encodeURIComponent(id):'public').then(function(data){if(!panel.isConnected)return;panel.replaceChildren();if(id){panel.append(lButton('← 公開図書館',function(){go('#/library')},'secondary-pill'),h('h1','public-book-title',data.book.title),lButton('リンクを共有',function(){shareCloudLink('#/library/'+id)},'secondary-pill'));var es=data.entries.map(function(e){return Object.assign({},e,{previewSrc:'./api/public/'+id+'/media/'+e.photo})});panel.append(makeFolioReader(data.book,es,null));return}panel.append(h('p','l-note','ここに並ぶのは、作成者が公開した作品です。'),lButton('自分の図鑑を公開する',openPublishPicker,'primary-pill'),lButton('自分の記録を探す',function(){go('#/search')},'secondary-pill'));if(!data.books.length){panel.append(lEmpty('最初の一冊を、図書館へ。','公開する前に、写真と文章を確認できます。'));return}var grid=h('div','public-book-grid');data.books.forEach(function(item){var b=lButton('',function(){go('#/library/'+item.id)},'public-book-card');b.append(makeBookFace(item.book,true),h('strong',null,item.book.title),h('span','l-note',item.count+'ページ'));grid.append(b)});panel.append(grid)},function(e){panel.replaceChildren(h('p','l-error',e.message),lButton('再読込',function(){renderPublicLibrary(id)}))})}
  function openPublishPicker(){cloudApi('session').then(function(session){if(!session.user){var c=h('div','card');c.append(h('h2',null,'公開する図鑑を選ぶ'));cloudSignIn(c);c.append(lButton('閉じる',closeSheet));openSheet(c);return}return store.books().then(function(books){var c=h('div','card'),list=h('div','publish-picker');c.append(h('h2',null,'書斎から図書館へ'),h('p','l-note','選んだ図鑑のコピーを共有用に作成します。元の記録はこの端末に残ります。公開は次の画面で内容を確認してから行います。'));books.forEach(function(b){list.append(lButton(b.title,function(){createCloudBook(b,c)},'secondary-pill'))});c.append(list,lButton('共同編集の図鑑から選ぶ',function(){closeSheet();go('#/groups')},'secondary-pill'),lButton('閉じる',closeSheet));openSheet(c)})}).catch(function(e){toast(e.message)})}
  function photoDataForEntry(e){var source=e.photoBuf?new Blob([e.photoBuf],{type:e.photoType||'image/jpeg'}):e.photo;if(!source)return Promise.reject(new Error('この記録の写真を読み込めませんでした。元の図鑑で確認してください。'));return squeeze(source).then(toBuffer).then(function(buf){return 'data:image/jpeg;base64,'+bufferToBase64(buf)})}
  function createCloudBook(book,container){sheetBusy=true;var buttons=container.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true});var status=h('p','l-note','共有用のコピーを作っています…');container.append(status);var jobs=container._copyJobs||(container._copyJobs={}),job=jobs[book.id]||(jobs[book.id]={id:null}),gid=job.id;store.entries(book.id).then(async function(entries){if(!gid){var created=await cloudApi('groups',{body:{book:book}});gid=job.id=created.id;}for(var i=0;i<entries.length;i++){status.textContent='記録をコピーしています '+(i+1)+' / '+entries.length;var e=entries[i];await cloudApi('groups/'+gid+'/entries',{body:{sourceId:e.id,name:e.name,kanji:e.kanji,observed:e.observed,imagined:e.imagined,photoData:await photoDataForEntry(e)}})}closeSheet(true);go('#/group/'+gid)}).catch(function(e){sheetBusy=false;buttons.forEach(function(b){b.disabled=false});status.textContent=e.message+(gid?' コピーできた記録は残っています。同じ図鑑をもう一度選ぶと、重複せず続きをコピーします。':'');if(gid)container.append(lButton('作成済みの図鑑を確認',function(){closeSheet(true);go('#/group/'+gid)},'secondary-pill'))})}
  function renderGroups(id){var panel=cloudShell(id?'共同編集の図鑑':'共同編集','招待した人と、ひとつの図鑑を育てる。');panel.append(h('p','l-note','読み込み中…'));return cloudApi('session').then(function(session){if(!panel.isConnected)return;panel.replaceChildren();if(!session.user){cloudSignIn(panel);return}return cloudApi(id?'groups/'+id:'groups').then(function(data){if(!panel.isConnected)return;panel.replaceChildren();if(!id){panel.append(lButton('共同編集の図鑑をつくる',function(){openCloudNew()},'primary-pill'),lButton('個人の図鑑からコピー',openPublishPicker,'secondary-pill'));if(!data.groups.length)panel.append(lEmpty('まだ共同編集の図鑑はありません','家族や友人とつくる一冊を、ここから。'));data.groups.forEach(function(g){var b=lButton('',function(){go('#/group/'+g.id)},'group-row');b.append(h('strong',null,g.book.title),h('span','l-note',g.owner?'あなたが作成 · 招待・公開を管理':'招待された図鑑 · 編集できます'));panel.append(b)});return}panel.append(lButton('← 共同編集の一覧',function(){go('#/groups')},'secondary-pill'),h('h1','public-book-title',data.book.title));var actions=h('div','cloud-actions');actions.append(lButton('ページを追加',function(){openCloudEntry(id,null)},'primary-pill'),lButton('最新の状態を読み込む',function(){renderGroups(id)},'secondary-pill'),lButton('表紙とページのデザイン',function(){openCloudLayout(data)},'secondary-pill'));if(data.owner){actions.append(lButton('メンバーを管理',function(){openCloudMembers(data)},'secondary-pill'),lButton(data.published?'公開内容を更新':'公開図書館に並べる',function(){confirmCloudPublish(data)},'secondary-pill'));if(data.published)actions.append(lButton('公開を取り下げる',function(){confirmDelete('公開を取り下げますか？','共同編集の図鑑は残ります。公開リンクからは読めなくなります。',function(){return cloudApi('groups/'+id+'/publish',{method:'DELETE'}).then(function(){renderGroups(id)})})},'secondary-pill'))}panel.append(actions,h('p','l-note','編集内容は共有保存されます。他の人の変更は「最新の状態を読み込む」で確認できます。公開版は作成者が更新した時点の内容です。'));var es=data.entries.map(function(e){return Object.assign({},e,{previewSrc:'./api/groups/'+id+'/media/'+e.photo})});panel.append(es.length?makeFolioReader(data.book,es,function(e){openCloudEntry(id,e)}):lEmpty('最初のページをつくろう','写真と気づきを、みんなで集めていきましょう。'))})}).catch(function(e){if(panel.isConnected)panel.replaceChildren(h('p','l-error',e.message),lButton('再読込',function(){renderGroups(id)}))})}
  function openCloudNew(){var c=h('div','card'),title=field('図鑑の名前','input',{id:'cloud-title',max:48}),status=h('p','l-error');c.append(h('h2',null,'共同編集の図鑑をつくる'),title.label);var save=lButton('つくる',function(){save.disabled=true;sheetBusy=true;cloudApi('groups',{body:{book:{title:title.input.value,color:12,theme:5,font:1,pageLayout:'folio'}}}).then(function(data){closeSheet(true);go('#/group/'+data.id)},function(e){sheetBusy=false;save.disabled=false;status.textContent=e.message})},'primary-pill');c.append(status,save,lButton('やめる',closeSheet));openSheet(c)}
  function openCloudEntry(gid,entry){var c=h('div','card'),name=field('名前','input',{id:'shared-name',max:100}),observed=field('見て気づいたこと','textarea',{id:'shared-observed',max:4000}),imagined=field('思ったこと・ストーリー','textarea',{id:'shared-imagined',max:4000}),status=h('p','l-error'),photoData='',photo=document.createElement('input');photo.type='file';photo.accept='image/*';photo.setAttribute('aria-label','ページの写真');if(entry){name.input.value=entry.name;observed.input.value=entry.observed||'';imagined.input.value=entry.imagined||''}c.append(h('h2',null,entry?'ページを編集':'ページを追加'));var photoPreview=document.createElement('img');photoPreview.className='shared-photo-preview';photoPreview.alt='ページの写真プレビュー';photoPreview.hidden=!entry;if(entry)photoPreview.src=entry.previewSrc||'./api/groups/'+gid+'/media/'+entry.photo;c.append(h('p','l-note',entry?'写真を選ぶと差し替えます。選ばなければ今の写真を残します。':'ページに載せる写真を選んでください。'),photoPreview,photo);c.append(name.label,observed.label,imagined.label);var save=lButton('共有保存する',function(){sheetBusy=true;save.disabled=true;cloudApi('groups/'+gid+'/entries'+(entry?'/'+entry.id:''),{method:entry?'PUT':'POST',body:{name:name.input.value,observed:observed.input.value,imagined:imagined.input.value,kanji:entry&&entry.kanji||'',revision:entry&&entry.revision,photoData:photoData}}).then(function(){closeSheet(true);toast('共同編集の図鑑に保存しました');renderGroups(gid)},function(e){sheetBusy=false;save.disabled=false;status.textContent=e.message})},'primary-pill');photo.addEventListener('change',function(){var file=photo.files[0];if(!file)return;if(file.size>30*1024*1024){status.textContent='30MB以下の写真を選んでください';return}save.disabled=true;sheetBusy=true;squeeze(file).then(toBuffer).then(function(buf){photoData='data:image/jpeg;base64,'+bufferToBase64(buf);photoPreview.src=photoData;photoPreview.hidden=false;sheetDirty=true;status.textContent='写真を読み込みました'},function(){status.textContent='写真を読み込めませんでした'}).finally(function(){sheetBusy=false;save.disabled=false})});if(entry)c.append(lButton('このページを削除',function(){if(!confirm('このページを共同編集の図鑑から削除しますか？公開済みの版には、公開更新するまで残ります。'))return;sheetBusy=true;save.disabled=true;cloudApi('groups/'+gid+'/entries/'+entry.id,{method:'DELETE',body:{revision:entry.revision}}).then(function(){closeSheet(true);renderGroups(gid)},function(e){sheetBusy=false;save.disabled=false;status.textContent=e.message})},'danger-link'));c.append(status,save,lButton('やめる',closeSheet));openSheet(c)}
  function openCloudMembers(data){var c=h('div','card'),email=field('招待する人のメールアドレス','input',{id:'invite-email',max:254});email.input.type='email';c.append(h('h2',null,'メンバーを管理'),h('p','l-note','招待した人は、同じメールアドレスでChatGPTにログインすると参加できます。メンバーはページとレイアウトを編集できます。'),email.label);var status=h('p','l-error'),save=lButton('編集メンバーに招待',function(){save.disabled=true;cloudApi('groups/'+data.id+'/members',{body:{email:email.input.value}}).then(function(){sheetDirty=false;closeSheet(true);toast('招待しました。図鑑のリンクを相手に送ってください。');renderGroups(data.id);shareCloudLink('#/group/'+data.id)},function(e){save.disabled=false;status.textContent=e.message})},'primary-pill');c.append(status,save,lButton('図鑑のリンクを表示',function(){closeSheet(true);shareCloudLink('#/group/'+data.id)},'secondary-pill'));data.members.forEach(function(m){var row=h('div','member-row');row.append(h('span',null,m.email),lButton('解除',function(){if(!confirm('このメンバーの編集権限を解除しますか？'))return;cloudApi('groups/'+data.id+'/members',{method:'DELETE',body:{email:m.email}}).then(function(){row.remove();toast('編集権限を解除しました')},function(e){status.textContent=e.message})}));c.append(row)});c.append(lButton('閉じる',closeSheet));openSheet(c)}
  function confirmCloudPublish(data){var c=h('div','card');c.append(h('h2',null,'公開図書館に並べる'),h('p',null,'「'+data.book.title+'」の表紙・写真・名前・観察メモ・ストーリーを、誰でも読める状態にします。日付・場所・個人のコメントは公開しません。'),h('p','l-note','写真や文章に個人情報が含まれていないか確認してください。公開後も取り下げられます。'));var status=h('p','l-error'),save=lButton('この内容を公開する',function(){save.disabled=true;sheetBusy=true;cloudApi('groups/'+data.id+'/publish',{body:{}}).then(function(){closeSheet(true);go('#/library/'+data.id)},function(e){sheetBusy=false;save.disabled=false;status.textContent=e.message})},'primary-pill');c.append(status,save,lButton('やめる',closeSheet));openSheet(c)}
  function openCloudLayout(data){var c=h('div','card'),draft=Object.assign({},data.book),preview=h('div','page-live-preview');c.append(h('h2',null,'表紙とページのデザイン'));var title=field('図鑑の名前','input',{id:'group-book-title',max:48});title.input.value=draft.title;title.input.addEventListener('input',function(){draft.title=title.input.value;paint()});c.append(title.label,makeCoverPhotoEditor(draft,function(){sheetDirty=true;paint()},function(busy){save.disabled=busy}));appendFolioOptions(c,draft,function(){sheetDirty=true;paint()});function paint(){preview.replaceChildren(makeBookFace(draft,true),makeFolioReader(draft,data.entries.slice(0,2).map(function(e){return Object.assign({},e,{previewSrc:'./api/groups/'+data.id+'/media/'+e.photo})}),null))}var status=h('p','l-error'),save=lButton('共有保存する',function(){save.disabled=true;sheetBusy=true;cloudApi('groups/'+data.id,{method:'PUT',body:{book:draft,revision:data.revision}}).then(function(){closeSheet(true);renderGroups(data.id)},function(e){sheetBusy=false;save.disabled=false;status.textContent=e.message})},'primary-pill');c.append(preview,status,save,lButton('やめる',closeSheet));openSheet(c);paint()}
  function appendFolioOptions(parent,draft,change){var grid=h('div','page-customize');[['ページの組み方','pagePattern',[['field','図鑑 · 写真と観察'],['album','アルバム · 写真を大きく'],['story','物語 · 文章を先に']],'field'],['紙の色','pagePaper',[['ivory','アイボリー'],['white','白'],['sage','セージ']],'ivory']].forEach(function(x){var lab=h('label'),select=document.createElement('select');lab.append(h('span',null,x[0]));select.setAttribute('aria-label',x[0]);x[2].forEach(function(o){var opt=document.createElement('option');opt.value=o[0];opt.textContent=o[1];select.append(opt)});select.value=draft[x[1]]||x[3];select.addEventListener('change',function(){draft[x[1]]=select.value;change()});lab.append(select);grid.append(lab)});parent.append(grid)}

  /* ================= 起動 ================= */

  window.addEventListener("hashchange",function(){
    if(designDirty&&!confirm("表紙の変更がまだ保存されていません。破棄して移動しますか？")){history.replaceState({},"",lastRenderedHash);return}
    designDirty=false;lastRenderedHash=location.hash||"#/";
    if(!veil.hidden)closeSheet(true);
    Promise.resolve(render()).then(function(){window.scrollTo(0,0)}).catch(function(){showError("画面を開けませんでした","もう一度お試しください。保存済みの記録は削除していません。")})
  });

  /* データベースが開くまで画面を空にしない。開けない端末でも見出しは出る。 */
  document.documentElement.setAttribute("data-view", "shelf");
  app.append(h("p", "lead", "ライブラリをひらいています…"));

  if("serviceWorker" in navigator&&!(window.NativeZukan&&window.NativeZukan.isNative)){
    window.addEventListener("load",function(){navigator.serviceWorker.register("./service-worker.js").catch(function(){})})
  }

  if(document.modelContext&&document.modelContext.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:"list_local_collections",description:"この端末内にある図鑑一覧を読み取ります。",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:function(input){if(!input||Object.keys(input).length)throw new Error("引数は空のオブジェクトにしてください");if(!db)throw new Error("起動中です");return store.books().then(function(bs){return bs.map(function(b){return{id:b.id,title:b.title,count:b.count||0}})})}})).catch(function(){})}catch(_){}}
  store.open().then(function (d) {
    db = d;
    /* 端末の容量が足りなくなったとき、ブラウザが勝手に消さないよう頼んでおく。
       断られても動きは変わらない。 */
    if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (on) {
        if (!on) return navigator.storage.persist();
      })["catch"](function () {});
    }
    return render();
  })["catch"](function (e) {
    app.replaceChildren();
    app.append(h("h1", "display", "きろくを ひらけませんでした"));
    app.append(h("p", "lead",
      "この ブラウザでは、きろくを しまう場所が つかえないようです。" +
      "プライベートモードを やめるか、べつの ブラウザで ひらいてください。"));
    app.append(h("p", "note", "（" + ((e && e.name) || "error") + "）"));
  });
})();
