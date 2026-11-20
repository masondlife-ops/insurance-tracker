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
  function sum(arr, f) {
    return arr.reduce(function (t, x) { var v = Number(f(x)); return t + (isFinite(v) ? v : 0); }, 0);
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
  function matches(row, q) {
    if (!q) return true;
    var c = row.client;
    // Deliberately not searched: ssn, bank. A search box is the easiest way to
    // confirm a number you already half-know, and typing one here would put it
    // in the browser's input history.
    var hay = [c.name, c.phone, c.email, c.address, c.notes]
      .concat(row.carriers)
      .concat(row.deals.map(function (d) { return d.policy || ""; }))
      .concat(row.deals.map(function (d) { return d.policyNumber || ""; }))
      .concat((c.beneficiaries || []).map(function (b) { return b.name || ""; }))
      .join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) {
      return hay.indexOf(w) !== -1;
    });
  }

  function renderBook() {
    var q = ($("bookSearch").value || "").trim();
    var rows = state().clients.map(rowFor).filter(function (r) { return matches(r, q); });
    rows.sort(function (a, b) {
      return String(b.last || "").localeCompare(String(a.last || "")) ||
             a.client.name.localeCompare(b.client.name);
    });

    var total = state().clients.length;
    $("bookCount").textContent = total ? (q ? rows.length + " of " + total : String(total)) : "";

    $("bookBody").innerHTML = rows.map(function (r) {
      return '<tr data-client="' + esc(r.client.id) + '">' +
        "<td><b>" + esc(r.client.name) + "</b></td>" +
        "<td>" + esc(r.client.phone || "—") + "</td>" +
        '<td class="num">' + r.deals.length + "</td>" +
        '<td class="num">' + money(r.ap) + "</td>" +
        "<td>" + esc(r.carriers.join(", ") || "—") + "</td>" +
        "<td>" + (r.last ? fmtDay(r.last) : "—") + "</td>" +
        '<td><button type="button" class="btn secondary small" data-edit-client="' + esc(r.client.id) + '">Edit</button></td>' +
      "</tr>";
    }).join("");

    var empty = $("bookEmpty");
    empty.style.display = rows.length ? "none" : "";
    empty.textContent = total
      ? "No client matches “" + q + "”."
      : "No clients yet. They appear here as you log deals, or use Add client.";

    if (viewingId && !rows.some(function (r) { return r.client.id === viewingId; })) viewingId = null;
    renderDetail();
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
        '<th>Policy no.</th><th class="num">AP</th><th>Status</th><th></th></tr></thead><tbody>' +
        ds.map(function (d) {
          return '<tr><td>' + fmtDay(d.date) + "</td>" +
            "<td>" + esc([d.carrier, d.policy].filter(Boolean).join(" · ") || "—") + "</td>" +
            "<td>" + esc(d.policyNumber || "—") + "</td>" +
            '<td class="num">' + money(d.ap) + "</td>" +
            "<td>" + esc(d.status || "—") + "</td>" +
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

  function openSheet() {
    $("clientScrim").classList.add("show");
    $("clientSheet").classList.add("show");
    setTimeout(function () { var n = $("c-name"); if (n) n.focus(); }, 180);
  }
  function closeSheet() {
    $("clientSheet").classList.remove("show");
    $("clientScrim").classList.remove("show");
    editingId = null;
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
    $("clientFormTitle").textContent = c ? "Edit client" : "Add client";
    $("clientSubmit").textContent = c ? "Save client" : "Add client";
    $("clientDelete").style.display = c ? "" : "none";
  }

  function editClient(id) {
    var c = id ? clientById(id) : null;
    editingId = c ? c.id : null;
    fillForm(c);
    openSheet();
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

  function openDealSheet() {
    $("dealScrim").classList.add("show");
    $("dealSheet").classList.add("show");
    setTimeout(function () { var n = $("x-carrier"); if (n) n.focus(); }, 180);
  }
  function closeDealSheet() {
    $("dealSheet").classList.remove("show");
    $("dealScrim").classList.remove("show");
    dealEditingId = null;
  }

  function fillDealForm(d, clientId) {
    dealEditingId = d ? d.id : null;
    dealClientId = clientId || (d && d.clientId) || null;
    comAutoFilled = false;
    pendingFull = d ? (num(d.com) || 0) + (num(d.comBalance) || 0) || null : null;

    var c = dealClientId ? clientById(dealClientId) : null;
    $("dealForClient").innerHTML = c ? "For <b>" + esc(c.name) + "</b>" : "";

    $("x-date").value = d ? d.date || todayStr() : todayStr();
    $("x-carrier").value = d ? d.carrier || "" : "";
    $("x-policy").value = d ? d.policy || "" : "";
    $("x-policynum").value = d ? d.policyNumber || "" : "";
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

    $("dealFormTitle").textContent = d ? "Edit policy" : "Add a policy";
    $("dealSubmit").textContent = d ? "Save policy" : "Add policy";
    $("dealDelete").style.display = d ? "" : "none";
    refreshDealLists();
    syncTargetField();
    recalcCommission();
  }

  function addDealFor(clientId) { fillDealForm(null, clientId); openDealSheet(); }
  function editDeal(id) {
    var d = state().deals.find(function (x) { return x.id === id; });
    if (!d) return;
    fillDealForm(d, d.clientId);
    openDealSheet();
  }

  function wireDealSheet() {
    $("dealSheetClose").addEventListener("click", closeDealSheet);
    $("dealScrim").addEventListener("click", closeDealSheet);
    ["x-carrier", "x-policy"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        refreshDealLists(); syncTargetField(); recalcCommission();
      });
    });
    ["x-ap", "x-target"].forEach(function (id) {
      $(id).addEventListener("input", recalcCommission);
    });
    // Typing a commission means you meant it; auto-fill stops overwriting it.
    $("x-com").addEventListener("input", function () { comAutoFilled = false; });

    $("dealForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var c = dealClientId ? clientById(dealClientId) : null;
      if (!c) { alert("Open a client first, then add the policy to their record."); return; }

      var adv = num($("x-com").value);
      // The balance above the advance cap is still owed, just paid as the
      // client pays, so it is kept on the deal rather than thrown away.
      var balance = (adv != null && pendingFull != null && pendingFull > adv)
        ? Number((pendingFull - adv).toFixed(2)) : null;

      var fields = {
        date: $("x-date").value,
        client: c.name,
        clientId: c.id,
        carrier: $("x-carrier").value.trim(),
        policy: $("x-policy").value.trim(),
        policyNumber: $("x-policynum").value.trim(),
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
      var id = dealEditingId || S.uid();

      S.commit(function (doc) {
        var d = doc.deals.find(function (x) { return x.id === id; });
        if (!d) { d = { id: id }; doc.deals.push(d); }
        Object.keys(fields).forEach(function (k) { d[k] = fields[k]; });
      });
      closeDealSheet();
      renderBook();
    });

    $("dealDelete").addEventListener("click", function () {
      var id = dealEditingId;
      if (!id) return;
      var d = state().deals.find(function (x) { return x.id === id; });
      if (!d) return;
      if (!confirm("Delete this policy for " + (d.client || "this client") + "? It comes off the Deals board and your PNL too.")) return;
      S.commit(function (doc) {
        doc.deals = doc.deals.filter(function (x) { return x.id !== id; });
      });
      closeDealSheet();
      renderBook();
    });
  }

  /* ---------- wiring ---------- */

  function wire() {
    $("bookSearch").addEventListener("input", renderBook);
    $("clientAddBtn").addEventListener("click", function () { editClient(null); });
    $("clientSheetClose").addEventListener("click", closeSheet);
    $("clientScrim").addEventListener("click", closeSheet);
    $("benAdd").addEventListener("click", function () {
      $("benRows").appendChild(benRow(null));
      benMeta();
    });

    $("bookBody").addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-edit-client]");
      if (btn) { editClient(btn.getAttribute("data-edit-client")); return; }
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
      if (ev.target.id === "csAddDeal") { addDealFor(viewingId); return; }
      if (ev.target.id === "clientClose") { closeRecord(); }
    });

    // Escape closes whatever is on top: the deal sheet, then the client sheet,
    // then the record itself.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if ($("dealSheet").classList.contains("show")) { closeDealSheet(); return; }
      if ($("clientSheet").classList.contains("show")) { closeSheet(); return; }
      if (!$("clientDetail").hidden) closeRecord();
    });

    wireDealSheet();

    $("clientForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = $("c-name").value.trim();
      if (!name) return;
      // Two records with one name would split a person's policies in half,
      // which is the one thing a book of business must never do.
      var clash = clientByName(name);
      if (clash && clash.id !== editingId) {
        alert("You already have a client called " + clash.name + ". Open that record instead.");
        return;
      }
      var id = editingId;
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
      if (!id) id = S.uid();

      // Written as a function of the document so the store can replay it onto
      // the live cloud copy -- a deal logged elsewhere a moment ago survives.
      S.commit(function (doc) {
        var c = doc.clients.find(function (x) { return x.id === id; });
        if (!c) { c = { id: id, createdAt: todayStr(), beneficiaries: [] }; doc.clients.push(c); }
        Object.keys(fields).forEach(function (k) { c[k] = fields[k]; });
        // The name on past deals follows the record, so fixing a spelling fixes
        // it everywhere rather than leaving the old one in the deals table.
        doc.deals.forEach(function (d) { if (d.clientId === id) d.client = c.name; });
      });
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
    onReady: function () { wire(); renderBook(); }
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
