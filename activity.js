/* ============================================================================
   activity.js -- the daily numbers.

   Replaces the per-call logger. That asked you to record every call as its own
   row with outcome checkboxes; this asks for six figures and gets out of the
   way. Typed, not tapped: at the end of a session you know you made 68 dials,
   and pressing a plus button 68 times is not how you want to say so.

   Shape, stored in activity_state alongside the old keys:

     counts: {
       "2026-11-20": { dials: 68, contacts: 12, ... },   a day
       "2026-11":    { dials: 400, ... }                 a whole month, typed
                                                          in one go
     }

   A seven-character key is a month. Month totals are the daily keys for that
   month plus its month key, kept apart so entering a month figure never
   silently overwrites days already logged, and so a day logged later still
   adds up.
   ========================================================================== */
(function (global) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var METRICS = [
    { key: "dials",         label: "Dials",         hint: "How many dials you've made" },
    { key: "leads",         label: "Leads bought",  hint: "How many leads you've received" },
    { key: "contacts",      label: "Contacts",      hint: "How many people picked up the phone" },
    { key: "appointments",  label: "Appointments",  hint: "How many appointments you've set" },
    { key: "presentations", label: "Presentations", hint: "How many people you presented numbers to" }
  ];
  /* No Sold here on purpose. A sale is a deal, and a deal is logged on the
     Clients page where it carries a carrier, a premium and a commission. A
     second tally kept by hand could only ever agree with that by luck, and
     the PNL funnel counts the deals, not this page. */

  var STORE_KEY = "agentTracker.entries.v1";
  var LEADS_KEY = "agentHub.leadTypes.v1";
  var DIALS_KEY = "agentHub.dials.v1";
  var COUNTS_KEY = "agentHub.counts.v1";
  var PENDING_KEY = "agentHub.activityPendingSync.v1";
  var CLOUD_TABLE = "activity_state";
  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  var cfg = global.HUB_CLOUD || {};
  var cloudOn = !!(cfg.url && cfg.anonKey);
  var sb = null, user = null, saveTimer = null, retryTimer = null;

  /* Everything the old page stored is carried through untouched. Dropping
     entries here would throw away the call log that counts are derived from,
     and there is no way to get it back. */
  var entries = [], leadTypes = [], dials = {}, counts = {};

  var mode = "day";          // "day" | "month"
  var day = todayStr();
  var month = day.slice(0, 7);

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function monthLabel(ym) {
    var p = String(ym || "").split("-");
    if (p.length !== 2) return "";
    return new Date(Number(p[0]), Number(p[1]) - 1, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
  function readLocal(k, fallback) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; }
    catch (e) { return fallback; }
  }
  function writeLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- reading the numbers ---------- */

  function bucket(key) { return counts[key] || {}; }

  function dayValue(ds, metric) { return num(bucket(ds)[metric]); }

  /* Days logged individually in this month, not counting the month lump. */
  function daySum(ym, metric) {
    var t = 0;
    Object.keys(counts).forEach(function (k) {
      if (k.length === 10 && k.slice(0, 7) === ym) t += num(counts[k][metric]);
    });
    return t;
  }
  function monthLump(ym, metric) { return num(bucket(ym)[metric]); }
  function monthTotal(ym, metric) { return daySum(ym, metric) + monthLump(ym, metric); }

  function shownValue(metric) {
    return mode === "day" ? dayValue(day, metric) : monthLump(month, metric);
  }

  /* ---------- writing ---------- */

  function setValue(metric, v) {
    var key = mode === "day" ? day : month;
    if (!counts[key]) counts[key] = {};
    var n = num(v);
    if (n) counts[key][metric] = n;
    else delete counts[key][metric];
    if (!Object.keys(counts[key]).length) delete counts[key];
    save();
  }

  function save() {
    writeLocal(COUNTS_KEY, counts);
    scheduleCloudSave();
    renderValues();
  }

  /* ---------- migration ----------
     The old page logged a row per call. Those rows still say how many people
     picked up and how many were presented to, so the new daily figures are
     derived from them once rather than leaving last year blank. Runs only when
     there is nothing in counts yet, so it cannot overwrite typed numbers. */
  function migrateOnce() {
    if (Object.keys(counts).length) return false;
    var touched = false;
    var add = function (ds, metric, n) {
      if (!n) return;
      if (!counts[ds]) counts[ds] = {};
      counts[ds][metric] = num(counts[ds][metric]) + n;
      touched = true;
    };
    Object.keys(dials || {}).forEach(function (ds) { add(ds, "dials", num(dials[ds])); });
    (entries || []).forEach(function (e) {
      var d = new Date(e.ts);
      if (isNaN(d.getTime())) return;
      var ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
               "-" + String(d.getDate()).padStart(2, "0");
      if (e.pickup) add(ds, "contacts", 1);
      if (e.appointment) add(ds, "appointments", 1);
      if (e.presentation) add(ds, "presentations", 1);
    });
    if (touched) writeLocal(COUNTS_KEY, counts);
    return touched;
  }

  /* ---------- render ---------- */

  function cardHtml(m) {
    var hero = m.key === "dials";
    return '<div class="metric' + (hero ? " hero" : "") + '">' +
      '<div class="m-label">' + m.label + "</div>" +
      '<div class="m-hint">' + m.hint + "</div>" +
      '<input class="m-input" type="number" inputmode="numeric" min="0" step="1" placeholder="0" ' +
        'id="m-' + m.key + '" data-metric="' + m.key + '" aria-label="' + m.label + '">' +
      '<div class="m-sub" id="sub-' + m.key + '"></div>' +
    "</div>";
  }

  function renderShell() {
    $("metrics").innerHTML = METRICS.map(cardHtml).join("");
    $("metrics").addEventListener("input", function (ev) {
      var el = ev.target.closest("[data-metric]");
      if (!el) return;
      setValue(el.getAttribute("data-metric"), el.value);
    });
  }

  function renderValues() {
    METRICS.forEach(function (m) {
      var el = $("m-" + m.key);
      if (!el) return;
      var v = shownValue(m.key);
      // Leave the box empty at zero rather than showing a 0 you have to clear.
      if (document.activeElement !== el) el.value = v ? String(v) : "";

      var sub = $("sub-" + m.key);
      if (!sub) return;
      if (mode === "month") {
        var byDay = daySum(month, m.key);
        var total = byDay + monthLump(month, m.key);
        sub.textContent = byDay
          ? "+" + byDay + " logged by day · " + total + " total"
          : "";
      } else {
        sub.textContent = "";
      }
    });
    renderSummary();
  }

  function renderSummary() {
    var ym = mode === "day" ? day.slice(0, 7) : month;
    var parts = METRICS.map(function (m) {
      return m.label + " " + monthTotal(ym, m.key);
    });
    $("summary").textContent = monthLabel(ym) + " so far — " + parts.join(" · ");
  }

  function renderPeriod() {
    $("dayWrap").hidden = mode !== "day";
    $("monthWrap").hidden = mode !== "month";
    $("dayBtn").className = "seg" + (mode === "day" ? " on" : "");
    $("monthBtn").className = "seg" + (mode === "month" ? " on" : "");
    $("periodNote").textContent = mode === "day"
      ? ""
      : "Enter a figure for the whole month. Anything you logged day by day is kept and added on top.";
    renderValues();
  }

  function wire() {
    $("dayBtn").addEventListener("click", function () { mode = "day"; renderPeriod(); });
    $("monthBtn").addEventListener("click", function () { mode = "month"; renderPeriod(); });
    $("dayPick").addEventListener("change", function () {
      day = this.value || todayStr(); month = day.slice(0, 7);
      $("monthPick").value = month;
      renderValues();
    });
    $("monthPick").addEventListener("change", function () {
      month = this.value || todayStr().slice(0, 7);
      renderValues();
    });
    $("dayPick").value = day;
    $("monthPick").value = month;
  }

  /* ---------- cloud ---------- */

  function blob() { return { entries: entries, leadTypes: leadTypes, dials: dials, counts: counts }; }

  function applyBlob(b) {
    entries = Array.isArray(b.entries) ? b.entries : [];
    leadTypes = Array.isArray(b.leadTypes) ? b.leadTypes : [];
    dials = (b.dials && typeof b.dials === "object") ? b.dials : {};
    counts = (b.counts && typeof b.counts === "object") ? b.counts : {};
    writeLocal(STORE_KEY, entries);
    writeLocal(LEADS_KEY, leadTypes);
    writeLocal(DIALS_KEY, dials);
    writeLocal(COUNTS_KEY, counts);
  }

  function pill(txt, cls) {
    var el = $("syncPill");
    if (!el) return;
    if (!txt) { el.style.display = "none"; return; }
    el.style.display = "";
    el.textContent = txt;
    el.className = "sync-pill" + (cls ? " " + cls : "");
  }

  function scheduleCloudSave() {
    if (!cloudOn || !user) return;
    try { localStorage.setItem(PENDING_KEY, "1"); } catch (e) {}
    pill("Saving…", "saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(push, 700);
  }

  function push() {
    if (!cloudOn || !user) return;
    clearTimeout(retryTimer);
    sb.from(CLOUD_TABLE).upsert(
      { user_id: user.id, data: blob(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    ).then(function (res) {
      if (res.error) { pill("Sync error", "err"); retryTimer = setTimeout(push, 8000); return; }
      try { localStorage.setItem(PENDING_KEY, "0"); } catch (e) {}
      pill("Saved", "saved");
    });
  }

  function pull() {
    // Always read before deciding to push: pushing blind on a pending flag is
    // how an empty device erases a full account.
    var pending = false;
    try { pending = localStorage.getItem(PENDING_KEY) === "1"; } catch (e) {}

    return sb.from(CLOUD_TABLE).select("data").eq("user_id", user.id).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        var cloud = res.data && res.data.data;
        var cloudHas = cloud && ((cloud.entries || []).length ||
                                 Object.keys(cloud.dials || {}).length ||
                                 Object.keys(cloud.counts || {}).length);
        var localHas = entries.length || Object.keys(dials).length || Object.keys(counts).length;

        if (!localHas && cloudHas) {
          try { localStorage.setItem(PENDING_KEY, "0"); } catch (e) {}
          applyBlob(cloud); pill("Saved", "saved"); return;
        }
        if (pending) { push(); return; }
        if (cloudHas) { applyBlob(cloud); pill("Saved", "saved"); }
        else if (localHas) { push(); }
        else { pill("Saved", "saved"); }
      });
  }

  function loadSdk(cb) {
    if (global.supabase) return cb();
    var s = document.createElement("script");
    s.src = SDK; s.onload = cb;
    s.onerror = function () { pill("Offline", "err"); cb(); };
    document.head.appendChild(s);
  }

  /* ---------- boot ---------- */

  entries = readLocal(STORE_KEY, []);
  leadTypes = readLocal(LEADS_KEY, []);
  dials = readLocal(DIALS_KEY, {});
  counts = readLocal(COUNTS_KEY, {});

  renderShell();
  wire();
  renderPeriod();

  if (!cloudOn) { migrateOnce(); renderValues(); return; }

  loadSdk(function () {
    if (!global.supabase) { migrateOnce(); renderValues(); return; }
    sb = global.supabase.createClient(cfg.url, cfg.anonKey);
    sb.auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      // One session across the hub; PNL owns the sign-in form.
      if (!sess) { location.replace("pnl.html"); return; }
      user = sess.user;
      $("acctBox").classList.add("show");
      $("acctEmail").textContent = user.email || "";
      if (global.HubPrefs) {
        HubPrefs.attachCloud(sb, user.id).then(function () {
          if (global.HubSettings) HubSettings.refresh();
        }, function () {});
      }
      revealTabs();
      pull().then(function () {
        if (migrateOnce()) scheduleCloudSave();
        renderValues();
      }, function () { migrateOnce(); renderValues(); });
    });
  });

  function revealTabs() {
    if (!sb || !user) return;
    sb.from("agency_members").select("agency_id").eq("agent_id", user.id).limit(1)
      .then(function (r) {
        if (!r.error && r.data && r.data.length) {
          var t = $("boardTab"); if (t) t.style.display = "";
        }
      }, function () {});
    sb.from("agencies").select("id").eq("owner_id", user.id).maybeSingle()
      .then(function (r) {
        if (!r.error && r.data) {
          var o = $("ownerTab"); if (o) o.style.display = "";
          var b = $("boardTab"); if (b) b.style.display = "";
        }
      }, function () {});
  }
})(window);
