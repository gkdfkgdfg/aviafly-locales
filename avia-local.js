/*
 * AviaFly — локальная версия: игра открывается двойным кликом по index.html, node server.js не нужен.
 * Этот файл подключается раньше игры и заменяет сайт и сервер:
 *   1) файлы игры — страница с file:// не может читать их через fetch, а картинки с диска «пачкают» WebGL,
 *      поэтому игре дан виртуальный адрес https://avia.local/…, а ответы берутся из avia-assets.js;
 *   2) сервер — POST https://avia.local/api отвечает здесь же: порт server.js (та же модель полёта dev/src/model);
 *      раунды из seeds_portal.bin (с порталом, всегда пройден) или seeds_noportal.bin («Отключить портал»), КФ 10–100x;
 *   3) кошелёк — баланс и валюта в localStorage этого браузера; меняются в панели «Настройки» (кнопка в игре);
 *   4) портал — iframe с srcdoc (avia-portal.js): тот же источник, что у игры, поэтому он берёт файлы и
 *      сервер у этой страницы (этот же файл встроен в портал, там работает только пункт 1).
 * Пересборка avia-game.js / avia-portal.js / avia-assets.js: node tools/build-local.mjs
 */
(function () {
  "use strict";

  var IN_PORTAL = window.__AVIA_PORTAL_FRAME__ === true;
  var HOST = IN_PORTAL ? window.parent : window;
  var VHOST = "avia.local", VORIGIN = "https://avia.local";
  var ASSETS = HOST.__AVIA_ASSETS__ || {};

  // ===== файлы ================================================================================
  function bytes(key) {
    var bin = atob(ASSETS[key][1]), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function text(key) { return new TextDecoder().decode(bytes(key)); }

  // папка страницы игры (с диска или на хостинге): файлы под ней тоже отдаются из avia-assets — так на хостинг
  // не нужно выкладывать саму папку html/ (в портале — папка страницы игры, а не адрес srcdoc)
  var pageDir = decodeURIComponent(new URL("./", HOST.location.href).pathname);
  var pageOrigin = HOST.location.origin;
  // ключ в avia-assets.js (путь от папки LocalAviaGame) или "api", иначе null
  function assetKey(input) {
    var raw = input && typeof input === "object" && "url" in input ? input.url : input;
    if (raw == null) return null;
    var u;
    try { u = new URL(String(raw), document.baseURI); } catch (_) { return null; }
    var rel = null;
    if (u.hostname === VHOST) rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    else if ((u.protocol === "file:" ? location.protocol === "file:" || HOST.location.protocol === "file:" : u.origin === pageOrigin)
      && decodeURIComponent(u.pathname).indexOf(pageDir) === 0) rel = decodeURIComponent(u.pathname).slice(pageDir.length);
    if (rel === null) return null;
    if (rel === "api") return "api";
    return ASSETS[rel] ? rel : null;
  }
  var dataUrls = new Map();
  function dataUrl(key) {
    var v = dataUrls.get(key);
    if (!v) {
      if (ASSETS[key][0] === "text/css") {
        var dir = key.slice(0, key.lastIndexOf("/") + 1);
        var css = text(key).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (all, q, u) {
          if (/^(data:|https?:|\/\/)/i.test(u)) return all;
          var out = [];
          (dir + u.split(/[?#]/)[0]).split("/").forEach(function (p) { if (p === "..") out.pop(); else if (p !== "." && p !== "") out.push(p); });
          var ref = out.join("/");
          return ASSETS[ref] ? 'url("' + dataUrl(ref) + '")' : all;
        });
        v = "data:text/css;charset=utf-8," + encodeURIComponent(css);
      } else v = "data:" + ASSETS[key][0] + ";base64," + ASSETS[key][1];
      dataUrls.set(key, v);
    }
    return v;
  }
  function mapUrl(value) {
    var key = assetKey(value);
    return key && key !== "api" ? dataUrl(key) : value;
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var key = assetKey(input);
    if (key === "api") {
      var body = init && init.body != null ? init.body : input && input.body;
      return Promise.resolve(typeof body === "string" ? body : body ? new Response(body).text() : "{}").then(function (raw) {
        var req = {};
        try { req = JSON.parse(raw || "{}"); } catch (_) {}
        return HOST.__aviaApi(req);
      }).then(function (res) {
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      });
    }
    if (key && ASSETS[key][0] === "text/css") return nativeFetch(dataUrl(key));
    if (key) return Promise.resolve(new Response(bytes(key), { status: 200, headers: { "Content-Type": ASSETS[key][0] } }));
    return nativeFetch(input, init);
  };

  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var key = assetKey(url);
    if (key && key !== "api") arguments[1] = dataUrl(key);
    return nativeOpen.apply(this, arguments);
  };
  function hookSrc(proto, prop) {
    var d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, mapUrl(v)); } });
  }
  hookSrc(HTMLImageElement.prototype, "src");
  hookSrc(HTMLMediaElement.prototype, "src");
  hookSrc(HTMLLinkElement.prototype, "href");
  var nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase();
    if ((n === "src" && (this instanceof HTMLImageElement || this instanceof HTMLMediaElement || this instanceof HTMLSourceElement))
      || (n === "href" && this instanceof HTMLLinkElement)) arguments[1] = mapUrl(value);
    return nativeSetAttribute.apply(this, arguments);
  };
  if (window.Worker) { // PixiJS грузит текстуры в Worker-е — подменяем адрес, который ему передают
    var nativePost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message) {
      if (message && message.id === "loadImageBitmap" && Array.isArray(message.data))
        arguments[0] = Object.assign({}, message, { data: message.data.map(function (v) { return typeof v === "string" ? mapUrl(v) : v; }) });
      return nativePost.apply(this, arguments);
    };
  }
  if (window.FontFace) {
    var NativeFontFace = window.FontFace;
    var FontFaceLocal = function (family, source, desc) {
      if (typeof source === "string") source = source.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (all, q, u) {
        var key = assetKey(u);
        return key && key !== "api" ? 'url("' + dataUrl(key) + '")' : all;
      });
      return new NativeFontFace(family, source, desc);
    };
    FontFaceLocal.prototype = NativeFontFace.prototype;
    window.FontFace = FontFaceLocal;
  }

  // Шрифты движка: он вставляет <style> с @font-face url(https://avia.local/…) — их браузер грузит сам,
  // мимо fetch, поэтому url(...) в таких стилях заменяем на встроенные файлы до вставки в документ.
  function fixCss(css) {
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (all, q, u) {
      var key = assetKey(u);
      return key && key !== "api" ? 'url("' + dataUrl(key) + '")' : all;
    });
  }
  function fixStyleNode(node) {
    if (node && node.nodeType === 1 && node.tagName === "STYLE" && !node.__aviaFixed && /avia\.local|url\(/.test(node.textContent)) {
      node.__aviaFixed = true;
      var t = node.textContent, f = fixCss(t);
      if (f !== t) node.textContent = f;
    }
    return node;
  }
  // HUD и окна выигрыша вставляют разметку через innerHTML: <img src="html/…"> и style="…url(…)" — тоже встроенные
  var innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  Object.defineProperty(Element.prototype, "innerHTML", {
    configurable: true, enumerable: innerHTMLDesc.enumerable, get: innerHTMLDesc.get,
    set: function (html) {
      if (typeof html === "string" && /src=|url\(/.test(html)) {
        html = fixCss(html.replace(/(\ssrc=)(["'])([^"']+)\2/g, function (all, a, q, u) { return a + q + mapUrl(u) + q; }));
      }
      innerHTMLDesc.set.call(this, html);
    },
  });
  ["appendChild", "insertBefore"].forEach(function (fn) {
    var native = Node.prototype[fn];
    Node.prototype[fn] = function (node) { fixStyleNode(node); return native.apply(this, arguments); };
  });
  new MutationObserver(function (recs) {
    recs.forEach(function (r) { r.addedNodes.forEach(fixStyleNode); if (r.type === "characterData" || r.target.tagName === "STYLE") { if (r.target.tagName === "STYLE") { r.target.__aviaFixed = false; fixStyleNode(r.target); } } });
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (IN_PORTAL) return; // дальше — только в странице игры

  // ===== кошелёк ===============================================================================
  // суммы — в сотых (subunits 100, как USD в server.js)
  var WALLET_KEY = "avia-local-wallet";
  var WALLET_DEFAULT = { balance: 100000, currency: "USD" }; // 1 000.00 при первом запуске
  function walletRead() {
    var w = null;
    try { w = JSON.parse(localStorage.getItem(WALLET_KEY) || "null"); } catch (_) {}
    if (!w || typeof w !== "object") w = {};
    var b = Math.trunc(Number(w.balance));
    return {
      balance: Number.isFinite(b) && b >= 0 ? b : WALLET_DEFAULT.balance,
      currency: typeof w.currency === "string" && w.currency.trim() ? w.currency.trim().slice(0, 12) : WALLET_DEFAULT.currency,
    };
  }
  var wallet = walletRead();
  function walletSave() { try { localStorage.setItem(WALLET_KEY, JSON.stringify(wallet)); } catch (_) {} }

  // ===== вид: скрыть верхнюю / нижнюю панель, иксы ============================================
  // Применяется сразу: классы на <html> прячут блоки HUD (AviaHud: .ah-stats — три верхние плашки,
  // .ah-bet — баланс и ставка); window.__aviaHideX читают бонусы и плашка множителя (правки в avia-game.js).
  var UI_KEY = "avia-local-ui";
  var ui = { hide_top: false, hide_bottom: false, hide_x: false, hide_nums: false, hide_portal_cur: false, no_portal: false };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || "{}")); } catch (_) {}
  var uiStyle = document.createElement("style");
  uiStyle.textContent = "html.avia-hide-top .ah-stats{display:none!important}html.avia-hide-bottom .ah-bet{display:none!important}";
  document.head.appendChild(uiStyle);
  function applyUi() {
    var h = document.documentElement.classList;
    h.toggle("avia-hide-top", !!ui.hide_top);
    h.toggle("avia-hide-bottom", !!ui.hide_bottom);
    window.__aviaHideX = !!ui.hide_x;
    window.__aviaHideNums = !!ui.hide_nums;
    window.__aviaHidePortalCur = !!ui.hide_portal_cur; // читает портал (avia-portal.js: money())
  }
  // окно выигрыша (avia-game.js, AviaWin): сумма всегда без валюты
  window.__aviaStripCur = function (s) {
    s = String(s);
    var c = wallet.currency;
    var i = s.lastIndexOf(c);
    return (i >= 0 ? s.slice(0, i) + s.slice(i + c.length) : s).replace(/\s+/g, " ").trim();
  };
  applyUi();

  var BETS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  var DEFAULT_BET = 100;
  var CURRENCY = { code: wallet.currency, symbol: wallet.currency, subunits: 100, exponent: 2 };

  // то, что раньше было в index.html для server.js: адреса — на виртуальный сайт, валюта — из кошелька
  var O = window.__OPTIONS__ || (window.__OPTIONS__ = {});
  O.api = VORIGIN + "/api";
  O.resources_path = VORIGIN + "/html/LocalAviaGame";
  O.currency = wallet.currency;
  O.rules = Object.assign({}, O.rules, { min_bet: BETS[0], max_bet: BETS[BETS.length - 1], currency: CURRENCY });

  // ===== сервер (порт server.js) ===============================================================
  // Базы раундов (tools/gen-pools.mjs), КФ 10–100x, равномерно:
  //   seeds_portal.bin   — 12 байт: seed полёта, pseed портала, КФ×1e6 — портал есть и всегда проходится;
  //   seeds_noportal.bin —  8 байт: seed, КФ×1e6 — портала в полёте нет (даже на экране).
  // «Отключить портал» в настройках = раунды из второй базы.
  var M = null, model = null, POOL_P = null, POOL_N = null;
  function boot() {
    if (M) return;
    var code = ["seeded-random.js", "flight-model.js", "portal-sim.js"].map(function (f) { return text("dev/src/model/" + f); }).join("\n");
    M = new Function(code + "\nreturn { FlightModel: FlightModel, PortalSim: PortalSim, PORTAL_STAGES: PORTAL_STAGES };")();
    model = new M.FlightModel();
    var view = function (key) { var b = bytes(key); return new DataView(b.buffer, b.byteOffset, b.byteLength); };
    POOL_P = view("seeds_portal.bin");
    POOL_N = view("seeds_noportal.bin");
  }
  function pickRound(noPortal) {
    var v = noPortal ? POOL_N : POOL_P, size = noPortal ? 8 : 12, n = v.byteLength / size;
    var i = Math.floor(Math.random() * n) * size;
    return noPortal ? { seed: v.getUint32(i, true), pseed: 0 } : { seed: v.getUint32(i, true), pseed: v.getUint32(i + 4, true) };
  }
  var WIN_EPSILON = 1e-4;
  function multiplierToWin(m, bet) { return m >= 0.95 ? Math.ceil(m * bet - WIN_EPSILON) : Math.floor(m * bet + WIN_EPSILON); }
  function playSeed(seed) {
    model.seed(seed);
    var guard = 0;
    while (!model.isFinished && guard++ < 200000) model.update();
    return model.getTotalWinMultiplier();
  }

  // открытый раунд с порталом переживает перезагрузку страницы (как pending-portal.json у server.js)
  var PENDING_KEY = "avia-local-portal";
  var pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch (_) {}
  function savePending() {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify({ seed: pending.seed, bet: pending.bet, pseed: pending.pseed, choices: pending.choices || [] }));
      else localStorage.removeItem(PENDING_KEY);
    } catch (_) {}
  }
  function pendingSim() {
    if (!pending.sim) {
      pending.sim = new M.PortalSim(pending.pseed);
      for (var i = 0; i < (pending.choices || []).length; i++) pending.sim.passStage();
    }
    return pending.sim;
  }
  function finishWithPortal(seed, add) {
    model.seed(seed);
    model.portalInteractive = true;
    var guard = 0;
    while (!model.isFinished && !model.portalWait && guard++ < 200000) model.update();
    model.resolvePortal(add);
    while (!model.isFinished && guard++ < 400000) model.update();
    model.portalInteractive = false;
    return model.getTotalWinMultiplier();
  }
  function settle(add) {
    var m = finishWithPortal(pending.seed, add);
    var win = multiplierToWin(m, pending.bet);
    wallet.balance += win;
    walletSave();
    pending = null;
    savePending();
    return { win: win, balance: wallet.balance, multiplier: m };
  }
  function portalApi(command, options) {
    if (!pending) return { errors: [{ code: 400, desc: "no_portal" }] };
    var sim = pendingSim();
    if (command === "portal_start") return { portal: { seed: pending.pseed, stage: sim.stage, coins: sim.collected, choices: pending.choices || [] } };
    var choice = Number(options && options.choice);
    if (!(choice >= 0 && choice <= 2)) return { errors: [{ code: 400, desc: "bad_portal_step" }] };
    // выигрышный портал: каждый уворот верный (как AVIA_PORTAL_SAFE=1 в start_portal.bat)
    sim.passStage();
    (pending.choices = pending.choices || []).push(choice);
    var res = { safe: true, stage: sim.stage, coins: sim.collected };
    if (sim.stage >= M.PORTAL_STAGES) res.final = settle(sim.collected);
    else savePending();
    return { portal: res };
  }
  var roundId = Date.now();
  function flow(command) { return { round_id: roundId, state: command === "init" ? "ready" : "closed", command: command, available_actions: ["init", "spin"] }; }

  function api(body) {
    boot();
    var command = body.command || "init";
    if (command === "init") {
      return {
        api_version: "2",
        options: {
          available_bets: BETS, default_bet: DEFAULT_BET, currency: CURRENCY,
          paytable: {}, paytables: {}, special_symbols: [], lines: [], reels: { main: [] }, layout: { reels: 1, rows: 1 }, screen: [],
        },
        balance: { game: 0, wallet: wallet.balance },
        flow: flow("init"),
      };
    }
    if (command === "portal_start" || command === "portal") return portalApi(command, body.options);
    if (command === "spin") {
      var bet = Number(body.options && body.options.bet);
      if (BETS.indexOf(bet) === -1) return { errors: [{ code: 400, desc: "invalid_bet" }] };
      if (wallet.balance < bet) return { errors: [{ code: 301, desc: "not_enough_money" }] };
      var pick = pickRound(!!ui.no_portal), seed = pick.seed;
      var mult = playSeed(seed), portal = model.portalHit;
      var win = portal ? 0 : multiplierToWin(mult, bet); // раунд с порталом оплачивается после портала (settle)
      wallet.balance -= bet;
      var walletAfterBet = wallet.balance;
      wallet.balance += win;
      walletSave();
      roundId++;
      // pseed — из базы: монеты портала и итог раунда те, что записаны (КФ в 10–100x)
      pending = portal ? { seed: seed, bet: bet, pseed: pick.pseed || ((Math.random() * 4294967296) >>> 0), sim: null, choices: [] } : null;
      savePending();
      return {
        api_version: "2",
        outcome: { screen: null, special_symbols: null, bet: bet, win: win, wins: [], storage: portal ? { seed: seed, portal: 1 } : { seed: seed } },
        balance: { game: win, wallet: walletAfterBet },
        flow: flow("spin"),
      };
    }
    return {};
  }
  // ответ — чуть позже, как у сети (игра ждёт асинхронный ответ)
  window.__aviaApi = function (req) {
    return new Promise(function (ok) { setTimeout(function () { ok(api(req)); }, 30); });
  };

  // ===== портал: iframe со srcdoc =================================================================
  window.__aviaPortalLoad = function (f) {
    f.srcdoc = (window.__AVIA_PORTAL_HTML__ || "<!doctype html><title>portal</title>") + "<!--" + Date.now() + "-->";
  };

  // ===== панель «Настройки» (как в фллнг): валюта и баланс ===============================================
  var panel = null;
  function buildPanel(openGameSettings) {
    var style = document.createElement("style");
    style.textContent = [
      ".fp-wallet-backdrop{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease;font-family:Inter,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased}",
      ".fp-wallet-backdrop *{box-sizing:border-box}",
      ".fp-wallet-backdrop.is-open{opacity:1;visibility:visible}",
      ".fp-wallet-panel{position:relative;width:min(380px,100%);max-height:calc(100vh - 32px);overflow-y:auto;color:#fff;background:#121214 radial-gradient(circle at 50% 0%,rgba(0,152,234,.18),transparent 65%) no-repeat;border:1px solid rgba(255,255,255,.08);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.7);transform:scale(.96);transition:transform .2s ease}",
      ".fp-wallet-backdrop.is-open .fp-wallet-panel{transform:none}",
      ".fp-wallet-close{position:absolute;top:10px;right:10px;z-index:2;width:30px;height:30px;padding:0;border:0;border-radius:8px;color:rgba(255,255,255,.4);background:none;font-size:18px;line-height:30px;cursor:pointer;transition:color .2s,background .2s}",
      ".fp-wallet-close:hover{color:#fff;background:rgba(255,255,255,.06)}",
      ".fp-brand{display:flex;flex-direction:column;align-items:center;padding:26px 20px 18px;text-align:center;user-select:none;border-bottom:1px solid rgba(255,255,255,.06)}",
      ".fp-brand-mark{position:relative;margin:0;font-size:32px;font-weight:900;line-height:1;letter-spacing:-.045em;color:#fff;white-space:nowrap}",
      ".fp-brand-letters{display:inline-flex}.fp-brand-letter{display:inline-block}.fp-brand-space{display:inline-block;width:.26em}",
      ".fp-brand-shine{position:absolute;inset:0;pointer-events:none;color:transparent;background:linear-gradient(105deg,transparent 42%,rgba(0,152,234,.95) 50%,transparent 58%);background-size:300% 100%;background-position:100% 0;-webkit-background-clip:text;background-clip:text}",
      ".fp-brand-badge{position:relative;overflow:hidden;margin-top:24px;padding:.42em 1.15em;border-radius:999px;background:#0098EA;color:#fff;font-size:13px;font-weight:800;letter-spacing:-.01em}",
      ".fp-brand-badge:after{content:'';position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent);transform:translateX(-120%)}",
      ".fp-brand-sub{margin-top:12px;color:rgba(255,255,255,.4);font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase}",
      ".fp-anim .fp-brand-letter{opacity:0;transform:translateY(.35em);filter:blur(6px);animation:fpLetterIn .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(var(--i)*45ms + 80ms)}",
      ".fp-anim .fp-brand-badge{opacity:0;transform:scale(.85);animation:fpBadgeIn .6s cubic-bezier(.34,1.56,.64,1) .8s forwards}",
      ".fp-anim .fp-brand-shine{animation:fpShine 6s ease-in-out 1.7s infinite}",
      ".fp-anim .fp-brand-badge:after{animation:fpBadgeShine 6s ease-in-out 1.7s infinite}",
      "@keyframes fpLetterIn{to{opacity:1;transform:none;filter:blur(0)}}@keyframes fpBadgeIn{to{opacity:1;transform:none}}",
      "@keyframes fpShine{0%{background-position:100% 0}35%{background-position:0% 0}100%{background-position:0% 0}}",
      "@keyframes fpBadgeShine{0%,20%{transform:translateX(-120%)}45%{transform:translateX(320%)}100%{transform:translateX(320%)}}",
      ".fp-wallet-body{padding:18px 20px 20px}",
      ".fp-wallet-field{display:block;margin:0 0 14px;color:rgba(255,255,255,.4);font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase}",
      ".fp-wallet-row{display:flex;gap:10px}.fp-wallet-row .fp-wallet-field{flex:1;min-width:0}",
      ".fp-wallet-input{width:100%;margin-top:8px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:12px;outline:0;color:#fff;background:rgba(255,255,255,.03);font:600 14px/1.2 Inter,system-ui,Arial,sans-serif;letter-spacing:0;text-transform:none;transition:border-color .2s,background .2s}",
      ".fp-wallet-input:focus{border-color:#0098EA;background:rgba(0,152,234,.06)}",
      ".fp-wallet-input::-webkit-outer-spin-button,.fp-wallet-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.fp-wallet-input[type=number]{-moz-appearance:textfield}",
      ".fp-wallet-toggles{margin:4px 0 0;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.02);overflow:hidden}",
      ".fp-wallet-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;color:#fff;font-size:12px;font-weight:700;cursor:pointer}",
      ".fp-wallet-toggle+.fp-wallet-toggle{border-top:1px solid rgba(255,255,255,.06)}",
      ".fp-wallet-toggle small{display:block;margin-top:3px;color:rgba(255,255,255,.4);font-size:10px;font-weight:600}",
      ".fp-wallet-switch{position:relative;display:inline-block;width:44px;height:24px;flex:0 0 auto}.fp-wallet-switch input{position:absolute;opacity:0;width:0;height:0}",
      ".fp-wallet-slider{position:absolute;inset:0;border-radius:999px;background:#2a2a2e;cursor:pointer;transition:background .25s}",
      ".fp-wallet-slider:before{content:'';position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;transition:transform .25s}",
      ".fp-wallet-switch input:checked+.fp-wallet-slider{background:#0098EA}.fp-wallet-switch input:checked+.fp-wallet-slider:before{transform:translateX(20px)}",
      ".fp-wallet-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px}",
      ".fp-wallet-submit{width:100%;padding:14px;border:0;border-radius:12px;color:#fff;background:#0098EA;font:900 12px/1 Inter,system-ui,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 18px rgba(0,152,234,.35);transition:transform .2s,box-shadow .2s}",
      ".fp-wallet-submit:hover{transform:translateY(-1px);box-shadow:0 6px 26px rgba(0,152,234,.55)}",
      ".fp-wallet-second{width:100%;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:rgba(255,255,255,.75);background:rgba(255,255,255,.03);font:700 12px/1 Inter,system-ui,Arial,sans-serif;letter-spacing:.5px;cursor:pointer;transition:border-color .2s,color .2s}",
      ".fp-wallet-second:hover{border-color:rgba(255,255,255,.25);color:#fff}",
      ".fp-wallet-status{order:3;min-height:14px;color:rgba(255,255,255,.45);font-size:12px;line-height:14px;text-align:center}",
      ".fp-wallet-status.is-error{color:#f87171}",
      "@media (max-width:480px){.fp-wallet-backdrop{padding:12px}.fp-brand{padding:22px 16px 16px}.fp-brand-mark{font-size:28px}.fp-wallet-body{padding:16px}}",
    ].join("");
    document.head.appendChild(style);

    var letters = "ELITE SOLUTIONS".split("").map(function (ch, i) {
      return ch === " " ? '<span class="fp-brand-space"></span>' : '<span class="fp-brand-letter" style="--i:' + i + '">' + ch + "</span>";
    }).join("");
    var b = document.createElement("div");
    b.className = "fp-wallet-backdrop";
    b.setAttribute("aria-hidden", "true");
    b.innerHTML = [
      '<section class="fp-wallet-panel" role="dialog" aria-modal="true" aria-labelledby="avia-wallet-title">',
      '<button class="fp-wallet-close" type="button" aria-label="Закрыть">&times;</button>',
      '<header class="fp-brand">',
      '<div id="avia-wallet-title" class="fp-brand-mark" aria-label="ELITE SOLUTIONS">',
      '<span class="fp-brand-letters" aria-hidden="true">' + letters + "</span>",
      '<span class="fp-brand-shine" aria-hidden="true">ELITE<span class="fp-brand-space"></span>SOLUTIONS</span>',
      "</div>",
      '<div class="fp-brand-badge">100% RTP</div>',
      '<div class="fp-brand-sub">Настройки игры</div>',
      "</header>",
      '<form class="fp-wallet-body" novalidate>',
      '<div class="fp-wallet-row">',
      '<label class="fp-wallet-field">Валюта<input class="fp-wallet-input" data-cur type="text" maxlength="12" autocomplete="off" spellcheck="false"></label>',
      '<label class="fp-wallet-field">Баланс<input class="fp-wallet-input" data-bal type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off"></label>',
      "</div>",
      '<div class="fp-wallet-toggles">',
      '<label class="fp-wallet-toggle"><span>Отключить портал<small>раунды без портала (со следующего полёта)</small></span><span class="fp-wallet-switch"><input type="checkbox" data-ui="no_portal"><span class="fp-wallet-slider"></span></span></label>',
      '<label class="fp-wallet-toggle"><span>Скрыть верхнюю панель<small>высота, дистанция, множитель</small></span><span class="fp-wallet-switch"><input type="checkbox" data-ui="hide_top"><span class="fp-wallet-slider"></span></span></label>',
      '<label class="fp-wallet-toggle"><span>Скрыть нижнюю панель<small>баланс и ставка</small></span><span class="fp-wallet-switch"><input type="checkbox" data-ui="hide_bottom"><span class="fp-wallet-slider"></span></span></label>',
      '<label class="fp-wallet-toggle"><span>Скрыть иксы и прочее<small>только знаки «×», «+» на бонусах и «×» у множителя</small></span><span class="fp-wallet-switch"><input type="checkbox" data-ui="hide_x"><span class="fp-wallet-slider"></span></span></label>',
      '<label class="fp-wallet-toggle"><span>Скрыть числа в полёте<small>надписи на бонусах целиком</small></span><span class="fp-wallet-switch"><input type="checkbox" data-ui="hide_nums"><span class="fp-wallet-slider"></span></span></label>',
      '<label class="fp-wallet-toggle"><span>Скрыть валюту в портале<small>сумма монет в портале без валюты</small></span><span class="fp-wallet-switch"><input type="checkbox" data-ui="hide_portal_cur"><span class="fp-wallet-slider"></span></span></label>',
      "</div>",
      '<div class="fp-wallet-actions"><div class="fp-wallet-status" data-status></div>',
      '<button class="fp-wallet-submit" type="submit">Применить</button>',
      '<button class="fp-wallet-second" type="button" data-game>Звук и правила</button></div>',
      "</form></section>",
    ].join("");
    document.body.appendChild(b);
    // клики по панели не должны доходить до игры под ней
    ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click", "keydown"].forEach(function (t) {
      b.addEventListener(t, function (e) { e.stopPropagation(); });
    });

    var cur = b.querySelector("[data-cur]"), bal = b.querySelector("[data-bal]"), status = b.querySelector("[data-status]");
    function close() { b.classList.remove("is-open"); b.setAttribute("aria-hidden", "true"); }
    function setStatus(msg, err) { status.textContent = msg; status.classList.toggle("is-error", !!err); }
    b.querySelector(".fp-wallet-close").addEventListener("click", close);
    b.addEventListener("click", function (e) { if (e.target === b) close(); });
    b.querySelector("[data-game]").addEventListener("click", function () { close(); if (panel.openGame) panel.openGame(); });
    var toggles = Array.prototype.slice.call(b.querySelectorAll("[data-ui]"));
    [cur, bal].forEach(function (el) { el.addEventListener("input", function () { setStatus("Нажмите «Применить»"); }); });
    toggles.forEach(function (el) { el.addEventListener("change", function () { setStatus("Нажмите «Применить»"); }); });
    b.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var c = cur.value.trim(), v = Number(String(bal.value).replace(",", "."));
      if (!c) return setStatus("Укажите валюту", true);
      if (bal.value === "" || !Number.isFinite(v) || v < 0 || v > 1e12) return setStatus("Баланс: число от 0", true);
      // вид — сразу, без перезапуска
      toggles.forEach(function (el) { ui[el.getAttribute("data-ui")] = el.checked; });
      try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_) {}
      applyUi();
      var cents = Math.round(v * 100);
      if (c === wallet.currency && cents === wallet.balance) { setStatus("Сохранено"); return setTimeout(close, 350); }
      wallet.currency = c.slice(0, 12);
      wallet.balance = cents;
      walletSave();
      setStatus("Сохранено");
      // игра берёт баланс и валюту при запуске — перезапускаем
      setTimeout(function () { location.reload(); }, 300);
    });
    panel = { el: b, cur: cur, bal: bal, toggles: toggles, setStatus: setStatus, openGame: openGameSettings };
  }
  window.__aviaOpenSettings = function (openGameSettings) {
    if (!panel) buildPanel(openGameSettings);
    panel.openGame = openGameSettings;
    panel.cur.value = wallet.currency;
    panel.bal.value = String(wallet.balance / 100);
    panel.toggles.forEach(function (el) { el.checked = !!ui[el.getAttribute("data-ui")]; });
    panel.setStatus("");
    var mark = panel.el.querySelector(".fp-brand");
    mark.classList.remove("fp-anim");
    void mark.offsetWidth; // перезапуск анимации логотипа при каждом открытии
    mark.classList.add("fp-anim");
    panel.el.classList.add("is-open");
    panel.el.setAttribute("aria-hidden", "false");
  };
  // для проверки из консоли: aviaWallet.get() / aviaWallet.set({balance: 500, currency: "EUR"}) + перезагрузка
  window.aviaWallet = {
    get: function () { return { balance: wallet.balance / 100, currency: wallet.currency }; },
    set: function (o) {
      if (o.balance != null) wallet.balance = Math.round(Number(o.balance) * 100);
      if (o.currency) wallet.currency = String(o.currency).slice(0, 12);
      walletSave();
      return this.get();
    },
  };
})();
