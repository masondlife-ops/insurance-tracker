/* ===========================================================================
   Call-outcome funnel definition.

   The six core outcomes are fixed: they're what gets published to team_summary
   and rolled up on the agency/owner side, so every agent has to report the same
   things or the leaderboard stops comparing like with like.

   On top of those, a user can insert their own steps ("10+ min" between 5+ min
   and presentation, say). Custom steps are personal -- they show up in your
   chips, tiles and conversion rates, but they are deliberately NOT published to
   the agency roll-up, because your teammates don't have them.

   Everything downstream (chip implications, tile list, conversion-rate pairs,
   CSV columns) is derived from here rather than hardcoded, so adding a step
   doesn't mean touching six other places.
   =========================================================================== */
(function (global) {
  "use strict";

  var PREF_KEY = "outcomes";

  // chain:true means it's a step in the main funnel (each implies all the ones
  // before it). appointment sits off to the side -- you can set an appointment
  // without having presented -- so it only implies a pickup.
  var CORE = [
    { key: "pickup",       label: "Pickups",          chipLabel: "Pickup",          short: "Pickup",       chain: true },
    { key: "conv2",        label: "Convos 2+ min",    chipLabel: "2+ min",          short: "2+ min",       chain: true },
    { key: "conv5",        label: "Convos 5+ min",    chipLabel: "5+ min",          short: "5+ min",       chain: true },
    { key: "appointment",  label: "Appointments set", chipLabel: "Appointment set", short: "appointment",  chain: false },
    { key: "presentation", label: "Presentations",    chipLabel: "Presentation",    short: "presentation", chain: true },
    { key: "sold",         label: "Sold deals",       chipLabel: "Sold",            short: "sold",         chain: true }
  ];

  var CORE_KEYS = CORE.map(function (m) { return m.key; });
  // Where a custom step is allowed to sit. Nothing may be inserted after "sold"
  // (the funnel ends there) and appointment isn't part of the chain.
  var ANCHORS = ["pickup", "conv2", "conv5", "presentation"];

  function coreByKey(k) {
    for (var i = 0; i < CORE.length; i++) if (CORE[i].key === k) return CORE[i];
    return null;
  }

  function slug(label) {
    var s = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return "x_" + (s || "step");
  }

  function customList() {
    var raw = (global.HubPrefs && global.HubPrefs.get(PREF_KEY, [])) || [];
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (c) {
      return c && typeof c === "object" && c.key && c.label &&
             CORE_KEYS.indexOf(c.key) === -1 &&      // never shadow a core outcome
             ANCHORS.indexOf(c.after) > -1;
    });
  }

  /* Main funnel order with custom steps spliced in after their anchor. */
  function chain() {
    var custom = customList();
    var out = [];
    CORE.forEach(function (m) {
      if (!m.chain) return;
      out.push(m);
      custom.forEach(function (c) {
        if (c.after === m.key) {
          out.push({ key: c.key, label: c.label, chipLabel: c.chipLabel || c.label,
                     short: c.short || c.chipLabel || c.label, chain: true, custom: true });
        }
      });
    });
    return out;
  }

  /* Display order for chips and tiles: the chain, with appointment restored to
     its usual spot just ahead of presentation. */
  function metrics() {
    var c = chain();
    var appt = coreByKey("appointment");
    var idx = -1;
    for (var i = 0; i < c.length; i++) if (c[i].key === "presentation") { idx = i; break; }
    var out = c.slice();
    if (idx > -1) out.splice(idx, 0, appt); else out.push(appt);
    return out;
  }

  /* key -> every shallower outcome it necessarily included, so checking a step
     ticks everything beneath it and unchecking a step clears everything above. */
  function implies() {
    var c = chain(), map = {}, seen = [];
    c.forEach(function (m) {
      if (seen.length) map[m.key] = seen.slice().reverse();
      seen.push(m.key);
    });
    map.appointment = ["pickup"];
    return map;
  }

  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  /* Consecutive funnel steps up to presentation, as {label, from, to} pairs.
     Stops at presentation because presentation->sold is shown as "Close rate". */
  function ratePairs() {
    var c = chain(), pairs = [];
    for (var i = 0; i < c.length - 1; i++) {
      pairs.push({ label: cap(c[i].short) + " to " + c[i + 1].short, from: c[i].key, to: c[i + 1].key });
      if (c[i + 1].key === "presentation") break;
    }
    return pairs;
  }

  global.HubOutcomes = {
    CORE: CORE,
    CORE_KEYS: CORE_KEYS,
    ANCHORS: ANCHORS,
    anchorLabel: function (k) { var m = coreByKey(k); return m ? m.chipLabel : k; },
    chain: chain,
    metrics: metrics,
    implies: implies,
    ratePairs: ratePairs,
    custom: customList,
    slug: slug,

    /* Returns an error string, or null when the step is OK to add. */
    validate: function (label, after, ignoreKey) {
      if (!String(label || "").trim()) return "Give the step a name.";
      if (ANCHORS.indexOf(after) === -1) return "Pick where it goes in the funnel.";
      var key = slug(label);
      if (CORE_KEYS.indexOf(key) > -1) return "That name clashes with a built-in outcome.";
      var clash = customList().some(function (c) { return c.key === key && c.key !== ignoreKey; });
      if (clash) return "You already have a step with that name.";
      return null;
    },

    save: function (list) {
      if (global.HubPrefs) global.HubPrefs.set(PREF_KEY, list || []);
    }
  };
})(window);
