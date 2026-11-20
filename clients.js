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
    var hay = [c.name, c.phone, c.email, c.address, c.notes]
      .concat(row.carriers)
      .concat(row.deals.map(function (d) { return d.policy || ""; }))
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

  /* ---------- one client ---------- */

  function renderDetail() {
    var box = $("clientDetail");
    var c = viewingId ? clientById(viewingId) : null;
    if (!c) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;

    var ds = dealsForClient(c.id);
    var fact = function (label, val) {
      return val ? "<span>" + label + " <b>" + esc(val) + "</b></span>" : "";
    };
    var bens = (c.beneficiaries || []).filter(function (b) { return (b.name || "").trim(); });

    box.innerHTML =
      '<div class="client-head">' +
        "<h2>" + esc(c.name) + "</h2>" +
        '<button type="button" class="btn secondary small" data-edit-client="' + esc(c.id) + '">Edit client</button>' +
        '<button type="button" class="btn secondary small" id="clientClose">Close</button>' +
      "</div>" +
      '<div class="client-facts">' +
        fact("Born", c.dob ? fmtDay(c.dob) + (ageFrom(c.dob) ? " · " + ageFrom(c.dob) : "") : "") +
        fact("Phone", c.phone) + fact("Email", c.email) + fact("Address", c.address) +
        "<span>Policies <b>" + ds.length + "</b></span>" +
        "<span>Total AP <b>" + money(sum(ds, function (d) { return d.ap; })) + "</b></span>" +
      "</div>" +
      (c.notes ? '<div class="client-sec"><h3>Notes</h3><div>' + esc(c.notes) + "</div></div>" : "") +
      '<div class="client-sec"><h3>Policies</h3>' +
        (ds.length
          ? '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Carrier / product</th>' +
            '<th class="num">AP</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
            ds.map(function (d) {
              return "<tr><td>" + fmtDay(d.date) + "</td>" +
                "<td>" + esc([d.carrier, d.policy].filter(Boolean).join(" · ") || "—") + "</td>" +
                '<td class="num">' + money(d.ap) + "</td>" +
                "<td>" + esc(d.status || "—") + "</td>" +
                "<td>" + esc(d.notes || "") + "</td></tr>";
            }).join("") + "</tbody></table></div>"
          : '<div class="empty">No policies recorded for this client.</div>') +
      "</div>" +
      '<div class="client-sec"><h3>Beneficiaries</h3>' +
        (bens.length
          ? '<div class="table-scroll"><table><thead><tr><th>Name</th><th>Relationship</th>' +
            '<th>Date of birth</th><th class="num">Share</th><th>Type</th></tr></thead><tbody>' +
            bens.map(function (b) {
              return "<tr><td>" + esc(b.name) + "</td><td>" + esc(b.rel || "—") + "</td>" +
                "<td>" + (b.dob ? fmtDay(b.dob) : "—") + "</td>" +
                '<td class="num">' + (b.pct == null || b.pct === "" ? "—" : b.pct + "%") + "</td>" +
                "<td>" + esc(b.type || "Primary") + "</td></tr>";
            }).join("") + "</tbody></table></div>"
          : '<div class="empty">No beneficiaries recorded.</div>') +
      "</div>";
  }

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
      '<div class="field"><label>Name</label><input type="text" class="wide b-name" placeholder="Full name"></div>' +
      '<div class="field"><label>Relationship</label><input type="text" class="wide b-rel" placeholder="Spouse"></div>' +
      '<div class="field"><label>Date of birth</label><input type="date" class="b-dob"></div>' +
      '<div class="field"><label>Share %</label><input type="number" class="pct b-pct" min="0" max="100" step="1" placeholder="100"></div>' +
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
      var id = tr.getAttribute("data-client");
      viewingId = viewingId === id ? null : id;
      renderDetail();
    });

    $("clientDetail").addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-edit-client]");
      if (btn) { editClient(btn.getAttribute("data-edit-client")); return; }
      if (ev.target.id === "clientClose") { viewingId = null; renderDetail(); }
    });

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
      if (!confirm("Delete " + c.name + "? Their contact details and beneficiaries are removed." +
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
