/* Personal tab customizer — shared by every hub page.
   Lets each person hide tabs they don't use and pick which tab the hub opens to.
   Preference is per-browser (localStorage), same idea as the light/dark choice.
   Only changes what's shown — never touches any data. */
(function () {
  "use strict";
  var PREF_KEY = "agentHub.tabPrefs.v1";
  var SESS_HOME = "agentHub.homed.v1";

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} }

  var prefs = loadPrefs();
  if (!Array.isArray(prefs.hidden)) prefs.hidden = [];

  var nav = document.querySelector(".hub-tabs");
  if (!nav) return;
  var tabs = [].slice.call(nav.querySelectorAll(".hub-tab"));
  if (!tabs.length) return;

  function keyOf(t) { return (t.textContent || "").trim(); }
  function isActive(t) { return t.classList.contains("is-active"); }

  /* ---- styles ---- */
  var st = document.createElement("style");
  st.textContent =
    ".hub-tab.user-hidden{display:none !important;}" +
    "#hubGear{font:inherit;font-size:15px;line-height:1;cursor:pointer;background:transparent;border:1px solid var(--baseline);color:var(--text-secondary);border-radius:7px;padding:6px 11px;align-self:center;}" +
    "#hubGear:hover{color:var(--text-primary);}" +
    "#hubBackdrop{position:fixed;inset:0;z-index:199;display:none;}#hubBackdrop.show{display:block;}" +
    "#hubCust{position:fixed;z-index:200;min-width:236px;max-width:280px;background:var(--surface-1);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.28);padding:14px;display:none;}" +
    "#hubCust.show{display:block;}" +
    "#hubCust h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin:0 0 8px;font-weight:600;}" +
    "#hubCust label{display:flex;align-items:center;gap:9px;font-size:14px;padding:5px 0;color:var(--text-primary);cursor:pointer;}" +
    "#hubCust label.locked{opacity:.55;cursor:default;}" +
    "#hubCust input[type=checkbox]{width:16px;height:16px;flex:none;cursor:pointer;}" +
    "#hubCust label.locked input{cursor:default;}" +
    "#hubCust .home-row{margin-top:10px;padding-top:11px;border-top:1px solid var(--grid);font-size:13px;color:var(--text-secondary);}" +
    "#hubCust select{width:100%;margin-top:6px;font:inherit;font-size:14px;color:var(--text-primary);background:var(--page);border:1px solid var(--baseline);border-radius:7px;padding:7px 9px;}" +
    "#hubCust .hint{font-size:11.5px;color:var(--text-muted);margin-top:11px;line-height:1.4;}";
  document.head.appendChild(st);

  /* ---- apply hidden tabs (CSS class beats the reveal logic's inline display) ---- */
  function applyHidden() {
    tabs.forEach(function (t) {
      var k = keyOf(t);
      if (!isActive(t) && prefs.hidden.indexOf(k) >= 0) t.classList.add("user-hidden");
      else t.classList.remove("user-hidden");
    });
  }
  applyHidden();

  /* ---- gear button ---- */
  var gear = document.createElement("button");
  gear.id = "hubGear"; gear.type = "button";
  gear.title = "Customize which tabs you see";
  gear.setAttribute("aria-label", "Customize tabs");
  gear.innerHTML = "&#9881;";
  nav.appendChild(gear);

  var backdrop = document.createElement("div"); backdrop.id = "hubBackdrop"; document.body.appendChild(backdrop);
  var pop = document.createElement("div"); pop.id = "hubCust"; document.body.appendChild(pop);

  // tabs this person actually has access to (visible now, or hidden by their own choice)
  function eligibleTabs() {
    return tabs.filter(function (t) {
      if (t.classList.contains("user-hidden")) return true;
      return getComputedStyle(t).display !== "none";
    });
  }

  function buildPop() {
    var elig = eligibleTabs();
    var html = "<h3>Show these tabs</h3>";
    elig.forEach(function (t) {
      var k = keyOf(t);
      var hidden = t.classList.contains("user-hidden");
      var active = isActive(t);
      html += '<label class="' + (active ? "locked" : "") + '">' +
        '<input type="checkbox" data-k="' + k.replace(/"/g, "&quot;") + '"' +
        (hidden ? "" : " checked") + (active ? " disabled" : "") + ">" +
        "<span>" + t.innerHTML + "</span>" +
        (active ? ' <span style="color:var(--text-muted);font-size:11px">(here now)</span>' : "") +
        "</label>";
    });
    html += '<div class="home-row">Open the hub to:<select id="hubHome"></select></div>';
    html += '<div class="hint">Just changes what you see on this device. Your numbers are untouched.</div>';
    pop.innerHTML = html;

    var sel = pop.querySelector("#hubHome");
    var visible = elig.filter(function (t) { return !t.classList.contains("user-hidden"); });
    visible.forEach(function (t) {
      var k = keyOf(t);
      var o = document.createElement("option");
      o.value = k; o.textContent = k;
      if (prefs.home === k) o.selected = true;
      sel.appendChild(o);
    });
  }

  function openPop() {
    buildPop();
    var r = gear.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + "px";
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 260)) + "px";
    pop.classList.add("show"); backdrop.classList.add("show");
  }
  function closePop() { pop.classList.remove("show"); backdrop.classList.remove("show"); }

  gear.addEventListener("click", function () { pop.classList.contains("show") ? closePop() : openPop(); });
  backdrop.addEventListener("click", closePop);

  pop.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.matches && el.matches('input[type="checkbox"]')) {
      var k = el.getAttribute("data-k");
      var i = prefs.hidden.indexOf(k);
      if (el.checked) { if (i >= 0) prefs.hidden.splice(i, 1); }
      else { if (i < 0) prefs.hidden.push(k); if (prefs.home === k) delete prefs.home; }
      savePrefs(prefs); applyHidden(); buildPop();
    } else if (el.id === "hubHome") {
      prefs.home = el.value; savePrefs(prefs);
    }
  });

  /* ---- open-to-your-home-tab: only from the Activity entry page, once per session ---- */
  (function homeRedirect() {
    var active = tabs.filter(isActive)[0];
    if (!active || keyOf(active) !== "Activity") return;      // only the base/entry page
    if (!prefs.home || prefs.home === "Activity") return;
    try { if (sessionStorage.getItem(SESS_HOME)) return; sessionStorage.setItem(SESS_HOME, "1"); } catch (e) {}
    var target = tabs.filter(function (t) { return keyOf(t) === prefs.home; })[0];
    if (target && !target.classList.contains("user-hidden")) {
      var href = target.getAttribute("href");
      if (href) window.location.replace(href);
    }
  })();
})();
