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
  hourly:      { name: "Hourly Cleaning",                  emoji: "⏱" },
  airbnb:      { name: "Airbnb Turnover Cleaning",         emoji: "🛏" }
};

/* Move-In / Move-Out Cleaning pricing — sq-ft bracket base + bedroom/bathroom
   adders. Replaces the old flat bedroom-tier table (was: 1:199, 2:299, 3:399,
   4:499, 5:599), which underpriced small 4-bed homes and overpriced small
   1-bed homes since it ignored home size entirely. Base includes up to
   2 bedrooms and 1 full bathroom. "base: null" (over 3,400 sq ft) is a
   custom quote — see rpIsCustomQuoteOnly(). */
/* PRICING MODEL REBUILT (round 18) — replaces the round-17 sqft-bracket
   system with a bedroom-tier base + a surcharge that only kicks in on
   large homes, per direct instruction: "should only really add money on
   extra large homes, reduce the number of brackets."

   This is, structurally, the same model Red Prairie used BEFORE the
   sqft-bracket system existed (flat bedroom tiers: 1:$199, 2:$299,
   3:$399, 4:$499, 5:$599) — that model was replaced specifically because
   it couldn't tell a compact home from a sprawling one at the same
   bedroom count. This version keeps the bedroom tier as the simple,
   easy-to-quote base, but fixes that exact flaw with rpSqftTiers below,
   which is now a SURCHARGE table (only 5 steps, only matters above
   2,200 sq ft) instead of the entire pricing engine.

   NOTE — open question, not resolved by this change: the Hourly Move-Out
   option (RP_MOVEOUT_HOURLY_RATE, $80/hr) was calibrated in round 17 so
   an 8-hour standard 3bed/2bath job priced at $640 on both the flat and
   hourly paths. The new 3-bed flat price is $449, so that agreement no
   longer holds — a customer could get a meaningfully different number
   depending which path they pick for what might be the same actual job.
   Left as-is since it wasn't part of this request, but flagging clearly:
   worth deciding whether to adjust the hourly rate, or accept the two
   paths pricing differently now. */
const RP_MOVEOUT_BEDROOM_TIERS = [
  { min: 1, max: 2, base: 299, includedBathrooms: 1, label: "1\u20132 bedrooms" },
  { min: 3, max: 3, base: 399, includedBathrooms: 2, label: "3 bedrooms" },
  { min: 4, max: 4, base: 499, includedBathrooms: 2, label: "4 bedrooms" },
  /* 5+ base ($599) continues the same $100 step as the other three tiers
     ($299/$399/$499) — not given directly, follows the confirmed pattern. */
  { min: 5, max: 999, base: 599, includedBathrooms: 3, label: "5+ bedrooms" }
];
function rpMoveoutBedroomTier(beds) {
  const b = Number(beds || 0);
  return RP_MOVEOUT_BEDROOM_TIERS.find(t => b >= t.min && b <= t.max) || null;
}
/* $50/extra bathroom beyond whatever's included at that bedroom tier —
   raised from $40 to stay proportional now that the base tiers moved up
   by $100 each. */
/* $0/extra bathroom — per direct instruction, the ONLY extra charge on
   top of the bedroom tier is now the large-home sqft surcharge below.
   Bathroom count is still collected (crew planning, still shown on the
   invoice) but no longer adds to price. Kept as a rate constant rather
   than deleting the formula entirely, so restoring a bathroom charge
   later is a one-line change if that's ever reversed. */
const RP_MOVEOUT_EXTRA_BATH_RATE = 0;

/* Large-home surcharge — the ONLY place square footage still affects
   Move-Out price. Threshold and step sizes below 2,200 sq ft don't
   matter at all now; a compact and a mid-size home under that line pay
   the same bedroom-tier price. Step amounts ($100/$200/$300) are
   defaults, not numbers given directly — easy to adjust, they're the
   only unspecified part of this table. */
const rpSqftTiers = [
  { key: "t1", label: "Under 2,200 sq ft",     base: 0 },
  { key: "t2", label: "2,200\u20132,600 sq ft",     base: 100 },
  { key: "t3", label: "2,600\u20133,000 sq ft",     base: 200 },
  { key: "t4", label: "3,000\u20133,400 sq ft",     base: 300 },
  { key: "t5", label: "Over 3,400 sq ft",      base: null }
];
/* Deep Cleaning sq-ft tiers — same bracket structure and included
   bed/bath convention as Move-Out (RP_MOVEOUT_* constants below), just
   its own base prices. Replaces the old flat 1-4 bedroom table, which
   couldn't tell a compact home from a sprawling one at the same bedroom
   count. */
const rpDeepSqftTiers = [
  { key: "t1", label: "Up to 1,000 sq ft",     base: 199 },
  { key: "t2", label: "1,001–1,400 sq ft",     base: 255 },
  { key: "t3", label: "1,401–1,800 sq ft",     base: 259 },
  { key: "t4", label: "1,801–2,200 sq ft",     base: 299 },
  { key: "t5", label: "2,201–2,600 sq ft",     base: 339 },
  { key: "t6", label: "2,601–3,000 sq ft",     base: 379 },
  { key: "t7", label: "3,001–3,400 sq ft",     base: 419 },
  { key: "t8", label: "Over 3,400 sq ft",      base: null }
];
/* Basic/Maintenance Cleaning sq-ft tiers — lighter included bed/bath
   baseline (1 bed, 1 bath) and a smaller per-room rate than Move-Out/Deep
   since a recurring visit is a lighter touch than a full reset. The
   frequency discount (rpFrequencyPlan) still applies on top of this. */
const rpMaintenanceSqftTiers = [
  { key: "t1", label: "Up to 1,000 sq ft",     base: 150 },
  { key: "t2", label: "1,001–1,400 sq ft",     base: 155 },
  { key: "t3", label: "1,401–1,800 sq ft",     base: 175 },
  { key: "t4", label: "1,801–2,200 sq ft",     base: 195 },
  { key: "t5", label: "2,201–2,600 sq ft",     base: 219 },
  { key: "t6", label: "2,601–3,000 sq ft",     base: 245 },
  { key: "t7", label: "3,001–3,400 sq ft",     base: 275 },
  { key: "t8", label: "Over 3,400 sq ft",      base: null }
];
/* RP_MOVEOUT_INCLUDED_BEDROOMS/BATHROOMS and the flat per-unit rates
   that used to live here are gone — replaced by RP_MOVEOUT_BEDROOM_TIERS
   above, where included bathrooms now vary BY bedroom tier (1 for a
   1-2bed home, 2 for 3-4bed, 3 for 5+) rather than a single fixed
   number for every size. */
const RP_MAINTENANCE_INCLUDED_BEDROOMS = 1;
const RP_MAINTENANCE_INCLUDED_BATHROOMS = 1;
const RP_MAINTENANCE_BEDROOM_RATE = 15;
const RP_MAINTENANCE_BATHROOM_RATE = 15;
/* Picks the right tier table for whichever service is active. Every
   caller (in this file, /book, and /call) goes through rpSqftTier()
   rather than referencing a tier array by name, so a page never has to
   know which service uses which table. */
function rpSqftTiersForService(service) {
  if (service === "deep") return rpDeepSqftTiers;
  if (service === "maintenance") return rpMaintenanceSqftTiers;
  return rpSqftTiers; // moveout, and safe default
}
function rpSqftTier() { return rpSqftTiersForService(rpState.service).find(t => t.key === rpState.sqft) || null; }
/* Over-size custom-quote check. Move-Out's table shrank to 5 tiers in
   round 18 (was 8), so the "last tier = custom quote" key changed from
   t8 to t5. Deep/Basic no longer use a sqft step at all (round 12), so
   their branches here are dead but harmless — kept rather than removed
   to avoid touching every call site for a rename, same reasoning as
   before. */
function rpMoveoutIsCustomSqft() {
  return (rpState.service === "moveout" && rpState.sqft === "t5")
    || (["deep", "maintenance"].includes(rpState.service) && rpState.sqft === "t8");
}

/* Hourly Cleaning — flat rate per cleaner per hour. No condition
   step; the customer sets scope via cleaner count + hours.

   IMPORTANT — this service sells TIME, NOT COMPLETION. The customer ranks
   priority areas and the crew works that list in order for the hours
   booked. Nothing promises the list gets finished. That framing is what
   keeps a partial-scope job from turning into a "you missed things"
   review, so don't soften it in the UI copy.

   Minimum is 3 hours @ 1 cleaner = $150, which sits just above the
   maintenance floor so it doesn't cannibalise a full clean. */
const HOURLY_RATE_PER_CLEANER = 50;
const HOURLY_MIN_HOURS = 3;
const HOURLY_MAX_HOURS = 8;
const HOURLY_MAX_CLEANERS = 4;

/* PEAK-SEASON KILL SWITCH — flip to false to pull Hourly Cleaning off the
   public /book service list in one line (e.g. during peak PCS weeks when
   a $150 3-hour booking would otherwise eat a Friday slot a $379+
   move-out wanted). /call is unaffected: CSRs can always book it by
   phone, so turning this off routes the demand through Christa and Liz
   instead of killing it. */
const RP_HOURLY_PUBLIC = true;

/* ---------------------------------------------------------------------
   BASIC & DEEP CLEANING — FLAT TIME-ANCHORED PRICING (replaces the old
   sqft-bracket + bedroom/bathroom + condition-multiplier model for these
   two services only. Move-Out keeps sqft brackets; it's the one service
   where a size-based number matters for the "no upcharges" promise).

   Rationale: quoting every possible home size was the actual problem,
   not the pricing model. A flat anchor removes the guessing — $150 or
   $300 is easy to sell and easy for a CSR to quote instantly — and
   EXTRA HOURS (an add-on, $50/hr) absorb the variance a sqft bracket
   used to handle. A big or heavily-soiled home just costs more because
   more hours get added, not because it landed in a higher bracket.

   This also means Basic and Deep no longer collect sqft/bedrooms/
   bathrooms/condition at all (see rpFlows below) — the customer is
   buying an anchored block of time, not a size-priced job. */
const RP_BASIC_ANCHOR_HOURS = 3;
const RP_BASIC_ANCHOR_PRICE = 150;
const RP_DEEP_ANCHOR_HOURS = 6;
const RP_DEEP_ANCHOR_PRICE = 300;
const RP_EXTRA_HOUR_RATE = 50;

/* Services hidden from the PUBLIC /book service picker. /call ignores
   this entirely. */
function rpServiceIsPublic(key) {
  if (key === "hourly") return RP_HOURLY_PUBLIC;
  return true;
}

/* Guarantee tiers, not a single on/off switch:

   - "deposit"      Move-Out only. This is the one service with an
                     inspection/deposit outcome to stand behind, so it
                     keeps the specific, provable Defend Your Deposit
                     promise: come back free if a landlord flags something.

   - "satisfaction" Deep and Basic. These no longer promise a completed
                     whole-home reset regardless of size — the customer
                     buys an anchored block of time and can add hours.
                     A deposit-style completion guarantee wouldn't be
                     honest against a job that's intentionally scoped by
                     time rather than by square footage. A satisfaction
                     guarantee is: we stand behind the QUALITY of what we
                     did clean, not a promise that everything in a large
                     or heavily-soiled home got reached in the time booked.

   - "none"         Hourly only. Scope is entirely customer-directed (their
                     priority list, in their order), so neither guarantee
                     applies — unchanged from the original hourly carve-out.

   Carpet is not covered by this function and still falls through to the
   old rpGuaranteeApplies()-style "true" behavior at the call site (shows
   the Defend Your Deposit line). That's a pre-existing oddity — a
   carpet-only booking has no deposit/inspection outcome either — flagged
   in the round log as unresolved, not silently changed here since it
   wasn't part of what was asked. */
function rpGuaranteeType() {
  /* Split by billing mode, not just service. Flat-rate Move-Out is paid
     for an OUTCOME (an inspection-ready home) — the deposit guarantee
     protects that outcome. Hourly Move-Out is paid for TIME — if the
     crew stops when the clock runs out, promising the same outcome
     guarantee wouldn't hold together, so it gets the same time-based
     Satisfaction Guarantee Deep/Basic already use instead. */
  if (rpIsMoveoutHourly()) return "satisfaction";
  if (rpState.service === "moveout") return "deposit";
  if (rpState.service === "deep" || rpState.service === "maintenance") return "satisfaction";
  if (rpState.service === "hourly") return "none";
  return "deposit";
}
/* Kept for any other caller still checking a boolean — true for anything
   that shows SOME guarantee line (deposit or satisfaction), false only
   for the scope-directed hourly carve-out. */
function rpGuaranteeApplies() {
  return rpGuaranteeType() !== "none";
}

/* Condition step — Move-Out and Deep Cleaning, automatic percentage
   model. Standard is the lowest advertised price (no pre-cleaned
   discount/credit for either service). Heavy (+20%) and Extreme (+50%)
   apply automatically to the base price — confirmed, not re-priced, at
   the arrival walkthrough. Specialty/Unsafe is still bookable online but
   routes to a custom quote, same treatment as over-3,400 sq ft on either
   Move-Out or Deep Cleaning. */
const rpConditionOrder = ["Standard Condition", "Heavy Buildup", "Extreme Buildup", "Specialty or Unsafe Conditions"];
const rpConditionKeys = {
  "Standard Condition": "standard",
  "Heavy Buildup": "heavy",
  "Extreme Buildup": "extreme",
  "Specialty or Unsafe Conditions": "specialty"
};
const rpConditionCopy = {
  "Standard Condition": "Normal lived-in condition. No loose trash, no major oven or fridge buildup, no heavy grime.",
  "Heavy Buildup": "More buildup than standard. Some trash, grease in the oven or stovetop, major soap scum or hard water buildup, dust or pet hair throughout.",
  "Extreme Buildup": "Requires significant extra time and labor. Heavy grease, trash in multiple rooms, noticeable pet odor, or visible mold.",
  "Specialty or Unsafe Conditions": "Biohazards, hoarding-level clutter, active pests, or anything requiring PPE. Still bookable online, we'll confirm a custom quote before your cleaning date."
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
  const tier = rpSqftTier();
  if (!tier || tier.base === null) return 0; // no sqft selected yet, or over-3400sf custom quote
  const beds = Number(bedrooms || RP_MAINTENANCE_INCLUDED_BEDROOMS);
  const baths = Number(bathrooms || RP_MAINTENANCE_INCLUDED_BATHROOMS);
  const bedAdj = Math.max(0, beds - RP_MAINTENANCE_INCLUDED_BEDROOMS) * RP_MAINTENANCE_BEDROOM_RATE;
  const bathAdj = Math.max(0, baths - RP_MAINTENANCE_INCLUDED_BATHROOMS) * RP_MAINTENANCE_BATHROOM_RATE;
  return tier.base + bedAdj + bathAdj;
}

const rpAddonCatalog = {
  carpet:  { label: "Carpet Cleaning",     unit: "room", bundlePrice: 50 },
  junk:    { label: "Junk Haul",           half: 100, full: 200 },
  windows: { label: "Exterior Windows",    basic: 100, premium: 200 },
  garage:  { label: "Garage Floor Wash",   price: 150 },
  laundry: { label: "Laundry Service",     pricePerLoad: 35 },
  fridge:  { label: "Refrigerator Interior", price: 50 },
  yard:    { label: "Yard Refresh", normal: 100, overgrown: 150, xl: 200, xlOvergrown: 250 },
  extraHours: { label: "Extra Time", unit: "hour", pricePerHour: RP_EXTRA_HOUR_RATE },
  /* Deep Cleaning only. Priced per hour actually booked (anchor hours
     plus any Extra Time already purchased), not a flat number — a 2nd
     cleaner for 6 hours costs the same $50/hr as the 1st, so the price
     has to track whatever the total hours end up being. See
     rpSecondCleanerPrice() for the calculation. */
  secondCleaner: { label: "Additional Cleaner", pricePerHour: RP_EXTRA_HOUR_RATE }
};

const rpServiceAddons = {
  moveout:     ["carpet", "junk", "windows", "garage", "yard"],
  /* Fridge and laundry pulled from Deep/Basic — for a crew already on
     site for hours with an anchored-time model, these are small enough
     that "note it in special instructions" covers it without needing a
     separate priced add-on step. Move-out and Hourly keep both: Move-out
     because the crew isn't necessarily told anything beyond the standard
     scope, and Hourly because the whole service is instruction-driven
     anyway, so fridge/laundry fit the same pattern as any other request. */
  deep:        ["extraHours", "secondCleaner", "carpet", "windows", "garage", "yard"],
  maintenance: ["extraHours", "windows", "yard"],
  hourly:      ["fridge", "laundry", "windows", "garage", "yard"]
};

/* Second cleaner costs the same $50/hr as the base rate, for however
   many hours are actually booked (the 6-hour anchor plus any Extra Time
   already added) — a 2nd person working 8 hours costs the same as the
   1st person working 8 hours. Recomputed live so adding/removing Extra
   Time updates this price automatically instead of going stale. */
function rpSecondCleanerHours() {
  return RP_DEEP_ANCHOR_HOURS + Number(rpState.addonExtraHours || 0);
}
function rpSecondCleanerPrice() {
  return rpSecondCleanerHours() * rpAddonCatalog.secondCleaner.pricePerHour;
}

const rpIncludes = {
  /* Round-16 rebuild: every service now uses ONE shared step-2 format
     instead of five slightly different layouts (some with checklists,
     some without, mismatched font sizes between them). A short intro
     line, three scannable fact chips, one outcome line, no em dashes
     anywhere. `highlights` is an array of [iconKey, text] pairs (pass
     null for iconKey to render a plain text chip, used for the two
     price-only chips below since there's no dollar-sign icon in the
     set). `items` stays in every entry ONLY because /call's CSR
     reference rail (call/index.html, ~line 936) still reads it for a
     fast on-call checklist — not rendered on /book anymore for ANY
     service as of this round. Do not delete items. */
  moveout: {
    intro: "This isn't a checklist. It's a full interior reset: oven, fridge, cabinets, closets, bathrooms, baseboards, windows, and floors, all included and nothing billed separately.",
    highlights: [
      ["home", "Every room, inside & out"],
      ["check", "Oven, fridge & cabinets included"],
      ["shield", "Defend Your Deposit"],
      ["repeat", "2-cleaner crew"]
    ],
    outcome: "Built to pass a landlord walkthrough, or to photograph well if you're listing the home for sale.",
    /* Exclusions folded into the fine print instead of their own
       paragraph — this is what makes "everything" credible (naming a
       few exclusions beats staying vague about them), but it doesn't
       need to be a whole separate block anymore now that chips do the
       main enumeration work. */
    fineprint: "Exterior windows, the garage floor, carpet extraction, and junk removal aren't included, but you can add any of them on the next step. Need something else? Text us anytime.",
    itemsLead: "Including the parts most companies bill as add-ons:",
    items: ["Inside & out: oven, fridge & all appliances", "Cabinets, drawers & closets, inside included", "Bathrooms, scrubbed top to bottom", "Interior windows, sills & tracks", "Baseboards, doors, fixtures & trim", "All floors throughout", "Every other room and surface inside the home"]
  },
  deep: {
    intro: "A detailed, top-to-bottom clean of every room.",
    highlights: [
      ["clock", "6 hours included"],
      ["zap", "Add time for a bigger home"],
      ["shield", "Satisfaction Guaranteed"]
    ],
    outcome: "You'll either love the clean or you won't. Tell us within 48 hours and we'll make it right, free.",
    items: ["Kitchen, detailed clean", "Bathrooms, scrubbed top to bottom", "Inside oven & microwave", "Baseboards, doors & fixtures", "Floors throughout", "All reachable surfaces"]
  },
  maintenance: {
    intro: "A routine clean to keep an already-tidy home fresh.",
    highlights: [
      ["clock", "3 hours included"],
      ["zap", "Add time for a bigger home"],
      ["shield", "Satisfaction Guaranteed"]
    ],
    outcome: "You'll either love the clean or you won't. Tell us within 48 hours and we'll make it right, free.",
    items: ["Kitchen, wiped down & tidied", "Bathrooms, cleaned & sanitized", "Dusting throughout", "Floors throughout", "Everyday surfaces refreshed"]
  },
  carpet: {
    /* "Not a rental machine" removed per direct feedback: nobody was
       assuming that, so the line was answering an objection nobody
       raised instead of just describing the service. */
    intro: "Hot-water extraction cleaning for the rooms you choose.",
    highlights: [
      ["droplet", "Hot-water extraction"],
      ["check", "Pre-treatment included"],
      [null, "$50 per room"]
    ],
    outcome: "Lifts dirt and allergens deep in the fibers, not just the surface.",
    items: ["Hot-water extraction cleaning", "Pre-treatment included", "Normal spot treatment", "For the rooms you select"]
  },
  hourly: {
    /* Description now explicitly says "cleaning and organizing" so the
       full scope of the service is stated plainly, not just implied by
       the checklist underneath it. */
    intro: "For when you only want certain areas cleaned and organized.",
    highlights: [
      ["clock", "3-hour minimum"],
      ["check", "You set the priorities"],
      [null, "$50 per hour"]
    ],
    outcome: "Tell us what matters most, and we'll work that list for the hours you book.",
    items: ["You set the priority order", "Kitchens, bathrooms, or any specific rooms", "Organizing, decluttering & light tidying", "Billed by the hour, 3-hour minimum"]
  }
};

/* Funnel flows: same per-service question order as the homepage, minus the
   read-only "includes" screen — that content lives as an expandable
   "What's included" on the estimate screen. */
const rpFlows = {
  /* Move-Out's actual flow is computed in rpCurrentFlow() below, not
     read directly from this array — it branches on rpState.moveoutMode
     ("flat" vs "hourly"). This entry is the flat-rate path, kept as the
     default/fallback. */
  moveout:     ["included", "moveoutmode", "bedrooms", "bathrooms", "sqft", "condition", "addons", "estimate", "lead", "calendar"],
  /* Deep and Basic dropped sqft/bedrooms/bathrooms/condition entirely —
     both are flat time-anchored (RP_DEEP_ANCHOR_PRICE / RP_BASIC_ANCHOR_PRICE
     above) with Extra Time as an add-on instead of a size bracket. */
  deep:        ["included", "addons", "estimate", "lead", "calendar"],
  maintenance: ["included", "frequency", "addons", "estimate", "lead", "calendar"],
  carpet:      ["included", "rooms", "carpetdetails", "estimate", "lead", "calendar"],
  hourly:      ["included", "cleaners", "hours", "addons", "estimate", "lead", "calendar"],
  airbnb:      ["included", "bedrooms", "bathrooms", "airbnbdetails", "estimate", "lead", "calendar"]
};

/* CONTACT GATE — the single biggest leak in the old funnel.
   Price used to render before any contact was captured, so anyone who
   balked at the number left completely anonymous: no name, no phone, no
   callback, no retargeting. A paid LSA/Ads click would produce a price
   objection we never got to answer.

   The gate asks for name + phone ONLY (not the full address block —
   that stays on the lead step, prefilled). It posts a partial lead the
   moment it's submitted, so a bounce at the price screen still lands a
   callable contact in GHL.

   Set false to restore the old price-first order. Worth revisiting with
   real numbers: this trades some top-of-funnel completion for a much
   higher share of *reachable* leads. Watch booked jobs, not funnel
   completion rate — completion will look worse by design. */
const RP_CONTACT_GATE = true;

/* ---------------------------------------------------------------------
   MOVE-OUT HOURLY OPTION
   New alternative to the flat sqft-bracket price: pay by the hour at a
   rate that already bundles the standard 2-cleaner crew, no separate
   cleaner-count picker needed. Priced to match the same labor economics
   as the flat-rate table above — see rpSqftTiers comment for the shared
   $80/hr benchmark both paths are built from.

   Minimum is 4 hours (a full move-out reset rarely finishes faster than
   that even for a small home) — adjustable if that's wrong in practice.
   No condition step: like Deep/Basic, variance is absorbed by choosing
   more hours rather than a size/condition multiplier. Still gets the
   Defend Your Deposit guarantee (rpGuaranteeType() keys off the service,
   not the billing mode) — this is still a real move-out job, just billed
   differently, not a customer-directed scope like Hourly Cleaning. */
const RP_MOVEOUT_HOURLY_RATE = 80;
const RP_MOVEOUT_HOURLY_MIN_HOURS = 4;
const RP_MOVEOUT_HOURLY_MAX_HOURS = 12;
const RP_MOVEOUT_HOURLY_CLEANERS = 2;

function rpIsMoveoutHourly() {
  return rpState.service === "moveout" && rpState.moveoutMode === "hourly";
}

function rpCurrentFlow() {
  let flow = rpFlows[rpState.service] || [];
  if (rpState.service === "moveout") {
    /* Questionnaire always comes first, before any billing-mode choice —
       water/power/A/C/mold/pests decide whether the job can happen at
       all, regardless of how it's priced. A "no"/"yes" that blocks the
       job ends the flow right there (see "moveoutblocked" screen, which
       captures a callback lead instead of dead-ending with nothing).

       "moveoutintent" (rental vs. selling + PM/realtor name) now comes
       right after "included" — asked the moment someone picks Move-Out,
       not buried at the very end of the funnel where it used to live on
       the lead step. Moved per direct feedback; no longer duplicated on
       the lead screen (see rpLeadScreen).

       Past the questionnaire, flat-rate is the DEFAULT path straight
       through to a real price — no upfront "how do you want this
       priced?" choice anymore. Hourly is only reached by explicitly
       choosing "Prefer an hourly clean?" from the estimate screen once
       a flat price is already showing, not as a coin-flip before either
       number exists. */
    if (rpMoveoutBlocked()) {
      flow = ["included", "moveoutintent", "moveoutquestionnaire", "moveoutblocked"];
    } else if (rpIsMoveoutHourly()) {
      flow = ["included", "moveoutintent", "moveoutquestionnaire", "moveouthours", "addons", "estimate", "lead", "calendar"];
    } else {
      flow = ["included", "moveoutintent", "moveoutquestionnaire", "bedrooms", "bathrooms", "sqft", "addons", "estimate", "lead", "calendar"];
    }
  }
  if (!RP_CONTACT_GATE) return flow;
  if (flow.includes("contactgate") || flow.includes("moveoutblocked")) return flow;
  /* Insert before "addons", NOT before "estimate". The add-ons screen
     carries a live "Current estimate" chip, so gating only at the
     estimate screen still let the customer read their full price a step
     early and leave without giving a number. Blanking that chip instead
     would mean choosing add-ons with no idea what they cost, which is
     worse. Flows without an add-ons step fall back to the estimate. */
  let at = flow.indexOf("addons");
  if (at === -1) at = flow.indexOf("estimate");
  if (at === -1) return flow;
  return flow.slice(0, at).concat(["contactgate"], flow.slice(at));
}
function rpStepIndex() { return rpCurrentFlow().indexOf(rpState.step); }

function rpTimeEstimate() {
  if (rpIsMoveoutHourly()) return rpState.moveoutHours ? `${rpState.moveoutHours} hour${rpState.moveoutHours === 1 ? "" : "s"}` : `${RP_MOVEOUT_HOURLY_MIN_HOURS}+ hours`;
  if (rpState.service === "moveout") return "6–10 hours";
  if (rpState.service === "deep") {
    const extra = Number(rpState.addonExtraHours || 0);
    return extra > 0 ? `${RP_DEEP_ANCHOR_HOURS + extra} hours (${RP_DEEP_ANCHOR_HOURS} + ${extra} extra)` : `${RP_DEEP_ANCHOR_HOURS} hours`;
  }
  if (rpState.service === "maintenance") {
    const extra = Number(rpState.addonExtraHours || 0);
    return extra > 0 ? `${RP_BASIC_ANCHOR_HOURS + extra} hours (${RP_BASIC_ANCHOR_HOURS} + ${extra} extra)` : `${RP_BASIC_ANCHOR_HOURS} hours`;
  }
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
/* Move-Out is the only condition-priced service now. Deep and Basic used
   to carry this same Standard/Heavy/Extreme ladder (added in an earlier
   round specifically to fix Basic having no size-variance protection at
   all), but both moved to flat time-anchored pricing with an Extra Time
   add-on instead — see RP_DEEP_ANCHOR_PRICE / RP_BASIC_ANCHOR_PRICE above.
   Extra hours now do the job condition multipliers used to do for those
   two services, so this list shrank rather than grew. */
const RP_CONDITION_PRICED_SERVICES = [];
/* ^ Empty now that Move-Out dropped condition-based pricing (see
   rpServiceBasePrice's comment above). This safely makes
   rpConditionMultiplier() and rpIsSpecialtyCondition() no-ops everywhere
   they're still referenced, without hunting down and deleting every call
   site individually. rpConditionOrder/rpConditionCopy stay defined but
   are no longer wired into any active flow. */

/* ---------------------------------------------------------------------
   MOVE-OUT HARD-STOP QUESTIONNAIRE
   Replaces the old self-reported condition scale entirely. Five plain
   yes/no facts about whether the job can happen as booked, not how
   dirty the home is. Any answer that fails routes straight to a phone
   call instead of adjusting price, because this crew can't renegotiate
   a number on-site, so there's no point pricing for dirtiness anymore,
   only checking whether a normal crew can do a normal job here.

   NOTE: mold and pests used to route through rpIsSpecialtyCondition()
   (the old "Specialty or Unsafe Conditions" custom-quote tier). That
   mechanism is gone along with condition pricing; this is now the only
   path for those two flags on Move-Out. */
function rpMoveoutQuestionnaireAnswered() {
  return rpState.moveoutWaterOn !== null && rpState.moveoutPowerOn !== null &&
         rpState.moveoutAcOn !== null && rpState.moveoutMold !== null &&
         rpState.moveoutPests !== null;
}
function rpMoveoutBlocked() {
  if (rpState.service !== "moveout") return false;
  if (!rpMoveoutQuestionnaireAnswered()) return false;
  return rpState.moveoutWaterOn === false
      || rpState.moveoutPowerOn === false
      || rpState.moveoutAcOn === false
      || rpState.moveoutMold === true
      || rpState.moveoutPests === true;
}
/* Which specific answer(s) triggered the block, used to write a useful
   note for the office instead of a generic "blocked" flag. */
function rpMoveoutBlockReasons() {
  const reasons = [];
  if (rpState.moveoutWaterOn === false) reasons.push("Water is off");
  if (rpState.moveoutPowerOn === false) reasons.push("Power is off");
  if (rpState.moveoutAcOn === false) reasons.push("A/C isn't working");
  if (rpState.moveoutMold === true) reasons.push("Signs of mold");
  if (rpState.moveoutPests === true) reasons.push("Signs of pests");
  return reasons;
}

/* Automatic condition multiplier for Move-Out, Deep and Basic — 0 for
   Standard, 0.20 for Heavy, 0.50 for Extreme. Specialty has no multiplier
   (null); it's handled as a custom quote via rpIsSpecialtyCondition()
   instead. */
function rpConditionMultiplier() {
  if (!RP_CONDITION_PRICED_SERVICES.includes(rpState.service)) return 0;
  const m = RP_CONDITION_MULTIPLIER[rpConditionKey()];
  return typeof m === "number" ? m : 0;
}
function rpIsSpecialtyCondition() {
  return RP_CONDITION_PRICED_SERVICES.includes(rpState.service) && rpConditionKey() === "specialty";
}
function rpIsCustomQuoteOnly() {
  return rpState.service === "airbnb"
    || rpMoveoutIsCustomSqft()
    || rpIsSpecialtyCondition()
    || rpMoveoutBlocked();
}

/* Base price for Move-Out or Deep Cleaning — both are sq-ft bracket +
   bedroom/bathroom adders (same included-2-bed/1-bath convention and
   $45/$35 rates for both), then the Heavy/Extreme condition multiplier
   applied automatically, before add-ons and military discount. No manual
   credits for either service; Standard is always the lowest advertised
   price. */
function rpServiceBasePrice() {
  if (rpState.service === "moveout") {
    /* Condition-based pricing (Standard/Heavy/Extreme multiplier) REMOVED
       for Move-Out. Replaced by a hard-stop questionnaire (water, power,
       A/C, mold, pests) — see rpMoveoutBlocked(). The reasoning: this
       crew can't renegotiate a price on-site, so a self-reported
       "how dirty is it" multiplier was never enforceable anyway. The new
       model doesn't try to price dirtiness at all — it only checks
       whether the job can happen as booked. If it can't, the flow stops
       and routes to a phone call instead of adjusting the price. */
    if (!rpState.bedrooms || rpMoveoutIsCustomSqft() || rpMoveoutBlocked()) return 0;
    const tier = rpMoveoutBedroomTier(rpState.bedrooms);
    if (!tier) return 0;
    const baths = Number(rpState.bathrooms || tier.includedBathrooms);
    const bathAdj = Math.max(0, baths - tier.includedBathrooms) * RP_MOVEOUT_EXTRA_BATH_RATE;
    /* Large-home surcharge — 0 for anything under 2,200 sq ft. rpSqftTier()
       returning null (sqft not yet answered) is treated the same as "no
       surcharge" rather than blocking the price, since the surcharge is
       secondary information now, not the primary driver. */
    const sizeTier = rpSqftTier();
    const sizeSurcharge = (sizeTier && sizeTier.base !== null) ? sizeTier.base : 0;
    return tier.base + bathAdj + sizeSurcharge;
  }
  /* Deep is now a flat anchor price (see RP_DEEP_ANCHOR_PRICE) — it no
     longer runs through this sqft-bracket formula. Kept returning 0 here
     rather than deleting the branch, so any stale caller fails loudly
     (a visible $0) instead of silently inheriting Move-Out's math. */
  return 0;
}

/* Single source of truth for what "Base Service" should display for any
   service, used by both /book's invoice and /call's CSR summary so the
   two never drift apart. */
function rpDisplayBasePrice() {
  if (rpIsMoveoutHourly()) {
    const hours = Number(rpState.moveoutHours || 0);
    return hours >= RP_MOVEOUT_HOURLY_MIN_HOURS ? hours * RP_MOVEOUT_HOURLY_RATE : 0;
  }
  if (rpState.service === "moveout") return rpServiceBasePrice();
  if (rpState.service === "deep") return RP_DEEP_ANCHOR_PRICE;
  if (rpState.service === "maintenance") return RP_BASIC_ANCHOR_PRICE;
  return 0;
}

/* ---- All money math below runs in integer cents to avoid float drift,
   then converts to dollars only for display/storage. ---- */
function rpToCents(dollars) { return Math.round(Number(dollars || 0) * 100); }
function rpCentsToDollars(cents) { return Number((cents / 100).toFixed(2)); }
function rpFormatMoney(cents) { return `$${(Math.abs(cents) / 100).toFixed(2)}`; }

/* Per-visit / per-job subtotal BEFORE military discount and BEFORE add-ons.
   For Deep Cleaning this is base price + condition adjustment.
   For Maintenance this is the frequency-discounted per-visit price.
   For Carpet this is the room-based price. Add-ons are always excluded —
   they're fixed price and never touched by condition or military discount. */
function rpPreDiscountSubtotalCents() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  if (rpIsMoveoutHourly()) {
    /* Flat $80/hr, 2 cleaners already bundled into that rate — no
       separate cleaner-count picker needed, and no condition multiplier
       (same reasoning as Deep/Basic: more hours absorbs a bigger or
       messier home, not a size/condition bump on top of the rate). */
    const hours = Number(rpState.moveoutHours || 0);
    if (hours < RP_MOVEOUT_HOURLY_MIN_HOURS) return 0;
    return rpToCents(hours * RP_MOVEOUT_HOURLY_RATE);
  }
  if (rpState.service === "carpet") {
    const rooms = Math.max(2, Number(rpState.carpetRooms || 0)); // 2-room minimum
    /* $50/room whether carpet is booked standalone or bundled onto another
       service — used to be $75 standalone, which meant the exact same
       carpet work cost 50% more depending on how it was booked. Nothing
       about cleaning a carpet changes based on that. The 2-room minimum
       plus the $150 one-time floor still protect against an unprofitable
       single-room trip. */
    return rpState.carpetRooms ? rpToCents(rooms * rpAddonCatalog.carpet.bundlePrice) : 0;
  }
  if (rpState.service === "deep") {
    /* Flat anchor — see RP_DEEP_ANCHOR_PRICE block above for the reasoning.
       No sqft/bedroom/condition inputs anymore; size and buildup variance
       is absorbed by the Extra Time add-on instead. */
    return rpToCents(RP_DEEP_ANCHOR_PRICE);
  }
  if (rpState.service === "maintenance") {
    /* Flat anchor, same reasoning as Deep. Condition multiplier no longer
       applies here (RP_CONDITION_PRICED_SERVICES is Move-Out only now),
       so rpConditionMultiplier() naturally returns 0 for this service —
       the line below is left in place rather than special-cased so a
       future change to that list doesn't silently stop applying here. */
    const base = RP_BASIC_ANCHOR_PRICE;
    const conditioned = rpCentsToDollars(Math.round(rpToCents(base) * (1 + rpConditionMultiplier())));
    const plan = rpFrequencyPlan();
    const discountedBase = plan ? Math.round(conditioned * (1 - plan.discount)) : conditioned;
    return rpToCents(discountedBase);
  }
  if (rpState.service === "moveout") {
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

/* Single source of truth for "what would N rooms of standalone Carpet
   Cleaning cost" — used by the room-count picker on /book so its preview
   prices can never silently drift from the real formula again. Before
   this existed, the picker had its own hardcoded `n*75` — a leftover
   from the pre-round-10 rate that never got updated when the price cut
   to $50/room, so the page quoted $75/room math right below a subheading
   that said "$50 per room." Applies the same 2-room minimum and $150
   one-time floor as the real engine calculation. */
function rpCarpetOptionPrice(n) {
  const rooms = Math.max(2, Number(n || 0));
  return Math.max(rooms * rpAddonCatalog.carpet.bundlePrice, RP_ONE_TIME_MIN);
}

/* Pet enzyme treatment — carpet only, priced per room. Breaks down odor
   and stains at the source rather than masking them; surfaced right
   when "Pet odor" gets checked on the carpet details screen, since
   that's the exact moment the customer's already thinking about it. */
const RP_PET_ENZYME_RATE = 25;
function rpPetEnzymePrice() {
  return Math.max(1, Number(rpState.carpetRooms || 0)) * RP_PET_ENZYME_RATE;
}

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
  if (rpState.addonExtraHours > 0) total += rpState.addonExtraHours * rpAddonCatalog.extraHours.pricePerHour;
  if (rpState.addonSecondCleaner) total += rpSecondCleanerPrice();
  /* Gated to carpet specifically — pet enzyme only makes sense for the
     standalone Carpet Cleaning service, and stacking it here (rather than
     inside rpPreDiscountSubtotalCents' carpet branch) keeps it OUTSIDE
     the $150 one-time floor, same as every other add-on. A $100 carpet
     job + $25 enzyme should floor-then-add to $175, not get absorbed
     into a single floored $150. */
  if (rpState.service === "carpet" && rpState.addonPetEnzyme) total += rpPetEnzymePrice();
  return total;
}
function rpAddonsCents() { return rpToCents(rpAddonsTotal()); }
/* Add-ons are fixed price and are never discounted by the military offer. */
function rpAddonsOnceCharge() { return rpAddonsTotal(); }

/* ---------------------------------------------------------------------
   MINIMUM CHARGE
   A crew still burns drive time, setup and supplies on a small job, so
   below a certain ticket the trip loses money once acquisition cost is
   counted. Enforced AFTER the military discount — applied before it, the
   discount punches straight through the floor.

   Two floors on purpose. For a ONE-TIME job the visit is the whole
   relationship, so it has to stand on its own. For a RECURRING plan the
   ACCOUNT is the unit of economics, not the visit: a weekly customer at
   $120/visit is ~$6,200 a year and is one of the best accounts on the
   book. Refusing that because one visit prints under $150 would be a
   mistake, so recurring carries a lower floor.

   The floor covers the CLEANING only. Add-ons are priced separately and
   stack on top, so a thin base can't ride in on an expensive add-on.
   --------------------------------------------------------------------- */
const RP_ONE_TIME_MIN = 150;
const RP_RECURRING_MIN_PER_VISIT = 115;

function rpIsRecurringBooking() {
  return rpState.service === "maintenance"
    && !!rpState.frequency
    && rpState.frequency !== "One-Time";
}
function rpServiceFloorCents() {
  if (rpIsCustomQuoteOnly()) return 0;
  return rpToCents(rpIsRecurringBooking() ? RP_RECURRING_MIN_PER_VISIT : RP_ONE_TIME_MIN);
}
/* Service subtotal after military discount, raised to the floor. */
function rpNetServiceCents() {
  const subtotal = rpPreDiscountSubtotalCents();
  if (subtotal <= 0) return 0;
  return Math.max(subtotal - rpMilitaryDiscountCents(), rpServiceFloorCents());
}
function rpFloorApplied() {
  const subtotal = rpPreDiscountSubtotalCents();
  if (subtotal <= 0 || rpIsCustomQuoteOnly()) return false;
  return (subtotal - rpMilitaryDiscountCents()) < rpServiceFloorCents();
}

function rpFinalPriceCents() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  const subtotal = rpPreDiscountSubtotalCents();
  const addons = rpAddonsCents();
  if (subtotal <= 0 && addons <= 0) return 0;
  return rpNetServiceCents() + addons;
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

/* ---------------------------------------------------------------------
   REQUIRED FIRST-VISIT DEEP CLEAN ON RECURRING PLANS
   Visit one of a recurring plan absorbs months of accumulated buildup at
   the maintenance rate — the standard way cleaners lose money on
   recurring accounts. Setting the baseline with a Deep Clean makes every
   later visit genuinely predictable, because we controlled the starting
   condition. Trade practice, and it's disclosed up front rather than
   sprung on arrival.

   Applies to ANY recurring frequency including Monthly (visitsPerMonth
   is 1 for Monthly, so rpIsRecurringPlan() is false for it — that's why
   this checks frequency directly instead). One-Time Basic cleans are
   unaffected.

   Set false to sell recurring with no required first Deep.
   --------------------------------------------------------------------- */
const RP_RECURRING_REQUIRES_DEEP_FIRST = true;

function rpRecurringNeedsDeepFirst() {
  return RP_RECURRING_REQUIRES_DEEP_FIRST
    && rpState.service === "maintenance"
    && !!rpState.frequency
    && rpState.frequency !== "One-Time"
    && !rpIsCustomQuoteOnly();
}

/* Price of that first-visit Deep, using the same size/bed/bath/condition
   the customer already gave us. Computed by briefly swapping the service
   so it reuses rpServiceBasePrice() rather than duplicating the formula —
   state is always restored, including on error. */
function rpRecurringDeepFirstCents() {
  if (!rpRecurringNeedsDeepFirst()) return 0;
  /* Used to swap rpState.service to "deep" and read a sqft-bracket price,
     which made the recurring first visit only as reliable as whatever
     sqft/bedroom values happened to still be in state from the Basic
     Cleaning flow. Deep is a flat anchor now, so the first visit is just
     that anchor — no state-swapping, no sqft dependency, no chance of
     silently returning $0 because a tier field was empty. */
  return rpToCents(RP_DEEP_ANCHOR_PRICE);
}
function rpRecurringDeepFirstPrice() {
  return rpCentsToDollars(rpRecurringDeepFirstCents());
}

/* What the customer actually pays on booking day: the required Deep plus
   any add-ons, with the military discount applied to the Deep. The
   recurring per-visit rate starts from visit two. */
function rpFirstVisitTotalCents() {
  if (!rpRecurringNeedsDeepFirst()) return rpFinalPriceCents();
  const deep = rpRecurringDeepFirstCents();
  if (deep <= 0) return rpFinalPriceCents();
  const discount = rpState.militaryDiscount
    ? Math.min(Math.round(deep * MILITARY_DISCOUNT_RATE), rpToCents(MILITARY_DISCOUNT_CAP))
    : 0;
  return Math.max(deep - discount, rpToCents(RP_ONE_TIME_MIN)) + rpAddonsCents();
}
function rpFirstVisitTotal() { return rpCentsToDollars(rpFirstVisitTotalCents()); }

function rpMaintenanceBasePerVisit() {
  if (rpState.service !== "maintenance" || !rpState.bedrooms) return 0;
  return rpCentsToDollars(rpNetServiceCents());
}
function rpMonthlyTotal() {
  const plan = rpFrequencyPlan();
  const basePerVisitCents = rpNetServiceCents();
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
