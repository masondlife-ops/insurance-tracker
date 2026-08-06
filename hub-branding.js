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

  // Just the mark -- no name/tagline text block, no dark panel. A small logo
  // sitting above the tabs, nothing else.
  var CSS = [
    ".brandbar { display: flex; align-items: center; padding: 2px 0 12px; }",
    ".brand-logo { height: 36px; width: auto; display: block; }"
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
    /* cfg: { name, logoUrl, accent } -- name/accent still just affect the tab
       title and theme colour; welcome/tagline are accepted (older rows may
       still carry them) but no longer rendered anywhere.
       Pass null/undefined, or a cfg with no logoUrl, to clear the bar --
       there's nothing left to show without one. */
    apply: function (cfg) {
      if (baseTitle === null) baseTitle = document.title;
      if (!cfg || !cfg.logoUrl) { remove(); return; }

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

      var img = el("img", "brand-logo");
      img.src = cfg.logoUrl;
      img.alt = cfg.name || "";
      // A broken logo means there's nothing left to show -- drop the whole bar
      // rather than leave a torn-looking empty box sitting above the tabs.
      img.onerror = function () { remove(); };
      bar.appendChild(img);

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
