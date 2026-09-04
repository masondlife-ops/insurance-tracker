/* ============================================================================
   hub-shell.js -- portal chrome (sidebar rail + topbar) shared by every page.

   Two things here are load-bearing:

   1. The rail is BUILT FROM the existing <nav class="hub-tabs"> markup, and each
      new rail link keeps the original anchor's `id`. Several pages already do
      `document.getElementById("boardTab").style.display = ""` once Supabase
      confirms agency membership. Reusing the ids means all of that existing
      reveal logic keeps working untouched -- and the solo-agent nav (no team
      section) falls out for free, since those links simply stay hidden.

   2. Section headers only render when a section has a VISIBLE link, and are
      suppressed entirely while the nav is short. A solo user shouldn't see a
      "Team" heading over nothing, or grouping over four items.
   ========================================================================== */
(function (global) {
  "use strict";

  var SECTION = {
    "dashboard.html": "Produce",
    "index.html": "Produce",
    "pnl.html": "Produce",
    "leaderboard.html": "Team",
    "owner/": "Team",
    "carriers.html": "Resources"
  };
  var ORDER = ["Produce", "Team", "Resources"];

  var ICON = {
    "dashboard.html": '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    "index.html": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/>',
    "pnl.html": '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    "leaderboard.html": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 4h12v5a6 6 0 0 1-12 0z"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="21" x2="16" y2="21"/>',
    "owner/": '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/>',
    "carriers.html": '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
  };

  var CSS = [
    ":root { --rail: #131313; --rail-hover: rgba(255,255,255,0.05); --rail-w: 244px; }",
    '@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --rail: #ffffff; --rail-hover: rgba(16,19,26,0.05); } }',
    ':root[data-theme="light"] { --rail: #ffffff; --rail-hover: rgba(16,19,26,0.05); }',

    "body.has-shell { padding: 0 !important; }",
    ".hub-tabs { display: none !important; }",
    ".shell { display: grid; grid-template-columns: var(--rail-w) 1fr; min-height: 100vh; }",

    ".rail { background: var(--rail); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 14px 12px; gap: 3px; }",
    ".rail-brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px 16px; min-width: 0; }",
    ".rail-mark { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(145deg, var(--series-1), #1d5fae); display: grid; place-items: center; font-weight: 700; font-size: 13px; color: #fff; flex: none; }",
    ".rail-logo { height: 28px; width: auto; max-width: 150px; display: block; }",
    ".rail-name { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".rail-sec { font-size: 10.5px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-muted); padding: 13px 10px 5px; }",
    ".rail .nav { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 8px; text-decoration: none; color: var(--text-secondary); font-size: 14px; font-weight: 550; }",
    ".rail .nav:hover { background: var(--rail-hover); color: var(--text-primary); }",
    ".rail .nav.on { background: var(--series-1-soft); color: var(--text-primary); box-shadow: inset 2px 0 0 var(--series-1); }",
    ".rail .nav svg { width: 17px; height: 17px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; opacity: .9; }",
    ".rail-foot { margin-top: auto; padding-top: 13px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 9px; min-width: 0; }",
    ".rail-av { width: 30px; height: 30px; border-radius: 50%; background: var(--grid); display: grid; place-items: center; font-size: 11px; font-weight: 700; color: var(--text-secondary); flex: none; }",
    ".rail-who { min-width: 0; }",
    ".rail-who b { display: block; font-size: 12.5px; font-weight: 600; }",
    ".rail-who span { display: block; font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",

    ".shell-main { display: flex; flex-direction: column; min-width: 0; }",
    ".topbar { display: flex; align-items: center; gap: 10px; padding: 11px 22px; border-bottom: 1px solid var(--border); background: var(--surface-1); flex-wrap: wrap; }",
    ".topbar .tb-title h1 { font-size: 17px; font-weight: 650; margin: 0; }",
    ".topbar .tb-title .crumb { font-size: 12px; color: var(--text-muted); }",
    ".topbar .tb-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }",
    ".shell-main > .wrap { max-width: 1180px; margin: 0; padding: 20px 22px 40px; }",
    // hub-branding.js puts the logo and agency name beside the page title. With
    // the rail showing both, that is the same brand twice on one screen -- so
    // inside the shell the header keeps only the page title.
    ".topbar .brand-logo, .topbar .brand-eyebrow { display: none !important; }",
    ".topbar .brandhead { gap: 0; }",

    ".burger { display: none; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--baseline); background: transparent; cursor: pointer; flex: none; padding: 0; }",
    ".burger i { display: block; width: 15px; height: 1.8px; margin: 3.2px auto; background: var(--text-secondary); border-radius: 2px; }",
    ".rail-scrim { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 60; opacity: 0; transition: opacity .18s ease; }",
    "@media (max-width: 900px) {",
    "  .shell { grid-template-columns: 1fr; }",
    "  .burger { display: block; }",
    "  .rail { position: fixed; top: 0; left: 0; bottom: 0; width: 278px; z-index: 61; transform: translateX(-100%); transition: transform .2s ease; box-shadow: 8px 0 26px rgba(0,0,0,.4); }",
    "  body.rail-open .rail { transform: none; }",
    "  .rail-scrim { display: block; pointer-events: none; }",
    "  body.rail-open .rail-scrim { opacity: 1; pointer-events: auto; }",
    "  .shell-main > .wrap { padding: 14px 14px 34px; }",
    "  .topbar { padding: 10px 14px; }",
    "}"
  ].join("\n");

  // Ids beat hrefs: on owner/index.html the Agency link points at a bare
  // "index.html", which read as href alone would look like the Activity page.
  var BY_ID = { boardTab: "leaderboard.html", ownerTab: "owner/" };

  function key(a) {
    if (a.id && BY_ID[a.id]) return BY_ID[a.id];
    var raw = String(a.getAttribute("href") || "");
    // Test the RAW href -- "../index.html" is Activity and must not match here.
    if (raw === "index.html" && /\/owner\//.test(location.pathname)) return "owner/";
    return raw.replace(/^\.\.\//, "").replace(/^\.\//, "");
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function initials(s) {
    var p = String(s || "").trim().split(/[\s@._-]+/).filter(Boolean);
    if (!p.length) return "?";
    return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
  }

  function build() {
    var nav = document.querySelector("nav.hub-tabs");
    if (!nav) return;
    var wrap = nav.parentNode;
    if (!wrap || !wrap.classList.contains("wrap")) return;

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add("has-shell");

    var links = [].slice.call(nav.querySelectorAll("a.hub-tab"));

    var shell = el("div", "shell");
    var rail = el("aside", "rail");
    var main = el("div", "shell-main");
    var scrim = el("div", "rail-scrim");

    var brand = el("div", "rail-brand");
    brand.innerHTML = '<div class="rail-mark" id="shellMark">&bull;</div><div class="rail-name" id="shellName">Agent Hub</div>';
    rail.appendChild(brand);

    var groups = {};
    links.forEach(function (a) {
      var sec = SECTION[key(a)] || "Produce";
      (groups[sec] = groups[sec] || []).push(a);
    });

    var made = [];
    ORDER.forEach(function (sec) {
      var items = groups[sec];
      if (!items || !items.length) return;
      var secEl = el("div", "rail-sec");
      secEl.textContent = sec;
      rail.appendChild(secEl);
      var built = [];
      items.forEach(function (src) {
        var k = key(src);
        var a = el("a", "nav" + (src.classList.contains("is-active") ? " on" : ""));
        a.setAttribute("href", src.getAttribute("href"));
        if (src.id) a.id = src.id;          // keeps existing reveal logic working
        a.style.display = src.style.display;
        a.innerHTML = '<svg viewBox="0 0 24 24">' + (ICON[k] || "") + "</svg><span>" +
                      src.textContent.trim() + "</span>";
        rail.appendChild(a);
        built.push(a);
      });
      made.push({ secEl: secEl, items: built });
    });
    nav.parentNode.removeChild(nav);   // drop the originals so ids resolve to the rail

    var foot = el("div", "rail-foot");
    foot.innerHTML = '<div class="rail-av" id="shellAv">?</div>' +
      '<div class="rail-who"><b id="shellWho">Signed out</b><span id="shellSub"></span></div>';
    rail.appendChild(foot);

    var topbar = el("div", "topbar");
    var burger = el("button", "burger");
    burger.type = "button";
    burger.setAttribute("aria-label", "Menu");
    burger.innerHTML = "<i></i><i></i><i></i>";
    topbar.appendChild(burger);

    var titleBox = el("div", "tb-title");
    topbar.appendChild(titleBox);
    var actions = el("div", "tb-actions");
    topbar.appendChild(actions);

    // Adopt the page's own header: title block on the left, its controls right.
    var header = wrap.querySelector("header");
    if (header) {
      var kids = [].slice.call(header.children);
      if (kids.length) {
        titleBox.appendChild(kids[0]);
        kids.slice(1).forEach(function (c) { actions.appendChild(c); });
      }
      header.parentNode.removeChild(header);
    }
    var crumb = el("div", "crumb");
    crumb.id = "shellCrumb";
    titleBox.insertBefore(crumb, titleBox.firstChild);

    wrap.parentNode.insertBefore(shell, wrap);
    shell.appendChild(rail);
    shell.appendChild(main);
    main.appendChild(topbar);
    main.appendChild(wrap);
    document.body.appendChild(scrim);

    function close() { document.body.classList.remove("rail-open"); }
    burger.addEventListener("click", function () { document.body.classList.toggle("rail-open"); });
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    // The burger sits top-left, the hardest spot to reach one-handed, so the
    // edge swipe is the gesture that actually gets used day to day.
    var sx = null, sy = null;
    document.addEventListener("touchstart", function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener("touchend", function (e) {
      if (sx === null) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dy) < 60 && window.innerWidth <= 900) {
        if (sx < 26 && dx > 55) document.body.classList.add("rail-open");
        else if (dx < -55) close();
      }
      sx = sy = null;
    }, { passive: true });

    function refresh() {
      var visible = 0;
      made.forEach(function (g) {
        var any = g.items.some(function (x) { return x.style.display !== "none"; });
        g.secEl.style.display = any ? "" : "none";
        g.items.forEach(function (x) { if (x.style.display !== "none") visible++; });
      });
      // Grouping earns its keep at 6+ items; below that it is noise.
      if (visible < 6) made.forEach(function (g) { g.secEl.style.display = "none"; });
    }
    refresh();
    // boardTab/ownerTab are revealed after a Supabase round-trip, so watch them.
    var mo = new MutationObserver(refresh);
    made.forEach(function (g) {
      g.items.forEach(function (x) { mo.observe(x, { attributes: true, attributeFilter: ["style"] }); });
    });

    global.HubShell = {
      refresh: refresh,
      actions: actions,
      setBrand: function (name, logoUrl) {
        var n = document.getElementById("shellName");
        var m = document.getElementById("shellMark");
        if (name && n) { n.textContent = name; if (m) m.textContent = initials(name); }
        if (logoUrl) {
          var img = new Image();
          img.onload = function () {
            brand.innerHTML = "";
            img.className = "rail-logo";
            brand.appendChild(img);
          };
          img.src = logoUrl;                      // a broken logo just leaves the text
        }
      },
      setUser: function (label, sub) {
        var w = document.getElementById("shellWho");
        var s = document.getElementById("shellSub");
        var a = document.getElementById("shellAv");
        if (w) w.textContent = label || "Signed out";
        if (s) s.textContent = sub || "";
        if (a) a.textContent = initials(label);
      },
      setCrumb: function (t) {
        var c = document.getElementById("shellCrumb");
        if (!c) return;
        // On most pages the branding hook is the <h1> itself, so a naive crumb
        // just repeats the title. Only show it when it adds something.
        var h1 = titleBox.querySelector("h1");
        var same = h1 && h1.textContent.trim() === String(t || "").trim();
        c.textContent = same ? "" : (t || "");
        c.style.display = c.textContent ? "" : "none";
      }
    };

    // Branding and account both arrive asynchronously after auth.
    function sniff() {
      var eyebrow = document.getElementById("hubBrandEyebrow");
      var logo = document.getElementById("hubBrandLogo");
      var em = document.getElementById("acctEmail");
      if (eyebrow && eyebrow.textContent.trim()) {
        // Rail only. Repeating it as a crumb above the page title would be the
        // third copy of the same name.
        global.HubShell.setBrand(eyebrow.textContent.trim(), null);
      }
      if (logo && logo.src) global.HubShell.setBrand(null, logo.src);
      if (em && em.textContent.trim()) global.HubShell.setUser(em.textContent.trim(), "");
    }
    sniff();
    // Branding lands whenever the auth round-trip finishes, which is not a time
    // we can guess -- so watch for it rather than polling on a hopeful timer.
    var bo = new MutationObserver(function () { sniff(); });
    bo.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(sniff, 1200);   // belt and braces for anything set before we attached
  }

  // Build as soon as this script runs. It is a body script, so the nav and wrap
  // it needs are already parsed above it -- waiting for DOMContentLoaded would
  // put the shell behind any page listener registered earlier, and those need
  // HubShell to exist (pnl.html puts its Add-deal button in the topbar).
  if (document.querySelector("nav.hub-tabs")) build();
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})(window);
