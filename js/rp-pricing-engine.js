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
     bedrooms, bathrooms, condition, addons, etc. — plus
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
  /* ROUND 52 — THE TWO MOVE-OUT TIERS ARE ONE PRODUCT AGAIN.
     Direct instruction: "Let's remove inspection ready vs express move-out.
     Just call it Move-Out Cleaning."

     Round 19 split Move-Out into a guaranteed full-checklist tier
     ("Inspection Ready") and a lighter, cheaper one ("Move-Out Express")
     that excluded oven/fridge/cabinet interiors and the baseboards-windows-
     walls detail work, then sold each of those back as an add-on. Thirty
     rounds of machinery grew on top of that split: a side-by-side compare
     screen, a second tier table, a second sqft surcharge table, a Detail
     Pass SKU priced by bedroom count, a buy-back list, an invariant
     stopping a la carte from undercutting a tier switch, tier-switch links
     on the estimate screen, and two guarantee types.

     All of it is gone. One product, one price per size, everything inside
     the home included. "moveout" keeps its original key so no GHL field,
     webhook mapping or analytics event has to be migrated -- only the
     display name changed. "moveoutrefresh" is deleted outright rather than
     aliased: a dead service key that still resolves is how a stale saved
     session or a bookmarked deep link quietly prices a job at a tier that
     no longer exists. Anything still holding it fails loudly instead. */
  moveout:     { name: "Move-Out Cleaning",                emoji: "🏠" },
  deep:        { name: "Deep Cleaning",                    emoji: "🧼" },
  maintenance: { name: "Basic Cleaning",             emoji: "✨" },
  carpet:      { name: "Carpet Cleaning",                  emoji: "🧽" },
  hourly:      { name: "Hourly Cleaning",                  emoji: "⏱" },
  airbnb:      { name: "Airbnb Turnover Cleaning",         emoji: "🛏" }
};

/* ---------------------------------------------------------------------
   MOVE-OUT PRICING — HISTORY, CONDENSED (round 52)

   Rounds 17-51 are gone from this file. They documented, in order: a
   sqft-bracket model, its replacement by flat bedroom tiers, an hourly
   move-out option and its removal, the two-tier Inspection Ready /
   Express split, four separate re-pricings of the Inspection Ready
   ladder ($299/$399/$499/$599 -> $459/$539/$619/$699 -> $399/$499/$599
   -> $379/$474/$569 -> $349/$429/$499), a crew size that went 2 -> 3 ->
   2, and a flat per-service hours range that became per-bracket rows.

   None of it describes a live number any more. The two-tier split that
   most of those rounds were reasoning about no longer exists (see
   rpServices above), so the comments were not just stale, they named
   products a reader could not find in the file. The one thing worth
   carrying forward is the constraint every round from 45 on was solved
   against, because it still binds:

       a 4-bedroom move-out is $399, and that is the anchor.

   Everything else on the ladder is built around it.
   --------------------------------------------------------------------- */
/* =========================================================================
   ROUND 42 — HOW A JOB ACTUALLY COSTS, AS OF THE NEW PAY MODEL
   =========================================================================
   DIRECT INSTRUCTION: "I changed labor to 40% of the job or min wage
   whatever is higher." 40% of the whole ticket, add-ons included, split
   across the crew, W2 with employer payroll taxes on top.

   READ THIS BEFORE READING ANY COST MATH BELOW. Every round comment from
   here down derives its prices from labor as an HOURLY cost:

       labor(hrs) = hrs x crew x $17.50/hr x 1.12 burden

   That is retired. It is kept because it is the honest record of how these
   numbers were arrived at, and the prices it produced are still the prices
   we charge — but it is NOT how a job costs any more, and re-deriving a
   price from it would produce a number unrelated to what the business pays.

   The live model is rpJobEconomics() below. In words:

       crew gross = max( 40% of the ticket , $7.25 x crew-hours )
       labor      = crew gross x 1.12
       cost       = labor + $15 supplies + $25 overhead
                    + 8% of the ticket on Inspection Ready (guarantee reserve)
       profit     = ticket - cost

   WHAT CHANGED, IN ONE TABLE. Same prices, real costs:

                        round 41 claimed      actually
       IR 1-2 bed          -1.4%               36.6%
       IR 3 bed             9.9%               38.8%
       IR 4+ bed           17.5%               40.2%
       Express (all)     ~1-8%                35-42%

   Round 41 shipped the 1-2 bedroom at $379 against a modelled $384.35 cost
   and flagged it as a deliberate ~$5 loss per job. Under the real pay model
   it returns $138.89. That flag is void.

   TWO STRUCTURAL CONSEQUENCES.

   (a) COST-PLUS NO LONGER SETS A PRICE. Labor scales with the ticket, so
       solving for the 20% target leaves only the fixed costs:

           price = $40 / (1 - 0.20 - 0.448 - 0.08) = $147.06

       Every published price clears that several times over. The target
       margin has stopped being the binding constraint.

   (b) THE MINIMUM WAGE FLOOR IS THE BINDING CONSTRAINT NOW. It takes over
       whenever the job runs long enough that 40% falls below minimum wage:

           ticket < $18.13 x crew-hours

       All current prices clear it, but Move-Out Express on a 1-2 bedroom is
       the tight one: $199 against 10 budgeted crew-hours trips at 11.0. Half
       an hour over per cleaner and that job is on minimum wage.

       That ratio is what should gate any future price cut.
       tools/check-prices.py cannot see it — r42test.js asserts it.

   AND THE THING THAT IS EASY TO MISS. A piece rate moves overrun risk onto
   the cleaner: a 16-crew-hour job that takes 20 still pays $151.60, so the
   effective rate falls from $9.48 to $7.58. The floor is what stops that
   going somewhere bad, and it only works if actual hours are recorded —
   under FLSA a piece-rate W2 employee's hours must be tracked to prove the
   floor was met. "Log real hours" has been the open item since round 34. It
   did not go away with the hourly cost model; it stopped being a margin
   question and became a payroll-compliance one.
   ========================================================================= */
const RP_LABOR_SHARE       = 0.40;   /* of the whole ticket, split across the crew */
const RP_LABOR_BURDEN      = 1.12;   /* employer FICA, unemployment, workers' comp */
const RP_MIN_WAGE          = 7.25;   /* Oklahoma follows the federal rate. SQ 832,
                                        which would have taken it to $15, was
                                        rejected by voters in June 2026. */
const RP_SUPPLIES_PER_JOB  = 15;
const RP_OVERHEAD_PER_JOB  = 25;
const RP_GUARANTEE_RESERVE = 0.08;   /* Inspection Ready only */
const RP_TARGET_MARGIN     = 0.20;

/* What the crew splits before the floor is considered. */
function rpCrewGrossPay(ticket) {
  return Math.max(0, Number(ticket) || 0) * RP_LABOR_SHARE;
}
/* What they must be paid regardless, for the hours actually worked. */
function rpMinWageFloorPay(crewHours) {
  return Math.max(0, Number(crewHours) || 0) * RP_MIN_WAGE;
}
/* The instruction, in one line: whichever is higher. */
function rpCrewPay(ticket, crewHours) {
  return Math.max(rpCrewGrossPay(ticket), rpMinWageFloorPay(crewHours));
}
/* The crew-hours at which the floor takes over for a given ticket. Below
   this the crew is on the 40%; above it they are on minimum wage and the
   company absorbs the overrun. */
function rpFloorTripHours(ticket) {
  return (Math.max(0, Number(ticket) || 0) * RP_LABOR_SHARE) / RP_MIN_WAGE;
}
/* Everything about one job's money, in the shape a human would ask for it. */
function rpJobEconomics(ticket, crewHours, hasGuarantee) {
  const t     = Math.max(0, Number(ticket) || 0);
  const hrs   = Math.max(0, Number(crewHours) || 0);
  const gross = rpCrewPay(t, hrs);
  const labor = gross * RP_LABOR_BURDEN;
  const fixed = RP_SUPPLIES_PER_JOB + RP_OVERHEAD_PER_JOB;
  const res   = hasGuarantee ? t * RP_GUARANTEE_RESERVE : 0;
  const cost  = labor + fixed + res;
  return {
    ticket: t, crewHours: hrs,
    crewPay: gross, laborCost: labor, fixed: fixed, reserve: res,
    cost: cost, profit: t - cost, margin: t > 0 ? (t - cost) / t : 0,
    onFloor: rpMinWageFloorPay(hrs) > rpCrewGrossPay(t),
    floorTripHours: rpFloorTripHours(t),
    /* Crew-hours at which this job stops making money at all. Every current
       price survives 2-3x its budget before reaching this. */
    breakEvenHours: (t - fixed - res) / (RP_MIN_WAGE * RP_LABOR_BURDEN),
    effectiveHourly: hrs > 0 ? gross / hrs : 0
  };
}
/* Crew-hours this job is BUDGETED at — the conservative end of whatever the
   customer was told, times the crew size. Used for the floor check, so it
   deliberately takes the long end of a range: the question being asked is
   "could this job land on minimum wage", and the pessimistic case is the
   one worth knowing. */
function rpBudgetedCrewHours(service = rpState.service) {
  if (service === "moveout") {
    /* Round 51: was parsing the top of a flat "8-10 hours" string and
       multiplying by crew, which is how a 3-bedroom ended up budgeted at
       20 crew-hours. Reads the tier row now -- one number, per size, the
       same one the card shows the customer. */
    return rpMoveoutCrewHours(service);
  }
  /* Round 52: Deep and Basic used to multiply their hours by
     `rpMoveoutCrewSize(service) || 2`, which returns 0 for a non-move-out
     service and therefore fell through to a hardcoded 2 -- so a Deep was
     budgeted at 12 crew-hours whether or not a second cleaner had been
     bought, and a Basic at 6. Both are one cleaner by default now, with a
     real second-cleaner add-on, so the crew size is a fact about the
     booking rather than a constant to guess at. This is what feeds the
     minimum-wage floor check, so guessing high was hiding the thin case
     rather than being conservative about it. */
  const timedCrew = rpTimedServiceCrew();
  if (service === "deep")        return (RP_DEEP_ANCHOR_HOURS  + Number(rpState.addonExtraHours || 0)) * timedCrew;
  if (service === "maintenance") return (RP_BASIC_ANCHOR_HOURS + Number(rpState.addonExtraHours || 0)) * timedCrew;
  if (service === "hourly")      return Number(rpState.hourCount || HOURLY_MIN_HOURS) * Number(rpState.cleanerCount || 1);
  if (service === "carpet")      return RP_BASIC_ANCHOR_HOURS;
  return 0;
}
/* The economics of the call currently in rpState. Returns null when there is
   no real number to reason about — a custom quote, or a job we have decided
   not to price. */
function rpCurrentJobEconomics() {
  if (typeof rpIsCustomQuoteOnly === "function" && rpIsCustomQuoteOnly()) return null;
  const ticket = typeof rpFinalPrice === "function" ? rpFinalPrice() : 0;
  if (!(ticket > 0)) return null;
  return rpJobEconomics(ticket, rpBudgetedCrewHours(), rpState.service === "moveout");
}

/* =========================================================================
   THE MOVE-OUT LADDER (round 52)
   =========================================================================
   Direct instruction: "Make 4bed/2bath $399 and build everything else
   around that probably 1/2 bed is $199 1 cleaner, 3 bed $299 2 cleaners,
   4 bed $399. It includes a full cleaning of everything inside the home
   assuming a standard home in standard condition."

   ONE TIER. Every row below is the FULL interior reset -- oven, fridge,
   cabinets and closets inside, bathrooms, baseboards, interior windows,
   ceiling fans, vents, light fixtures, all floors. Nothing in that list is
   an add-on any more; the whole Express buy-back apparatus (oven $50,
   fridge $50, cabinets $50, Detail Pass $90-$210) is deleted, along with
   the invariant that existed to stop a customer assembling the full
   checklist a la carte for less than the tier gap. With one tier there is
   no gap and nothing to assemble.

   CREW AND HOURS ARE UNCHANGED from round 51. That is a deliberate choice,
   not an oversight: the question was put directly and the answer was to
   keep them. So the same job that was $349 / $429 / $499 is now
   $199 / $299 / $399, at the same crew and the same hours.

       size      price   crew  on-site   crew-hrs   $/crew-hr
       1-2 bed   $199      1      8h         8       $24.88
       3   bed   $299      2      6h        12       $24.92
       4   bed   $399      2      8h        16       $24.94
       5   bed   $499      2     10h        20       $24.95

   THE LADDER IS NOW A FLAT RATE PER CREW-HOUR, which no previous version
   of this table ever was -- round 51's ran $43.63 / $35.75 / $31.19,
   sloping down as size went up. Building around the $399 anchor at fixed
   hours produced the flat line by itself. It is worth knowing that is what
   happened, because it means the 1-2 bedroom row took by far the biggest
   cut (-43%) and the 5-bedroom row was set to hold the same rate rather
   than to preserve its old $629 price.

   WHAT IT COSTS, from rpJobEconomics() above -- labor at 40% of the ticket
   or minimum wage whichever is higher, plus $15 supplies, $25 overhead and
   the 8% deposit-guarantee reserve, which now applies to every move-out
   because every move-out carries the guarantee:

       size      ticket   labor    fixed   reserve   cost     profit   margin
       1-2 bed   $199     $89.15   $40     $15.92    $145.07   $53.93  27.1%
       3   bed   $299    $133.95   $40     $23.92    $197.87  $101.13  33.8%
       4   bed   $399    $178.75   $40     $31.92    $250.67  $148.33  37.2%
       5   bed   $499    $223.55   $40     $39.92    $303.47  $195.53  39.2%

   Every row clears the 20% target. The 1-2 bedroom is the thin one and is
   the row to watch: it is one cleaner alone in a house for a full eight
   hours, and at 40% of $199 that cleaner earns $9.95/hr. The minimum-wage
   floor trips at 11.0 crew-hours (rpFloorTripHours), so three hours of
   overrun on that job and the company is absorbing the difference. It was
   already the tightest row in the business before this round; it is
   tighter now.

   6+ BEDROOMS is still a custom quote (rpMoveoutIsOversizeHome) rather
   than a row here -- past five bedrooms the spread is too wide to publish.

   "STANDARD HOME IN STANDARD CONDITION" is the stated assumption behind
   every number above, and it is load-bearing. Condition-based pricing was
   already removed from Move-Out (RP_CONDITION_PRICED_SERVICES is empty);
   what protects these margins is the arrival walkthrough -- a home worse
   than described is a RE-QUOTE, not a silent overrun. That SOP is still
   unbuilt. It is the single biggest open risk against this ladder, and it
   matters more at $199 than it did at $349. */
const RP_MOVEOUT_BEDROOM_TIERS = [
  { min: 1, max: 2, base: 199, includedBathrooms: 1, crew: 1, onSiteHours: 8,  label: "1\u20132 bedrooms" },
  { min: 3, max: 3, base: 299, includedBathrooms: 2, crew: 2, onSiteHours: 6,  label: "3 bedrooms" },
  { min: 4, max: 4, base: 399, includedBathrooms: 3, crew: 2, onSiteHours: 8,  label: "4 bedrooms" },
  { min: 5, max: 5, base: 499, includedBathrooms: 3, crew: 2, onSiteHours: 10, label: "5 bedrooms" }
];
/* Round 52: there is only one table now. Kept as a function rather than
   inlining RP_MOVEOUT_BEDROOM_TIERS at every call site, because every
   caller in this file, /book and /call already goes through it -- and the
   `service` argument is still accepted (and ignored) so a stale caller
   passing one doesn't throw. */
function rpMoveoutTierTable() {
  return RP_MOVEOUT_BEDROOM_TIERS;
}
function rpMoveoutBedroomTier(beds, service = rpState.service) {
  const b = Number(beds || 0);
  return rpMoveoutTierTable(service).find(t => b >= t.min && b <= t.max) || null;
}
/* ROUND 52 — DETAIL PASS AND THE EXPRESS BUY-BACKS ARE DELETED.

   RP_DETAIL_PASS_PRICES, rpDetailPassPrice(), rpExpressBuyBackItems(),
   rpExpressBuyBackTotal() and rpTierNeutralAddonTotal() all lived here.
   Every one of them existed to serve the same job: Move-Out Express
   excluded oven interiors, fridge interiors, inside cabinets and closets,
   and the baseboards/interior-windows/walls/fans/vents/fixtures detail
   work, and sold each of them back a la carte. The Detail Pass was the
   bundle of that last group, priced by bedroom count, and the buy-back
   helpers existed so that /book and /call could compare "buy it all back"
   against "just switch tiers" and never let the a la carte route come out
   cheaper -- which would have made the un-guaranteed tier the cheapest
   path to the full checklist.

   Move-Out includes all of it now, so there is nothing to sell back and no
   invariant left to protect. Deleted rather than left as dead code: these
   were consumed by three surfaces and a stale caller getting a real number
   back from a function that no longer means anything is worse than one
   that throws. rpAddonCatalog below drops the oven, cabinets and detailPass
   SKUs entirely for the same reason. The fridge SKU survives -- it is still
   sold on Hourly.

   For anyone reading this in six months wondering whether the a la carte
   invariant needs re-checking: it does not exist. There is one move-out
   price per size and it includes everything inside the home. */

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
/* Round 52: rpRefreshSqftTiers (Express's own halved surcharge table) is
   deleted along with the tier it belonged to. Note that /book has not
   asked for square footage on a Move-Out since round 24 -- rpState.sqft is
   never set in that flow, rpSqftTier() returns null, and the surcharge
   reads as 0. The table above is live only for a CSR entering a size by
   hand on /call. */
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

/* =========================================================================
   ONE LABOUR RATE: $40 PER CLEANER PER HOUR (round 52)
   =========================================================================
   Direct instruction: "Change basic and deep to $40 hour so basic is $120
   deep is $240. 1 cleaner 3 or 6 hours. They can add a second cleaner but
   it doubles the price for each."

   Hourly Cleaning and the Extra Time add-on came down to $40 in the same
   round, by direct instruction, because leaving them at $50 would have
   published two different prices for the same hour of the same cleaner's
   time. Concretely, before this round: a 3-hour Hourly booking was $150
   while a 3-hour Basic -- same one cleaner, same three hours, and a defined
   scope on top -- was about to be $120. Nobody would book the Hourly. And
   an extra hour added to a Deep cost $50 while each of the Deep's own six
   hours cost $40, so the fifteenth minute of the job was priced above the
   first.

   So every service that sells TIME now sells it at the same rate:

       Basic        3 hours x 1 cleaner   $120
       Deep         6 hours x 1 cleaner   $240
       Hourly       3-hour minimum        $120 and up
       Extra Time   per hour              $40
       2nd cleaner  per hour              $40  (doubles the job, exactly)

   THE SECOND CLEANER DOUBLES THE PRICE, which is the instruction stated
   plainly and also just what $40/hr produces: a second person for the same
   hours costs the same as the first person for those hours. $120 -> $240
   on a Basic, $240 -> $480 on a Deep. It is now offered on BOTH services;
   before this round it was Deep only, and rpSecondCleanerHours() was
   hardcoded to the Deep anchor, so adding one to a Basic would have
   charged for six hours of a three-hour job.

   WHAT THE $120 BASIC COSTS, at 40% labour plus $15 supplies and $25
   overhead: $53.76 + $40 = $93.76, leaving $26.24 at a 21.9% margin. It
   clears the 20% target and nothing else on the list is close to the line.
   It is the thinnest priced job in the business, and the reason is the
   flat $40/job of fixed cost, which a three-hour ticket amortises worse
   than any other. A $40 supplies-and-overhead assumption that turns out to
   be $55 puts this job under target on its own.

   IMPORTANT — HOURLY SELLS TIME, NOT COMPLETION. The customer ranks
   priority areas and the crew works that list in order for the hours
   booked. Nothing promises the list gets finished. That framing is what
   keeps a partial-scope job from turning into a "you missed things"
   review, so don't soften it in the UI copy. It is also the whole reason
   Hourly can sit at the same rate as Basic without cannibalising it: they
   are the same hours, sold with and without a defined scope.

   Basic and Deep collect no sqft/bedrooms/bathrooms/condition at all (see
   rpFlows below) -- the customer is buying an anchored block of time, and
   size or buildup variance is absorbed by Extra Time rather than by a
   bracket. */
const HOURLY_RATE_PER_CLEANER = 40;
const HOURLY_MIN_HOURS = 3;
const HOURLY_MAX_HOURS = 8;
const HOURLY_MAX_CLEANERS = 4;

/* PEAK-SEASON KILL SWITCH — flip to false to pull Hourly Cleaning off the
   public /book service list in one line (e.g. during peak PCS weeks when
   a $120 3-hour booking would otherwise eat a Friday slot a $399 move-out
   wanted). /call is unaffected: CSRs can always book it by phone, so
   turning this off routes the demand through the office instead of
   killing it. */
const RP_HOURLY_PUBLIC = true;

const RP_BASIC_ANCHOR_HOURS = 3;
const RP_BASIC_ANCHOR_PRICE = 120;
const RP_DEEP_ANCHOR_HOURS = 6;
const RP_DEEP_ANCHOR_PRICE = 240;
const RP_EXTRA_HOUR_RATE = 40;
/* The single rate the four lines above are all derived from. Asserted
   against them in the round-52 test rather than used to compute them, so
   a deliberate departure from the flat rate stays possible -- it just has
   to be a decision someone makes, not a drift someone misses. */
const RP_HOURLY_LABOUR_RATE = 40;

/* Crew size on a service that sells an anchored block of time. One
   cleaner, or two when the second-cleaner add-on is on the booking. Used
   by the minimum-wage floor check and the crew sheet; the PRICE of that
   second cleaner is rpSecondCleanerPrice(). */
function rpTimedServiceCrew() {
  return rpState.addonSecondCleaner ? 2 : 1;
}

/* Services hidden from the PUBLIC /book service picker. /call ignores
   this entirely. */
function rpServiceIsPublic(key) {
  if (key === "hourly") return RP_HOURLY_PUBLIC;
  return true;
}

/* Guarantee tiers, not a single on/off switch:

   - "deposit"      Move-Out only. It is the one product with an
                     inspection/deposit outcome to stand behind, so it
                     carries the specific, provable Defend Your Deposit
                     promise: come back free if a landlord flags
                     something. As of round 52 that is EVERY move-out --
                     the un-guaranteed Express tier is gone.

   - "satisfaction" Deep and Basic. Neither promises a completed,
                     inspection-proof reset; both sell an anchored block
                     of time, so a deposit-style completion guarantee
                     wouldn't be honest against either. A satisfaction
                     guarantee is: we stand behind the QUALITY of what we
                     did clean, not a promise that a full inspection
                     checklist got covered.

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
  /* Round 52: every move-out gets the deposit guarantee now. The
     "satisfaction" carve-out here was Move-Out Express's -- a lighter scope
     with no landlord walkthrough to answer to, which a completion promise
     could not honestly cover. That tier is gone and the surviving product
     is the full inspection-grade reset, so the guarantee that was written
     for it applies to every move-out this business sells.

     Note what that costs: the 8% guarantee reserve in rpJobEconomics() now
     comes out of every move-out ticket, including the $199 row that used
     to be the un-guaranteed one at the same price. That is priced in --
     see the cost table on RP_MOVEOUT_BEDROOM_TIERS. */
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


/* Recurring maintenance plans. Round 52, direct instruction: "remove any
   kind of reoccuring discount."

   EVERY DISCOUNT IS NOW ZERO. Weekly was 20% off, Biweekly 15%, Monthly
   10%. A recurring visit costs exactly what a one-time visit costs, which
   at the new $120 Basic is what makes the job viable at all -- 20% off
   $120 is $96, and a $96 visit returns about 13% after labour and fixed
   cost, under the 20% target and well under what a one-time visit at the
   same length returns.

   FREQUENCY STILL EXISTS AS A SELECTION and the screen stays in the flow.
   It is not a price band any more, it is a scheduling fact: it tells the
   office to set up a repeating visit, it drives visitsPerMonth for the
   monthly commitment figure, and it still decides whether the first visit
   must be a Deep (rpRecurringNeedsDeepFirst). The discount field is kept
   at 0 rather than deleted so restoring a band later is a one-number edit
   and every consumer of rpFrequencyPlan().discount keeps working --
   rpFrequencySummary() below reads it and stops printing a "% off" line
   once it is zero. */
const rpFrequencyPlans = {
  "Weekly":   { discount: 0, visitsPerMonth: 4 },
  "Biweekly": { discount: 0, visitsPerMonth: 2 },
  "Monthly":  { discount: 0, visitsPerMonth: 1 },
  "One-Time": { discount: 0, visitsPerMonth: 1 }
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
  /* Round 52: the oven, cabinets and detailPass SKUs are deleted. They
     existed only to sell back what Move-Out Express excluded, and Move-Out
     includes all of it now. The fridge SKU above survives because Hourly
     still sells it.

     If one of these needs to come back as a real add-on on some future
     service, note that the prices they carried ($50 oven, $50 cabinets,
     $90/$130/$170/$210 Detail Pass by bedroom count) were solved backwards
     from an invariant that no longer exists -- re-price them off the work,
     not off this comment. */
  extraHours: { label: "Extra Time", unit: "hour", pricePerHour: RP_EXTRA_HOUR_RATE },
  /* Basic and Deep. Priced per hour actually booked (the service's anchor
     plus any Extra Time already purchased), not a flat number — a 2nd
     cleaner for 6 hours costs the same $40/hr as the 1st, so the price has
     to track whatever the total hours end up being, and doubling the crew
     doubles the ticket. See rpSecondCleanerPrice(). */
  secondCleaner: { label: "Additional Cleaner", pricePerHour: RP_EXTRA_HOUR_RATE }
};

const rpServiceAddons = {
  /* Round 52: Move-Out's add-on list is unchanged, and that is the point --
     these four (carpet extraction, junk removal, exterior windows, the
     garage floor) are the things that are genuinely NOT inside the home.
     Everything that is inside it is in the base price now. The Express
     entry, which sold back oven/fridge/cabinets/Detail Pass, is gone with
     its tier. */
  moveout:     ["carpet", "junk", "windows", "garage"],
  /* Fridge and laundry pulled from Deep/Basic — for a crew already on
     site for hours with an anchored-time model, these are small enough
     that "note it in special instructions" covers it without needing a
     separate priced add-on step. Hourly keeps both, because the whole
     service is instruction-driven anyway. */
  deep:        ["extraHours", "secondCleaner", "carpet", "windows", "garage"],
  /* Round 52: Basic gains the second-cleaner add-on. It was Deep-only, for
     no reason anyone recorded, and the instruction this round was that
     either service can add one. */
  maintenance: ["extraHours", "secondCleaner", "windows"],
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

/* Second cleaner costs the same $40/hr as the base rate, for however many
   hours are actually booked (the service's anchor plus any Extra Time
   already added) — a 2nd person working 8 hours costs the same as the 1st
   person working 8 hours. Recomputed live so adding/removing Extra Time
   updates this price automatically instead of going stale.

   Round 52: the anchor is read from the SERVICE now. This was hardcoded to
   RP_DEEP_ANCHOR_HOURS, which was harmless while Deep was the only service
   offering a second cleaner and is not any more -- adding one to a
   three-hour Basic would have billed six hours, $240 on top of a $120 job.
   With this reading the right anchor, the add-on doubles either service
   exactly: Basic $120 -> $240, Deep $240 -> $480. */
function rpSecondCleanerAnchorHours() {
  if (rpState.service === "maintenance") return RP_BASIC_ANCHOR_HOURS;
  return RP_DEEP_ANCHOR_HOURS;
}
function rpSecondCleanerHours() {
  return rpSecondCleanerAnchorHours() + Number(rpState.addonExtraHours || 0);
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
  /* Round 52: one move-out entry. The "moveoutrefresh" entry that sat
     between this one and `deep` is deleted along with its tier.

     The copy below barely changed, which is worth noting rather than
     glossing: this was already written as the everything-included product.
     What changed is that it is now the ONLY move-out, so the fine print no
     longer has a cheaper tier to point at, and the crew-size line is back
     as a highlight -- it used to live on the comparison card, and that
     card is gone. */
  moveout: {
    intro: "This isn't a checklist. It's a full interior reset: oven, fridge, cabinets, closets, bathrooms, baseboards, windows, and floors, all included and nothing billed separately.",
    highlights: [
      ["home", "Every room, inside & out"],
      ["check", "Oven, fridge & cabinets included"],
      ["check", "Baseboards, interior windows & fixtures included"],
      ["shield", "If something's missed, we come back free"]
    ],
    outcome: "Built to pass a landlord walkthrough, or to photograph well if you're listing the home for sale.",
    /* Exclusions folded into the fine print instead of their own
       paragraph — this is what makes "everything" credible (naming a
       few exclusions beats staying vague about them), but it doesn't
       need to be a whole separate block anymore now that chips do the
       main enumeration work.

       Round 52: the four things named here are now the ENTIRE list of what
       a move-out doesn't cover, and every one of them is outside the home.
       That is the promise the single-tier price is making, so if anything
       interior ever moves back out of the base scope, this sentence is the
       first thing that has to change. */
    fineprint: "Exterior windows, the garage floor, carpet extraction, and junk removal aren't included, but you can add any of them on the next step. Need something else? Text us anytime.",
    itemsLead: "Including the parts most companies bill as add-ons:",
    items: ["Inside & out: oven, fridge & all appliances", "Cabinets, drawers & closets, inside included", "Bathrooms, scrubbed top to bottom", "Interior windows, sills & tracks", "Baseboards, doors, fixtures & trim", "Ceiling fans, vents & light fixtures", "All floors throughout", "Every other room and surface inside the home"]
  },
  deep: {
    intro: "A detailed, top-to-bottom clean of every room.",
    highlights: [
      ["clock", "6 hours, 1 cleaner"],
      ["zap", "Add time or a second cleaner"],
      ["shield", "Satisfaction Guaranteed"]
    ],
    outcome: "You'll either love the clean or you won't. Tell us within 48 hours and we'll make it right, free.",
    items: ["Kitchen, detailed clean", "Bathrooms, scrubbed top to bottom", "Inside oven & microwave", "Baseboards, doors & fixtures", "Floors throughout", "All reachable surfaces"]
  },
  maintenance: {
    intro: "A routine clean to keep an already-tidy home fresh.",
    highlights: [
      ["clock", "3 hours, 1 cleaner"],
      ["zap", "Add time or a second cleaner"],
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
      [null, "$40 per hour"]
    ],
    outcome: "Tell us what matters most, and we'll work that list for the hours you book.",
    items: ["You set the priority order", "Kitchens, bathrooms, or any specific rooms", "Organizing, decluttering & light tidying", "Billed by the hour, 3-hour minimum"]
  }
};

/* Funnel flows: same per-service question order as the homepage, minus the
   read-only "includes" screen — that content lives as an expandable
   "What's included" on the estimate screen. */
const rpFlows = {
  /* Move-Out's actual flow is computed in rpCurrentFlow() below, not read
     from this array for step ORDER -- it branches on whether the hard-stop
     questionnaire blocks the job (rpMoveoutBlocked()). This array is the
     allowlist /book's session-resume check (rpLoadPersistedState)
     validates a saved step name against, so every reachable move-out step
     name needs to be here even though the order isn't what drives
     navigation.

     Move-Out collects size and the three hard-stop questions and nothing
     else. There is no "included" screen (that content is an expandable on
     the estimate screen), no sqft step (flat bedroom-tier pricing since
     round 24), no rent-vs-sell question on /book, and since round 52 no
     tier comparison. /call keeps its own rent-vs-sell question on its own
     script step. */
  /* Round 31: "bedrooms" and "bathrooms" merged into one "size" screen.
     They are the same question asked twice ("how big is it"), they are
     both a single tap, and splitting them bought a screen transition for
     nothing. One screen, both rows visible, and the second tap advances
     -- see rpSelectBedrooms/rpSelectBathrooms in /book. Ten steps became
     nine. Both old names stay OUT of this allowlist deliberately: a
     session saved mid-funnel under the old flow should restart cleanly
     rather than resume onto a screen that no longer renders. */
  /* Round 52: "moveouttiers" -- the side-by-side Inspection Ready vs.
     Express comparison screen -- is removed from the flow, and the
     duplicate "moveoutrefresh" flow with it. With one product there is
     nothing to compare, so the customer goes from the hard-stop questions
     straight to add-ons. Ten screens became nine.

     The old step name is deliberately NOT kept in this allowlist: a
     session saved mid-funnel on the comparison screen should restart
     cleanly rather than resume onto a screen that no longer renders.
     Same reasoning as the round-31 bedrooms/bathrooms merge. */
  moveout:     ["size", "moveoutquestionnaire", "contactgate", "moveoutblocked", "moveoutblockedconfirmed", "addons", "estimate", "lead", "calendar"],
  /* Deep and Basic dropped sqft/bedrooms/bathrooms/condition entirely —
     both are flat time-anchored (RP_DEEP_ANCHOR_PRICE / RP_BASIC_ANCHOR_PRICE
     above) with Extra Time as an add-on instead of a size bracket. */
  /* ROUND 52 BUG FIX, found by tools/funnel-test.js rather than by this
     round's brief -- "contactgate" was missing from all five of these.

     rpCurrentFlow() INSERTS contactgate into every non-move-out flow at
     runtime (see the bottom of that function), but this array is also what
     /book's session-resume check validates a saved step name against:

         if (saved.step !== "service" && !rpFlows[saved.service].includes(saved.step)) return false;

     So a customer who reached the name-and-number screen on a Deep clean,
     left, and came back had their saved session REJECTED and restarted at
     the service picker, losing every answer they had given. It failed on
     the one screen in the funnel whose entire purpose is capturing a lead
     before the price is shown, and only on a returning visitor, which is
     why nothing surfaced it.

     Move-Out was unaffected: its branch of rpCurrentFlow() builds its own
     flow and "contactgate" was already listed above.

     The fix is just naming the step. Note the rule this violated, since it
     is the actual lesson: a step that rpCurrentFlow() can produce must be
     in this allowlist, whether it is hardcoded in the array or inserted at
     runtime. */
  deep:        ["included", "contactgate", "addons", "estimate", "lead", "calendar"],
  maintenance: ["included", "frequency", "contactgate", "addons", "estimate", "lead", "calendar"],
  carpet:      ["included", "rooms", "carpetdetails", "contactgate", "estimate", "lead", "calendar"],
  hourly:      ["included", "cleaners", "hours", "contactgate", "addons", "estimate", "lead", "calendar"],
  airbnb:      ["included", "size", "airbnbdetails", "contactgate", "estimate", "lead", "calendar"]
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
  if (rpState.service === "moveout") {
    /* WHY MOVE-OUT COMPUTES ITS FLOW INSTEAD OF READING THE ARRAY: the
       hard-stop questionnaire can end the funnel early. A home with the
       water off, the A/C out, or signs of mold or pests cannot be worked
       as booked, and this crew can't renegotiate on site, so the flow
       stops at "moveoutblocked" and routes to a phone call rather than
       adjusting a price.

       Round 28 (direct instruction, after live review: "put the 3
       questions about water/AC/mold before the phone number name screen,
       I think it'll flow better") -- "contactgate" lands right AFTER
       "moveoutquestionnaire". The customer answers "tell us about your
       home" as one uninterrupted block (size, then the three hard-stop
       questions) before being asked for a name and number. The lead-
       capture goal that put the gate here in round 24 still holds:
       contactgate lands before "moveoutblocked" in BOTH branches below,
       so even a home that turns out to be blocked hands over a callable
       name and number first. The blocked screen reads what the gate
       collected rather than asking again.

       Round 52: "moveouttiers" is gone from the unblocked branch. It was
       the Inspection Ready vs. Express comparison, and there is one
       product now, so the customer goes from the questions straight to
       add-ons. */
    if (rpMoveoutBlocked()) {
      flow = ["size", "moveoutquestionnaire", "moveoutblocked"];
    } else {
      flow = ["size", "moveoutquestionnaire", "addons", "estimate", "lead", "calendar"];
    }
    if (!RP_CONTACT_GATE) return flow;
    const at = flow.indexOf("moveoutquestionnaire");
    if (at === -1) return flow;
    return flow.slice(0, at + 1).concat(["contactgate"], flow.slice(at + 1));
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

/* ---------------------------------------------------------------------
   MOVE-OUT CREW & HOURS — history, condensed (round 51)

   Rounds 20-43 kept accumulating notes here about a flat, per-service
   hours range ("6-10" -> "5-8" -> "4-5 / 8-10") and a crew number that
   went 2 -> 3 -> 2 -> "2 except the small bracket". Every one of those
   numbers is gone: hours and crew are per-bedroom-bracket fields on the
   tier rows now (see RP_MOVEOUT_BEDROOM_TIERS), so none of that history
   describes live behaviour any more and leaving it in full was actively
   misleading -- it named crew sizes and ranges a reader could no longer
   find anywhere in the file.

   The one thing worth carrying forward: the reason these live in the
   engine at all is that the comparison screen shows BOTH tiers' hours
   side by side without touching rpState, the same reason
   rpMoveoutTierBasePrice() exists for prices. The hours are the honest
   justification for the gap between the two numbers.
   --------------------------------------------------------------------- */

/* ROUND 51: RP_MOVEOUT_TIER_HOURS and the RP_MOVEOUT_CREW / _CREW_SMALL
   constants are GONE. Both were flat per-service values that couldn't vary
   with home size -- the whole problem documented on RP_MOVEOUT_BEDROOM_TIERS
   above. Crew and on-site hours now live on the tier rows, so there is
   exactly one place that knows what a given size costs, how long it takes,
   and how many people go. The four accessors below are the only way to read
   them; nothing should reach into a tier row directly. */

/* How many cleaners go, for a home of this size on this tier. */
function rpMoveoutCrewSize(service, beds = rpState.bedrooms) {
  if (!service === "moveout") return 0;
  const tier = rpMoveoutBedroomTier(beds, service);
  return tier ? tier.crew : 0;
}

/* Hours the crew is physically in the home (wall-clock, not person-hours). */
function rpMoveoutOnSiteHours(service, beds = rpState.bedrooms) {
  const tier = rpMoveoutBedroomTier(beds, service);
  return tier ? tier.onSiteHours : 0;
}

/* Total paid labour: crew x on-site hours. This is the number the job
   economics and the crew sheet care about, and the one the customer never
   sees directly. */
function rpMoveoutCrewHours(service, beds = rpState.bedrooms) {
  return rpMoveoutCrewSize(service, beds) * rpMoveoutOnSiteHours(service, beds);
}

/* The customer-facing duration string, e.g. "8 hours". Returns "" when the
   bedroom count isn't known yet rather than guessing a size -- every caller
   already handles an empty string, and a wrong duration on a booking screen
   is a promise, not a placeholder. */
function rpMoveoutTierHours(service, beds = rpState.bedrooms) {
  const h = rpMoveoutOnSiteHours(service, beds);
  return h ? `${h} hour${h === 1 ? "" : "s"}` : "";
}

/* Round 51: past five bedrooms the spread on a move-out is too wide to
   publish a number for, so 6+ routes to a real quote instead of falling
   into the 5-bedroom bracket the way it used to fall into the old 4+ one.
   Feeds rpIsCustomQuoteOnly(). */
function rpMoveoutIsOversizeHome(beds = rpState.bedrooms) {
  return rpState.service === "moveout" && Number(beds || 0) > RP_MOVEOUT_MAX_PRICED_BEDROOMS;
}
const RP_MOVEOUT_MAX_PRICED_BEDROOMS = 5;

function rpTimeEstimate() {
  /* Round 51: per-bedroom-bracket, read off the tier row. Falls back to a
     range across the whole ladder when the size isn't known yet, rather
     than naming one size's hours as if they applied to all of them. */
  if (rpState.service === "moveout") {
    /* A 6+ bedroom home is quoted, not priced, so it gets no hours figure
       either -- the published ladder tops out at five and naming its range
       here would understate a home bigger than anything in the table. */
    if (rpMoveoutIsOversizeHome()) return "Confirmed with your quote";
    const exact = rpMoveoutTierHours(rpState.service);
    if (exact) return exact;
    const table = rpMoveoutTierTable(rpState.service);
    return `${table[0].onSiteHours}\u2013${table[table.length - 1].onSiteHours} hours depending on size`;
  }
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
  /* Move-out crew comes off the tier row -- one cleaner on a 1-2 bedroom,
     two from three bedrooms up. See RP_MOVEOUT_BEDROOM_TIERS. */
  if (rpState.service === "moveout") {
    const n = rpMoveoutCrewSize(rpState.service);
    return `${n} cleaner${n === 1 ? "" : "s"}`;
  }
  /* Round 52: Deep and Basic are one cleaner, or two when the
     second-cleaner add-on is on the booking -- it is offered on both
     services now, and it doubles the price. Was hardcoded to "1 cleaner",
     which put the wrong crew size on the confirmation and the crew sheet
     for anyone who had paid for a second person. */
  if (rpState.service === "deep" || rpState.service === "maintenance") {
    const n = rpTimedServiceCrew();
    return `${n} cleaner${n === 1 ? "" : "s"}`;
  }
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
  if (!rpState.service === "moveout") return false;
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
    || rpMoveoutIsOversizeHome()
    || rpMoveoutIsCustomSqft()
    || rpIsSpecialtyCondition()
    || rpMoveoutBlocked();
}

/* Base price for Move-Out or Deep Cleaning — both are sq-ft bracket +
   bedroom/bathroom adders (same included-2-bed/1-bath convention and
   $45/$35 rates for both), then the Heavy/Extreme condition multiplier
   applied automatically, before add-ons. No manual
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

/* Round 52: rpMoveoutTierBasePrice() is deleted. It computed one tier's
   price without permanently switching rpState.service, by swapping the
   service, calling rpServiceBasePrice() and swapping back -- a trick that
   existed purely so the comparison screen could show both tiers' numbers
   side by side before the customer committed to either. With one tier,
   rpServiceBasePrice() answers the question directly.

   Every caller in /book and /call is updated in the same round. If a
   reference to it survives somewhere, it should throw rather than resolve:
   a function that answers "what would the OTHER tier cost" has no honest
   return value now. */

/* Single source of truth for what "Base Service" should display for any
   service, used by both /book's invoice and /call's CSR summary so the
   two never drift apart. */
function rpDisplayBasePrice() {
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

/* Per-visit / per-job subtotal BEFORE add-ons.
   For Deep Cleaning this is base price + condition adjustment.
   For Maintenance this is the frequency-discounted per-visit price.
   For Carpet this is the room-based price. Add-ons are always excluded —
   they're fixed price and never touched by condition adjustments. */
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
/* Add-ons are always fixed price. */
function rpAddonsOnceCharge() { return rpAddonsTotal(); }

/* ---------------------------------------------------------------------
   MINIMUM CHARGE
   A crew still burns drive time, setup and supplies on a small job, so
   below a certain ticket the trip loses money once acquisition cost is
   counted.

   ROUND 52 — THE FLOOR MOVED TO $120, AND HERE IS WHY IT HAD TO.
   Basic Cleaning is $120 as of this round. The floor was $150. Because
   rpNetServiceCents() raises any service subtotal to the floor, a $120
   Basic would have silently rendered as $150 on the estimate screen, on
   the phone, and in the webhook -- the instruction would have looked
   applied in this file and been invisible to every customer. A floor above
   a published price is not a floor, it is a bug with a comment.

   So the one-time minimum is now $120: the cheapest thing this business
   sells, which is the only number a floor can honestly be.

   Both floors are the same figure now. They used to differ because a
   recurring ACCOUNT justified a thinner single visit than a one-time job
   did -- but with recurring discounts removed (see rpFrequencyPlans), a
   recurring visit and a one-time visit are the same price, so there is
   nothing left for a second floor to do. Kept as two constants rather than
   one so that reintroducing a recurring discount does not also require
   rebuilding the floor that protects it.

   WHAT ELSE THIS TOUCHES: the floor is what stopped a two-room carpet job
   ($50/room, two-room minimum = $100) from going out at $100. It now
   floors to $120 instead of $150. That is a real $30 cut to the smallest
   carpet ticket, arrived at as a side effect of the Basic price rather
   than as a decision about carpet -- worth knowing, and worth revisiting
   with a carpet-specific floor if that job stops paying for its own
   drive time.

   The floor covers the CLEANING only. Add-ons are priced separately and
   stack on top, so a thin base can't ride in on an expensive add-on.
   --------------------------------------------------------------------- */
const RP_ONE_TIME_MIN = 120;
const RP_RECURRING_MIN_PER_VISIT = 120;

function rpIsRecurringBooking() {
  return rpState.service === "maintenance"
    && !!rpState.frequency
    && rpState.frequency !== "One-Time";
}
function rpServiceFloorCents() {
  if (rpIsCustomQuoteOnly()) return 0;
  return rpToCents(rpIsRecurringBooking() ? RP_RECURRING_MIN_PER_VISIT : RP_ONE_TIME_MIN);
}
/* Service subtotal, raised to the floor. */
function rpNetServiceCents() {
  const subtotal = rpPreDiscountSubtotalCents();
  if (subtotal <= 0) return 0;
  return Math.max(subtotal, rpServiceFloorCents());
}
function rpFloorApplied() {
  const subtotal = rpPreDiscountSubtotalCents();
  if (subtotal <= 0 || rpIsCustomQuoteOnly()) return false;
  return subtotal < rpServiceFloorCents();
}

function rpFinalPriceCents() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  const subtotal = rpPreDiscountSubtotalCents();
  const addons = rpAddonsCents();
  if (subtotal <= 0 && addons <= 0) return 0;
  return rpNetServiceCents() + addons;
}

function rpFinalPrice() {
  if (!rpState.service || rpIsCustomQuoteOnly()) return 0;
  return rpCentsToDollars(rpFinalPriceCents());
}

/* Display formatter for HEADLINE prices — the big number on /book's
   estimate screen, the add-on screen's live chip, and the "quote to
   give" card Liz reads off on /call. Every price this business charges
   is a whole dollar amount, so ".00" added nothing but noise: it made a
   confident "$539" read like an invoice line, and made the CSR script
   literally say "five hundred thirty-nine dollars and zero cents" out
   loud. Cents are still rendered by rpFormatMoney() wherever a real
   fractional amount can occur (recurring per-visit math), so nothing is
   lost where it matters. */
function rpFormatMoneyDisplay(cents) {
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? `$${Math.round(abs / 100)}` : rpFormatMoney(cents);
}

function rpPriceLabel() {
  if (rpIsCustomQuoteOnly()) return "Custom Quote";
  const cents = rpFinalPriceCents();
  if (!cents) return "$0";
  return rpFormatMoneyDisplay(cents);
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
   any add-ons. The recurring per-visit rate starts from visit two. */
function rpFirstVisitTotalCents() {
  if (!rpRecurringNeedsDeepFirst()) return rpFinalPriceCents();
  const deep = rpRecurringDeepFirstCents();
  if (deep <= 0) return rpFinalPriceCents();
  return Math.max(deep, rpToCents(RP_ONE_TIME_MIN)) + rpAddonsCents();
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
  /* Round 52: discounts are zero, so this printed "Weekly · 0% off
     recurring rate" on every recurring booking. It describes the schedule
     now. The discount branch is kept live rather than deleted so that
     restoring a band stays a one-number edit in rpFrequencyPlans. */
  const pct = Math.round(plan.discount * 100);
  if (pct > 0) return `${rpState.frequency} · ${pct}% off recurring rate`;
  const visits = plan.visitsPerMonth;
  return `${rpState.frequency} · ${visits} visit${visits === 1 ? "" : "s"} per month, same rate every visit`;
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
  const isMoveout = rpState.service === "moveout";
  /* Round 52: this field used to carry "Inspection Ready" or "Express".
     There is one move-out product now, so every move-out booking reports
     the same value. The FIELD is kept because GHL workflows, the crew
     sheet and confirmation templates all branch on it -- a field that
     stops arriving breaks them silently.

     ACTION REQUIRED ON THE GHL SIDE: if moveout_tier is a dropdown there,
     "Move-Out Cleaning" needs adding as an option, and any workflow
     conditioned on the value being "Express" (most importantly the
     confirmation SMS that must NOT promise the deposit guarantee) is now
     dead and should be retired -- every move-out carries the guarantee. */
  const tierLabel = isMoveout ? "Move-Out Cleaning" : "N/A";
  const guarantee = rpGuaranteeType();
  return {
    /* --- service identity --- */
    service: (rpServices[rpState.service] || {}).name || "N/A",
    service_key: rpState.service || "N/A",
    /* Discrete tier + guarantee fields so GHL can branch without parsing
       a text blob. guarantee_type is still the field a confirmation
       message should read before promising anything -- it is "none" on an
       Hourly booking and "satisfaction" on Deep/Basic. */
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
    /* Round 52: these three add-ons no longer exist -- Move-Out includes
       all of it in the base price. The FIELDS are kept and hardcoded to
       "No" rather than removed, because GHL workflows and crew-sheet
       templates are keyed to the field names and a field that stops
       arriving is a silent break, where a field that always says No is a
       correct statement about every booking from here on. Safe to delete
       once the GHL side no longer references them. */
    addon_oven_interior: "No",
    addon_cabinets_closets: "No",
    addon_detail_pass: "No",
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
