/* ============================================================================
   expenses.js -- the Expenses page.

   Split out of the old Deals & PNL page, which did three jobs at once. Like
   the Clients page, this is a view over the shared store that writes back only
   what it owns: the expenses array, and nothing else. Deals, clients and
   settings pass through untouched, so having this page open alongside the
   others cannot cost you a policy.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var S = window.HubStore;
  var editingId = null;
  var currentMonth = null;

  function state() { return S.state; }
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
  function fmtDay(d) {
    var p = String(d || "").split("-");
    return p.length === 3 ? Number(p[1]) + "/" + Number(p[2]) + "/" + p[0] : (d || "—");
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function thisMonth() { return todayStr().slice(0, 7); }
  function sum(arr, f) {
    return arr.reduce(function (t, x) { var v = Number(f(x)); return t + (isFinite(v) ? v : 0); }, 0);
  }
  function num(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function monthLabel(ym) {
    var p = String(ym || "").split("-");
    if (p.length !== 2) return "";
    var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function shiftMonth(ym, by) {
    var p = ym.split("-"), d = new Date(Number(p[0]), Number(p[1]) - 1 + by, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  /* The month the form should default to: today if you are looking at this
     month, otherwise the 1st of whichever month you are browsing -- so adding
     an expense while reviewing March doesn't quietly file it under today. */
  function defaultDate() {
    return currentMonth === thisMonth() ? todayStr() : currentMonth + "-01";
  }

  function inMonth(list, ym) {
    return list.filter(function (x) { return String(x.date || "").slice(0, 7) === ym; });
  }
  function monthExpenses() { return inMonth(state().expenses || [], currentMonth); }
  function monthDeals() { return inMonth(state().deals || [], currentMonth); }

  /* ---------- render ---------- */

  function renderTiles() {
    var exps = monthExpenses();
    var total = sum(exps, function (e) { return e.price; });
    var leads = sum(exps.filter(function (e) { return e.kind === "lead"; }), function (e) { return e.price; });
    var other = total - leads;
    var deals = monthDeals().length;

    // Cost per deal is the number this page exists to produce: spend on its own
    // says nothing until you know what it bought.
    var cpd = deals ? total / deals : null;

    var tiles = [
      { label: "Total spend", value: money(total), sub: exps.length + (exps.length === 1 ? " expense" : " expenses") },
      { label: "Leads", value: money(leads), sub: total ? Math.round(leads / total * 100) + "% of spend" : "" },
      { label: "Other", value: money(other), sub: total ? Math.round(other / total * 100) + "% of spend" : "" },
      { label: "Cost per deal", value: cpd == null ? "—" : money(cpd),
        sub: deals ? deals + (deals === 1 ? " deal" : " deals") + " this month" : "no deals this month" }
    ];
    $("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="t-label">' + esc(t.label) + "</div>" +
        '<div class="t-value">' + t.value + "</div>" +
        '<div class="t-sub">' + esc(t.sub) + "</div></div>";
    }).join("");
  }

  function renderList() {
    var exps = monthExpenses().slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    var total = sum(exps, function (e) { return e.price; });

    $("expBody").innerHTML = exps.map(function (e) {
      var type = e.kind === "lead"
        ? '<span class="status-chip">Lead' + (e.lead ? " · " + esc(e.lead) : "") + "</span>"
        : '<span class="muted">Other</span>';
      return "<tr><td>" + fmtDay(e.date) + "</td><td>" + esc(e.item) + "</td>" +
        "<td>" + type + "</td>" +
        '<td class="num">' + money(e.price) + "</td>" +
        '<td><div class="row-actions">' +
          '<button class="btn icon" data-edit-exp="' + esc(e.id) + '" title="Edit">&#9998;</button>' +
          '<button class="btn icon" data-del-exp="' + esc(e.id) + '" title="Delete">&#10005;</button>' +
        "</div></td></tr>";
    }).join("");

    $("expFoot").innerHTML = exps.length
      ? '<tr><td colspan="3">Total</td><td class="num">' + money(total) + "</td><td></td></tr>"
      : "";
    $("expEmpty").style.display = exps.length ? "none" : "";
    $("expEmpty").textContent = "Nothing logged for " + monthLabel(currentMonth) + " yet.";
    $("expCount").textContent = exps.length ? "(" + exps.length + " · " + money(total) + ")" : "";
  }

  function renderByItem() {
    var byItem = {};
    monthExpenses().forEach(function (e) {
      var k = (e.item || "—").trim() || "—";
      byItem[k] = byItem[k] || { n: 0, total: 0 };
      byItem[k].n += 1;
      byItem[k].total += Number(e.price) || 0;
    });
    var rows = Object.keys(byItem).map(function (k) {
      return { item: k, n: byItem[k].n, total: byItem[k].total };
    }).sort(function (a, b) { return b.total - a.total; });

    $("spendBody").innerHTML = rows.map(function (r) {
      return "<tr><td>" + esc(r.item) + "</td>" +
        '<td class="num">' + r.n + "</td>" +
        '<td class="num">' + money(r.total) + "</td></tr>";
    }).join("");
    $("spendEmpty").style.display = rows.length ? "none" : "";
  }

  function renderLists() {
    var exps = state().expenses || [];
    fill("itemList", exps.map(function (e) { return e.item; }), ["Goat leads", "Ringy"]);
    fill("leadList",
      exps.map(function (e) { return e.lead; })
        .concat((state().deals || []).map(function (d) { return d.lead; })),
      ["Goat aged $3", "Referral"]);
  }
  function fill(id, values, seeds) {
    var seen = {}, out = [];
    (seeds || []).concat(values).forEach(function (v) {
      var t = String(v == null ? "" : v).trim();
      if (!t || seen[t.toLowerCase()]) return;
      seen[t.toLowerCase()] = 1; out.push(t);
    });
    $(id).innerHTML = out.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("");
  }

  function render() {
    $("monthLabel").textContent = monthLabel(currentMonth);
    renderTiles();
    renderList();
    renderByItem();
    renderLists();
  }

  /* ---------- the form ---------- */

  function syncLeadField() {
    $("e-lead-field").style.display = $("e-kind").value === "lead" ? "" : "none";
  }

  function resetForm() {
    editingId = null;
    $("expForm").reset();
    $("e-date").value = defaultDate();
    syncLeadField();
    $("expSubmit").textContent = "Add expense";
    $("expCancel").style.display = "none";
  }

  function startEdit(id) {
    var e = (state().expenses || []).find(function (x) { return x.id === id; });
    if (!e) return;
    editingId = id;
    $("e-date").value = e.date || "";
    $("e-item").value = e.item || "";
    $("e-kind").value = e.kind === "lead" ? "lead" : "other";
    $("e-lead").value = e.lead || "";
    $("e-price").value = e.price != null ? e.price : "";
    syncLeadField();
    $("expSubmit").textContent = "Save changes";
    $("expCancel").style.display = "";
    $("expForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function wire() {
    $("e-kind").addEventListener("change", syncLeadField);
    $("expCancel").addEventListener("click", resetForm);

    $("prevMonth").addEventListener("click", function () {
      currentMonth = shiftMonth(currentMonth, -1); resetForm(); render();
    });
    $("nextMonth").addEventListener("click", function () {
      currentMonth = shiftMonth(currentMonth, 1); resetForm(); render();
    });

    $("expForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var kind = $("e-kind").value;
      var id = editingId || S.uid();
      var fields = {
        date: $("e-date").value,
        item: $("e-item").value.trim(),
        kind: kind,
        lead: kind === "lead" ? $("e-lead").value.trim() : "",
        price: num($("e-price").value)
      };

      // Written as a function of the document so the store can replay it onto
      // the live cloud copy: a deal logged on the Clients page a moment ago
      // survives this save.
      S.commit(function (doc) {
        doc.expenses = doc.expenses || [];
        var e = doc.expenses.find(function (x) { return x.id === id; });
        if (!e) { e = { id: id }; doc.expenses.push(e); }
        Object.keys(fields).forEach(function (k) { e[k] = fields[k]; });
      });

      // Follow the expense to its own month, so a date typed for last month
      // doesn't look like it vanished.
      currentMonth = (fields.date || "").slice(0, 7) || currentMonth;
      resetForm();
      render();
    });

    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn) return;
      if (btn.dataset.editExp) { startEdit(btn.dataset.editExp); return; }
      if (btn.dataset.delExp) {
        var id = btn.dataset.delExp;
        var e = (state().expenses || []).find(function (x) { return x.id === id; });
        if (!e) return;
        if (!confirm("Delete " + (e.item || "this expense") + " for " + money(e.price) + "?")) return;
        S.commit(function (doc) {
          doc.expenses = (doc.expenses || []).filter(function (x) { return x.id !== id; });
        });
        if (editingId === id) resetForm();
        render();
      }
    });
  }

  /* ---------- boot ---------- */

  currentMonth = thisMonth();

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
    // One session across the hub: the PNL page owns the sign-in form, so an
    // unauthenticated visitor is sent there rather than meeting a second copy.
    onSignedOut: function () { location.replace("pnl.html"); },
    onReady: function () { wire(); resetForm(); render(); }
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
