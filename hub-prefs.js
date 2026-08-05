/* ===========================================================================
   Shared preference store for the agent hub.

   Preferences used to be scattered across a handful of localStorage keys, which
   meant they were per-BROWSER: customise your tiles on the laptop, open the hub
   on your phone, and you were back to defaults with no explanation. This keeps
   one object, writes it through to localStorage (instant, works offline) and to
   the user_prefs table (so it follows the account).

   Degrades on purpose: if supabase-prefs-setup.sql hasn't been run yet, or the
   user is offline, every call still works and simply stays local. Nothing in
   the hub should ever break because prefs couldn't reach the cloud.
   =========================================================================== */
(function (global) {
  "use strict";

  var LOCAL_KEY  = "agentHub.prefs.v1";
  var THEME_KEY  = "agentHub.theme.v1";          // legacy: still the fast-boot cache
  var TILES_KEY  = "agentHub.pnlTilesHidden.v1"; // legacy: absorbed on first load
  var TABLE      = "user_prefs";
  var SAVE_DELAY = 800;

  var prefs   = {};
  var sb      = null;
  var userId  = null;
  var timer   = null;
  var cloudOk = false;   // flips true once a cloud read/write succeeds
  var listeners = [];

  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; } }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  /* Pull the old standalone keys in once, so nobody loses settings they
     already had. Only fills gaps -- never overwrites a real prefs value. */
  function absorbLegacy() {
    var changed = false;
    try {
      var t = localStorage.getItem(THEME_KEY);
      if (t && prefs.theme == null) { prefs.theme = t; changed = true; }
    } catch (e) {}
    try {
      var raw = localStorage.getItem(TILES_KEY);
      if (raw && prefs.pnlTilesHidden == null) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) { prefs.pnlTilesHidden = arr; changed = true; }
      }
    } catch (e) {}
    return changed;
  }

  function notify(key) {
    listeners.forEach(function (fn) {
      try { fn(key, prefs); } catch (e) { console.error("prefs listener failed", e); }
    });
  }

  /* The theme is read by a tiny synchronous script in each page's <head> to
     avoid a flash of the wrong palette, and that script can't wait on us.
     So the legacy key stays the boot cache and prefs stays the source of truth. */
  function mirrorTheme() {
    try {
      if (prefs.theme) localStorage.setItem(THEME_KEY, prefs.theme);
      else localStorage.removeItem(THEME_KEY);
    } catch (e) {}
  }

  function scheduleSave() {
    writeLocal();
    mirrorTheme();
    if (!sb || !userId) return;
    clearTimeout(timer);
    timer = setTimeout(pushCloud, SAVE_DELAY);
  }

  function pushCloud() {
    if (!sb || !userId) return;
    sb.from(TABLE)
      .upsert({ user_id: userId, data: prefs, updated_at: new Date().toISOString() },
              { onConflict: "user_id" })
      .then(function (res) {
        if (res && res.error) { cloudOk = false; return; }
        cloudOk = true;
      });
  }

  var API = {
    /* Call as early as possible; safe before login. */
    boot: function () {
      prefs = readLocal();
      if (absorbLegacy()) writeLocal();
      return API;
    },

    /* Called once the page has an authenticated supabase client. Merges what's
       in the cloud with what's on this device, preferring the cloud for keys it
       actually has, then re-saves so both ends agree. */
    attachCloud: function (client, uid) {
      sb = client; userId = uid;
      if (!sb || !userId) return Promise.resolve(prefs);
      return sb.from(TABLE).select("data").eq("user_id", userId).maybeSingle()
        .then(function (res) {
          if (res && res.error) {
            // Most likely the table doesn't exist yet -- stay local, stay quiet.
            cloudOk = false;
            return prefs;
          }
          cloudOk = true;
          var remote = (res && res.data && res.data.data) || null;
          if (remote && typeof remote === "object") {
            var local = prefs;
            prefs = clone(remote);
            // Keep any local-only keys the cloud copy hasn't seen yet.
            Object.keys(local).forEach(function (k) {
              if (!(k in prefs)) prefs[k] = local[k];
            });
          }
          writeLocal();
          mirrorTheme();
          notify(null);
          pushCloud();
          return prefs;
        })
        .catch(function () { cloudOk = false; return prefs; });
    },

    get: function (key, fallback) {
      var v = prefs[key];
      return (v === undefined || v === null) ? fallback : v;
    },

    set: function (key, value) {
      if (value === undefined) delete prefs[key];
      else prefs[key] = value;
      scheduleSave();
      notify(key);
      return API;
    },

    all: function () { return clone(prefs); },

    /* fn(changedKey, prefs). changedKey is null for a bulk cloud merge. */
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); return API; },

    /* True only once the cloud has actually answered -- the settings panel uses
       this to tell the user their prefs are device-only until the SQL is run. */
    isSynced: function () { return cloudOk; },

    /* Flush immediately, e.g. before a sign-out. */
    flush: function () { clearTimeout(timer); pushCloud(); }
  };

  global.HubPrefs = API.boot();
})(window);
