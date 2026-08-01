/* =========================================================================
   RED PRAIRIE CLEANING — SHARED PRICING & BOOKING-DATA ENGINE
   =========================================================================
   Single source of truth for pricing math, service catalog, condition
   model, add-ons, and flow order. Loaded by BOTH /book (customer-facing)
   and /call (CSR phone-booking tool) via <script src="../js/rp-pricing-engine.js">
   so a quote given over the phone and a quote given on the website always
   produce the exact same number — no drift between the two.

   RULES FOR EDITING THIS FILE:
   - Every function here reads/writes the global `rpState` object. Both
     /book and /call define their own `rpState` (same core fields — sqft,
     bedrooms, bathrooms, condition, addons, military flag, etc. — plus
     whatever page-specific extras they need) BEFORE this script runs any
     of its functions. Load order of the <script> tags doesn't matter
     since nothing here executes at parse time against rpState — only
     when a function is called after the page's own state exists.
   - Pricing changes (rates, tier prices, condition multipliers, add-on
     prices) belong ONLY here. Never duplicate a price into /book or
     /call's own inline script — that's exactly the drift problem this
     file exists to prevent.
   - UI-only concerns (screen rendering, DOM, calendar widget, GHL webhook
     payload shape, analytics/tracking) stay OUT of this file and live in
     each page's own inline script, since those legitimately differ
     between the customer and CSR experiences.
   ========================================================================= */

const rpServices = {
  moveout:     { name: "Move-In / Move-Out Cleaning",     emoji: "🏠" },
  deep:        { name: "Deep Cleaning",                    emoji: "🧼" },
  maintenance: { name: "Basic Cleaning",             emoji: "✨" },
  carpet:      { name: "Carpet Cleaning",                  emoji: "🧽" },
  hourly:      { name: "Hourly Cleaning & Organizing",     emoji: "⏱" },
  airbnb:      { name: "Airbnb Turnover Cleaning",         emoji: "🛏" }
};

/* Move-In / Move-Out Cleaning pricing — sq-ft bracket base + bedroom/bathroom
   adders. Replaces the old flat bedroom-tier table (was: 1:199, 2:299, 3:399,
   4:499, 5:599), which underpriced small 4-bed homes and overpriced small
   1-bed homes since it ignored home size entirely. Base includes up to
   2 bedrooms and 1 full bathroom. "base: null" (over 3,400 sq ft) is a
   custom quote — see rpIsCustomQuoteOnly(). */
const rpSqftTiers = [
  { key: "t1", label: "Up to 1,000 sq ft",     base: 229 },
  { key: "t2", label: "1,001–1,400 sq ft",     base: 259 },
  { key: "t3", label: "1,401–1,800 sq ft",     base: 299 },
  { key: "t4", label: "1,801–2,200 sq ft",     base: 349 },
  { key: "t5", label: "2,201–2,600 sq ft",     base: 399 },
  { key: "t6", label: "2,601–3,000 sq ft",     base: 449 },
  { key: "t7", label: "3,001–3,400 sq ft",     base: 499 },
  { key: "t8", label: "Over 3,400 sq ft",      base: null }
];
const RP_MOVEOUT_INCLUDED_BEDROOMS = 2;
const RP_MOVEOUT_INCLUDED_BATHROOMS = 1;
const RP_MOVEOUT_BEDROOM_RATE = 45;   // $ per bedroom above the included 2
const RP_MOVEOUT_BATHROOM_RATE = 35;  // $ per full bathroom above the included 1
function rpSqftTier() { return rpSqftTiers.find(t => t.key === rpState.sqft) || null; }
function rpMoveoutIsCustomSqft() { return rpState.service === "moveout" && rpState.sqft === "t8"; }

/* Deep Cleaning bedroom-tier base prices. 5+ bedrooms is a custom quote
   (no fixed tier), handled via rpIsCustomQuoteOnly(). */
const rpDeepTierPrices = { 1: 179, 2: 249, 3: 299, 4: 399 };

/* Hourly Cleaning & Organizing — flat rate per cleaner per hour. No
   condition step; the customer sets scope via cleaner count + hours. */
const HOURLY_RATE_PER_CLEANER = 50;
const HOURLY_MIN_HOURS = 4;
const HOURLY_MAX_HOURS = 8;
const HOURLY_MAX_CLEANERS = 4;

/* Condition step — Move-Out and Deep Cleaning, automatic percentage
   model. Standard is the lowest advertised price (no pre-cleaned
   discount/credit for either service). Heavy (+20%) and Extreme (+50%)
   apply automatically to the base price — confirmed, not re-priced, at
   the arrival walkthrough. Specialty/Unsafe is still bookable online but
   routes to a custom quote, same treatment as over-3,400 sq ft Move-Out
   or 5+ bedroom Deep Cleaning. */
const rpConditionOrder = ["Standard Condition", "Heavy Buildup", "Extreme Buildup", "Specialty or Unsafe Conditions"];
const rpConditionKeys = {
  "Standard Condition": "standard",
  "Heavy Buildup": "heavy",
  "Extreme Buildup": "extreme",
  "Specialty or Unsafe Conditions": "specialty"
};
const rpConditionCopy = {
  "Standard Condition": "Normal lived-in condition — no loose trash, no major oven or fridge buildup, no heavy grime.",
  "Heavy Buildup": "More buildup than standard — some trash, grease in the oven or stovetop, major soap scum or hard water buildup, dust or pet hair throughout.",
  "Extreme Buildup": "Requires significant extra time and labor — heavy grease, trash in multiple rooms, noticeable pet odor, or visible mold.",
  "Specialty or Unsafe Conditions": "Biohazards, hoarding-level clutter, active pests, or anything requiring PPE. Still bookable online — we'll confirm a custom quote before your cleaning date."
};
const RP_CONDITION_MULTIPLIER = { standard: 0, heavy: 0.20, extreme: 0.50, specialty: null };


/* Military / First Responder discount — 10%, capped at $25. Cannot stack
   with promotional coupon codes. */
const MILITARY_DISCOUNT_RATE = 0.10;
const MILITARY_DISCOUNT_CAP = 25;



/* Recurring maintenance plans — industry-standard discount bands for a
   no-contract, cancel-anytime recurring cleaning service. Discount applies
   to the per-visit price; visitsPerMonth is used to show the total monthly
   commitment (e.g. Weekly = 4 visits/month, billed at 4x the per-visit rate). */
const rpFrequencyPlans = {
  "Weekly":   { discount: 0.20, visitsPerMonth: 4 },
  "Biweekly": { discount: 0.15, visitsPerMonth: 2 },
  "Monthly":  { discount: 0.10, visitsPerMonth: 1 },
  "One-Time": { discount: 0,    visitsPerMonth: 1 }
};
function rpFrequencyPlan() {
  return rpFrequencyPlans[rpState.frequency] || null;
}

function rpMaintenancePrice(bedrooms, bathrooms) {
  const beds = Number(bedrooms || 1);
  const baths = Number(bathrooms || 1);
  return 149 + Math.max(0, beds - 1) * 25 + Math.max(0, baths - 1) * 25;
}

const rpAddonCatalog = {
  carpet:  { label: "Carpet Cleaning",     unit: "room", bundlePrice: 50 },
  junk:    { label: "Junk Haul",           half: 100, full: 200 },
  windows: { label: "Exterior Windows",    basic: 100, premium: 200 },
  garage:  { label: "Garage Floor Wash",   price: 150 },
  laundry: { label: "Laundry Service",     pricePerLoad: 35 },
  fridge:  { label: "Refrigerator Interior", price: 50 },
  yard:    { label: "Yard Refresh", normal: 100, overgrown: 150, xl: 200, xlOvergrown: 250 }
};

const rpServiceAddons = {
  moveout:     ["carpet", "junk", "windows", "garage", "yard"],
  deep:        ["fridge", "carpet", "laundry", "windows", "garage", "yard"],
  maintenance: ["laundry", "windows", "yard"],
  hourly:      ["fridge", "laundry", "windows", "garage", "yard"]
};

const rpIncludes = {
  moveout: {
    intro: "A complete top-to-bottom reset of the entire interior — every room, surface, and appliance inside and out. Built for move-outs, move-ins, and getting a home show-ready for sale.",
    items: ["The entire interior, cleaned top to bottom", "Bathrooms, scrubbed top to bottom", "Inside & out: oven, fridge & all appliances", "Cabinets, drawers & closets — inside included", "Interior windows, sills & tracks", "Baseboards, doors, fixtures & trim", "All floors throughout"]
  },
  deep: {
    intro: "A detailed top-to-bottom clean of kitchens, bathrooms, baseboards, doors, fixtures, floors, and reachable surfaces—including inside the oven and microwave.",
    items: ["Kitchens & bathrooms, detailed", "Inside oven & microwave", "Baseboards, doors & fixtures", "Floors throughout", "All reachable surfaces"]
  },
  maintenance: {
    intro: "A complete routine clean of kitchens, bathrooms, dusting, floors, and everyday surfaces to keep the home consistently fresh.",
    items: ["Kitchens & bathrooms", "Dusting throughout", "Floors throughout", "Everyday surfaces refreshed"]
  },
  carpet: {
    intro: "Professional hot-water extraction with pre-treatment and normal spot treatment for the carpeted rooms you select.",
    items: ["Hot-water extraction cleaning", "Pre-treatment included", "Normal spot treatment", "For the rooms you select"]
  },
  hourly: {
    intro: "Flexible, general help around the house—cleaning, organizing, decluttering, and light tidying—billed by the hour with as many cleaners as you need.",
    items: ["Cleaning & light tidying", "Organizing & decluttering", "As many cleaners as you need", "Billed by the hour"]
  },
  airbnb: {
    intro: "A guest-ready turnover of kitchens, bathrooms, floors, and everyday surfaces, with laundry, restocking, and same-day service available by request.",
    items: ["Guest-ready kitchens & bathrooms", "Floors & everyday surfaces", "Laundry & restocking on request", "Same-day service available"]
  }
};

/* Funnel flows: same per-service question order as the homepage, minus the
   read-only "includes" screen — that content lives as an expandable
   "What's included" on the estimate screen. */
const rpFlows = {
  moveout:     ["included", "sqft", "bedrooms", "bathrooms", "condition", "addons", "estimate", "lead", "calendar"],
  deep:        ["included", "bedrooms", "bathrooms", "condition", "addons", "estimate", "lead", "calendar"],
  maintenance: ["included", "bedrooms", "bathrooms", "frequency", "addons", "estimate", "lead", "calendar"],
  carpet:      ["included", "rooms", "carpetdetails", "estimate", "lead", "calendar"],
  hourly:      ["included", "cleaners", "hours", "addons", "estimate", "lead", "calendar"],
  airbnb:      ["included", "bedrooms", "bathrooms", "airbnbdetails", "estimate", "lead", "calendar"]
};

function rpCurrentFlow() { return rpFlows[rpState.service] || []; }
function rpStepIndex() { return rpCurrentFlow().indexOf(rpState.step); }

function rpTimeEstimate() {
  if (rpState.service === "moveout") return "6–10 hours";
  if (rpState.service === "deep") return "Up to 6 hours";
  if (rpState.service === "maintenance") return "Up to 4 hours";
  if (rpState.service === "hourly") return rpState.hourCount ? `${rpState.hourCount} hour${rpState.hourCount === 1 ? "" : "s"}` : `${HOURLY_MIN_HOURS}+ hours`;
  if (rpState.service === "airbnb") return "Varies by property size";
  if (rpState.service === "carpet") return "Varies by room count";
  return "";
}
function rpTeamSize() {
  if (rpState.service === "moveout") return "2 cleaners";
  if (rpState.service === "deep" || rpState.service === "maintenance") return "1 cleaner";
  if (rpState.service === "hourly") return rpState.cleanerCount ? `${rpState.cleanerCount} cleaner${rpState.cleanerCount === 1 ? "" : "s"}` : "You choose";
  if (rpState.service === "airbnb") return "1–2 cleaners";
  if (rpState.service === "carpet") return "1 technician";
  return "";
}

/* True when this service/selection has no fixed instant price and needs
   a custom quote — Airbnb Turnover always, and Deep Cleaning at 5+
   bedrooms. Booking still proceeds normally (calendar + confirmation);
   only the price display and crew notes change. */
function rpConditionKey() {
  return rpConditionKeys[rpState.condition] || null;
}
/* Automatic condition multiplier for Move-Out and Deep Cleaning — 0 for
   Standard, 0.20 for Heavy, 0.50 for Extreme. Specialty has no multiplier
   (null); it's handled as a custom quote via rpIsSpecialtyCondition()
   instead. */
function rpConditionMultiplier() {
  if (!["moveout", "deep"].includes(rpState.service)) return 0;
  const m = RP_CONDITION_MULTIPLIER[rpConditionKey()];
  return typeof m === "number" ? m : 0;
}
function rpIsSpecialtyCondition() {
  return ["moveout", "deep"].includes(rpState.service) && rpConditionKey() === "specialty";
}
function rpIsCustomQuoteOnly() {
  return rpState.service === "airbnb"
    || (rpState.service === "deep" && Number(rpState.bedrooms) >= 5)
    || rpMoveoutIsCustomSqft()
    || rpIsSpecialtyCondition();
}

/* Base price for Move-Out (sq-ft bracket + bedroom/bathroom adders) or
   Deep Cleaning (bedroom-tier) — then the Heavy/Extreme condition
   multiplier applied automatically to either, before add-ons and
   military discount. No manual credits for either service; Standard is
   always the lowest advertised price. */
function rpServiceBasePrice() {
  const mult = rpConditionMultiplier();
  if (rpState.service === "moveout") {
    if (!rpState.sqft || !rpState.bedrooms || rpMoveoutIsCustomSqft() || rpIsSpecialtyCondition()) return 0;
    const tier = rpSqftTier();
    if (!tier || tier.base === null) return 0;
    const beds = Number(rpState.bedrooms);
    const baths = Number(rpState.bathrooms || RP_MOVEOUT_INCLUDED_BATHROOMS);
    const bedAdj = Math.max(0, beds - RP_MOVEOUT_INCLUDED_BEDROOMS) * RP_MOVEOUT_BEDROOM_RATE;
    const bathAdj = Math.max(0, baths - RP_MOVEOUT_INCLUDED_BATHROOMS) * RP_MOVEOUT_BATHROOM_RATE;
    const preConditionCents = rpToCents(tier.base + bedAdj + bathAdj);
    return rpCentsToDollars(Math.round(preConditionCents * (1 + mult)));
  }
  if (rpState.service === "deep") {
    if (!rpState.bedrooms || Number(rpState.bedrooms) >= 5 || rpIsSpecialtyCondition()) return 0; // custom quote
    const base = rpDeepTierPrices[Number(rpState.bedrooms)] || 0;
    return rpCentsToDollars(Math.round(rpToCents(base) * (1 + mult)));
  }
  return 0;
}

/* ---- All money math below runs in integer cents to avoid float drift,
   then converts to dollars only for display/storage. ---- */
function rpToCents(dollars) { return Math.round(Number(dollars || 0) * 100); }
function rpCentsToDollars(cents) { return Number((cents / 100).toFixed(2)); }
function rpFormatMoney(cents) { return `$${(Math.abs(cents) / 100).toFixed(2)}`; }

/* Per-visit / per-job subtotal BEFORE military discount and BEFORE add-ons.
   For Deep/Factory Reset this is base price + condition adjustment.
   For Maintenance this is the frequency-discounted per-visit price.
   For Carpet this is the room-based price. Add-ons are always excluded —
   they're fixed price and never touched by condition or military discount. */
function rpPreDiscountSubtotalCents() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  if (rpState.service === "carpet") {
    const rooms = Math.max(2, Number(rpState.carpetRooms || 0)); // 2-room minimum
    return rpState.carpetRooms ? rpToCents(rooms * 75) : 0;
  }
  if (rpState.service === "maintenance") {
    if (!rpState.bedrooms) return 0;
    const base = rpMaintenancePrice(rpState.bedrooms, rpState.bathrooms);
    const plan = rpFrequencyPlan();
    const discountedBase = plan ? Math.round(base * (1 - plan.discount)) : base;
    return rpToCents(discountedBase);
  }
  if (["moveout", "deep"].includes(rpState.service)) {
    if (!rpState.bedrooms) return 0;
    return rpToCents(rpServiceBasePrice());
  }
  if (rpState.service === "hourly") {
    if (!rpState.cleanerCount || !rpState.hourCount) return 0;
    return rpToCents(HOURLY_RATE_PER_CLEANER * rpState.cleanerCount * rpState.hourCount);
  }
  return 0;
}

/* Military / First Responder discount — 10% of the pre-add-on subtotal
   (after condition adjustment), capped at MILITARY_DISCOUNT_CAP. Never
   applied to add-ons, and never stacks with promotional coupon codes. */
function rpMilitaryDiscountCents() {
  if (!rpState.militaryDiscount || rpIsCustomQuoteOnly()) return 0;
  const subtotal = rpPreDiscountSubtotalCents();
  if (subtotal <= 0) return 0;
  return Math.min(Math.round(subtotal * MILITARY_DISCOUNT_RATE), rpToCents(MILITARY_DISCOUNT_CAP));
}
function rpMilitaryDiscountAmount() { return rpCentsToDollars(rpMilitaryDiscountCents()); }

function rpAddonsTotal() {
  let total = 0;
  if (rpState.addonCarpetRooms > 0) total += rpState.addonCarpetRooms * rpAddonCatalog.carpet.bundlePrice;
  if (rpState.junkSize === "half") total += rpAddonCatalog.junk.half;
  if (rpState.junkSize === "full") total += rpAddonCatalog.junk.full;
  if (rpState.windowsTier === "basic") total += rpAddonCatalog.windows.basic;
  if (rpState.windowsTier === "premium") total += rpAddonCatalog.windows.premium;
  if (rpState.garageWash) total += rpAddonCatalog.garage.price;
  if (rpState.laundryLoads > 0) total += rpState.laundryLoads * rpAddonCatalog.laundry.pricePerLoad;
  if (rpState.fridgeAddon) total += rpAddonCatalog.fridge.price;
  if (rpState.yardTier) total += rpAddonCatalog.yard[rpState.yardTier];
  return total;
}
function rpAddonsCents() { return rpToCents(rpAddonsTotal()); }
/* Add-ons are fixed price and are never discounted by the military offer. */
function rpAddonsOnceCharge() { return rpAddonsTotal(); }

function rpFinalPriceCents() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  const subtotal = rpPreDiscountSubtotalCents();
  const addons = rpAddonsCents();
  if (subtotal <= 0 && addons <= 0) return 0;
  return subtotal - rpMilitaryDiscountCents() + addons;
}

/* Pre-discount subtotal INCLUDING add-ons — used only where the code needs
   "what it would cost with no military discount applied." */
function rpCalculatePrice() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  return rpCentsToDollars(rpPreDiscountSubtotalCents() + rpAddonsCents());
}

function rpFinalPrice() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  return rpCentsToDollars(rpFinalPriceCents());
}

function rpPriceLabel() {
  if (rpIsCustomQuoteOnly()) return "Custom Quote";
  const cents = rpFinalPriceCents();
  if (!cents) return "$0.00";
  return rpFormatMoney(cents);
}

function rpIsRecurringPlan() {
  return rpState.service === "maintenance" && !!rpFrequencyPlan() && rpFrequencyPlan().visitsPerMonth > 1;
}
function rpMaintenanceBasePerVisit() {
  if (rpState.service !== "maintenance" || !rpState.bedrooms) return 0;
  return rpCentsToDollars(rpPreDiscountSubtotalCents() - rpMilitaryDiscountCents());
}
function rpMonthlyTotal() {
  const plan = rpFrequencyPlan();
  const basePerVisitCents = Math.round(rpPreDiscountSubtotalCents() - rpMilitaryDiscountCents());
  if (!plan || !basePerVisitCents) return 0;
  return rpCentsToDollars(basePerVisitCents * plan.visitsPerMonth);
}
function rpFrequencySummary() {
  const plan = rpFrequencyPlan();
  if (!plan || !rpState.frequency) return "";
  if (rpState.frequency === "One-Time") return "One-Time · no recurring plan";
  const pct = Math.round(plan.discount * 100);
  return `${rpState.frequency} · ${pct}% off recurring rate`;
}
