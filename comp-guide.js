/* ============================================================================
   comp-guide.js -- first-year commission rates by carrier, product and FFL
   contract level.

   Source: FAMILY FIRST LIFE COMP GUIDE, revised 08/26/2026. The agency moved
   from FFG to FFL, so this file was rebuilt from that guide rather than
   merged -- the two disagree on nearly every shared carrier, and a half-merged
   table is worse than either one.

   Deals already saved keep the commission they were saved with. The tracker
   stores the figure on the deal, so nothing here reaches backwards.

   A null means the guide prints "-" for that level: the product is not
   available there, which is different from a rate of zero.

   Levels run 145 down to 65 and the arrays are in that order. Adding a level
   means adding a value to every array.
   ========================================================================== */
window.COMP_LEVELS = [145,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65];

window.COMP_GUIDE_SOURCE = "Family First Life comp guide, revised 08/26/2026";

window.COMP_CARRIERS = {
  "Aetna": {
    products: {
      "Whole Life": [null,144,137,130,125,120,115,107.5,100,92.5,85,77.5,70,70,70,70,70]
    }
  },

  "Aflac": {
    products: {
      "Final EX": [null,123,118,113,108,100,93,85,78,70,70,70,63,63,63,63,63]
    }
  },

  "Americo": {
    products: {
      "HMS 125":       [145,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65],
      "Eagle Premier": [135,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60]
    }
  },

  "American Amicable": {
    products: {
      "Senior/Family Choice": [125,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55,50],
      "EZ Term":              [100,100,95,90,85,80,75,70,65,60,55,50,45,40,35,30,25],
      "Secure Life":          [140,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65],
      "Home Protector":       [145,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65],
      "OBA":                  [100,100,95,90,85,80,75,70,65,60,55,50,45,40,35,30,30],
      "Term Made Simple":     [130,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55],
      "Family Protector":     [130,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55],
      // The guide prints 76% at level 100, out of step with the rest of the
      // column. Transcribed as printed; worth confirming with the IMO.
      "XUL":                  { r: [105,105,100,95,90,85,80,75,70,76,60,55,50,45,45,45,45], verify: true }
    }
  },

  "Corebridge": {
    products: {
      "GIWL": [null,80,77.5,75,72.5,70,67.5,65,62.5,60,57.5,57.5,55,55,55,55,55],
      "SIWL": [null,132,127,122,117,112,107,102,97,92,87,82,77,72,67,62,57]
    }
  },

  "Ethos": {
    products: {
      "Ethos Term Life - Prime":    [120,117.5,115,112.5,110,107.5,105,102.5,100,97.5,95,92.5,90,87.5,85,82.5,80],
      "Ethos Term Life - Choice":   [120,117.5,115,112.5,110,107.5,105,102.5,100,97.5,95,92.5,90,87.5,85,82.5,80],
      "TruStage Term Life":         [120,115,110,105,100,95,90,85,80,75,70,65,60,55,50,50,50],
      "Ethos Index Universal Life": [125,120,115,110,105,100,95,90,85,80,75,70,65,60,55,50,45],
      "Accumulation IUL (First Year)": [125,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55,50],
      "TruStage Advantage Whole Life": [120,120,115,110,105,100,95,90,85,82.5,80,77.5,75,72.5,65,60,55],
      "TruStage Advantage WL - Age 60-80":     [120,120,115,110,105,100,95,90,85,82.5,80,77.5,75,72.5,65,60,55],
      "TruStage Advantage WL - Age 20-59, 80+": [72,72,67,62,59,56,53,50,47,45.5,44,42.5,41,39.5,39.5,39.5,39.5],
      "TruStage Guaranteed Acceptance Whole Life": [30,27.5,25,22.5,20,17.5,15,12.5,10,7.5,5,2.5,2.5,2.5,2.5,2.5,2.5],
      "TruStage Accidental Death":  [85,85,80,75,70,65,60,55,50,45,40,35,30,25,25,25,25]
    }
  },

  "Foresters": {
    products: {
      "Strong Foundation": [null,125,122.5,120,115,110,105,100,95,90,85,80,75,70,65,60,60],
      "Planright":         [null,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65]
    }
  },

  "Ladder Life": {
    products: {
      "FX": [null,120,115,110,105,100,95,90,85,80,75,70,65,60,50,50,50]
    }
  },

  "NLG": {
    products: {
      "Universal Life": [null,110,105,100,95,90,85,80,75,70,65,60,55,50,45,40,40]
    }
  },

  "Mutual of Omaha": {
    products: {
      "Term Life Express":   [145,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65],
      "Final Expense":       [125,125,120,115,110,105,100,95,90,86,82,78,74,70,65,61,57],
      "IUL":                 [125,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55,50],
      "Children's Whole Life": [100,100,97,95,92,90,85,80,75,70,65,60,55,50,45,40,35],
      "IULE":                [130,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55],
      "Term Life Answers":   [110,110,105,100,95,90,85,80,75,70,65,60,55,50,45,40,35],
      "Accidental Death":    [130,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55]
    }
  },

  "Royal Neighbors": {
    products: {
      "Term":               [null,120,115,110,100,100,100,95,90,85,80,75,50,50,50,50,50],
      "Royal Legacy SPWL":  [null,16,15,14,13,13,13,13,12,11,10,9,7,7,7,7,7],
      "Secure Life IUL":    [null,125,120,112,105,105,105,100,95,90,85,80,50,50,50,50,50],
      "SI Whole Life":      [null,125,120,110,100,100,100,95,90,85,80,75,45,45,45,45,45]
    }
  },

  "Transamerica": {
    products: {
      "FE": [140,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,70],
      "UL": [120,120,115,110,105,100,95,90,80,75,70,60,55,50,45,40,40]
    }
  },

  "United Home Life": {
    products: {
      "FX":         [null,110,105,100,95,90,85,80,75,70,65,60,55,50,45,45,45],
      "GIWL":       [null,70,65,60,55,50,45,40,35,30,25,25,25,25,25,25,25],
      "Whole Life": [null,120,115,110,105,100,95,90,85,80,75,70,65,60,55,55,55],
      "Accidental": [null,100,95,90,85,80,75,70,65,60,55,50,50,50,45,45,45],
      "Term":       [null,110,105,100,95,90,85,80,75,70,65,60,55,50,45,45,45]
    }
  }
};
