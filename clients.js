/* ============================================================================
   clients.js -- the Clients page (book of business).

   A view over the shared store, nothing more: it reads deals and clients from
   HubStore and writes back only the clients array and the clientId links. It
   never writes a deal's figures, so it cannot damage anything the Deals page
   owns even when both are open.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var S = window.HubStore;
  var viewingId = null, editingId = null;
  var dealMonth = null;   // which month the policies list is showing

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
  function monthLabel(ym) {
    var p = String(ym || "").split("-");
    if (p.length !== 2) return "";
    return new Date(Number(p[0]), Number(p[1]) - 1, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function shiftMonth(ym, by) {
    var p = ym.split("-"), d = new Date(Number(p[0]), Number(p[1]) - 1 + by, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function sum(arr, f) {
    return arr.reduce(function (t, x) { var v = Number(f(x)); return t + (isFinite(v) ? v : 0); }, 0);
  }

  /* Worked out from carrier and product each time, never stored, so correcting
     the rules fixes every policy already on the board. */
  /* Paid is a yes/no, so it reads better as a mark than as another word in a
     row already carrying a status. */
  function paidTick(d) {
    return d && d.paid ? ' <span class="paid-tick" title="Paid">\u2713</span>' : "";
  }

  function typeCell(d) {
    var t = window.PolicyType ? PolicyType.forDeal(d) : null;
    return t ? esc(t) : '<span class="muted-cell">\u2014</span>';
  }

  function clientById(id) {
    return state().clients.find(function (c) { return c.id === id; }) || null;
  }
  function clientByName(name) {
    var key = S.normName(name);
    if (!key) return null;
    return state().clients.find(function (c) { return S.normName(c.name) === key; }) || null;
  }
  function dealsForClient(id) {
    return state().deals
      .filter(function (d) { return d.clientId === id; })
      .sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
  }
  function ageFrom(dob) {
    var d = new Date(String(dob) + "T12:00:00");
    if (isNaN(d.getTime())) return null;
    var now = new Date(), age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 && age < 130 ? age + " yrs" : null;
  }

  /* ---------- the list ---------- */

  function rowFor(c) {
    var ds = dealsForClient(c.id);
    var carriers = [];
    ds.forEach(function (d) {
      var x = (d.carrier || "").trim();
      if (x && carriers.indexOf(x) === -1) carriers.push(x);
    });
    return { client: c, deals: ds, ap: sum(ds, function (d) { return d.ap; }),
             carriers: carriers, last: ds.length ? ds[0].date : "" };
  }

  /* One box over everything someone might remember about a client -- their
     name, the number they called from, or just the carrier. Every word has to
     match, so a second word narrows instead of widening. */
  /* Matched per ROW, not per client, because a row is now one policy. Searching
     a client's name matches every row they own; searching a carrier matches
     only the policies with it, instead of dragging along everything else that
     client ever bought. */
  function rowMatches(c, d, q) {
    if (!q) return true;
    // Deliberately not searched: ssn, bank. A search box is the easiest way to
    // confirm a number you already half-know, and typing one here would put it
    // in the browser's input history.
    var hay = [c.name, c.phone, c.email, c.address, c.notes]
      .concat((c.beneficiaries || []).map(function (b) { return b.name || ""; }))
      .concat(d ? [d.carrier, d.policy, d.policyNumber, d.status, d.lead, d.notes,
                   (window.PolicyType && PolicyType.forDeal(d)) || ""] : [])
      .join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) {
      return hay.indexOf(w) !== -1;
    });
  }

  function renderBook() {
    var q = ($("bookSearch").value || "").trim();
    /* One row per policy, matching the month list above — the two tables read
       the same way, one filtered to a month and this one covering everything.
       A client with nothing written yet still gets a row: they are in the book,
       and a record you cannot see is a record you cannot add a policy to. */
    var rows = [];
    state().clients.map(rowFor).forEach(function (r) {
      if (!r.deals.length) {
        if (rowMatches(r.client, null, q)) rows.push({ client: r.client, deal: null });
        return;
      }
      r.deals.forEach(function (d) {
        if (rowMatches(r.client, d, q)) rows.push({ client: r.client, deal: d });
      });
    });
    var matchedIds = {};
    rows.forEach(function (r) { matchedIds[r.client.id] = 1; });
    rows.sort(function (x, y) {
      var dx = (x.deal && x.deal.date) || "", dy = (y.deal && y.deal.date) || "";
      return String(dy).localeCompare(String(dx)) ||
             x.client.name.localeCompare(y.client.name);
    });

    var total = state().clients.length;
    $("bookCount").textContent = total
      ? (q ? rows.length + (rows.length === 1 ? " match" : " matches") : total + (total === 1 ? " client" : " clients"))
      : "";

    $("bookBody").innerHTML = rows.map(function (r) {
      var d = r.deal;
      return '<tr data-client="' + esc(r.client.id) + '">' +
        "<td>" + (d && d.date ? fmtDay(d.date) : "—") + "</td>" +
        "<td><b>" + esc(r.client.name) + "</b></td>" +
        "<td>" + (d ? esc([d.carrier, d.policy].filter(Boolean).join(" · ") || "—") : "—") + "</td>" +
        "<td>" + (d ? typeCell(d) : "—") + "</td>" +
        '<td class="num">' + (d ? money(d.ap) : "—") + "</td>" +
        '<td class="num">' + (d ? money(d.com) : "—") + "</td>" +
        "<td>" + (d ? esc(d.status || "—") + paidTick(d) : '<span class="muted-cell">No policy yet</span>') + "</td>" +
        '<td><button type="button" class="btn secondary small" data-edit-client="' + esc(r.client.id) + '"' +
          ' data-edit-row-deal="' + esc(d ? d.id : "") + '">Edit</button></td>' +
      "</tr>";
    }).join("");

    var empty = $("bookEmpty");
    empty.style.display = rows.length ? "none" : "";
    empty.textContent = total
      ? "No client matches \u201c" + q + "\u201d."
      : "No deals yet. Use Add deal — it takes the client and their policy together.";

    if (viewingId && !matchedIds[viewingId]) viewingId = null;
    renderMonthDeals();
    renderDetail();
  }

  /* ---------- policies, by month ---------- */

  function renderMonthDeals() {
    var ds = state().deals
      .filter(function (d) { return String(d.date || "").slice(0, 7) === dealMonth; })
      .sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });

    $("dealMonthLabel").textContent = monthLabel(dealMonth);

    var ap = sum(ds, function (d) { return d.ap; });
    var com = sum(ds, function (d) { return d.com; });

    $("monthDealBody").innerHTML = ds.map(function (d) {
      return '<tr data-open-deal="' + esc(d.id) + '">' +
        "<td>" + fmtDay(d.date) + "</td>" +
        "<td><b>" + esc(d.client || "—") + "</b></td>" +
        "<td>" + esc([d.carrier, d.policy].filter(Boolean).join(" · ") || "—") + "</td>" +
        "<td>" + typeCell(d) + "</td>" +
        "<td>" + esc(d.policyNumber || "—") + "</td>" +
        '<td class="num">' + money(d.ap) + "</td>" +
        '<td class="num">' + money(d.com) + "</td>" +
        "<td>" + esc(d.status || "—") + paidTick(d) + "</td>" +
        '<td><button type="button" class="btn secondary small" data-edit-deal="' + esc(d.id) + '">Edit</button></td>' +
      "</tr>";
    }).join("");

    $("monthDealFoot").innerHTML = ds.length
      ? '<tr><td colspan="5">Total</td><td class="num">' + money(ap) + "</td>" +
        '<td class="num">' + money(com) + "</td><td></td><td></td></tr>"
      : "";

    var empty = $("monthDealEmpty");
    empty.style.display = ds.length ? "none" : "";
    empty.textContent = "No policies written in " + monthLabel(dealMonth) + ".";
    $("monthDealCount").textContent = ds.length
      ? "(" + ds.length + " · " + money(ap) + " AP)" : "";
  }

  /* ---------- one client, full screen ---------- */

  /* Masked until asked for, and the reveal lapses on its own. A record left
     open on a desk should not keep an SSN on screen. */
  var REVEAL_MS = 30000;
  var revealed = {};          // field -> timeout id
  var revealTimers = {};

  function maskTail(v, keep, groups) {
    var raw = String(v == null ? "" : v).replace(/\s+/g, "");
    if (!raw) return "";
    var digits = raw.replace(/\D/g, "");
    var tail = digits.slice(-keep);
    if (digits.length <= keep) return tail;
    return (groups || "") + tail;
  }
  function maskSsn(v) {
    var t = maskTail(v, 4);
    return t ? "•••-••-" + t : "";
  }
  function maskAcct(v) {
    var t = maskTail(v, 4);
    return t ? "••••" + t : "";
  }

  function secret(field, value, masker) {
    if (!value) return "—";
    var open = !!revealed[field];
    return '<span class="secret"><code>' +
      esc(open ? value : masker(value)) + "</code>" +
      '<button type="button" class="reveal" data-reveal="' + esc(field) + '">' +
      (open ? "Hide" : "Show") + "</button></span>";
  }

  function toggleReveal(field) {
    if (revealed[field]) {
      delete revealed[field];
      clearTimeout(revealTimers[field]);
    } else {
      revealed[field] = true;
      clearTimeout(revealTimers[field]);
      revealTimers[field] = setTimeout(function () {
        delete revealed[field];
        renderDetail();
      }, REVEAL_MS);
    }
    renderDetail();
  }
  function clearReveals() {
    Object.keys(revealTimers).forEach(function (k) { clearTimeout(revealTimers[k]); });
    revealed = {}; revealTimers = {};
  }

  function row(label, val) {
    return val ? "<dt>" + label + "</dt><dd>" + esc(val) + "</dd>" : "";
  }
  function rawRow(label, html) {
    return html ? "<dt>" + label + "</dt><dd>" + html + "</dd>" : "";
  }
  function noteCard(title, body) {
    if (!String(body || "").trim()) return "";
    return '<div class="card"><h2>' + title + '</h2>' +
           '<div class="note-body">' + esc(body) + "</div></div>";
  }

  function renderDetail() {
    var box = $("clientDetail");
    var c = viewingId ? clientById(viewingId) : null;
    if (!c) {
      box.hidden = true; box.innerHTML = "";
      document.body.style.overflow = "";
      return;
    }
    box.hidden = false;
    document.body.style.overflow = "hidden";   // the screen scrolls, not the page

    var ds = dealsForClient(c.id);
    var bens = (c.beneficiaries || []).filter(function (b) { return (b.name || "").trim(); });
    var bank = c.bank || {};
    var age = c.dob ? ageFrom(c.dob) : null;

    var policies = ds.length
      ? '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Carrier / product</th>' +
        '<th>Type</th><th>Policy no.</th><th class="num">AP</th><th>Status</th><th></th></tr></thead><tbody>' +
        ds.map(function (d) {
          return '<tr><td>' + fmtDay(d.date) + "</td>" +
            "<td>" + esc([d.carrier, d.policy].filter(Boolean).join(" · ") || "—") + "</td>" +
            "<td>" + typeCell(d) + "</td>" +
            "<td>" + esc(d.policyNumber || "—") + "</td>" +
            '<td class="num">' + money(d.ap) + "</td>" +
            "<td>" + esc(d.status || "—") + paidTick(d) + "</td>" +
            '<td><button type="button" class="btn secondary small" data-edit-deal="' + esc(d.id) + '">Edit</button></td>' +
            "</tr>";
        }).join("") + "</tbody></table></div>"
      : '<div class="empty">No policies yet. Use Add policy to log one.</div>';

    var beneficiaries = bens.length
      ? '<div class="table-scroll"><table><thead><tr><th>Name</th><th>Relationship</th>' +
        '<th>Date of birth</th><th class="num">Share</th><th>Type</th></tr></thead><tbody>' +
        bens.map(function (b) {
          return "<tr><td>" + esc(b.name) + "</td><td>" + esc(b.rel || "—") + "</td>" +
            "<td>" + (b.dob ? fmtDay(b.dob) : "—") + "</td>" +
            '<td class="num">' + (b.pct == null || b.pct === "" ? "—" : b.pct + "%") + "</td>" +
            "<td>" + esc(b.type || "Primary") + "</td></tr>";
        }).join("") + "</tbody></table></div>"
      : '<div class="empty">No beneficiaries recorded.</div>';

    var hasSensitive = c.ssn || bank.name || bank.routing || bank.account;

    box.innerHTML =
      '<div class="cs-bar">' +
        '<button type="button" class="cs-back" id="clientClose">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
          "<span>Clients</span></button>" +
        "<div><h2>" + esc(c.name) + "</h2>" +
        '<div class="cs-sub">' +
          (c.dob ? fmtDay(c.dob) + (age ? " · " + age : "") : "No date of birth on file") +
        "</div></div>" +
        '<div class="spacer"></div>' +
        '<button type="button" class="btn" id="csAddDeal">Add policy</button>' +
        '<button type="button" class="btn secondary" data-edit-client="' + esc(c.id) + '">Edit client</button>' +
      "</div>" +

      '<div class="cs-body">' +
        '<div class="cs-col">' +
          '<div class="card"><div class="cs-stat">' +
            '<div><div class="s-label">Policies</div><div class="s-value">' + ds.length + "</div></div>" +
            '<div><div class="s-label">Total AP</div><div class="s-value">' + money(sum(ds, function (d) { return d.ap; })) + "</div></div>" +
            '<div><div class="s-label">Last deal</div><div class="s-value">' + (ds.length ? fmtDay(ds[0].date) : "—") + "</div></div>" +
          "</div></div>" +
          '<div class="card"><h2>Policies</h2>' + policies + "</div>" +
          '<div class="card"><h2>Beneficiaries</h2>' + beneficiaries + "</div>" +
          noteCard("General notes", c.notes) +
          noteCard("Medical notes", c.medicalNotes) +
          noteCard("Financial notes", c.financialNotes) +
        "</div>" +

        '<div class="cs-col">' +
          '<div class="card"><h2>Contact</h2><dl class="kv">' +
            row("Phone", c.phone) + row("Email", c.email) + row("Address", c.address) +
            (c.phone || c.email || c.address ? "" : "<dt>—</dt><dd>Nothing on file</dd>") +
          "</dl></div>" +
          '<div class="card"><h2>Sensitive details</h2>' +
            (hasSensitive
              ? '<dl class="kv">' +
                  rawRow("SSN", c.ssn ? secret("ssn", c.ssn, maskSsn) : "") +
                  row("Bank", bank.name) +
                  rawRow("Routing", bank.routing ? secret("routing", bank.routing, maskAcct) : "") +
                  rawRow("Account", bank.account ? secret("account", bank.account, maskAcct) : "") +
                "</dl>"
              : '<div class="empty">Nothing on file.</div>') +
          "</div>" +
        "</div>" +
      "</div>";
  }

  /* Opening a record pushes a history entry, so the phone's back gesture and
     the browser's back button mean "back to the list" rather than "leave the
     Clients page". Without it, a full-screen record is a trap on mobile: it
     looks like a page you navigated to, so back is the obvious way out, and it
     would have thrown you off the hub entirely. */
  var pushedState = false;

  function openRecord(id) {
    clearReveals();
    viewingId = id;
    renderDetail();
    $("clientDetail").scrollTop = 0;
    if (!pushedState) {
      try { history.pushState({ clientRecord: true }, ""); pushedState = true; } catch (e) {}
    }
  }

  /* Closing by hand walks history back, so the entry is consumed rather than
     left behind -- otherwise the next back press would silently reopen it. */
  function closeRecord() {
    if (pushedState) { history.back(); return; }   // popstate finishes the job
    dropRecord();
  }

  function dropRecord() {
    clearReveals();
    viewingId = null;
    renderDetail();
  }

  window.addEventListener("popstate", function () {
    pushedState = false;
    if (!$("clientDetail").hidden) dropRecord();
  });

  /* ---------- the sheet ---------- */

  /* "client"  -- editing someone who already exists, no policy involved
     "deal"    -- the main path: a new client and their first policy at once
     "policy"  -- another policy for a client who already exists */
  var sheetMode = "client";

  function openSheet(focusId) {
    $("clientScrim").classList.add("show");
    $("clientSheet").classList.add("show");
    setTimeout(function () { var n = $(focusId); if (n) n.focus(); }, 180);
  }
  function closeSheet() {
    $("clientSheet").classList.remove("show");
    $("clientScrim").classList.remove("show");
    editingId = null;
    dealEditingId = null;
  }

  function applyMode(mode) {
    sheetMode = mode;
    $("clientSections").hidden = mode === "policy";
    $("policySection").hidden = mode === "client";
    $("c-name").required = mode !== "policy";
    $("x-date").required = mode !== "client";
    // Whichever halves are on screen can be deleted from here.
    $("clientDelete").style.display =
      (editingId && (mode === "client" || mode === "both")) ? "" : "none";
    $("dealDelete").style.display =
      (dealEditingId && (mode === "policy" || mode === "both")) ? "" : "none";
  }

  function benRow(b) {
    b = b || {};
    var row = document.createElement("div");
    row.className = "ben-row";
    row.innerHTML =
      '<div class="field"><label>Name</label><input type="text" class="wide b-name"></div>' +
      '<div class="field"><label>Relationship</label><input type="text" class="wide b-rel"></div>' +
      '<div class="field"><label>Date of birth</label><input type="date" class="b-dob"></div>' +
      '<div class="field"><label>Share %</label><input type="number" class="pct b-pct" min="0" max="100" step="1"></div>' +
      '<div class="field"><label>Type</label><select class="b-type"><option>Primary</option><option>Contingent</option></select></div>' +
      '<button type="button" class="x" aria-label="Remove beneficiary">&times;</button>';
    row.querySelector(".b-name").value = b.name || "";
    row.querySelector(".b-rel").value = b.rel || "";
    row.querySelector(".b-dob").value = b.dob || "";
    row.querySelector(".b-pct").value = b.pct == null ? "" : b.pct;
    row.querySelector(".b-type").value = b.type || "Primary";
    row.querySelector(".x").addEventListener("click", function () { row.remove(); benMeta(); });
    row.addEventListener("input", benMeta);
    row.addEventListener("change", benMeta);
    return row;
  }

  /* Shares are shown, never enforced: contingents legitimately add to another
     100, and a half-filled form shouldn't block saving. */
  function benMeta() {
    var rows = Array.prototype.slice.call($("benRows").children);
    $("benEmpty").style.display = rows.length ? "none" : "";
    var tally = { Primary: 0, Contingent: 0 }, seen = {};
    rows.forEach(function (r) {
      var t = r.querySelector(".b-type").value || "Primary";
      var v = parseFloat(r.querySelector(".b-pct").value);
      seen[t] = true;
      if (!isNaN(v)) tally[t] += v;
    });
    var parts = ["Primary", "Contingent"].filter(function (t) { return seen[t]; })
      .map(function (t) { return t.toLowerCase() + " " + tally[t] + "%"; });
    var el = $("benTotal");
    el.textContent = parts.length ? "Shares: " + parts.join(" · ") : "";
    el.classList.toggle("over", tally.Primary > 100 || tally.Contingent > 100);
  }

  function fillForm(c) {
    $("c-name").value = c ? c.name || "" : "";
    $("c-dob").value = c ? c.dob || "" : "";
    $("c-phone").value = c ? c.phone || "" : "";
    $("c-email").value = c ? c.email || "" : "";
    $("c-address").value = c ? c.address || "" : "";
    $("c-notes").value = c ? c.notes || "" : "";
    $("c-medical").value = c ? c.medicalNotes || "" : "";
    $("c-financial").value = c ? c.financialNotes || "" : "";
    var bank = (c && c.bank) || {};
    $("c-ssn").value = c ? c.ssn || "" : "";
    $("c-bank-name").value = bank.name || "";
    $("c-bank-routing").value = bank.routing || "";
    $("c-bank-account").value = bank.account || "";
    $("benRows").innerHTML = "";
    ((c && c.beneficiaries) || []).forEach(function (b) { $("benRows").appendChild(benRow(b)); });
    benMeta();
  }

  /* dealId turns this into an edit of the client AND that policy in one sheet.
     A row in the book is a client and one of their policies, so its Edit
     button opens both rather than making you fix the phone number here and
     the premium somewhere else. Without a dealId it is the client alone. */
  function editClient(id, dealId) {
    var c = id ? clientById(id) : null;
    editingId = c ? c.id : null;
    var d = dealId ? state().deals.find(function (x) { return x.id === dealId; }) : null;

    fillForm(c);
    if (dealId !== undefined && c) {
      fillDealForm(d, c.id);
      $("dealForClient").innerHTML = "";
      $("clientFormTitle").textContent = d ? "Edit client & policy" : "Edit client · add a policy";
      $("clientSubmit").textContent = "Save";
      $("policySectionTitle").textContent = d ? "Policy" : "Add a policy";
      applyMode("both");
    } else {
      dealEditingId = null;
      $("dealForClient").innerHTML = "";
      $("clientFormTitle").textContent = "Edit client";
      $("clientSubmit").textContent = "Save client";
      applyMode("client");
    }
    openSheet("c-name");
  }

  /* The main path. One sheet, one submit: the client and the policy they just
     bought go in together, because that is one event. */
  function addDeal() {
    editingId = null;
    dealEditingId = null;
    dealClientId = null;
    fillForm(null);
    fillDealForm(null, null);
    $("dealForClient").innerHTML = "";
    $("clientFormTitle").textContent = "Add a deal";
    $("clientSubmit").textContent = "Add deal";
    $("policySectionTitle").textContent = "Policy";
    applyMode("deal");
    openSheet("c-name");
  }

  function readBeneficiaries() {
    return Array.prototype.slice.call($("benRows").children).map(function (r) {
      var pct = r.querySelector(".b-pct").value;
      return {
        name: r.querySelector(".b-name").value.trim(),
        rel: r.querySelector(".b-rel").value.trim(),
        dob: r.querySelector(".b-dob").value,
        pct: pct === "" ? null : Number(pct),
        type: r.querySelector(".b-type").value
      };
    }).filter(function (b) { return b.name || b.rel || b.dob || b.pct != null; });
  }

  /* ---------- the deal sheet ----------
     Adding a policy happens here now, against a client you already have open,
     so a deal can no longer be logged with a name that matches nobody. Pricing
     comes from comp-calc.js, the same module the Deals page uses. */

  var dealEditingId = null;
  var dealClientId = null;
  var comAutoFilled = false;
  var typeAutoFilled = false;
  var pendingFull = null;

  function num(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function contractLevel() {
    try { return window.HubContract ? HubContract.get() : null; } catch (e) { return null; }
  }

  function fillList(id, primary, fallback) {
    var el = $(id);
    if (!el) return;
    var seen = {}, out = [];
    (primary && primary.length ? primary : (fallback || [])).forEach(function (v) {
      var t = String(v == null ? "" : v).trim();
      if (!t || seen[t.toLowerCase()]) return;
      seen[t.toLowerCase()] = 1; out.push(t);
    });
    el.innerHTML = out.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("");
  }

  function refreshDealLists() {
    fillList("xCarrierList", Object.keys(window.COMP_CARRIERS || {}), []);
    var ckey = window.CompCalc && CompCalc.findCarrierKey($("x-carrier").value);
    if (ckey) fillList("xProductList", Object.keys(COMP_CARRIERS[ckey].products), []);
    else fillList("xProductList", state().deals.map(function (d) { return d.policy; }), ["WL", "Term", "IUL", "FE"]);
    fillList("xLeadList", state().deals.map(function (d) { return d.lead; }), []);
  }

  /* The product usually says what type it is, so the box fills itself as you
     type the carrier and product. Touch it once and it stops guessing — which
     is how the five American Amicable products nothing can classify get a type
     at all. */
  function syncPolicyType() {
    var el = $("x-type");
    if (!el || typeAutoFilled === "locked") return;
    var guess = window.PolicyType
      ? PolicyType.of($("x-carrier").value, $("x-policy").value) : null;
    if (guess && el.value !== guess) { el.value = guess; typeAutoFilled = true; }
  }

  function syncTargetField() {
    var f = $("xTargetField");
    if (!f) return;
    var show = window.CompCalc && CompCalc.looksLikeIul($("x-policy").value);
    f.hidden = !show;
    if (!show) $("x-target").value = "";
  }

  function recalcCommission() {
    var noteEl = $("xComNote");
    if (!window.CompCalc) return;
    var q = CompCalc.quote({
      carrier: $("x-carrier").value, product: $("x-policy").value,
      level: contractLevel(), ap: $("x-ap").value, target: $("x-target").value
    });
    var n = CompCalc.note(q, money);
    if (noteEl) {
      noteEl.textContent = n.text;
      noteEl.className = "com-note" + (n.warn ? " warn" : "");
    }
    if (q.miss) return;
    var comEl = $("x-com");
    if (q.needsTarget && comAutoFilled) comEl.value = "";
    if (q.amount != null && (comEl.value === "" || comAutoFilled)) {
      comEl.value = q.amount.toFixed(2);
      comAutoFilled = true;
    }
    pendingFull = q.full;
  }

  /* The policy-only path reuses the same sheet with the client half hidden. */
  function openPolicySheet(d, clientId) {
    editingId = null;
    fillDealForm(d, clientId);
    var c = clientId ? clientById(clientId) : null;
    $("dealForClient").innerHTML = c ? "For <b>" + esc(c.name) + "</b>" : "";
    $("clientFormTitle").textContent = d ? "Edit policy" : "Add a policy";
    $("clientSubmit").textContent = d ? "Save policy" : "Add policy";
    $("policySectionTitle").textContent = "Policy";
    applyMode("policy");
    openSheet("x-carrier");
  }

  function fillDealForm(d, clientId) {
    dealEditingId = d ? d.id : null;
    dealClientId = clientId || (d && d.clientId) || null;
    comAutoFilled = false;
    pendingFull = d ? (num(d.com) || 0) + (num(d.comBalance) || 0) || null : null;

    $("x-date").value = d ? d.date || todayStr() : todayStr();
    $("x-carrier").value = d ? d.carrier || "" : "";
    $("x-policy").value = d ? d.policy || "" : "";
    $("x-policynum").value = d ? d.policyNumber || "" : "";
    $("x-type").value = d ? (d.type || (window.PolicyType ? PolicyType.of(d.carrier, d.policy) : "") || "") : "";
    // An existing deal's saved type is a choice already made.
    typeAutoFilled = d && d.type ? "locked" : false;
    $("x-ap").value = d && d.ap != null ? d.ap : "";
    $("x-target").value = d && d.target != null ? d.target : "";
    $("x-face").value = d && d.face != null ? d.face : "";
    $("x-monthly").value = d && d.monthly != null ? d.monthly : "";
    $("x-com").value = d && d.com != null ? d.com : "";
    $("x-status").value = d ? d.status || "Submitted" : "Submitted";
    $("x-lead").value = d ? d.lead || "" : "";
    $("x-issued-date").value = d ? d.issuedDate || "" : "";
    $("x-notes").value = d ? d.notes || "" : "";
    $("x-paid").checked = !!(d && d.paid);
    $("x-reqs").checked = !!(d && d.reqs);

    refreshDealLists();
    syncTargetField();
    syncPolicyType();
    recalcCommission();
  }

  /* Reads the policy half of the form into a deal record. Returns null when
     the section is blank, so "Add deal" can be used for a client you have
     taken details for but not yet written. */
  function readPolicy(client) {
    var touched = ["x-carrier", "x-policy", "x-policynum", "x-type", "x-ap", "x-face",
                   "x-monthly", "x-com", "x-lead", "x-notes"]
      .some(function (id) { return String($(id).value || "").trim() !== ""; });
    if (!touched) return null;

    var adv = num($("x-com").value);
    // The balance above the advance cap is still owed, just paid as the
    // client pays, so it is kept on the deal rather than thrown away.
    var balance = (adv != null && pendingFull != null && pendingFull > adv)
      ? Number((pendingFull - adv).toFixed(2)) : null;

    return {
      date: $("x-date").value || todayStr(),
      client: client.name,
      clientId: client.id,
      carrier: $("x-carrier").value.trim(),
      policy: $("x-policy").value.trim(),
      policyNumber: $("x-policynum").value.trim(),
      type: $("x-type").value,
      ap: num($("x-ap").value),
      target: num($("x-target").value),
      face: num($("x-face").value),
      monthly: num($("x-monthly").value),
      com: adv,
      comBalance: balance,
      status: $("x-status").value,
      lead: $("x-lead").value.trim(),
      issuedDate: $("x-issued-date").value,
      notes: $("x-notes").value.trim(),
      paid: $("x-paid").checked,
      reqs: $("x-reqs").checked
    };
  }

  function savePolicy(fields, existingId) {
    var id = existingId || S.uid();
    S.commit(function (doc) {
      var d = doc.deals.find(function (x) { return x.id === id; });
      if (!d) { d = { id: id }; doc.deals.push(d); }
      Object.keys(fields).forEach(function (k) { d[k] = fields[k]; });
    });
  }

  function addDealFor(clientId) { openPolicySheet(null, clientId); }
  function editDeal(id) {
    var d = state().deals.find(function (x) { return x.id === id; });
    if (!d) return;
    openPolicySheet(d, d.clientId);
  }

  function wireDealSheet() {
    ["x-carrier", "x-policy"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        refreshDealLists(); syncTargetField(); syncPolicyType(); recalcCommission();
      });
    });
    ["x-ap", "x-target"].forEach(function (id) {
      $(id).addEventListener("input", recalcCommission);
    });
    // Typing a commission means you meant it; auto-fill stops overwriting it.
    $("x-com").addEventListener("input", function () { comAutoFilled = false; });
    // Choosing a type by hand means you meant it; stop overwriting it.
    $("x-type").addEventListener("change", function () { typeAutoFilled = "locked"; });

    $("dealDelete").addEventListener("click", function () {
      var id = dealEditingId;
      if (!id) return;
      var d = state().deals.find(function (x) { return x.id === id; });
      if (!d) return;
      if (!confirm("Delete this policy for " + (d.client || "this client") + "? It comes off the Deals board and your PNL too.")) return;
      S.commit(function (doc) {
        doc.deals = doc.deals.filter(function (x) { return x.id !== id; });
      });
      closeSheet();
      renderBook();
    });
  }

  /* ---------- wiring ---------- */

  function wire() {
    $("bookSearch").addEventListener("input", renderBook);

    $("prevDealMonth").addEventListener("click", function () {
      dealMonth = shiftMonth(dealMonth, -1); renderMonthDeals();
    });
    $("nextDealMonth").addEventListener("click", function () {
      dealMonth = shiftMonth(dealMonth, 1); renderMonthDeals();
    });

    // A row opens the policy for editing; the Edit button does the same, so
    // either lands in the right place.
    $("monthDealBody").addEventListener("click", function (ev) {
      var row = ev.target.closest("[data-open-deal]");
      var btn = ev.target.closest("[data-edit-deal]");
      var id = (btn && btn.getAttribute("data-edit-deal")) ||
               (row && row.getAttribute("data-open-deal"));
      if (id) editDeal(id);
    });
    $("clientAddBtn").addEventListener("click", addDeal);
    $("clientSheetClose").addEventListener("click", closeSheet);
    $("clientScrim").addEventListener("click", closeSheet);
    $("benAdd").addEventListener("click", function () {
      $("benRows").appendChild(benRow(null));
      benMeta();
    });

    $("bookBody").addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-edit-client]");
      if (btn) {
        // "" means a client with no policy yet: still open both halves, with
        // the policy side blank and ready.
        var rowDeal = btn.getAttribute("data-edit-row-deal");
        editClient(btn.getAttribute("data-edit-client"), rowDeal == null ? undefined : rowDeal);
        return;
      }
      var tr = ev.target.closest("tr[data-client]");
      if (!tr) return;
      openRecord(tr.getAttribute("data-client"));
    });

    $("clientDetail").addEventListener("click", function (ev) {
      var rev = ev.target.closest("[data-reveal]");
      if (rev) { toggleReveal(rev.getAttribute("data-reveal")); return; }
      var ed = ev.target.closest("[data-edit-deal]");
      if (ed) { editDeal(ed.getAttribute("data-edit-deal")); return; }
      var btn = ev.target.closest("[data-edit-client]");
      if (btn) { editClient(btn.getAttribute("data-edit-client")); return; }
      if (ev.target.closest("#csAddDeal")) { addDealFor(viewingId); return; }
      if (ev.target.closest("#clientClose")) { closeRecord(); }
    });

    // Escape closes whatever is on top: the deal sheet, then the client sheet,
    // then the record itself.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if ($("clientSheet").classList.contains("show")) { closeSheet(); return; }
      if (!$("clientDetail").hidden) closeRecord();
    });

    wireDealSheet();

    $("clientForm").addEventListener("submit", function (ev) {
      ev.preventDefault();

      /* Policy only: the client already exists and is not being edited. */
      if (sheetMode === "policy") {
        var owner = dealClientId ? clientById(dealClientId) : null;
        if (!owner) { alert("Open a client first, then add the policy to their record."); return; }
        var pol = readPolicy(owner);
        if (!pol) { alert("Fill in at least the carrier or the premium before saving this policy."); return; }
        savePolicy(pol, dealEditingId);
        if (pol.date) dealMonth = pol.date.slice(0, 7);
        closeSheet();
        renderBook();
        return;
      }

      var name = $("c-name").value.trim();
      if (!name) return;

      var existing = clientByName(name);
      var id = editingId;

      if (sheetMode === "client" || sheetMode === "both") {
        // Two records with one name would split a person's policies in half,
        // which is the one thing a book of business must never do.
        if (existing && existing.id !== editingId) {
          alert("You already have a client called " + existing.name + ". Open that record instead.");
          return;
        }
      } else if (existing) {
        /* Adding a deal under a name already on the book is the normal way a
           repeat sale gets logged, so it attaches to that record instead of
           refusing. Their details are only filled in where blank -- a name
           typed with an empty phone box must never wipe the number on file. */
        id = existing.id;
      }

      var fields = {
        name: name,
        dob: $("c-dob").value,
        phone: $("c-phone").value.trim(),
        email: $("c-email").value.trim(),
        address: $("c-address").value.trim(),
        notes: $("c-notes").value.trim(),
        medicalNotes: $("c-medical").value.trim(),
        financialNotes: $("c-financial").value.trim(),
        ssn: $("c-ssn").value.trim(),
        bank: {
          name: $("c-bank-name").value.trim(),
          routing: $("c-bank-routing").value.trim(),
          account: $("c-bank-account").value.trim()
        },
        beneficiaries: readBeneficiaries()
      };
      var attaching = sheetMode === "deal" && !!existing;
      if (!id) id = S.uid();

      // Written as a function of the document so the store can replay it onto
      // the live cloud copy -- a deal logged elsewhere a moment ago survives.
      S.commit(function (doc) {
        var c = doc.clients.find(function (x) { return x.id === id; });
        if (!c) { c = { id: id, createdAt: todayStr(), beneficiaries: [] }; doc.clients.push(c); }
        Object.keys(fields).forEach(function (k) {
          var v = fields[k];
          if (attaching) {
            if (k === "bank") {
              c.bank = c.bank || {};
              Object.keys(v).forEach(function (bk) { if (v[bk] && !c.bank[bk]) c.bank[bk] = v[bk]; });
              return;
            }
            if (k === "beneficiaries") {
              if (v.length && !(c.beneficiaries || []).length) c.beneficiaries = v;
              return;
            }
            if (!v || c[k]) return;      // only fill the gaps
          }
          c[k] = v;
        });
        // The name on past deals follows the record, so fixing a spelling fixes
        // it everywhere rather than leaving the old one in the deals table.
        doc.deals.forEach(function (d) { if (d.clientId === id) d.client = c.name; });
      });

      if (sheetMode === "deal" || sheetMode === "both") {
        var client = clientById(id);
        var deal = client && readPolicy(client);
        if (deal) {
          // In "both" this updates the policy the row was showing; with no
          // policy yet, dealEditingId is null and it creates their first.
          savePolicy(deal, dealEditingId);
          // Follow the policy to its own month, so one dated for last month
          // does not look like it failed to save.
          if (deal.date) dealMonth = deal.date.slice(0, 7);
        }
      }

      closeSheet();
      renderBook();
    });

    $("clientDelete").addEventListener("click", function () {
      var c = editingId ? clientById(editingId) : null;
      if (!c) return;
      var id = c.id, n = dealsForClient(id).length;
      if (!confirm("Delete " + c.name + "? Their contact details, notes, "
                   + "sensitive details and beneficiaries are removed." +
                   (n ? " Their " + n + " deal" + (n === 1 ? "" : "s") + " stay on the board with the name intact." : ""))) return;
      S.commit(function (doc) {
        doc.deals.forEach(function (d) { if (d.clientId === id) d.clientId = null; });
        doc.clients = doc.clients.filter(function (x) { return x.id !== id; });
      });
      if (viewingId === id) viewingId = null;
      closeSheet();
      renderBook();
    });
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
      // Same hook every other page uses. Without it this page read prefs from
      // localStorage only, so the theme, accent and agency name you set
      // anywhere else simply were not here.
      if (window.HubPrefs && S.client) {
        HubPrefs.attachCloud(S.client, user.id).then(function () {
          if (window.HubSettings) HubSettings.refresh();
        }, function () {});
      }
      revealTabs(user);
    },
    // There is one session across the hub, so no sign-in form here: the Deals
    // page owns that, and sending them there avoids a second copy of auth.
    onSignedOut: function () { location.replace("pnl.html"); },
    onReady: function () { dealMonth = thisMonth(); wire(); renderBook(); }
  });

  S.onChange(renderBook);

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
