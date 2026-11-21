/* ============================================================================
   hub-store.js -- the shared deal/client store, for every page that reads or
   writes `pnl_state`.

   Why this exists: pnl.html grew its own copy of load / migrate / sync, which
   was fine while it was the only page touching that row. It isn't any more.
   Two pages each keeping their own copy is how they drift and start
   overwriting each other's saves.

   The one rule that shapes everything here: a page writes back only the part
   of the state it owns. The clients page must never push a whole document it
   read five minutes ago, because a deal logged on another tab since then would
   vanish. So saves are read-modify-write against the live cloud row, not blind
   upserts. That costs a round trip and buys the thing that actually matters.

   Versioned deliberately: pages load `hub-store.js?v=N`, so an HTML file only
   ever gets the store it shipped with, even while a CDN still holds the last
   one.
   ========================================================================== */
(function (global) {
  "use strict";

  var STORE_KEY = "insurance-pnl-v1";          // same key pnl.html uses -- one local copy
  var CLOUD_TABLE = "pnl_state";
  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  var cfg = global.HUB_CLOUD || {};
  var cloudOn = !!(cfg.url && cfg.anonKey);
  var sb = null, user = null;
  var state = null;
  var listeners = [];

  /* ---------- shape ---------- */

  function seed() { return { deals: [], expenses: [], clients: [], events: [] }; }

  function normName(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* Additive only. Nothing here removes or rewrites an existing field, which is
     what lets an agent on a cached older page keep working against new data:
     their copy reads the whole document, ignores what it doesn't know, and
     writes it back intact. */
  function migrate(s) {
    s = s && typeof s === "object" ? s : seed();
    s.deals = (s.deals || []).filter(function (d) { return d && typeof d === "object"; });
    s.expenses = (s.expenses || []).filter(function (e) { return e && typeof e === "object"; });
    s.clients = (s.clients || []).filter(function (c) { return c && typeof c === "object"; });
    // Scheduled follow-ups and events, owned by the Dashboard.
    s.events = (s.events || []).filter(function (e) { return e && typeof e === "object"; });
    s.clients.forEach(function (c) {
      if (!c.id) c.id = uid();
      if (!Array.isArray(c.beneficiaries)) c.beneficiaries = [];
    });
    var byName = {};
    s.clients.forEach(function (c) { byName[normName(c.name)] = c; });
    s.deals.forEach(function (d) {
      var key = normName(d.client);
      if (!key) return;
      if (d.clientId && s.clients.some(function (c) { return c.id === d.clientId; })) return;
      if (!byName[key]) {
        byName[key] = {
          id: uid(), name: String(d.client).trim(), dob: "", phone: "", email: "",
          address: "", notes: "", beneficiaries: [], createdAt: d.date || ""
        };
        s.clients.push(byName[key]);
      }
      d.clientId = byName[key].id;
    });
    return s;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {}
    return seed();
  }
  function writeLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }

  /* ---------- sync ---------- */

  var status = function () {};

  /* Read-modify-write. `apply` receives the freshest document we can get and
     mutates only what this page owns; whatever else changed meanwhile survives.
     Offline or signed out, it still writes locally and reports honestly. */
  function commit(apply) {
    apply(state);
    writeLocal();
    emit();
    if (!cloudOn || !user) { status("Saved on this device", "saved"); return Promise.resolve(); }

    status("Saving…", "saving");
    return sb.from(CLOUD_TABLE).select("data").eq("user_id", user.id).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        var base = (res.data && res.data.data) ? migrate(res.data.data) : state;
        if (base !== state) {
          apply(base);          // replay this page's change onto the live document
          state = base;
          writeLocal();
          emit();
        }
        return sb.from(CLOUD_TABLE).upsert(
          { user_id: user.id, data: state, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
        status("Saved", "saved");
      })
      .catch(function () {
        // The local copy is already written, so nothing is lost -- say so rather
        // than implying the change reached the other devices.
        status("Saved on this device", "err");
      });
  }

  function pull() {
    if (!cloudOn || !user) return Promise.resolve();
    return sb.from(CLOUD_TABLE).select("data").eq("user_id", user.id).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        var cloud = res.data && res.data.data;
        var cloudHas = cloud && (((cloud.deals || []).length) || ((cloud.clients || []).length));
        // This page never seeds the cloud from a local copy: it only reads
        // clients and writes clients. Pushing a thin local document from here
        // is exactly the wipe the deals page guards against.
        if (cloudHas) { state = migrate(cloud); writeLocal(); emit(); }
        status("Saved", "saved");
      })
      .catch(function () { status("Offline", "err"); });
  }

  /* ---------- auth ---------- */

  function loadSdk(cb) {
    if (global.supabase) return cb();
    var s = document.createElement("script");
    s.src = SDK;
    s.onload = cb;
    s.onerror = function () { cloudOn = false; cb(); };   // blocked or offline -> local only
    document.head.appendChild(s);
  }

  function boot(opts) {
    opts = opts || {};
    status = opts.onStatus || function () {};
    state = readLocal();

    if (!cloudOn) { opts.onReady && opts.onReady(api); emit(); return; }

    loadSdk(function () {
      if (!cloudOn || !global.supabase) { opts.onReady && opts.onReady(api); emit(); return; }
      sb = global.supabase.createClient(cfg.url, cfg.anonKey);
      sb.auth.getSession().then(function (r) {
        var sess = r && r.data && r.data.session;
        if (sess && sess.user) {
          user = sess.user;
          opts.onAuth && opts.onAuth(user);
          opts.onReady && opts.onReady(api);
          emit();
          pull();
        } else {
          // No session here means no session anywhere in the hub -- the pages
          // share one Supabase client and one stored session.
          opts.onSignedOut && opts.onSignedOut();
        }
      });
    });
  }

  var api = {
    get state() { return state; },
    normName: normName,
    uid: uid,
    migrate: migrate,
    commit: commit,
    pull: pull,
    onChange: function (fn) { listeners.push(fn); },
    get user() { return user; },
    get client() { return sb; },
    get cloudOn() { return cloudOn; }
  };

  global.HubStore = api;
  global.HubStore.boot = boot;
})(window);
