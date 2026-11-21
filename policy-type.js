/* ============================================================================
   policy-type.js -- what kind of policy a deal is.

   Five types: Whole Life, Term, IUL, UL, Accidental.

   Most products say what they are in the name, so the rules below read the
   product string. The ones that don't are brand names -- "PlanRight", "Eagle
   Premier", "FX" -- and no amount of pattern matching recovers those, so they
   are looked up per carrier instead.

   Derived, never stored. A deal keeps its carrier and product, and the type is
   worked out when it is shown, so correcting an entry here fixes every policy
   already on the board rather than only the ones logged afterwards.
   ========================================================================== */
(function (global) {
  "use strict";

  var TYPES = ["Whole Life", "Term", "IUL", "UL", "Accidental"];

  /* Carrier-level: everything this carrier writes is one type. */
  var BY_CARRIER = {
    "americo": "Whole Life"
  };

  /* Product-level, where the name gives nothing away. Keyed carrier|product,
     both lowercased. Anything not listed falls through to the name rules. */
  var BY_PRODUCT = {
    // Neither name gives it away, and they are not what you would guess:
    // Strong Foundation is term, PlanRight is whole life.
    "foresters|strong foundation": "Term",
    "foresters|planright": "Whole Life"

    // American Amicable's Senior/Family Choice, Secure Life, Home Protector,
    // OBA and Family Protector are still unconfirmed, and left out on purpose
    // so they show as unknown rather than as a guess.
  };

  function norm(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

  /* Returns one of TYPES, or null when the product is not recognisable. Null is
     a real answer -- better than labelling a policy wrongly, which is worse
     than not labelling it at all. */
  function of(carrier, product) {
    var c = norm(carrier), p = norm(product);
    if (!c && !p) return null;

    var byProduct = BY_PRODUCT[c + "|" + p];
    if (byProduct) return byProduct;
    if (BY_CARRIER[c]) return BY_CARRIER[c];

    // Accidental first: an AD&B rider product can carry another type's words.
    if (/accidental|\bad&?b\b/.test(p)) return "Accidental";

    // Indexed before plain universal, since every IUL is also a UL.
    if (/\biule?\b|index[a-z]*\s+universal|\bindexed?\s+ul\b/.test(p)) return "IUL";

    // Shared with comp-calc.js, which uses the same test to decide that a UL
    // pays commission on target premium rather than on AP.
    if (global.CompCalc && global.CompCalc.looksLikeIul(product)) return "UL";
    if (/\b[a-z]?ul\b|universal life/.test(p)) return "UL";

    if (/\bterm\b/.test(p)) return "Term";

    /* Final expense is whole life, and it is sold under initials as often as
       under its own name -- FE, FX, "Final EX". */
    if (/final\s*ex|\bfe\b|\bfx\b/.test(p)) return "Whole Life";

    if (/whole\s*life|\bwl\b|\bgiwl\b|\bsiwl\b|\bspwl\b/.test(p)) return "Whole Life";

    return null;
  }

  global.PolicyType = { TYPES: TYPES, of: of };
})(window);
