/* End-to-end funnel simulation: walks /book's real flow for every service,
   driving the engine the way the page does, and asserts the customer never
   sees a dead screen, a $0 price, or a reference to a deleted symbol. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const engine = R('js/rp-pricing-engine.js');
const msgs   = R('js/rp-messages.js');
const ctx = new Function('return (function(){ var rpState = {};' + engine + msgs +
  '; return {rpState:rpState, set:function(o){Object.assign(rpState,o)}, reset:function(o){' +
  'for(var k in rpState) delete rpState[k]; Object.assign(rpState,o)},' +
  'flow:function(){return rpCurrentFlow()}, price:function(){return rpFinalPrice()},' +
  'label:function(){return rpPriceLabel()}, time:function(){return rpTimeEstimate()},' +
  'team:function(){return rpTeamSize()}, det:function(){return rpBuildSharedDetails()},' +
  'addons:function(){return rpServiceAddons}, includes:function(){return rpIncludes},' +
  'services:function(){return rpServices}, msg:function(){return RP_MSG},' +
  'flows:function(){return rpFlows}, econ:function(){return rpCurrentJobEconomics()},' +
  /* Round 66: accessors for the timed-service table and the two flags the
     new checks below assert against. */
  'timed:function(){return RP_TIMED_SERVICES}, timedAgree:function(){return rpTimedServicesAgree()},' +
  'budgetHours:function(){return rpBudgetedCrewHours()}, isPublic:function(k){return rpServiceIsPublic(k)},' +
  'isRecurring:function(){return rpIsRecurringBooking()},' +
  'addonCatalog:function(){return rpAddonCatalog}, windowsPrice:function(){return rpWindowsPrice()},' +
  'windowsHasScreens:function(){return rpWindowsHasScreens()}, windowsSummary:function(){return rpWindowsSummary()},' +
  'heavyPct:function(){return RP_HEAVY_SURCHARGE_PCT}, surcharge:function(){return rpConditionSurcharge(rpServiceBasePrice())}};})()')();

const base = {bedrooms:null,bathrooms:null,sqft:null,condition:null,addonCarpetRooms:0,
  addonCarpetPetEnzyme:false,junkSize:null,windowsTier:null,garageWash:false,laundryLoads:0,
  fridgeAddon:false,addonExtraHours:0,addonSecondCleaner:false,carpetRooms:0,addonPetEnzyme:false,
  frequency:null,cleanerCount:null,hourCount:null,postalCode:"73501",
  moveoutWaterOn:true,moveoutAcOn:true,moveoutMoldPests:false,step:null};

let fails = 0;
const chk = (c,m) => { if(!c){ console.log("  FAIL "+m); fails++; } };

console.log("--- every service walks its flow to a real price ---");
const setups = {
  moveout:     {bedrooms:4,bathrooms:2},
  deep:        {},
  maintenance: {frequency:"One-Time"},
  /* Round 66: the new rung above Deep. Listed here so every check in this
     loop -- flow allowlist, real price, webhook service name, non-zero
     webhook price -- covers it too. A service missing from this object is a
     service with no test. */
  reset:       {},
  carpet:      {carpetRooms:3},
  hourly:      {cleanerCount:2,hourCount:4},
};
for (const [svc, extra] of Object.entries(setups)) {
  ctx.reset(Object.assign({}, base, {service:svc}, extra));
  const flow = ctx.flow();
  chk(flow.length > 0, svc+" has a flow");
  chk(!flow.includes("moveouttiers"), svc+" flow has no deleted tier screen");
  // every step name in the flow must be in the allowlist the resume-check uses
  const allow = ctx.flows()[svc] || [];
  for (const s of flow) chk(allow.includes(s), `${svc}: step "${s}" is in the resume allowlist`);
  const price = ctx.price();
  chk(price > 0, `${svc} reaches a real price (got ${price})`);
  const d = ctx.det();
  chk(d.service !== "N/A", svc+" webhook carries a service name");
  chk(d.estimated_price !== "$0.00", svc+" webhook price is not zero");
  chk(!/Inspection Ready|Express/.test(JSON.stringify(d)), svc+" webhook has no retired tier name");
  console.log(`  ${svc.padEnd(12)} ${flow.length} steps  ${ctx.label().padEnd(7)} ${ctx.team().padEnd(11)} ${ctx.time()}`);
}

console.log("\n--- move-out: every add-on offered is one the engine can price ---");
ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:3,bathrooms:2}));
const catalogKeys = Object.keys(ctx.msg() ? {} : {});
for (const [svc, list] of Object.entries(ctx.addons())) {
  for (const k of list) {
    chk(!["oven","cabinets","detailPass"].includes(k), `${svc} does not offer deleted add-on "${k}"`);
  }
}
chk(ctx.addons().moveout.join(",") === "carpet,junk,windows,garage", "move-out add-ons are the four exterior ones");
chk(ctx.addons().maintenance.includes("secondCleaner"), "Basic offers a second cleaner");
chk(ctx.addons().deep.includes("secondCleaner"), "Deep offers a second cleaner");
console.log("  move-out add-ons:", ctx.addons().moveout.join(", "));
console.log("  basic add-ons:   ", ctx.addons().maintenance.join(", "));

console.log("\n--- includes copy exists for every service in the picker ---");
for (const key of Object.keys(ctx.services())) {
  if (key === "airbnb") continue;
  chk(!!ctx.includes()[key], `rpIncludes has an entry for "${key}"`);
}
chk(!ctx.includes().moveoutrefresh, "no orphaned moveoutrefresh includes entry");

console.log("\n--- blocked move-out still routes to a callback, never a price ---");
for (const [field,label] of [["moveoutWaterOn","water off"],["moveoutAcOn","A/C out"],["moveoutMoldPests","mold/pests"]]) {
  const bad = Object.assign({},base,{service:"moveout",bedrooms:3,bathrooms:2});
  bad[field] = (field === "moveoutMoldPests");
  ctx.reset(bad);
  chk(ctx.label() === "Custom Quote", `${label}: shows Custom Quote`);
  chk(ctx.flow().includes("moveoutblocked"), `${label}: routes to the blocked screen`);
  chk(ctx.price() === 0, `${label}: no price is produced`);
}

console.log("\n--- the guarantee a customer is promised matches the product ---");
/* Round 66: carpet is here for the first time. It used to fall past every
   branch of rpGuaranteeType() to a "deposit" default, so a carpet-only
   booking was promised a landlord guarantee. Untested defaults are how that
   survived fourteen rounds. */
const g = {moveout:"deposit", deep:"satisfaction", maintenance:"satisfaction", reset:"satisfaction", carpet:"satisfaction", hourly:"none"};
for (const [svc,want] of Object.entries(g)) {
  ctx.reset(Object.assign({},base,{service:svc,bedrooms:3,bathrooms:2,cleanerCount:1,hourCount:3,frequency:"One-Time"}));
  const got = ctx.det().guarantee_type;
  chk(got === want, `${svc} guarantee is "${want}" (got "${got}")`);
}

console.log("\n--- second cleaner doubles, never anything else ---");
for (const [svc,one] of [["maintenance",120],["deep",240]]) {
  ctx.reset(Object.assign({},base,{service:svc,frequency:"One-Time"}));
  chk(ctx.price() === one, `${svc} alone is $${one}`);
  ctx.reset(Object.assign({},base,{service:svc,frequency:"One-Time",addonSecondCleaner:true}));
  chk(ctx.price() === one*2, `${svc} + 2nd cleaner is $${one*2} (got $${ctx.price()})`);
  chk(ctx.team() === "2 cleaners", `${svc} + 2nd cleaner reports 2 cleaners`);
}

/* =========================================================================
   ROUND 66 — THE TIMED-SERVICE TABLE
   =========================================================================
   RP_TIMED_SERVICES is now the one description of Basic, Deep and Reset,
   and six functions read it. These checks are what make that consolidation
   safe: if the table and the published RP_*_ANCHOR_* constants ever
   disagree, or a rung stops being priced at the flat rate, this fails here
   rather than on a customer's estimate screen.
   ========================================================================= */
console.log("\n--- timed services: table and published prices agree ---");
chk(ctx.timedAgree(), "every timed service's price is hours x crew x $40");
const timed = ctx.timed();
chk(Object.keys(timed).join(",") === "maintenance,deep,reset", "the three timed services, in ladder order");
for (const [svc,row] of Object.entries(timed)) {
  ctx.reset(Object.assign({},base,{service:svc,frequency:"One-Time"}));
  chk(ctx.price() === row.price, `${svc} prices at its table row ($${row.price}, got $${ctx.price()})`);
  chk(ctx.team() === `${row.crew} cleaner${row.crew===1?"":"s"}`, `${svc} reports ${row.crew} cleaner(s)`);
  chk(ctx.budgetHours() === row.hours * row.crew, `${svc} budgets ${row.hours*row.crew} crew-hours for the wage floor`);
  /* The floor check is the reason budgeted crew-hours has to be right --
     a rung invisible to it can quietly land on minimum wage. */
  const ec = ctx.econ();
  chk(ec && !ec.onFloor, `${svc} is not on the minimum-wage floor at its budgeted hours`);
  chk(ec && ec.margin >= 0.20, `${svc} clears the 20% target margin (got ${(ec.margin*100).toFixed(1)}%)`);
  console.log(`  ${svc.padEnd(12)} $${String(row.price).padEnd(4)} ${row.hours}h x ${row.crew}  margin ${(ec.margin*100).toFixed(1)}%`);
}

/* =========================================================================
   $40 PER CREW-HOUR, IN EVERY CONFIGURATION
   =========================================================================
   The real invariant is not "extra time costs $40" -- it is that a booked
   crew-hour costs $40 whichever way the customer assembles it. Asserting the
   ratio rather than three expected totals is what catches the case this
   round actually introduced: Extra Time on the two-cleaner Reset was billing
   one cleaner, an effective $35/crew-hour, which no total-based check would
   have called wrong because $560 is a perfectly plausible number.
   ========================================================================= */
console.log("\n--- every timed configuration bills $40 per crew-hour ---");
const configs = [
  ["plain",            {}],
  ["+2 extra hours",   {addonExtraHours:2}],
  ["+2nd cleaner",     {addonSecondCleaner:true}],
  ["+2 extra +2nd",    {addonExtraHours:2, addonSecondCleaner:true}]
];
for (const [svc,row] of Object.entries(timed)) {
  for (const [label,cfg] of configs) {
    /* Skip configurations the service doesn't offer -- the Reset ships with
       two cleaners and deliberately has no second-cleaner add-on. */
    if (cfg.addonSecondCleaner && !ctx.addons()[svc].includes("secondCleaner")) continue;
    ctx.reset(Object.assign({},base,{service:svc,frequency:"One-Time"},cfg));
    const price = ctx.price(), hrs = ctx.budgetHours();
    const rate = price / hrs;
    chk(Math.abs(rate - 40) < 0.005, `${svc} ${label}: $${price} / ${hrs} crew-hrs = $${rate.toFixed(2)}/crew-hr, want $40.00`);
    console.log(`  ${svc.padEnd(12)} ${label.padEnd(15)} $${String(price).padEnd(4)} ${String(hrs).padEnd(3)} crew-hrs  $${rate.toFixed(2)}/hr`);
  }
}

/* =========================================================================
   ROUND 66 — EXTERIOR WINDOWS, PER WINDOW
   =========================================================================
   The floor is the part worth testing hardest. It is what stops a small job
   losing money, and it is the easy thing to break by reordering the
   two-storey uplift relative to the Math.max.
   ========================================================================= */
console.log("\n--- exterior windows price per window, with a floor ---");
const W = ctx.addonCatalog().windows;
const wcase = (cfg, want, why) => {
  ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:4,bathrooms:2},cfg));
  const got = ctx.windowsPrice();
  chk(got === want, `${why}: want $${want}, got $${got}`);
  console.log(`  ${why.padEnd(42)} $${got}`);
};
wcase({windowCount:"s"},                                    100, "10 windows, glass only (floor)");
wcase({windowCount:"m"},                                    100, "15 windows, glass only (floor, $90 raw)");
wcase({windowCount:"l"},                                    144, "24 windows, glass only");
wcase({windowCount:"l", windowScreens:true},                216, "24 windows + screens");
wcase({windowCount:"xl", windowScreens:true},               288, "32 windows + screens");
wcase({windowCount:"xl", windowScreens:true, windowTwoStory:true}, 403, "32 + screens, two storey");
wcase({windowCount:"s", windowTwoStory:true},               140, "10 windows, two storey (floor + uplift)");
/* The floor must apply BEFORE the uplift, or a small two-storey job pays
   the flat minimum and the ladder work is free. */
ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:4,bathrooms:2,windowCount:"s",windowTwoStory:true}));
chk(ctx.windowsPrice() > W.minimum, "a two-storey job never prices at the bare minimum");
/* A session saved under the old basic/premium model must still price. */
ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:4,bathrooms:2,windowsTier:"premium"}));
chk(ctx.windowsPrice() > 0, `a legacy "premium" selection still prices (got $${ctx.windowsPrice()})`);
chk(ctx.windowsHasScreens(), 'a legacy "premium" selection keeps its screens');
ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:4,bathrooms:2,windowsTier:"basic"}));
chk(ctx.windowsPrice() > 0, `a legacy "basic" selection still prices (got $${ctx.windowsPrice()})`);
chk(!ctx.windowsHasScreens(), 'a legacy "basic" selection has no screens');
/* Windows are off Basic as of this round -- the add-on could cost more than
   the service. An unavailable add-on must never reach a total. */
chk(!ctx.addons().maintenance.includes("windows"), "Basic no longer offers exterior windows");
ctx.reset(Object.assign({},base,{service:"maintenance",frequency:"One-Time",windowCount:"xl",windowScreens:true}));
chk(ctx.price() === 120, `a stray window selection on Basic does not reach the total (got $${ctx.price()})`);

console.log("\n--- hourly is off the public menu, still bookable by phone ---");
chk(ctx.isPublic("hourly") === false, "hourly is hidden from the public picker");
chk(ctx.isPublic("maintenance") && ctx.isPublic("deep") && ctx.isPublic("reset"), "the three timed rungs are public");
chk(!!ctx.includes().hourly, "hourly's copy survives for /call");
chk(!!ctx.flows().hourly, "hourly still has a bookable flow");

/* =========================================================================
   ROUND 66 — THE HEAVY-CONDITION SURCHARGE
   =========================================================================
   Before this round the surcharge was dead code: RP_CONDITION_PRICED_SERVICES
   was empty and /book wrote a boolean that nothing pricing ever read. Both
   halves are asserted here, because either one reverting silently returns
   the funnel to charging standard prices for heavy homes with nobody
   noticing.
   ========================================================================= */
console.log("\n--- heavy buildup adds a real surcharge to move-out ---");
chk(ctx.heavyPct() === 25, `the published surcharge is 25% (got ${ctx.heavyPct()}%)`);
for (const [beds, std, heavy] of [[2,199,249],[3,299,374],[4,399,499],[5,499,624]]) {
  ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:beds,bathrooms:2,moveoutHeavyCondition:false}));
  chk(ctx.price() === std, `${beds}-bed standard is $${std} (got $${ctx.price()})`);
  ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:beds,bathrooms:2,moveoutHeavyCondition:true}));
  chk(ctx.price() === heavy, `${beds}-bed heavy is $${heavy} (got $${ctx.price()})`);
  /* Whole dollars: no customer should ever be quoted $498.75. */
  chk(Number.isInteger(ctx.price()), `${beds}-bed heavy is a whole dollar amount`);
  const e = ctx.econ();
  chk(e && e.margin >= 0.20, `${beds}-bed heavy clears the 20% target (${(e.margin*100).toFixed(1)}%)`);
  chk(e && !e.onFloor, `${beds}-bed heavy is not on the minimum-wage floor`);
  console.log(`  ${beds}-bed   $${String(std).padEnd(4)} -> $${String(heavy).padEnd(4)} (+$${ctx.surcharge()})  margin ${(e.margin*100).toFixed(1)}%`);
}
/* The surcharge is move-out only. A timed service answers "heavier home"
   with extra hours the customer buys themselves, not a silent multiplier. */
for (const svc of ["maintenance","deep","reset"]) {
  ctx.reset(Object.assign({},base,{service:svc,frequency:"One-Time",moveoutHeavyCondition:true}));
  chk(ctx.price() === timed[svc].price, `${svc} ignores the heavy flag (got $${ctx.price()}, want $${timed[svc].price})`);
}
/* An unanswered questionnaire must price as standard, never as heavy. */
ctx.reset(Object.assign({},base,{service:"moveout",bedrooms:4,bathrooms:2,moveoutHeavyCondition:null}));
chk(ctx.price() === 399, `an unanswered condition question prices as standard (got $${ctx.price()})`);

/* =========================================================================
   NO NUMBER SHOWN BEFORE THE CONTACT GATE MAY BE LOWER THAN THE REAL TOTAL
   =========================================================================
   This check exists because of a bug that shipped into this round and was
   caught by driving the page in a browser, not by any assertion here: the
   gate's teaser read rpServiceBasePrice(), which is the price BEFORE the
   heavy-condition surcharge. A customer answering "heavy build up" was
   shown $399, handed over their name and phone number, and then saw $499.

   That is the one lie this funnel cannot afford, so it gets a test rather
   than a comment. Scraped out of /book's source because the teaser is
   rendered there, not in the engine -- ugly, and much better than trusting
   the next person to remember.
   ========================================================================= */
console.log("\n--- the pre-gate teaser never undersells the real price ---");
{
  const bookSrc = R('book/index.html');
  const fn = bookSrc.slice(bookSrc.indexOf("function rpGatePricePreview"));
  const body = fn.slice(0, fn.indexOf("\nfunction "));
  chk(/rpConditionSurcharge\s*\(/.test(body),
      "rpGatePricePreview accounts for the condition surcharge");
  chk(!/figure:\s*`\$\$\{\s*rpServiceBasePrice\(\)\s*\}`/.test(body),
      "rpGatePricePreview does not quote the bare base price as the figure");
}

console.log("\n--- the frequency screen is gone, the selection is not ---");
chk(!ctx.flows().maintenance.includes("frequency"), "no frequency step in the Basic flow");
ctx.reset(Object.assign({},base,{service:"maintenance",frequency:"Weekly"}));
chk(ctx.price() === 120, "a Weekly Basic still prices at $120");
chk(ctx.isRecurring(), "a Weekly Basic is still recognised as recurring");
ctx.reset(Object.assign({},base,{service:"maintenance",frequency:"One-Time"}));
chk(!ctx.isRecurring(), "a One-Time Basic is not recurring");

console.log(fails ? `\n${fails} FAILURE(S)` : "\nFUNNEL OK");
process.exit(fails?1:0);
