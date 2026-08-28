/* ===========================================================================
   Shared settings panel.

   Lives in one file so all ten pages get the same panel instead of ten
   near-identical copies. A page opts in by loading this script; it can add its
   own section with HubSettings.register({...}) (the Activity page uses that for
   the call-outcome editor).

   Depends on HubPrefs. Safe to load before login -- everything works locally and
   starts syncing once the page calls HubPrefs.attachCloud().
   =========================================================================== */
(function (global) {
  "use strict";

  var sections = [];
  var built = false;
  var els = {};

  var CSS = [
    ".hs-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80;display:none;}",
    ".hs-backdrop.show{display:block;}",
    ".hs-panel{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);z-index:81;",
    "  background:var(--surface-1);border-left:1px solid var(--border);display:none;",
    "  flex-direction:column;box-shadow:-8px 0 24px rgba(0,0,0,.18);}",
    ".hs-panel.show{display:flex;}",
    ".hs-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);}",
    ".hs-head h2{font-size:15px;margin:0;flex:1;}",
    ".hs-body{overflow-y:auto;padding:4px 16px 20px;flex:1;}",
    ".hs-sec{padding:16px 0;border-bottom:1px solid var(--border);}",
    ".hs-sec:last-child{border-bottom:none;}",
    ".hs-sec>h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin:0 0 10px;}",
    ".hs-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;}",
    ".hs-row label{font-size:13px;color:var(--text-secondary);min-width:88px;}",
    ".hs-note{font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.5;}",
    ".hs-seg{display:inline-flex;border:1px solid var(--baseline);border-radius:8px;overflow:hidden;}",
    ".hs-seg button{font:inherit;font-size:12.5px;padding:5px 12px;border:none;background:var(--page);",
    "  color:var(--text-secondary);cursor:pointer;}",
    ".hs-seg button.on{background:var(--series-1);color:#fff;}",
    ".hs-input{font:inherit;font-size:13px;color:var(--text-primary);background:var(--page);",
    "  border:1px solid var(--baseline);border-radius:8px;padding:6px 8px;}",
    ".hs-input.grow{flex:1;min-width:120px;}",
    ".hs-btn{font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;",
    "  border:1px solid var(--baseline);background:var(--page);color:var(--text-primary);cursor:pointer;}",
    ".hs-btn.primary{background:var(--series-1);border-color:var(--series-1);color:#fff;}",
    ".hs-btn.danger{color:var(--danger);}",
    ".hs-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}",
    ".hs-item{display:flex;align-items:center;gap:8px;font-size:13px;padding:7px 10px;",
    "  border:1px solid var(--border);border-radius:8px;background:var(--page);}",
    ".hs-item .nm{flex:1;}",
    ".hs-item .where{font-size:11px;color:var(--text-muted);}",
    ".hs-inline-toggle{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);cursor:pointer;white-space:nowrap;}",
    ".hs-checkrow{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-secondary);margin:-2px 0 10px;cursor:pointer;}",
    ".hs-empty{font-size:12.5px;color:var(--text-muted);padding:2px 0 8px;}",
    ".hs-err{font-size:12px;color:var(--danger);margin-top:6px;min-height:15px;}",
    ".hs-sync{font-size:11.5px;color:var(--text-muted);padding:10px 16px;border-top:1px solid var(--border);}"
  ].join("");

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function injectCss() {
    if (document.getElementById("hs-css")) return;
    var s = document.createElement("style");
    s.id = "hs-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- appearance (every page gets this) ---------------- */

  function themeSection(body) {
    var wrap = el("div", "hs-sec");
    wrap.appendChild(el("h3", null, "Appearance"));

    var row = el("div", "hs-row");
    row.appendChild(el("label", null, "Theme"));
    var seg = el("div", "hs-seg");
    [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].forEach(function (o) {
      var b = el("button", null, o[1]);
      b.type = "button";
      b.dataset.val = o[0];
      b.onclick = function () {
        global.HubPrefs.set("theme", o[0] === "auto" ? undefined : o[0]);
        applyTheme();
        paintTheme(seg);
      };
      seg.appendChild(b);
    });
    row.appendChild(seg);
    wrap.appendChild(row);
    paintTheme(seg);

    var arow = el("div", "hs-row");
    arow.appendChild(el("label", null, "Accent"));
    var color = el("input", "hs-input");
    color.type = "color";
    color.style.padding = "2px";
    color.style.width = "46px";
    color.value = global.HubPrefs.get("accent", "") || currentAccent();
    color.oninput = function () { global.HubPrefs.set("accent", color.value); applyBranding(); };
    arow.appendChild(color);
    var reset = el("button", "hs-btn", "Reset");
    reset.type = "button";
    reset.onclick = function () {
      global.HubPrefs.set("accent", undefined);
      applyBranding();
      color.value = currentAccent();
    };
    arow.appendChild(reset);
    wrap.appendChild(arow);

    var nrow = el("div", "hs-row");
    nrow.appendChild(el("label", null, "Hub name"));
    var name = el("input", "hs-input grow");
    name.type = "text";
    name.placeholder = defaultBrandName();
    name.value = global.HubPrefs.get("brandName", "");
    name.oninput = function () {
      global.HubPrefs.set("brandName", name.value.trim() || undefined);
      applyBranding();
    };
    nrow.appendChild(name);
    wrap.appendChild(nrow);

    wrap.appendChild(el("div", "hs-note",
      "Applies across every tab on this account. Leave the name blank to use the default."));
    body.appendChild(wrap);
  }

  function paintTheme(seg) {
    var cur = global.HubPrefs.get("theme", null) || "auto";
    Array.prototype.forEach.call(seg.children, function (b) {
      b.className = b.dataset.val === cur ? "on" : "";
    });
  }

  /* ---------------- branding ---------------- */

  // Each page's own heading (e.g. "Deals & PNL") is captured once, the first time
  // applyBranding runs, and used as the un-set default -- so a page with no custom
  // name keeps its own distinct heading instead of being overwritten with something
  // generic. Only once a name is actually saved does every tab switch to showing it.
  var originalBrandText = null;
  function captureOriginal() {
    if (originalBrandText !== null) return;
    var slot = document.querySelector("[data-brand-name]");
    originalBrandText = slot ? slot.textContent : "Agent Hub";
  }
  function defaultBrandName() {
    captureOriginal();
    return originalBrandText;
  }
  function defaultAccent() {
    return (global.HUB_BRAND && global.HUB_BRAND.accent) || "#2a78d6";
  }
  function currentAccent() {
    return global.HubPrefs.get("accent", "") || defaultAccent();
  }

  function applyTheme() {
    var t = global.HubPrefs.get("theme", null);
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }

  function applyBranding() {
    var accent = global.HubPrefs.get("accent", null);
    if (accent) {
      document.documentElement.style.setProperty("--series-1", accent);
      document.documentElement.style.setProperty("--series-1-soft", hexToSoft(accent));
    } else {
      document.documentElement.style.removeProperty("--series-1");
      document.documentElement.style.removeProperty("--series-1-soft");
    }
    captureOriginal();
    var name = global.HubPrefs.get("brandName", null);
    var slot = document.querySelector("[data-brand-name]");
    // When a logo is showing, the header has an eyebrow above the page title --
    // the hub name belongs there, and the <h1> stays the page name. Without a
    // logo there's nowhere else to put it, so it takes over the title as before.
    var eyebrow = document.getElementById("hubBrandEyebrow");
    if (eyebrow) {
      if (name) eyebrow.textContent = name;
      if (slot) slot.textContent = originalBrandText;
    } else if (slot) {
      slot.textContent = name || originalBrandText;
    }
  }

  function hexToSoft(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return "rgba(42,120,214,0.12)";
    return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + ",0.14)";
  }

  /* ---------------- panel plumbing ---------------- */

  function build() {
    if (built) return;
    injectCss();

    els.backdrop = el("div", "hs-backdrop");
    els.backdrop.onclick = close;

    els.panel = el("div", "hs-panel");
    var head = el("div", "hs-head");
    head.appendChild(el("h2", null, "Settings"));
    var x = el("button", "hs-btn", "Close");
    x.type = "button"; x.onclick = close;
    head.appendChild(x);
    els.panel.appendChild(head);

    els.body = el("div", "hs-body");
    els.panel.appendChild(els.body);

    els.sync = el("div", "hs-sync");
    els.panel.appendChild(els.sync);

    document.body.appendChild(els.backdrop);
    document.body.appendChild(els.panel);
    built = true;
  }

  function render() {
    build();
    els.body.innerHTML = "";
    themeSection(els.body);
    sections.forEach(function (s) {
      var wrap = el("div", "hs-sec");
      wrap.appendChild(el("h3", null, s.title));
      try { s.render(wrap); } catch (e) {
        console.error("settings section failed: " + s.title, e);
        wrap.appendChild(el("div", "hs-note", "This section failed to load."));
      }
      els.body.appendChild(wrap);
    });
    els.sync.textContent = global.HubPrefs.isSynced()
      ? "Saved to your account — these settings follow you to any device."
      : "Saved on this device only. Run supabase-prefs-setup.sql to sync them to your account.";
  }

  function open() { render(); els.backdrop.classList.add("show"); els.panel.classList.add("show"); }
  function close() { if (!built) return; els.backdrop.classList.remove("show"); els.panel.classList.remove("show"); }

  global.HubSettings = {
    /* Page-specific section: {title, render(containerEl)} */
    register: function (s) { if (s && s.title && typeof s.render === "function") sections.push(s); },
    open: open,
    close: close,
    refresh: function () { if (built && els.panel.classList.contains("show")) render(); },
    applyBranding: applyBranding,

    /* Adds the gear. Pass a selector/element to place it somewhere specific. */
    // target: element/selector to place the gear in. beforeEl: an existing child
    // of target to insert immediately before (falls back to appending last).
    mount: function (target, beforeEl) {
      var host = typeof target === "string" ? document.querySelector(target) : target;
      var b = el("button", "mini", "⚙");
      b.type = "button";
      b.id = "hubSettingsBtn";
      b.title = "Settings";
      b.onclick = open;
      if (host) {
        if (beforeEl && beforeEl.parentNode === host) host.insertBefore(b, beforeEl);
        else host.appendChild(b);
      } else {
        b.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:60;";
        document.body.appendChild(b);
      }
      return b;
    }
  };

  /* Branding should land as soon as the DOM exists, and again after the cloud
     merge in case another device set it. */
  function boot() { applyTheme(); applyBranding(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  if (global.HubPrefs) global.HubPrefs.onChange(function () { applyTheme(); applyBranding(); });
})(window);
