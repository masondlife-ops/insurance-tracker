/* ============================================================================
   comp-calc.js -- pricing a deal from the comp guide.

   Lifted out of pnl.html so the Clients page can price a deal the same way.
   Two copies of this would drift the first time the guide changed, and the
   symptom would be two pages quoting different commission on the same policy
   -- the kind of bug you find in a paycheque, not in testing.

   Pure functions only: hand them values, get a number back. Nothing here
   touches the DOM, the store or the contract level; the caller owns all of
   that. comp-guide.js must be loaded first.
   ========================================================================== */
(function (global) {
  "use strict";

  /* Every carrier caps the advance at this much per policy, so a big case pays
     the cap rather than the full 9-month figure. */
  var ADVANCE_CAP = 2500;
  var ADVANCE_MONTHS = 9;

  function normKey(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

  function findCarrierKey(carrier) {
    var n = normKey(carrier);
    if (!n) return null;
    var keys = Object.keys(global.COMP_CARRIERS || {});
    for (var i = 0; i < keys.length; i++) if (normKey(keys[i]) === n) return keys[i];
    return null;
  }

  function findProductKey(carrierObj, product) {
    var n = normKey(product);
    if (!n) return null;
    var keys = Object.keys(carrierObj.products);
    for (var i = 0; i < keys.length; i++) if (normKey(keys[i]) === n) return keys[i];
    return null;
  }

  /* Universal life of any flavour pays on the target premium from the
     illustration, not the whole premium. Catches IUL, IULE, FFIUL, XUL, a bare
     "UL", and the spelled-out "Universal Life" that Ethos and NLG use. */
  function looksLikeIul(product) {
    return /\b[a-z]?ul\b|iule|universal life/i.test(String(product || ""));
  }

  /* Returns { rate, base, verify }, or { miss: <reason> } saying why it could
     not price this. A silent blank was hiding real money: a deal typed as
     "Banner"/"Term" instead of "Banner Life"/"Beyond Term" simply never
     calculated, and nothing said so. */
  function lookup(carrier, product, level) {
    if (!carrier || !product) return { miss: "incomplete" };   // still being typed
    if (level == null || level === "") return { miss: "level" };
    var ckey = findCarrierKey(carrier);
    if (!ckey) return { miss: "carrier" };
    var c = global.COMP_CARRIERS[ckey];
    var pkey = findProductKey(c, product);
    if (!pkey) return { miss: "product" };
    var li = (global.COMP_LEVELS || []).indexOf(parseInt(level, 10));
    if (li < 0) return { miss: "level" };
    var pv = c.products[pkey];                   // array of rates, or { r:[...], verify:true }
    var rates = Array.isArray(pv) ? pv : pv.r;
    var base = rates[li];
    // The FFL guide prints "-" where a product isn't sold at that level. That's
    // not a zero rate, and quietly calculating one would invent money.
    if (base == null) return { miss: "unavailable" };
    var verify = (!Array.isArray(pv) && !!pv.verify) || !!c.verify;
    return { rate: base, base: base, bonus: 0, bonusIncluded: false, verify: verify };
  }

  /* The whole calculation in one call, so a caller never has to remember that
     a UL pays on target or that the advance is capped.

     Returns { rate, basis, full, capped, amount, isIul, verify } when it can
     price it, or { miss } when it cannot. `amount` is what to put in the box;
     `full` is what it would have been before the cap, which is still owed and
     pays as the client pays. */
  function quote(opts) {
    opts = opts || {};
    var info = lookup(opts.carrier, opts.product, opts.level);
    if (info.miss) return info;

    var isIul = looksLikeIul(opts.product);
    var target = num(opts.target);
    var basis = isIul ? target : num(opts.ap);

    // No target yet on a UL: no figure at all, rather than an AP-based one that
    // is wrong and one keystroke from being saved.
    if (basis == null) {
      return { rate: info.rate, verify: info.verify, isIul: isIul,
               basis: null, full: null, capped: false, amount: null,
               needsTarget: isIul };
    }

    var full = basis * info.rate / 100 * ADVANCE_MONTHS / 12;
    var capped = full > ADVANCE_CAP;
    return {
      rate: info.rate, verify: info.verify, isIul: isIul, needsTarget: false,
      basis: basis, full: full, capped: capped,
      amount: capped ? ADVANCE_CAP : full
    };
  }

  function num(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* The sentence under the commission box. Facts first, warnings last, so it
     reads in one pass. `money` is passed in because each page formats its own
     way and this module has no opinion about it. */
  function note(q, money) {
    if (!q) return { text: "", warn: false };
    if (q.miss) {
      var m = q.miss;
      if (m === "carrier")     return { text: "⚠ carrier not in comp guide — enter commission manually", warn: true };
      if (m === "product")     return { text: "⚠ product not in comp guide — check spelling or enter manually", warn: true };
      if (m === "level")       return { text: "⚠ set your contract level in Settings to auto-calculate", warn: true };
      if (m === "unavailable") return { text: "⚠ not available at your contract level — enter commission manually", warn: true };
      return { text: "", warn: false };          // "incomplete": still typing
    }
    var msg = "auto · " + q.rate + "% × " + ADVANCE_MONTHS + " mo";
    // Say what it is paying on, so a number far below AP never looks like a bug.
    if (q.isIul && q.basis != null) msg += " on " + money(q.basis) + " target";
    // Say so when the cap bites: otherwise the number looks like a bad rate.
    if (q.capped) msg += " · capped at " + money(ADVANCE_CAP) + " (was " + money(q.full) + ")";
    if (q.needsTarget) msg += "  ⚠ enter the target premium — this pays on target, not AP";
    if (q.verify) msg += "  ⚠ check this rate against the comp guide";
    return { text: msg, warn: !!(q.verify || q.needsTarget) };
  }

  global.CompCalc = {
    ADVANCE_CAP: ADVANCE_CAP,
    ADVANCE_MONTHS: ADVANCE_MONTHS,
    findCarrierKey: findCarrierKey,
    findProductKey: findProductKey,
    looksLikeIul: looksLikeIul,
    lookup: lookup,
    quote: quote,
    note: note
  };
})(window);
