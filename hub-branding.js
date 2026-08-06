/* ===========================================================================
   Agency branding, rendered from data.

   Replaces the hand-maintained undeniable/ fork. Instead of a second copy of
   every page carrying a hardcoded brand bar, one codebase renders the bar from
   a config object -- normally the caller's own agency row, so any agency can be
   branded without adding files.

   apply(cfg) is idempotent and safe to call repeatedly (login, cloud merge,
   theme change). apply(null) removes the bar entirely, which is the correct
   state for a logged-out visitor or an agent with no agency.
   =========================================================================== */
(function (global) {
  "use strict";

  var CSS = [
    ".brandbar { display: flex; align-items: center; gap: 18px; background: #000; border: 1px solid #2a2a2a; border-radius: 12px; padding: 14px 20px; }",
    ".brand-logo { height: 84px; width: auto; flex: none; display: block; }",
    ".brand-copy { min-width: 0; }",
    ".brand-hi { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #8b8b8b; }",
    ".brand-user { font-size: 26px; font-weight: 700; line-height: 1.15; margin-top: 2px; color: #f0f0f0; }",
    "@supports (-webkit-background-clip: text) or (background-clip: text) {",
    "  .brand-user { background: linear-gradient(180deg,#ffffff 0%,#d2d2d2 45%,#8e8e8e 62%,#ededed 100%);",
    "    -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent; }",
    "}",
    ".brand-tag { font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: #6f6f6f; margin-top: 5px; }",
    "@media (max-width: 640px) {",
    "  .brandbar { gap: 12px; padding: 12px 14px; }",
    "  .brand-logo { height: 58px; }",
    "  .brand-user { font-size: 20px; }",
    "  .brand-tag { display: none; }",
    "}"
  ].join("\n");

  var baseTitle = null;

  function injectCss() {
    if (document.getElementById("hub-brand-css")) return;
    var s = document.createElement("style");
    s.id = "hub-brand-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function remove() {
    var bar = document.getElementById("hubBrandbar");
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    if (baseTitle !== null) document.title = baseTitle;
  }

  var API = {
    /* cfg: { name, logoUrl, welcome, tagline, accent } -- every field optional.
       Pass null/undefined to clear the bar. */
    apply: function (cfg) {
      if (baseTitle === null) baseTitle = document.title;
      if (!cfg || !(cfg.name || cfg.logoUrl || cfg.welcome)) { remove(); return; }

      injectCss();
      var wrap = document.querySelector(".wrap");
      if (!wrap) return;

      var bar = document.getElementById("hubBrandbar");
      if (!bar) {
        bar = el("div", "brandbar");
        bar.id = "hubBrandbar";
        wrap.insertBefore(bar, wrap.firstChild);
      }
      bar.innerHTML = "";

      if (cfg.logoUrl) {
        var img = el("img", "brand-logo");
        img.src = cfg.logoUrl;
        img.alt = cfg.name || "";
        // A broken logo shouldn't leave a torn-looking header -- drop the image
        // and let the text carry the branding on its own.
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
        bar.appendChild(img);
      }

      var copy = el("div", "brand-copy");
      copy.appendChild(el("div", "brand-hi", "Welcome"));
      // The greeting is the person, not the agency -- falls back to the signed-in
      // account so it stops being a hardcoded string in the markup.
      copy.appendChild(el("div", "brand-user", cfg.welcome || cfg.name || ""));
      if (cfg.tagline) copy.appendChild(el("div", "brand-tag", cfg.tagline));
      bar.appendChild(copy);

      if (cfg.name) document.title = cfg.name + " — " + baseTitle;
      if (cfg.accent) {
        document.documentElement.style.setProperty("--series-1", cfg.accent);
      }
    },

    clear: remove,

    /* Reads the caller's agency branding via my_branding(), a SECURITY DEFINER
       function scoped to their own agency. It has to go through a function
       rather than a plain select because `agencies` is owner-read-only -- read
       directly, an owner would see their branding and none of their agents
       would. Returns null for anyone not in an agency, and also if the function
       doesn't exist yet, so a hub running against an un-migrated database just
       renders unbranded instead of erroring. */
    fetch: function (sb) {
      if (!sb) return Promise.resolve(null);
      return sb.rpc("my_branding")
        .then(function (res) {
          if (!res || res.error) return null;
          return res.data || null;
        })
        .catch(function () { return null; });
    }
  };

  global.HubBranding = API;
})(window);
