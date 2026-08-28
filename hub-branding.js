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

  // The logo anchors the page title rather than floating on a row of its own.
  // The agency name sits small above the page name, so branding is present
  // without taking over the <h1> -- otherwise every page is titled the same
  // thing and only the highlighted tab says where you are.
  var CSS = [
    ".brandhead { display: flex; align-items: center; gap: 12px; min-width: 0; }",
    ".brand-logo { height: 30px; width: auto; display: block; flex: none; }",
    ".brand-eyebrow { font-size: 11.5px; letter-spacing: .04em; color: var(--text-muted); line-height: 1.2; }",
    ".brandhead h1 { line-height: 1.15; }"
  ].join("\n");

  var baseTitle = null;

  // The page's own title, read before anything can overwrite it. hub-settings
  // rewrites this slot when a Hub name is set, so capturing it lazily later
  // would capture the hub name instead of the page name.
  var titleSlot = document.querySelector("[data-brand-name]");
  var pageTitle = titleSlot ? titleSlot.textContent : null;

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

  // Unwind back to the plain header: drop the logo and eyebrow, lift the title
  // block out of the wrapper, and put the page title back.
  function remove() {
    var head = document.getElementById("hubBrandhead");
    if (head && head.parentNode) {
      var titleBlock = head.querySelector(".brand-titleblock");
      if (titleBlock) {
        titleBlock.classList.remove("brand-titleblock");
        head.parentNode.insertBefore(titleBlock, head);
      }
      head.parentNode.removeChild(head);
    }
    var eye = document.getElementById("hubBrandEyebrow");
    if (eye && eye.parentNode) eye.parentNode.removeChild(eye);
    var slot = document.querySelector("[data-brand-name]");
    if (slot && pageTitle != null && !nameFromPrefs()) slot.textContent = pageTitle;
    if (baseTitle !== null) document.title = baseTitle;
  }

  // A Hub name set in Settings still wins over the agency name.
  function nameFromPrefs() {
    try { return (global.HubPrefs && global.HubPrefs.get("brandName", null)) || null; }
    catch (e) { return null; }
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
      var slot = document.querySelector("[data-brand-name]");
      var titleBlock = slot ? slot.parentNode : null;
      if (!titleBlock || !titleBlock.parentNode) return;

      var head = document.getElementById("hubBrandhead");
      if (!head) {
        head = el("div", "brandhead");
        head.id = "hubBrandhead";
        titleBlock.parentNode.insertBefore(head, titleBlock);
        titleBlock.classList.add("brand-titleblock");
        head.appendChild(titleBlock);
      }

      var img = document.getElementById("hubBrandLogo");
      if (!img) {
        img = el("img", "brand-logo");
        img.id = "hubBrandLogo";
        head.insertBefore(img, head.firstChild);
      }
      // A broken logo would leave a torn box next to the title -- drop the
      // whole treatment and fall back to the plain header instead.
      img.onerror = function () { remove(); };
      img.src = cfg.logoUrl;
      img.alt = cfg.name || "";

      // Agency name above the page name; the page name goes back in the <h1>.
      var label = nameFromPrefs() || cfg.name || "";
      var eye = document.getElementById("hubBrandEyebrow");
      if (label) {
        if (!eye) {
          eye = el("div", "brand-eyebrow");
          eye.id = "hubBrandEyebrow";
          titleBlock.insertBefore(eye, titleBlock.firstChild);
        }
        eye.textContent = label;
      } else if (eye && eye.parentNode) {
        eye.parentNode.removeChild(eye);
      }
      if (pageTitle != null) slot.textContent = pageTitle;

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
