/* ============================================================================
   hub-contract.js -- your contract level, as an account-level setting.

   It used to live in pnl_state.settings, which meant only Deals & PNL could
   read or write it: that page is the sole writer of the deals blob, and adding
   a second writer is exactly how an agent's deals got wiped once. Moving it to
   HubPrefs (the user_prefs table) makes it editable from any page without
   anything else touching deal data.

   Migration is read-through. Prefs wins; if prefs has nothing, the old
   pnl_state value is used and copied up on first sight, so nobody has to
   re-enter a level they already set.
   ========================================================================== */
(function (global) {
  "use strict";

  var KEY = "contractLevel";
  var legacy = null;      // value handed over by pnl.html, if any
  var listeners = [];

  function levels() {
    return global.COMP_LEVELS || [145,140,135,130,125,120,115,110,105,100,95,90,85,80];
  }

  function prefsValue() {
    if (!global.HubPrefs) return null;
    var v = global.HubPrefs.get(KEY, null);
    return (v === "" || v == null) ? null : v;
  }

  var API = {
    /* The effective level: prefs first, then whatever pnl_state carried. */
    get: function () {
      var v = prefsValue();
      if (v != null) return v;
      return legacy;
    },

    set: function (v) {
      var val = (v === "" || v == null) ? null : String(v);
      if (global.HubPrefs) global.HubPrefs.set(KEY, val === null ? "" : val);
      legacy = val;
      listeners.forEach(function (f) { try { f(val); } catch (e) {} });
    },

    /* pnl.html hands over its stored value on boot. If prefs is empty this is
       the migration: adopt it and write it up so every other page sees it. */
    adoptLegacy: function (v) {
      if (v === "" || v == null) return;
      legacy = String(v);
      if (prefsValue() == null && global.HubPrefs) global.HubPrefs.set(KEY, legacy);
    },

    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); },

    section: function () {
      return {
        title: "Your contract level",
        order: 10,
        render: function (wrap) {
          var row = document.createElement("div");
          row.className = "hs-row";

          var sel = document.createElement("select");
          sel.id = "hubContractLevel";
          var blank = document.createElement("option");
          blank.value = ""; blank.textContent = "Set level…";
          sel.appendChild(blank);
          levels().forEach(function (l) {
            var o = document.createElement("option");
            o.value = l; o.textContent = l;
            sel.appendChild(o);
          });
          var cur = API.get();
          sel.value = cur == null ? "" : String(cur);
          sel.addEventListener("change", function () { API.set(this.value); });

          row.appendChild(sel);
          wrap.appendChild(row);

        }
      };
    }
  };

  global.HubContract = API;

  // Register on every page that has the settings panel.
  if (global.HubSettings && typeof global.HubSettings.register === "function") {
    global.HubSettings.register(API.section());
  }
})(window);
