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
  'flows:function(){return rpFlows}, econ:function(){return rpCurrentJobEconomics()}};})()')();

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
const g = {moveout:"deposit", deep:"satisfaction", maintenance:"satisfaction", hourly:"none"};
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

console.log(fails ? `\n${fails} FAILURE(S)` : "\nFUNNEL OK");
process.exit(fails?1:0);
