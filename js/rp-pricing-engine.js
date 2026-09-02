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
  /* Round 19 — Move-Out split into two real products instead of one
     product with an optional hourly billing mode. "moveout" keeps its
     original key (no GHL/webhook/analytics migration needed) and becomes
     the guaranteed, full-checklist tier. "moveoutrefresh" is new: a
     lighter, faster, cheaper clean for anyone NOT facing a landlord/PM
     inspection, with no Defend Your Deposit promise attached. See the
     comment above RP_MOVEOUT_REFRESH_BEDROOM_TIERS below for the pricing
     rationale and RP_GUARANTEE note in rpGuaranteeType() for the
     guarantee split. */
  moveout:        { name: "Inspection Ready Move-Out",     emoji: "🏠" },
  moveoutrefresh: { name: "Move-Out Express",               emoji: "🧹" },
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

   ROUND 19 — per direct instruction: "remove move-out hourly and replace
   move-out with" a two-tier structure so the customer knows exactly what
   scope they're buying. The old Hourly Move-Out option (pay-by-the-hour,
   RP_MOVEOUT_HOURLY_RATE) is GONE — it was a second way to price the same
   guaranteed job and had drifted from the flat-rate table's real hours.
   Removing it outright is simpler than re-syncing it: one product, one
   number, easy to explain at a glance, matching how Deep/Basic work.

   In its place, Move-Out is now two real products:
     - "moveout" (THIS table, UNCHANGED)         Inspection Ready.
       Full checklist, Defend Your Deposit guarantee. Same prices as
       before this round -- nothing here was re-priced.
     - "moveoutrefresh" (RP_MOVEOUT_REFRESH_BEDROOM_TIERS, below)
       A lighter, faster clean for anyone NOT facing a landlord/PM
       inspection -- no oven/fridge/cabinet interiors, no inside closets,
       no baseboards/interior windows/wall spot-cleaning, no deposit
       guarantee. Priced at roughly 60% of the matching Inspection Ready
       tier, rounded to a clean number, reflecting the shorter job (about
       half the crew-hours) rather than a discount off the same work. */
/* ROUND 25 (direct instruction) re-priced BOTH tiers from the Deposit
   Math worksheet's own formula, replacing numbers that were carried over
   unchanged from before the guarantee split existed:

     labor(hrs) = hrs * 2 crew * $17.50/hr * 1.12 burden
     cost       = labor + $15 supplies + $25 overhead
     Inspection Ready only: cost = cost / (1 - 8% guarantee reserve)
     price      = cost / (1 - 20% target margin)

   Using the worksheet's own assumed hours (Inspection Ready 6/8/10/12,
   Express 3/4/5/6, by bedroom tier) this formula outputs $374/$480/
   $587/$693 for Inspection Ready and $197/$246/$295/$344 for Express --
   rounded below to clean, ends-in-9 numbers that land AT OR SLIGHTLY
   ABOVE the formula's own target at every size, so the margin is a
   floor, not a ceiling. Inspection Ready's old prices ($299/$399/$499/
   $599) were the exact same numbers charged before the two-tier split
   existed -- the guarantee reserve was adopted structurally but never
   actually funded into the price. This is that fix. Express's old
   prices ($179/$229/$279/$329) were closer to correct (round 19's
   "~60% of Inspection Ready, rounded" heuristic) but still $15-18 under
   the formula at every size; nudged up to clear it cleanly. */
/* ROUND 26 (direct instruction: "Change Inspection Move-Out from 2
   cleaners to 3 cleaners, 5-8 hours") -- re-run through the SAME Deposit
   Math formula the round-25 comment above documents, with crew and hours
   swapped for Inspection Ready only (Express is untouched -- still 2
   crew, still its own hours):

     labor(hrs) = hrs * 3 crew * $17.50/hr * 1.12 burden
     cost       = labor + $15 supplies + $25 overhead
     cost       = cost / (1 - 8% guarantee reserve)
     price      = cost / (1 - 20% target margin)

   "5-8 hours" replaces the old 6-10 display range; assumed per-tier
   hours are the four whole numbers in that range, one per bedroom tier
   (5/6/7/8), the same even one-hour-per-tier step pattern the old
   6/8/10/12 assumption used (see RP_MOVEOUT_TIER_HOURS below for the
   display string these feed). That gives $453.80/$533.70/$613.59/
   $693.48 -- rounded up to the nearest ends-in-9 number at or above,
   same convention as round 25: $459/$539/$619/$699. The 5+ bedroom
   price barely moves ($699 unchanged) because 3 crew x 8 hours is the
   same 24 person-hours 2 crew x 12 hours used to cost before; the
   smaller tiers go up more (+$80/+$60/+$30) because fewer hours at the
   new crew size doesn't fully offset the extra person on a shorter job.

   This reopened the round-25 "a la carte should never be cheaper than
   switching tiers outright" invariant on Detail Pass pricing -- fixed
   in round 27, see the comment above RP_DETAIL_PASS_PRICES below for
   the corrected math (an earlier flag written in this comment named
   the wrong two bedroom sizes as the broken ones -- 1-2BR and 3BR were
   actually the sizes that broke, not 4BR/5+; that mistake was caught
   and fixed before anything shipped on it, see the round-27 note
   below). */
const RP_MOVEOUT_BEDROOM_TIERS = [
  { min: 1, max: 2, base: 459, includedBathrooms: 1, label: "1\u20132 bedrooms" },
  { min: 3, max: 3, base: 539, includedBathrooms: 2, label: "3 bedrooms" },
  { min: 4, max: 4, base: 619, includedBathrooms: 2, label: "4 bedrooms" },
  { min: 5, max: 999, base: 699, includedBathrooms: 3, label: "5+ bedrooms" }
];
/* Move-Out Express -- same bedroom brackets and included-bathroom
   convention as Inspection Ready above so the two stay directly
   comparable size-for-size; only the base price and scope differ. Still
   a starting estimate pending real logged Express job hours, same as
   before -- only the number changed this round, not that caveat. */
const RP_MOVEOUT_REFRESH_BEDROOM_TIERS = [
  { min: 1, max: 2, base: 199, includedBathrooms: 1, label: "1\u20132 bedrooms" },
  { min: 3, max: 3, base: 249, includedBathrooms: 2, label: "3 bedrooms" },
  { min: 4, max: 4, base: 299, includedBathrooms: 2, label: "4 bedrooms" },
  { min: 5, max: 999, base: 349, includedBathrooms: 3, label: "5+ bedrooms" }
];
function rpMoveoutTierTable(service) {
  return service === "moveoutrefresh" ? RP_MOVEOUT_REFRESH_BEDROOM_TIERS : RP_MOVEOUT_BEDROOM_TIERS;
}
function rpMoveoutBedroomTier(beds, service = rpState.service) {
  const b = Number(beds || 0);
  return rpMoveoutTierTable(service).find(t => b >= t.min && b <= t.max) || null;
}
/* Round 25 (direct instruction): Detail Pass pricing (baseboards & trim,
   interior windows, wall spot-cleaning, bundled) for Move-Out Express --
   same bedroom brackets as the tier tables above, $50-step convention.
   Anchored so buying every excluded-scope add-on (fridge $50 + oven $50
   + cabinets $50 + this) still costs MORE than just switching to
   Inspection Ready outright, at every size -- a la carte should never
   be the cheaper way to get the full checklist. That held at round 25's
   prices:
     1-2BR: $50*3 + $75  = $225  vs. tier gap $379-$199 = $180  (+$45)
     3BR:   $50*3 + $125 = $275  vs. tier gap $479-$249 = $230  (+$45)
     4BR:   $50*3 + $175 = $325  vs. tier gap $589-$299 = $290  (+$35)
     5+BR:  $50*3 + $225 = $375  vs. tier gap $699-$349 = $350  (+$25)

   BROKEN as of round 26 -- Inspection Ready's crew/hours change (see the
   comment above RP_MOVEOUT_BEDROOM_TIERS) moved the tier gap without
   touching this table. Checked by actually running the numbers (a first
   pass at this got the direction backwards and named the wrong two
   sizes -- corrected here): the invariant fails on the two SMALLEST
   sizes, not the two biggest, because the gap grew more on the small
   end (2-crew-for-6-hours vs. 3-crew-for-5-hours is a bigger jump than
   2-for-12 vs. 3-for-8):
     1-2BR: $50*3 + $75  = $225  vs. tier gap $459-$199 = $260  (-$35, cheaper a la carte)
     3BR:   $50*3 + $125 = $275  vs. tier gap $539-$249 = $290  (-$15, cheaper a la carte)
     4BR:   $50*3 + $175 = $325  vs. tier gap $619-$299 = $320  (+$5,  still fine, but thin)
     5+BR:  $50*3 + $225 = $375  vs. tier gap $699-$349 = $350  (+$25, still fine)

   ROUND 27 (direct instruction: "do not make refresh cheaper than
   inspection ready") fixes this by re-pricing Detail Pass alone, not
   Express's base price or the flat $50 add-ons -- this table is the one
   built specifically to be the invariant's anchor, so it's the natural
   place to absorb the correction rather than touching Express's
   advertised "starting at $199" figure. Solved for a flat $40 cushion
   at every size (a little more breathing room than round 25's smallest
   cushion of $25, so a future small nudge to Inspection Ready doesn't
   immediately break it again):
     1-2BR: need >= 260-150 = 110, +$40 cushion = $150
     3BR:   need >= 290-150 = 140, +$40 cushion = $180
     4BR:   need >= 320-150 = 170, +$40 cushion = $210
     5+BR:  need >= 350-150 = 200, +$40 cushion = $240
   Comes out to a clean $30-per-tier step (was $50) with identical $40
   margin at every size -- verify: $150+$150=$300 vs $260 (+40); $150+
   $180=$330 vs $290 (+40); $150+$210=$360 vs $320 (+40); $150+$240=
   $390 vs $350 (+40). */
const RP_DETAIL_PASS_PRICES = [
  { min: 1, max: 2, price: 150 },
  { min: 3, max: 3, price: 180 },
  { min: 4, max: 4, price: 210 },
  { min: 5, max: 999, price: 240 }
];
function rpDetailPassPrice(beds = rpState.bedrooms) {
  const b = Number(beds || 0);
  const tier = RP_DETAIL_PASS_PRICES.find(t => b >= t.min && b <= t.max);
  return tier ? tier.price : RP_DETAIL_PASS_PRICES[0].price;
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
/* Move-Out Express's own large-home surcharge -- same steps as Inspection
   Ready above, halved, since Express's whole point is a smaller number.
   Same t5 = custom-quote convention. */
const rpRefreshSqftTiers = [
  { key: "t1", label: "Under 2,200 sq ft",     base: 0 },
  { key: "t2", label: "2,200\u20132,600 sq ft",     base: 50 },
  { key: "t3", label: "2,600\u20133,000 sq ft",     base: 100 },
  { key: "t4", label: "3,000\u20133,400 sq ft",     base: 150 },
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
  if (service === "moveoutrefresh") return rpRefreshSqftTiers;
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
  return (["moveout", "moveoutrefresh"].includes(rpState.service) && rpState.sqft === "t5")
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
   a $150 3-hour booking would otherwise eat a Friday slot a $459+
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

   - "deposit"      Inspection Ready Move-Out only. This is the one
                     product with an inspection/deposit outcome to stand
                     behind, so it keeps the specific, provable Defend
                     Your Deposit promise: come back free if a landlord
                     flags something.

   - "satisfaction" Move-Out Express, Deep, and Basic. None of these
                     promise a completed, inspection-proof reset — Express
                     is intentionally a lighter/faster scope (no landlord
                     walkthrough to answer to), Deep/Basic sell an
                     anchored block of time. A deposit-style completion
                     guarantee wouldn't be honest against any of the
                     three. A satisfaction guarantee is: we stand behind
                     the QUALITY of what we did clean, not a promise that
                     the FULL inspection checklist got covered.

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
  if (rpState.service === "moveout") return "deposit";
  if (rpState.service === "moveoutrefresh") return "satisfaction";
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
  /* Round 24 (direct instruction): junk haul is no longer flat-priced at
     all -- half/full/oversized collapsed into one quoted-only item, same
     treatment as "Need Small Handyman Repairs?" on the estimate screen.
     No dollar fields left here on purpose; rpState.junkSize is now just
     null (not selected) or "yes" (selected, quoted separately) instead
     of "half"/"full"/"custom". */
  junk:    { label: "Junk Haul" },
  windows: { label: "Exterior Windows",    basic: 100, premium: 200 },
  garage:  { label: "Garage Floor Wash",   price: 150 },
  laundry: { label: "Laundry Service",     pricePerLoad: 35 },
  fridge:  { label: "Refrigerator Interior", price: 50 },
  /* Round 25 (direct instruction): three new real SKUs for Move-Out
     Express's excluded scope, so every row on the moveouttiers scope
     table (see book/index.html) shows a real price instead of "-".
     Oven and cabinets/closets are flat, same rate as the existing
     fridge interior -- interior appliance and storage cleaning time
     doesn't meaningfully scale with home size. The Detail Pass bundles
     the three remaining rows (baseboards & trim, interior windows,
     wall spot-cleaning) into one purchase, priced by bedroom tier
     since THOSE genuinely do scale with home size -- see
     rpDetailPassPrice() below for the actual numbers. Buying every one
     of these plus the fridge still costs more than switching to
     Inspection Ready outright, at every bedroom size -- see that
     function's comment for the check. */
  oven:     { label: "Oven Interior", price: 50 },
  cabinets: { label: "Inside Cabinets & Closets", price: 50 },
  detailPass: { label: "Detail Pass" }, // price is bedroom-tier-based -- see rpDetailPassPrice()
  extraHours: { label: "Extra Time", unit: "hour", pricePerHour: RP_EXTRA_HOUR_RATE },
  /* Deep Cleaning only. Priced per hour actually booked (anchor hours
     plus any Extra Time already purchased), not a flat number — a 2nd
     cleaner for 6 hours costs the same $50/hr as the 1st, so the price
     has to track whatever the total hours end up being. See
     rpSecondCleanerPrice() for the calculation. */
  secondCleaner: { label: "Additional Cleaner", pricePerHour: RP_EXTRA_HOUR_RATE }
};

const rpServiceAddons = {
  moveout:        ["carpet", "junk", "windows", "garage"],
  /* Express doesn't include the fridge interior by default (Inspection
     Ready does) -- so unlike "moveout" above, Express gets "fridge" as a
     purchasable add-on. This is the concrete version of "tell the
     customer exactly what's excluded, and how to add it back": the
     included screen names the exclusion, and this is where they can
     actually buy it. */
  moveoutrefresh: ["fridge", "oven", "cabinets", "detailPass", "carpet", "junk", "windows", "garage"],
  /* Fridge and laundry pulled from Deep/Basic — for a crew already on
     site for hours with an anchored-time model, these are small enough
     that "note it in special instructions" covers it without needing a
     separate priced add-on step. Move-out and Hourly keep both: Move-out
     because the crew isn't necessarily told anything beyond the standard
     scope, and Hourly because the whole service is instruction-driven
     anyway, so fridge/laundry fit the same pattern as any other request. */
  deep:        ["extraHours", "secondCleaner", "carpet", "windows", "garage"],
  maintenance: ["extraHours", "windows"],
  hourly:      ["fridge", "laundry", "windows", "garage"]
  /* Yard Refresh removed sitewide (direct instruction) -- it's gone from
     the catalog above too. Every service that offered it now just offers
     one less row on the add-ons screen; nothing else depended on it. */
};

/* =========================================================================
   ADD-ON AVAILABILITY (round 20)
   =========================================================================
   Every priced add-on lives in exactly one place: rpServiceAddons above.
   Before round 20, rpAddonsTotal() summed add-on state fields WITHOUT
   checking whether the current service actually offers that add-on, so a
   selection made under one service could survive a switch and keep
   charging under another.

   Reproduced live: pick Move-Out Express, add Refrigerator Interior
   ($50), then use the estimate screen's "See Inspection Ready pricing"
   link. Result was $449 on a 3BR instead of $399 -- a $50 charge for a
   fridge interior that Inspection Ready already includes in its base
   scope, rendered as a line item the customer could not remove
   (rpClearAddon is only reachable from an add-on card, and Inspection
   Ready has no fridge card). The same $50 then flowed to GHL and onto
   the crew sheet as a work item.

   This is the same bug class already fixed once in /call's pickService()
   -- see the "$525 instead of $225" note there. It came back through the
   new tier-switch path, so the fix here is structural rather than a
   patch on the two switch functions:

     1. rpClearUnavailableAddons() zeroes any add-on the incoming service
        doesn't offer. Called by every path that changes rpState.service
        WITHOUT a full rpResetServiceState() -- i.e. the move-out tier
        switches in /book and /call.
     2. rpAddonsTotal() below now filters by availability as a safety
        net, so a future code path that changes service and forgets to
        call (1) produces a correct PRICE even if state goes stale.

   Services with no entry in rpServiceAddons (carpet, airbnb) have no
   add-ons step in their flow at all, so filtering them to zero is
   correct. Carpet's own room count (rpState.carpetRooms) and pet enzyme
   are core service fields, not add-ons, and are priced elsewhere. */
function rpAddonAvailable(key, service = rpState.service) {
  return (rpServiceAddons[service] || []).includes(key);
}
/* Add-on key -> the rpState field(s) that hold its selection, and the
   value that means "not selected". Both /book and /call define all of
   these fields on their own rpState. */
const RP_ADDON_STATE_DEFAULTS = {
  carpet:        { addonCarpetRooms: 0, addonCarpetPetEnzyme: false },
  junk:          { junkSize: null },
  windows:       { windowsTier: null },
  garage:        { garageWash: false },
  laundry:       { laundryLoads: 0 },
  fridge:        { fridgeAddon: false },
  oven:          { ovenAddon: false },
  cabinets:      { cabinetsAddon: false },
  detailPass:    { detailPassAddon: false },
  extraHours:    { addonExtraHours: 0 },
  secondCleaner: { addonSecondCleaner: false }
};
/* Returns the list of add-on keys it actually cleared, so a caller can
   tell the customer what was dropped instead of silently changing their
   cart. */
function rpClearUnavailableAddons(service = rpState.service) {
  const cleared = [];
  Object.keys(RP_ADDON_STATE_DEFAULTS).forEach(key => {
    if (rpAddonAvailable(key, service)) return;
    const fields = RP_ADDON_STATE_DEFAULTS[key];
    Object.keys(fields).forEach(field => {
      const empty = fields[field];
      if (rpState[field] !== empty && rpState[field]) {
        rpState[field] = empty;
        if (!cleared.includes(key)) cleared.push(key);
      }
    });
  });
  return cleared;
}

/* =========================================================================
   ADD-ON LINE ITEMS (round 21) — ONE list, three consumers
   =========================================================================
   Before this, the same add-on selection was re-derived by hand in four
   places: /book's estimate rows, /book's office/crew summary string,
   /book's webhook payload, and /call's jobDetails(). Each had its own
   copy of "is it selected" and its own idea of how to describe it, which
   is how /call ended up shipping a $0 total for a Junk Haul the customer
   had actually selected, and how the webhook ended up with add-on names
   but no add-on prices.

   rpAddonLineItems() is now the single source. It returns one row per
   SELECTED and AVAILABLE add-on:

     { key, label, detail, price, quoted }

   price  — dollars actually added to the total (0 for quoted-separately)
   quoted — true when the item is real work with no instant price (the
            oversized junk load), so a consumer can render "quoted
            separately" instead of implying it's free.

   Every consumer formats these rows; nobody re-checks selection state. */
function rpAddonLineItems() {
  const rows = [];
  const add = (key, label, detail, price, quoted = false) => {
    if (!rpAddonAvailable(key)) return;
    rows.push({ key, label, detail, price, quoted });
  };
  if (rpState.addonCarpetRooms > 0) {
    const rooms = Number(rpState.addonCarpetRooms);
    add("carpet", "Carpet Cleaning", `${rooms} room${rooms === 1 ? "" : "s"}`, rooms * rpAddonCatalog.carpet.bundlePrice);
    /* Pet enzyme is now purchasable on the carpet ADD-ON too, not just
       the standalone Carpet Cleaning service. Same $25/room rate. A
       move-out with pet damage is the single most common place this is
       needed, and it was unreachable from that flow. */
    if (rpState.addonCarpetPetEnzyme) {
      add("carpet", "Pet Enzyme Treatment", `${rooms} room${rooms === 1 ? "" : "s"}`, rooms * RP_PET_ENZYME_RATE);
    }
  }
  /* Round 24: junk haul has no instant price at all anymore -- every
     selection is a quoted item worth $0 in the math, same treatment the
     oversized load already got. It used to render a row reading "Custom
     Quote" next to a firm grand total, which read as though the haul
     was included at $0; it's explicitly quoted instead, and every
     consumer (summary text, webhook, crew sheet, /call) says so. */
  if (rpState.junkSize === "yes") add("junk", "Junk Haul", "", 0, true);
  if (rpState.windowsTier === "basic") add("windows", "Exterior Windows", "Basic wash", rpAddonCatalog.windows.basic);
  if (rpState.windowsTier === "premium") add("windows", "Exterior Windows", "Premium wash, screens removed", rpAddonCatalog.windows.premium);
  if (rpState.garageWash) add("garage", "Garage Floor Wash", "Garage must be empty", rpAddonCatalog.garage.price);
  if (rpState.laundryLoads > 0) {
    const loads = Number(rpState.laundryLoads);
    add("laundry", "Laundry Service", `${loads} load${loads === 1 ? "" : "s"}`, loads * rpAddonCatalog.laundry.pricePerLoad);
  }
  if (rpState.fridgeAddon) add("fridge", "Refrigerator Interior", "", rpAddonCatalog.fridge.price);
  if (rpState.ovenAddon) add("oven", "Oven Interior", "", rpAddonCatalog.oven.price);
  if (rpState.cabinetsAddon) add("cabinets", "Inside Cabinets & Closets", "", rpAddonCatalog.cabinets.price);
  if (rpState.detailPassAddon) add("detailPass", "Detail Pass", "Baseboards, interior windows, walls, fans, vents & light fixtures", rpDetailPassPrice());
  if (rpState.addonExtraHours > 0) {
    const hrs = Number(rpState.addonExtraHours);
    add("extraHours", "Extra Time", `+${hrs} hour${hrs === 1 ? "" : "s"}`, hrs * rpAddonCatalog.extraHours.pricePerHour);
  }
  if (rpState.addonSecondCleaner) add("secondCleaner", "Additional Cleaner", `${rpSecondCleanerHours()} hours`, rpSecondCleanerPrice());
  /* Carpet-as-a-SERVICE keeps its own enzyme field (rpState.addonPetEnzyme)
     — different flow, different screen, priced identically. */
  if (rpState.service === "carpet" && rpState.addonPetEnzyme) {
    rows.push({ key: "petEnzyme", label: "Pet Enzyme Treatment", detail: `${Math.max(1, Number(rpState.carpetRooms || 0))} room(s)`, price: rpPetEnzymePrice(), quoted: false });
  }
  return rows;
}
/* "Carpet Cleaning: 2 rooms — $100, Junk Haul: Oversized load — quoted
   separately". Used by the crew sheet, the webhook, and /call. */
function rpAddonSummaryText() {
  const rows = rpAddonLineItems();
  if (!rows.length) return "None";
  return rows.map(r => {
    const detail = r.detail ? `: ${r.detail}` : "";
    return `${r.label}${detail} — ${r.quoted ? "quoted separately" : `$${r.price.toFixed(2)}`}`;
  }).join(", ");
}
function rpHasQuotedAddon() { return rpAddonLineItems().some(r => r.quoted); }

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
      ["repeat", "<strong>3</strong>-cleaner crew"]
    ],
    outcome: "Built to pass a landlord walkthrough, or to photograph well if you're listing the home for sale.",
    /* Exclusions folded into the fine print instead of their own
       paragraph — this is what makes "everything" credible (naming a
       few exclusions beats staying vague about them), but it doesn't
       need to be a whole separate block anymore now that chips do the
       main enumeration work. */
    fineprint: "Exterior windows, the garage floor, carpet extraction, and junk removal aren't included, but you can add any of them on the next step. Need something else? Text us anytime.",
    itemsLead: "Including the parts most companies bill as add-ons:",
    items: ["Inside & out: oven, fridge & all appliances", "Cabinets, drawers & closets, inside included", "Bathrooms, scrubbed top to bottom", "Interior windows, sills & tracks", "Baseboards, doors, fixtures & trim", "Ceiling fans, vents & light fixtures", "All floors throughout", "Every other room and surface inside the home"]
  },
  /* NEW (round 19) — the lighter counterpart to "moveout" above. Opposite
     framing on purpose: "moveout" claims totality (naming a few
     exclusions to make "everything" credible); Express is the opposite
     kind of promise, so it leads with what's bounded and names its
     exclusions as the MAIN point, not a footnote, per direct instruction
     that the customer should know exactly the scope they're getting. */
  moveoutrefresh: {
    intro: "A fast, affordable clean for when there's no landlord or PM inspection to pass — just a place that needs to be clean and ready to hand over.",
    highlights: [
      ["home", "Kitchen, bathrooms & floors"],
      ["check", "Surfaces & appliance exteriors wiped"],
      ["repeat", "<strong>2</strong>-cleaner crew"],
      [null, "No inspection guarantee"]
    ],
    outcome: "Built for tenants and owners who just need it clean — not for a landlord walkthrough.",
    /* Round 20 copy fix: the old version said "add any of them
       individually on the next step," but the refrigerator interior is
       the ONLY one of those exclusions that exists as a purchasable
       add-on (rpServiceAddons.moveoutrefresh). A customer picking
       Express on the strength of that sentence reached the add-ons step
       and found four of the five missing. Naming the one that's real and
       routing the rest to Inspection Ready keeps the promise accurate
       without needing new SKUs. */
    /* Round 25: rewritten now that oven, cabinets, and the baseboards/
       windows/walls/fans-vents-lights bundle are all real, priced
       add-ons on the next step (not just Inspection-Ready-only anymore) —
       the old copy told customers to switch tiers for things they could
       now just add here, which undersold this tier's flexibility. */
    fineprint: "Oven interior, inside cabinets & closets, and a Detail Pass (baseboards, interior windows, walls, ceiling fans, vents & light fixtures) aren't part of the base price, but you can add any of them on the next step. Inspection Ready includes all of it plus Defend Your Deposit™.",
    itemsLead: "What's included:",
    items: ["Kitchen counters, sink, stovetop & appliance exteriors", "Cabinet & closet exteriors wiped", "Bathrooms: toilet, tub/shower, sink, mirror", "All floors vacuumed & mopped", "Trash out, light fixtures dusted, glass & mirrors"]
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
  /* Both Move-Out services' actual flow is computed in rpCurrentFlow()
     below, not read directly from this array for step ORDER — it
     branches on whether the questionnaire answers block the job
     (rpMoveoutBlocked()). This array is still the allowlist /book's
     session-resume check (rpLoadPersistedState) validates a saved step
     name against, so every reachable move-out step name needs to be in
     here even though the order isn't what drives navigation.

     Round 19c (direct instruction): no more picking a tier up front.
     One "Move-Out Cleaning" entry on the service list asks bedrooms and
     bathrooms immediately, THEN a side-by-side "moveouttiers" screen
     shows both real prices for the home just described and the customer
     picks there. "included" is gone from this list -- its old job
     (describe the scope) is now the whole point of "moveouttiers", shown
     per-tier instead of once, generically, before any numbers exist to
     compare.

     Round 24 (direct instruction) rewrote this flow again, reversing
     part of round 23:
       - "bathrooms" is back as its own screen (round 23 had merged it
         into "bedrooms" to cut a step; direct instruction this round
         was to split them back out).
       - "sqft" is gone entirely, not just hidden -- Move-Out is flat
         bedroom-tier pricing now, no large-home surcharge, no
         sqft-triggered custom quote. rpServiceBasePrice() and
         rpMoveoutIsCustomSqft() already degrade correctly when
         rpState.sqft is never set (treated as "no surcharge"), so
         nothing in the pricing math itself needed to change -- just
         removing the step that used to set it.
       - "moveoutintent" (renting vs. selling) is gone from /book. /call
         keeps its own separate version of this question on its own
         script step -- this only removes /book's copy, along with the
         round-23 selling-specific nudge on "moveouttiers" that read it
         (see that screen's render block).
       - "contactgate" moved from right before "moveouttiers" to right
         after "bathrooms" -- see the comment on rpCurrentFlow() below
         for why. */
  moveout:        ["bedrooms", "bathrooms", "contactgate", "moveoutquestionnaire", "moveoutblocked", "moveoutblockedconfirmed", "moveouttiers", "addons", "estimate", "lead", "calendar"],
  moveoutrefresh: ["bedrooms", "bathrooms", "contactgate", "moveoutquestionnaire", "moveoutblocked", "moveoutblockedconfirmed", "moveouttiers", "addons", "estimate", "lead", "calendar"],
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

function rpCurrentFlow() {
  let flow = rpFlows[rpState.service] || [];
  if (["moveout", "moveoutrefresh"].includes(rpState.service)) {
    /* Round 19c (direct instruction): tier is no longer picked up front.
       One "Move-Out Cleaning" entry on the service list asks bedrooms and
       bathrooms immediately, THEN "moveouttiers" -- a side-by-side
       Express vs. Inspection Ready price comparison for the home just
       described, using rpMoveoutTierBasePrice() below. The customer
       picks a real tier there; rpState.service switches to whichever
       they pick (see rpChooseMoveoutTier in /book) and everything
       downstream (addons, guarantee copy, estimate) reads normally from
       that point on, same as picking the tier from the service list did
       in round 19.

       Round 24 (direct instruction): "sqft" and "moveoutintent" removed
       (see the comment on rpFlows above). "contactgate" is built in here
       directly now, rather than left to the generic insertion logic
       below -- it needs to land right after "bathrooms" and before
       "moveoutquestionnaire" for BOTH branches, blocked included, so
       that even a home that turns out to be blocked has already handed
       over a name and number before it finds that out. That's earlier
       than every other service's gate (which still sits right before its
       first real price -- see the generic insertion below), and earlier
       than Move-Out's OWN gate used to sit (round 19c-23 put it right
       before "moveouttiers"). The moveoutblocked screen itself no longer
       asks for name/phone a second time -- it reads what contactgate
       already collected. */
    if (rpMoveoutBlocked()) {
      flow = ["bedrooms", "bathrooms", "moveoutquestionnaire", "moveoutblocked"];
    } else {
      flow = ["bedrooms", "bathrooms", "moveoutquestionnaire", "moveouttiers", "addons", "estimate", "lead", "calendar"];
    }
    if (!RP_CONTACT_GATE) return flow;
    const at = flow.indexOf("moveoutquestionnaire");
    if (at === -1) return flow;
    return flow.slice(0, at).concat(["contactgate"], flow.slice(at));
  }
  if (!RP_CONTACT_GATE) return flow;
  if (flow.includes("contactgate")) return flow;
  /* Insert right before the FIRST screen that reveals a real price.
     Every non-Move-Out service gates at "addons" (or "estimate" if it
     has no add-ons step). Move-Out's own gate is built above instead,
     at a different position in its flow. */
  let at = flow.indexOf("addons");
  if (at === -1) at = flow.indexOf("estimate");
  if (at === -1) return flow;
  return flow.slice(0, at).concat(["contactgate"], flow.slice(at));
}
function rpStepIndex() { return rpCurrentFlow().indexOf(rpState.step); }

/* Round 20: pulled out of rpTimeEstimate() so the tier comparison screen
   can show BOTH tiers' hours side by side without touching rpState —
   same reason rpMoveoutTierBasePrice() exists for the prices. The hours
   are the clearest justification for the gap between the two numbers,
   and they weren't stated anywhere on that screen. */
/* Round 26: Inspection Ready's range dropped from "6-10" to "5-8" to
   match the new 3-cleaner crew (see RP_MOVEOUT_BEDROOM_TIERS above) --
   more hands, less time on site for the same job. Express untouched. */
const RP_MOVEOUT_TIER_HOURS = { moveout: "5–8 hours", moveoutrefresh: "3–5 hours" };
function rpMoveoutTierHours(service) { return RP_MOVEOUT_TIER_HOURS[service] || ""; }

function rpTimeEstimate() {
  if (rpState.service === "moveout") return RP_MOVEOUT_TIER_HOURS.moveout;
  if (rpState.service === "moveoutrefresh") return RP_MOVEOUT_TIER_HOURS.moveoutrefresh;
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
  /* Round 26: Inspection Ready moved to a 3-cleaner crew; Express is
     still 2. Was one shared line for both -- split so this doesn't go
     stale the next time only one tier's crew size changes. */
  if (rpState.service === "moveout") return "3 cleaners";
  if (rpState.service === "moveoutrefresh") return "2 cleaners";
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
   Reduced from 5 questions to 3 per direct instruction: Water, A/C, and
   Mold/Pests combined into one. Power dropped as a separate question
   entirely (no longer checked). Still plain facts about whether the job
   can happen as booked, not how dirty the home is — any answer that
   fails routes straight to a phone call instead of adjusting price,
   because this crew can't renegotiate a number on-site.

   Also moved to the END of the flow now, right before the price reveals
   (see rpCurrentFlow()) rather than the very first question after
   picking the service.

   NOTE: mold/pests used to route through rpIsSpecialtyCondition() (the
   old "Specialty or Unsafe Conditions" custom-quote tier). That
   mechanism is gone along with condition pricing; this is now the only
   path for that flag on Move-Out. Combining mold and pests into one
   question means the office note can no longer distinguish which one
   applies, just that one of them does. */
function rpMoveoutQuestionnaireAnswered() {
  return rpState.moveoutWaterOn !== null && rpState.moveoutAcOn !== null &&
         rpState.moveoutMoldPests !== null;
}
function rpMoveoutBlocked() {
  if (!["moveout", "moveoutrefresh"].includes(rpState.service)) return false;
  if (!rpMoveoutQuestionnaireAnswered()) return false;
  return rpState.moveoutWaterOn === false
      || rpState.moveoutAcOn === false
      || rpState.moveoutMoldPests === true;
}
/* Which specific answer(s) triggered the block, used to write a useful
   note for the office instead of a generic "blocked" flag. */
function rpMoveoutBlockReasons() {
  const reasons = [];
  if (rpState.moveoutWaterOn === false) reasons.push("Water is off");
  if (rpState.moveoutAcOn === false) reasons.push("A/C isn't working");
  if (rpState.moveoutMoldPests === true) reasons.push("Signs of mold or pests");
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
  if (["moveout", "moveoutrefresh"].includes(rpState.service)) {
    /* Condition-based pricing (Standard/Heavy/Extreme multiplier) REMOVED
       for Move-Out. Replaced by a hard-stop questionnaire (water, power,
       A/C, mold, pests) — see rpMoveoutBlocked(). The reasoning: this
       crew can't renegotiate a price on-site, so a self-reported
       "how dirty is it" multiplier was never enforceable anyway. The new
       model doesn't try to price dirtiness at all — it only checks
       whether the job can happen as booked. If it can't, the flow stops
       and routes to a phone call instead of adjusting the price. Applies
       identically to both Move-Out tiers; only the tier table differs
       (see rpMoveoutBedroomTier / rpMoveoutTierTable). */
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

/* Computes a MOVE-OUT TIER'S base price for a specific bedrooms/
   bathrooms/sqft combination without permanently switching
   rpState.service — used by the "moveouttiers" comparison screen
   (round 19c) to show both real numbers before the customer has
   committed to either one. rpServiceBasePrice() only reads
   rpState.service/.bedrooms/.bathrooms/.sqft, so a swap-compute-restore
   is safe and synchronous; nothing else observes rpState in between.
   Returns null (not 0) for a custom-quote home or a blocked
   questionnaire answer — both apply identically to either tier, so the
   comparison screen shows "Custom Quote" / routes to a callback instead
   of a misleading $0 on either card. */
function rpMoveoutTierBasePrice(service) {
  if (rpMoveoutIsCustomSqft() || rpMoveoutBlocked()) return null;
  const prevService = rpState.service;
  rpState.service = service;
  const price = rpServiceBasePrice();
  rpState.service = prevService;
  return price;
}

/* Single source of truth for what "Base Service" should display for any
   service, used by both /book's invoice and /call's CSR summary so the
   two never drift apart. */
function rpDisplayBasePrice() {
  if (rpState.service === "moveout" || rpState.service === "moveoutrefresh") return rpServiceBasePrice();
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
  if (rpState.service === "moveout" || rpState.service === "moveoutrefresh") {
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

/* Round 20: every line below is gated on rpAddonAvailable() — see the
   ADD-ON AVAILABILITY block above rpSecondCleanerPrice() for why. A
   selection the current service doesn't offer must never reach a total. */
function rpAddonsTotal() {
  let total = 0;
  if (rpAddonAvailable("carpet") && rpState.addonCarpetRooms > 0) total += rpState.addonCarpetRooms * rpAddonCatalog.carpet.bundlePrice;
  /* Pet enzyme on the carpet ADD-ON (round 21) — same $25/room rate as
     the standalone Carpet Cleaning service, priced off the add-on's own
     room count. Gated on "carpet" being available, so it can never
     outlive the carpet selection it depends on. */
  if (rpAddonAvailable("carpet") && rpState.addonCarpetRooms > 0 && rpState.addonCarpetPetEnzyme) total += rpState.addonCarpetRooms * RP_PET_ENZYME_RATE;
  /* Round 24: junk haul is quoted-only now (see rpAddonCatalog.junk) --
     it never adds to the total regardless of selection, so there's no
     line for it here anymore. */
  if (rpAddonAvailable("windows") && rpState.windowsTier === "basic") total += rpAddonCatalog.windows.basic;
  if (rpAddonAvailable("windows") && rpState.windowsTier === "premium") total += rpAddonCatalog.windows.premium;
  if (rpAddonAvailable("garage") && rpState.garageWash) total += rpAddonCatalog.garage.price;
  if (rpAddonAvailable("laundry") && rpState.laundryLoads > 0) total += rpState.laundryLoads * rpAddonCatalog.laundry.pricePerLoad;
  if (rpAddonAvailable("fridge") && rpState.fridgeAddon) total += rpAddonCatalog.fridge.price;
  if (rpAddonAvailable("oven") && rpState.ovenAddon) total += rpAddonCatalog.oven.price;
  if (rpAddonAvailable("cabinets") && rpState.cabinetsAddon) total += rpAddonCatalog.cabinets.price;
  if (rpAddonAvailable("detailPass") && rpState.detailPassAddon) total += rpDetailPassPrice();
  if (rpAddonAvailable("extraHours") && rpState.addonExtraHours > 0) total += rpState.addonExtraHours * rpAddonCatalog.extraHours.pricePerHour;
  if (rpAddonAvailable("secondCleaner") && rpState.addonSecondCleaner) total += rpSecondCleanerPrice();
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

/* =========================================================================
   SHARED WEBHOOK / CRM DETAIL FIELDS (round 21)
   =========================================================================
   /book and /call were building their GHL payloads independently. /book's
   was thorough (~60 fields); /call's `details` object had NINE, with
   everything else flattened into one job_details text blob. The practical
   effect: a phone booking arrived in GHL missing the guarantee type, the
   move-out tier, the add-on prices, the questionnaire answers, and the
   pricing breakdown — so any GHL automation that branches on those fields
   (a Express confirmation SMS must NOT promise Defend Your Deposit) fired
   wrong or not at all on every phone-booked job.

   Same fix as the pricing engine itself: put the shared fields in ONE
   function both pages spread into their own payload, and let each page
   add only what's genuinely page-specific (/book: ad attribution, Airbnb
   extras, handyman interest; /call: CSR name, lead source, call notes).

   Everything here is a STRING or NUMBER, flat, no nesting — GHL custom
   fields can't read nested objects.

   Field-name note: existing field names are preserved exactly. GHL
   dropdowns and workflows are keyed to them, so renaming would silently
   break automations. New fields are additive only. */
function rpBuildSharedDetails() {
  const custom = rpIsCustomQuoteOnly();
  const lineItems = rpAddonLineItems();
  const addonsTotal = rpAddonsTotal();
  const isMoveout = ["moveout", "moveoutrefresh"].includes(rpState.service);
  const tierLabel = !isMoveout ? "N/A"
    : rpState.service === "moveout" ? "Inspection Ready" : "Express";
  const guarantee = rpGuaranteeType();
  return {
    /* --- service identity --- */
    service: (rpServices[rpState.service] || {}).name || "N/A",
    service_key: rpState.service || "N/A",
    /* Discrete tier + guarantee fields so GHL can branch without parsing
       a text blob. THIS is what a Express confirmation message must read
       to avoid promising a deposit guarantee that doesn't apply. */
    moveout_tier: tierLabel,
    guarantee_type: guarantee,
    guarantee_label: guarantee === "deposit" ? "Defend Your Deposit"
      : guarantee === "satisfaction" ? "Satisfaction Guaranteed" : "No guarantee (customer-directed scope)",
    estimated_time_on_site: rpTimeEstimate() || "N/A",

    /* --- home --- */
    square_footage: rpSqftTier() ? rpSqftTier().label : "N/A",
    bedrooms: rpState.bedrooms || "N/A",
    bathrooms: rpState.bathrooms || "N/A",

    /* --- money --- */
    pricing_status: custom ? "Custom Quote" : "Confirmed",
    base_service_price: custom ? "N/A" : rpDisplayBasePrice().toFixed(2),
    addons_total: addonsTotal.toFixed(2),
    addons_count: String(lineItems.length),
    /* Names AND prices. The old payload sent names only, so the office
       could see "Junk Haul" but not what it was worth. */
    addons: rpAddonSummaryText(),
    addons_quoted_separately: rpHasQuotedAddon() ? "Yes" : "No",
    military_discount: rpState.militaryDiscount ? "Yes" : "No",
    discount_amount: rpMilitaryDiscountAmount().toFixed(2),
    estimated_price_number: custom ? "N/A" : rpFirstVisitTotal(),
    estimated_price: custom ? "Custom Quote" : `$${rpFirstVisitTotal().toFixed(2)}`,

    /* --- per-add-on discrete fields, for GHL automations and crew
       dispatch that need one thing rather than the whole string --- */
    addon_carpet_rooms: rpAddonAvailable("carpet") ? String(rpState.addonCarpetRooms || 0) : "0",
    addon_carpet_pet_enzyme: (rpAddonAvailable("carpet") && rpState.addonCarpetPetEnzyme) ? "Yes" : "No",
    addon_junk_haul: (rpAddonAvailable("junk") && rpState.junkSize === "yes") ? "Yes" : "No",
    addon_windows_tier: rpAddonAvailable("windows") ? (rpState.windowsTier || "None") : "None",
    addon_garage_wash: (rpAddonAvailable("garage") && rpState.garageWash) ? "Yes" : "No",
    addon_laundry_loads: rpAddonAvailable("laundry") ? String(rpState.laundryLoads || 0) : "0",
    addon_fridge_interior: (rpAddonAvailable("fridge") && rpState.fridgeAddon) ? "Yes" : "No",
    addon_oven_interior: (rpAddonAvailable("oven") && rpState.ovenAddon) ? "Yes" : "No",
    addon_cabinets_closets: (rpAddonAvailable("cabinets") && rpState.cabinetsAddon) ? "Yes" : "No",
    addon_detail_pass: (rpAddonAvailable("detailPass") && rpState.detailPassAddon) ? "Yes" : "No",
    addon_extra_hours: rpAddonAvailable("extraHours") ? String(rpState.addonExtraHours || 0) : "0",
    addon_second_cleaner: (rpAddonAvailable("secondCleaner") && rpState.addonSecondCleaner) ? "Yes" : "No",

    /* --- move-out questionnaire, discrete. Operationally the most
       important fields in the whole payload: they decide whether a crew
       can work the job at all. Previously text-blob only on both
       surfaces. "Not asked" is distinct from "No" on purpose. --- */
    moveout_intent: isMoveout ? (rpState.moveoutRentalOrSelling || "Not asked") : "N/A",
    moveout_pm_or_realtor: isMoveout ? (rpState.moveoutPmOrRealtor || "None") : "N/A",
    moveout_water_on: isMoveout ? (rpState.moveoutWaterOn === true ? "Yes" : rpState.moveoutWaterOn === false ? "NO" : "Not asked") : "N/A",
    moveout_ac_on: isMoveout ? (rpState.moveoutAcOn === true ? "Yes" : rpState.moveoutAcOn === false ? "NO" : "Not asked") : "N/A",
    moveout_mold_pests: isMoveout ? (rpState.moveoutMoldPests === true ? "YES" : rpState.moveoutMoldPests === false ? "No" : "Not asked") : "N/A",
    moveout_blocked: (isMoveout && rpMoveoutBlocked()) ? "Yes" : "No",
    moveout_block_reasons: (isMoveout && rpMoveoutBlocked()) ? rpMoveoutBlockReasons().join(", ") : "None",

    /* --- where the job is (round 22) --- */
    service_area_status: rpServiceAreaStatus().status,
    service_area_label: rpServiceAreaStatus().label,
    service_area_town: rpServiceAreaStatus().area || "N/A",
    outside_service_area: rpIsOutsideServiceArea() ? "Yes" : "No",

    /* --- recurring --- */
    frequency: rpState.frequency || "N/A",
    monthly_total: rpIsRecurringPlan() ? rpMonthlyTotal().toFixed(2) : "N/A"
  };
}

/* =========================================================================
   SERVICE AREA (round 22)
   =========================================================================
   Nothing anywhere in the funnel checked WHERE the job is. /book validated
   that the ZIP was five digits and that was the whole test, so a booking
   from Oklahoma City could land a 2-cleaner crew on a $399 flat rate with
   roughly three hours of unpaid round-trip drive attached to it. /call had
   no prompt at all.

   DESIGN DECISION — FLAG, NEVER BLOCK.
   A ZIP list maintained by hand will eventually be wrong, and the cost of
   the two errors is wildly asymmetric: wrongly flagging a real customer
   costs one confirmation call, while wrongly BLOCKING one throws away a
   paid click and a real job. So an out-of-area ZIP never stops a booking.
   It sets a flag that reaches the office, the crew sheet, the CRM, and
   (softly) the customer. The office decides.

   EDITING THIS: RP_SERVICE_AREA_ZIPS is the core list — jobs here are
   normal, no flag, no note. RP_SERVICE_AREA_EDGE_ZIPS is the nearby ring
   worth taking but worth KNOWING about, because drive time starts to eat
   a flat rate out there. Anything in neither list is "outside". Moving a
   ZIP between the two lists is a one-word edit. */
const RP_SERVICE_AREA_ZIPS = {
  "73501": "Lawton", "73502": "Lawton", "73505": "Lawton",
  "73506": "Lawton", "73507": "Lawton",
  "73503": "Fort Sill",
  "73527": "Cache",
  "73538": "Elgin",
  "73557": "Medicine Park",
  "73533": "Duncan", "73534": "Duncan", "73536": "Duncan"
};
/* Nearby Comanche/Stephens County towns not on the published service-area
   list but close enough to be worth taking deliberately rather than by
   accident. Verify these against what you actually want to drive before
   trusting them — they're a starting list, not a survey. */
const RP_SERVICE_AREA_EDGE_ZIPS = {
  "73541": "Fletcher", "73543": "Geronimo", "73567": "Sterling",
  "73540": "Faxon", "73528": "Chattanooga", "73572": "Walters",
  "73529": "Comanche", "73055": "Marlow", "73006": "Apache"
};
/* Returns { status, label, area } where status is:
     "core"    normal job, no flag anywhere
     "edge"    take it, but the office should see the drive
     "outside" office confirms coverage and travel before dispatch
     "unknown" ZIP not entered yet or not 5 digits — never treated as a
               problem, since the lead screen validates format separately */
function rpServiceAreaStatus(zip = rpState.postalCode) {
  const z = String(zip || "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) return { status: "unknown", label: "Not provided", area: "" };
  if (RP_SERVICE_AREA_ZIPS[z]) return { status: "core", label: "In service area", area: RP_SERVICE_AREA_ZIPS[z] };
  if (RP_SERVICE_AREA_EDGE_ZIPS[z]) return { status: "edge", label: "Edge of service area — extra drive time", area: RP_SERVICE_AREA_EDGE_ZIPS[z] };
  return { status: "outside", label: "OUTSIDE service area — confirm coverage and travel before dispatch", area: "" };
}
function rpIsOutsideServiceArea(zip) { return rpServiceAreaStatus(zip).status === "outside"; }
