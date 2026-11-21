/* ============================================================================
   dashboard.js -- what needs doing, rather than what already happened.

   The numbers live on PNL. This page is the diary: yearly reviews, policy
   packets, check-up calls and anything else with a date on it, plus the one
   thing worth keeping from the old dashboard -- business still waiting on a
   decision or on requirements.

   Scheduled items are their own array in the shared document. Open business
   isn't stored at all: it is read off the deals, because a deal's status
   already says whether it is waiting.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var S = window.HubStore;
  var editingId = null;

  /* A deal sitting at one of these has not been decided yet. */
  var OPEN_STATUS = { Submitted: 1, Pending: 1, Approved: 1 };
  var STALE_DAYS = 7;
  var ANNI_WINDOW = 90;      // days ahead to look for policy anniversaries
  var SOON_DAYS = 7;

  var PACKET_DAYS = 14;

  function state() { return S.state; }
  function stored() { return state().events || []; }

  /* ---------- items the deals schedule for themselves ----------

     Two follow-ups never need asking for: a policy packet check-in two weeks
     after a policy takes effect, on every deal, and an annual review a year
     out on anything indexed.

     They are derived rather than written, so opening this page never silently
     edits the document and a corrected effective date moves the follow-up with
     it. Acting on one is what makes it real: ticking it Done, editing it or
     deleting it writes a record under the same id, and that record then wins.
     Without the id the two would drift into duplicates. */
  function autoId(kind, dealId) { return "auto:" + kind + ":" + dealId; }

  function addDays(ds, n) {
    var d = dayVal(ds);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function addYears(ds, n) {
    var d = dayVal(ds);
    if (!d) return null;
    d.setFullYear(d.getFullYear() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function effectiveDate(d) { return d.issuedDate || d.date || ""; }

  function autoEvents() {
    var out = [];
    (state().deals || []).forEach(function (d) {
      if (d.status === "Declined" || d.status === "Cancelled") return;
      var eff = effectiveDate(d);
      if (!eff) return;
      var what = [d.carrier, d.policy].filter(Boolean).join(" \u00b7 ");

      var packet = addDays(eff, PACKET_DAYS);
      if (packet) out.push({ id: autoId("packet", d.id), date: packet, type: "Policy packet",
                             client: d.client || "", note: what, done: false, auto: true });

      // Indexed only, as asked -- a plain UL does not get one.
      var type = window.PolicyType ? PolicyType.forDeal(d) : null;
      if (type === "IUL") {
        var review = addYears(eff, 1);
        if (review) out.push({ id: autoId("review", d.id), date: review, type: "Yearly review",
                               client: d.client || "", note: what, done: false, auto: true });
      }
    });
    return out;
  }

  /* Everything the page works from: what was saved, plus the automatic items
     that have not been acted on. A saved record always beats its automatic
     twin, which is how Done and Delete stick. */
  function events() {
    var saved = stored();
    var byId = {};
    saved.forEach(function (e) { byId[e.id] = 1; });
    return saved.filter(function (e) { return !e.dismissed; })
      .concat(autoEvents().filter(function (e) { return !byId[e.id]; }));
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDay(d) {
    var p = String(d || "").split("-");
    return p.length === 3 ? Number(p[1]) + "/" + Number(p[2]) + "/" + p[0] : (d || "—");
  }
  function sum(arr, f) {
    return arr.reduce(function (t, x) { var v = Number(f(x)); return t + (isFinite(v) ? v : 0); }, 0);
  }

  /* Midday, deliberately: dates here are calendar days, and parsing them at
     midnight UTC lands on the previous day for anyone west of Greenwich. */
  function dayVal(ds) {
    var t = new Date(String(ds) + "T12:00:00");
    return isNaN(t.getTime()) ? null : t;
  }
  function daysFromToday(ds) {
    var a = dayVal(todayStr()), b = dayVal(ds);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }
  function relative(ds) {
    var n = daysFromToday(ds);
    if (n === null) return fmtDay(ds);
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n === -1) return "Yesterday";
    if (n < 0) return Math.abs(n) + " days ago";
    if (n < 14) return "In " + n + " days";
    return fmtDay(ds);
  }

  function chipClass(type) {
    if (type === "Yearly review") return "review";
    if (type === "Policy packet") return "packet";
    if (type === "Check-up call" || type === "Follow-up") return "";
    return "other";
  }

  /* ---------- tiles ---------- */

  function renderTiles() {
    var pending = events().filter(function (e) { return !e.done; });
    var overdue = pending.filter(function (e) { return (daysFromToday(e.date) || 0) < 0; });
    var soon = pending.filter(function (e) {
      var n = daysFromToday(e.date);
      return n !== null && n >= 0 && n <= SOON_DAYS;
    });
    var open = openDeals();
    var reqs = open.filter(function (o) { return o.d.reqs; });

    var tiles = [
      { label: "Overdue", value: String(overdue.length),
        sub: overdue.length ? "oldest " + relative(overdue.map(function (e) { return e.date; }).sort()[0]).toLowerCase() : "all clear",
        cls: overdue.length ? "profit-neg" : "" },
      { label: "Next 7 days", value: String(soon.length), sub: "scheduled", cls: "" },
      { label: "Open business", value: String(open.length),
        sub: open.length ? money(sum(open.map(function (o) { return o.d; }), function (d) { return d.ap; })) + " AP" : "nothing pending",
        cls: "" },
      { label: "Awaiting requirements", value: String(reqs.length),
        sub: reqs.length ? "chase these first" : "none outstanding",
        cls: reqs.length ? "profit-neg" : "" }
    ];
    $("dashTiles").innerHTML = tiles.map(function (t) {
      return '<div class="tile ' + t.cls + '"><div class="t-label">' + esc(t.label) + "</div>" +
        '<div class="t-value">' + esc(t.value) + "</div>" +
        '<div class="t-sub">' + esc(t.sub) + "</div></div>";
    }).join("");
  }

  /* ---------- the diary ---------- */

  function renderDue() {
    var pending = events().filter(function (e) { return !e.done; })
      .sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")); });

    var groups = [
      { key: "overdue", title: "Overdue", items: [] },
      { key: "week",    title: "Next 7 days", items: [] },
      { key: "later",   title: "Later", items: [] }
    ];
    pending.forEach(function (e) {
      var n = daysFromToday(e.date);
      if (n === null || n < 0) groups[0].items.push(e);
      else if (n <= SOON_DAYS) groups[1].items.push(e);
      else groups[2].items.push(e);
    });

    $("dueCount").textContent = pending.length
      ? pending.length + (pending.length === 1 ? " open" : " open") : "";
    $("dueEmpty").style.display = pending.length ? "none" : "";

    $("dueList").innerHTML = groups.filter(function (g) { return g.items.length; }).map(function (g) {
      return '<div class="due-group">' +
        '<div class="due-head' + (g.key === "overdue" ? " overdue" : "") + '">' +
          "<h3>" + g.title + '</h3><span class="n">' + g.items.length + "</span>" +
        "</div>" +
        g.items.map(function (e) {
          return '<div class="due' + (g.key === "overdue" ? " is-overdue" : "") + '">' +
            '<div class="due-when">' + esc(relative(e.date)) + "</div>" +
            '<span class="ev-chip ' + chipClass(e.type) + '">' + esc(e.type || "Follow-up") + "</span>" +
            '<div class="due-main">' +
              '<div class="due-who">' + esc(e.client || "—") + "</div>" +
              (e.note ? '<div class="due-note">' + esc(e.note) + "</div>" : "") +
            "</div>" +
            '<div class="due-acts">' +
              '<button type="button" class="btn small" data-done="' + esc(e.id) + '">Done</button>' +
              '<button type="button" class="btn secondary small" data-edit-ev="' + esc(e.id) + '">Edit</button>' +
            "</div>" +
          "</div>";
        }).join("") +
      "</div>";
    }).join("");
  }

  /* ---------- policy anniversaries ----------
     Derived, not stored: the date a policy was issued is already on the deal,
     so the next anniversary is arithmetic. Nothing is written until you
     schedule one, which keeps the diary to things you actually chose. */

  function anniversaries() {
    var out = [];
    (state().deals || []).forEach(function (d) {
      var base = d.issuedDate || d.date;
      var start = dayVal(base);
      if (!start) return;
      if (d.status === "Declined" || d.status === "Cancelled") return;

      var today = dayVal(todayStr());
      var next = new Date(start.getTime());
      next.setFullYear(today.getFullYear());
      if (next < today) next.setFullYear(today.getFullYear() + 1);

      var days = Math.round((next - today) / 86400000);
      if (days < 0 || days > ANNI_WINDOW) return;

      var iso = next.getFullYear() + "-" + String(next.getMonth() + 1).padStart(2, "0") +
                "-" + String(next.getDate()).padStart(2, "0");
      var years = next.getFullYear() - start.getFullYear();
      out.push({ deal: d, date: iso, days: days, years: years });
    });
    return out.sort(function (a, b) { return a.days - b.days; });
  }

  function renderAnniversaries() {
    var rows = anniversaries();
    // One already on the diary for that client and date should not be offered
    // again, or the list nags about something you have already dealt with.
    var booked = {};
    events().forEach(function (e) {
      if (e.type === "Yearly review") booked[(e.client || "").toLowerCase() + "|" + e.date] = 1;
    });

    $("anniEmpty").style.display = rows.length ? "none" : "";
    $("anniBody").innerHTML = rows.map(function (r) {
      var key = (r.deal.client || "").toLowerCase() + "|" + r.date;
      var done = !!booked[key];
      return "<tr><td>" + esc(relative(r.date)) + "</td>" +
        "<td><b>" + esc(r.deal.client || "—") + "</b></td>" +
        '<td style="color:var(--text-secondary)">' +
          esc([r.deal.carrier, r.deal.policy].filter(Boolean).join(" · ") || "—") +
          (r.years > 0 ? ' <span class="due-note">yr ' + r.years + "</span>" : "") + "</td>" +
        "<td>" + (done
          ? '<span class="due-note">scheduled</span>'
          : '<button type="button" class="btn secondary small" data-schedule="' + esc(r.deal.id) +
            '" data-when="' + esc(r.date) + '">Schedule review</button>') + "</td></tr>";
    }).join("");
  }

  /* ---------- open business (kept from the old dashboard) ---------- */

  function openDeals() {
    return (state().deals || []).filter(function (d) {
      if (d.status === "Declined" || d.status === "Cancelled") return false;
      return OPEN_STATUS[d.status] || d.reqs;
    }).map(function (d) {
      var n = daysFromToday(d.date);
      return { d: d, days: n === null ? 0 : Math.max(0, -n) };
    }).sort(function (a, b) { return b.days - a.days; });
  }

  function renderOpen() {
    var open = openDeals();
    var reqs = open.filter(function (o) { return o.d.reqs; }).length;
    var stale = open.filter(function (o) { return o.days >= STALE_DAYS; }).length;

    $("openSum").textContent = open.length
      ? money(sum(open.map(function (o) { return o.d; }), function (d) { return d.ap; })) + " AP" +
        (stale ? " · " + stale + " over a week" : "") +
        (reqs ? " · " + reqs + " on requirements" : "")
      : "";
    $("openEmpty").style.display = open.length ? "none" : "";

    $("openBody").innerHTML = open.map(function (o) {
      var d = o.d;
      var cls = o.days >= STALE_DAYS ? "hot" : o.days >= 4 ? "warm" : "";
      return "<tr><td><b>" + esc(d.client || "—") + "</b></td>" +
        '<td style="color:var(--text-secondary)">' + esc([d.carrier, d.policy].filter(Boolean).join(" · ") || "—") + "</td>" +
        '<td class="num">' + (d.ap == null ? "—" : money(d.ap)) + "</td>" +
        '<td class="num"><span class="age ' + cls + '">' + o.days + "d</span></td>" +
        "<td>" + esc(d.status || "—") +
          (d.reqs ? ' <span class="reqs-chip">REQS</span>' : "") + "</td></tr>";
    }).join("");
  }

  /* ---------- completed ---------- */

  function renderDone() {
    var done = stored().filter(function (e) { return e.done && !e.dismissed; })
      .sort(function (a, b) { return String(b.doneAt || "").localeCompare(String(a.doneAt || "")); });
    $("doneCount").textContent = done.length ? String(done.length) : "";
    $("doneEmpty").style.display = done.length ? "none" : "";
    $("doneBody").innerHTML = done.map(function (e) {
      return "<tr class='done-row'><td>" + esc(fmtDay(e.doneAt || e.date)) + "</td>" +
        "<td>" + esc(e.client || "—") + "</td>" +
        "<td>" + esc(e.type || "Follow-up") + (e.note ? " · " + esc(e.note) : "") + "</td>" +
        '<td><button type="button" class="btn secondary small" data-undone="' + esc(e.id) + '">Reopen</button></td></tr>';
    }).join("");
  }

  function renderClientList() {
    var seen = {}, out = [];
    (state().clients || []).forEach(function (c) {
      var n = (c.name || "").trim();
      if (!n || seen[n.toLowerCase()]) return;
      seen[n.toLowerCase()] = 1; out.push(n);
    });
    $("evClientList").innerHTML = out.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
  }

  function render() {
    renderTiles();
    renderDue();
    renderAnniversaries();
    renderOpen();
    renderDone();
    renderClientList();
  }

  /* ---------- the sheet ---------- */

  function openSheet() {
    $("evScrim").classList.add("show");
    $("evSheet").classList.add("show");
    setTimeout(function () { var n = $("ev-client"); if (n) n.focus(); }, 180);
  }
  function closeSheet() {
    $("evSheet").classList.remove("show");
    $("evScrim").classList.remove("show");
    editingId = null;
  }

  function fill(e, preset) {
    editingId = e ? e.id : null;
    $("ev-date").value = (e && e.date) || (preset && preset.date) || todayStr();
    $("ev-type").value = (e && e.type) || (preset && preset.type) || "Yearly review";
    $("ev-client").value = (e && e.client) || (preset && preset.client) || "";
    $("ev-note").value = (e && e.note) || (preset && preset.note) || "";
    $("evTitle").textContent = e ? "Edit" : "Schedule something";
    $("evSubmit").textContent = e ? "Save" : "Schedule";
    $("evDelete").style.display = e ? "" : "none";
  }

  function wire() {
    $("addEventBtn").addEventListener("click", function () { fill(null, null); openSheet(); });
    $("evClose").addEventListener("click", closeSheet);
    $("evScrim").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && $("evSheet").classList.contains("show")) closeSheet();
    });

    $("doneToggle").addEventListener("click", function () {
      var w = $("doneWrap");
      w.hidden = !w.hidden;
      this.textContent = w.hidden ? "Show" : "Hide";
    });

    $("evForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var id = editingId || S.uid();
      var fields = {
        date: $("ev-date").value,
        type: $("ev-type").value,
        client: $("ev-client").value.trim(),
        note: $("ev-note").value.trim()
      };
      S.commit(function (doc) {
        doc.events = doc.events || [];
        var e = doc.events.find(function (x) { return x.id === id; });
        if (!e) { e = { id: id, done: false, createdAt: todayStr() }; doc.events.push(e); }
        Object.keys(fields).forEach(function (k) { e[k] = fields[k]; });
        e.dismissed = false;
      });
      closeSheet();
      render();
    });

    $("evDelete").addEventListener("click", function () {
      var id = editingId;
      if (!id) return;
      var auto = id.indexOf("auto:") === 0;
      if (!confirm(auto
        ? "Remove this follow-up? It is scheduled automatically from the policy, so it will not come back."
        : "Delete this scheduled item?")) return;
      S.commit(function (doc) {
        doc.events = doc.events || [];
        if (auto) {
          // A tombstone, not a removal: delete the row and the deal would
          // schedule it again on the next render.
          var e = doc.events.find(function (x) { return x.id === id; });
          if (!e) { e = { id: id, createdAt: todayStr() }; doc.events.push(e); }
          e.dismissed = true;
          e.done = false;
        } else {
          doc.events = doc.events.filter(function (x) { return x.id !== id; });
        }
      });
      closeSheet();
      render();
    });

    document.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;

      if (b.dataset.done) { setDone(b.dataset.done, true); return; }
      if (b.dataset.undone) { setDone(b.dataset.undone, false); return; }

      if (b.dataset.editEv) {
        var e = events().find(function (x) { return x.id === b.dataset.editEv; });
        if (e) { fill(e, null); openSheet(); }
        return;
      }

      if (b.dataset.schedule) {
        var d = (state().deals || []).find(function (x) { return x.id === b.dataset.schedule; });
        if (!d) return;
        fill(null, {
          date: b.dataset.when,
          type: "Yearly review",
          client: d.client || "",
          note: [d.carrier, d.policy].filter(Boolean).join(" · ")
        });
        openSheet();
      }
    });
  }

  /* Ticking an automatic item is the moment it becomes a real record: there is
     nothing stored to update until then, so it is created here under the same
     id rather than quietly doing nothing. */
  function setDone(id, done) {
    var virt = events().find(function (x) { return x.id === id; });
    S.commit(function (doc) {
      doc.events = doc.events || [];
      var e = doc.events.find(function (x) { return x.id === id; });
      if (!e) {
        if (!virt) return;
        e = { id: id, date: virt.date, type: virt.type, client: virt.client,
              note: virt.note, createdAt: todayStr() };
        doc.events.push(e);
      }
      e.done = !!done;
      e.doneAt = done ? todayStr() : "";
    });
    render();
  }

  /* ---------- boot ---------- */

  S.boot({
    onStatus: function (txt, cls) {
      var el = $("syncPill");
      if (!el) return;
      if (!txt) { el.style.display = "none"; return; }
      el.style.display = "";
      el.textContent = txt;
      el.className = "sync-pill" + (cls ? " " + cls : "");
    },
    onAuth: function (user) {
      $("acctBox").classList.add("show");
      $("acctEmail").textContent = user.email || "";
      if (window.HubPrefs && S.client) {
        HubPrefs.attachCloud(S.client, user.id).then(function () {
          if (window.HubSettings) HubSettings.refresh();
        }, function () {});
      }
      revealTabs(user);
    },
    // One session across the hub; PNL owns the sign-in form.
    onSignedOut: function () { location.replace("pnl.html"); },
    onReady: function () { wire(); render(); }
  });

  S.onChange(render);

  function revealTabs(user) {
    var sb = S.client;
    if (!sb) return;
    sb.from("agency_members").select("agency_id").eq("agent_id", user.id).limit(1)
      .then(function (r) {
        if (!r.error && r.data && r.data.length) {
          var t = document.getElementById("boardTab"); if (t) t.style.display = "";
        }
      }, function () {});
    sb.from("agencies").select("id").eq("owner_id", user.id).maybeSingle()
      .then(function (r) {
        if (!r.error && r.data) {
          var o = document.getElementById("ownerTab"); if (o) o.style.display = "";
          var b = document.getElementById("boardTab"); if (b) b.style.display = "";
        }
      }, function () {});
  }
})();
