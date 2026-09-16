/* ROUND 52 ASSERTIONS — run from the repo root:  node tools/r52-test.js
   Exits 0 clean, 1 on any failure.

   tools/check-prices.py catches a published price drifting from the
   engine. This catches the engine drifting from what was actually asked
   for, which no grep can see: the ladder, the crew and hours behind each
   rung, the margin and crew pay each rung produces, the second cleaner
   doubling the ticket, the floors not quietly overriding a published
   price, and the round-52 deletions staying deleted. Run both. */
const src = require('fs').readFileSync(require('path').join(__dirname,'..','js','rp-pricing-engine.js'),'utf8');
const ctx = {};
const fn = new Function('ctx', 'var rpState = {};' + src + '\n; return {' + [
 'rpState','rpServices','RP_MOVEOUT_BEDROOM_TIERS','rpFinalPrice','rpJobEconomics','rpBudgetedCrewHours',
 'rpServiceBasePrice','rpPriceLabel','rpGuaranteeType','rpTeamSize','rpTimeEstimate','rpSecondCleanerPrice',
 'rpCurrentFlow','rpAddonsTotal','rpFrequencySummary','RP_BASIC_ANCHOR_PRICE','RP_DEEP_ANCHOR_PRICE',
 'HOURLY_RATE_PER_CLEANER','RP_EXTRA_HOUR_RATE','RP_ONE_TIME_MIN','rpFloorTripHours','rpMoveoutCrewHours',
 'rpCurrentJobEconomics','rpBuildSharedDetails','rpMoveoutCrewSize','rpFirstVisitTotal'
].join(',') + '};');
const E = fn(ctx);
const S = E.rpState;
function reset(service, extra={}) {
  Object.keys(S).forEach(k=>delete S[k]);
  Object.assign(S, {service, bedrooms:null, bathrooms:null, sqft:null, condition:null,
    addonCarpetRooms:0, addonCarpetPetEnzyme:false, junkSize:null, windowsTier:null, garageWash:false,
    laundryLoads:0, fridgeAddon:false, addonExtraHours:0, addonSecondCleaner:false, carpetRooms:0,
    addonPetEnzyme:false, frequency:null, cleanerCount:null, hourCount:null, postalCode:"73501",
    moveoutWaterOn:true, moveoutAcOn:true, moveoutMoldPests:false}, extra);
}
let fails = 0;
const eq = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok?'  ok ':'FAIL'}  ${label.padEnd(46)} ${String(got).padEnd(22)} ${ok?'':'expected '+want}`);
};

console.log('\n--- MOVE-OUT LADDER ---');
const want = {1:[199,1,8],2:[199,1,8],3:[299,2,6],4:[399,2,8],5:[499,2,10]};
for (const b of [1,2,3,4,5]) {
  reset('moveout',{bedrooms:b, bathrooms:2});
  const [price,crew,hrs] = want[b];
  eq(`${b} bed price`, E.rpFinalPrice(), price);
  eq(`${b} bed crew`, E.rpMoveoutCrewSize('moveout'), crew);
  eq(`${b} bed crew-hours`, E.rpMoveoutCrewHours('moveout'), crew*hrs);
  eq(`${b} bed guarantee`, E.rpGuaranteeType(), 'deposit');
  const ec = E.rpCurrentJobEconomics();
  console.log(`       $${price}  ${crew}x${hrs}h = ${crew*hrs} crew-hrs  $${(price/(crew*hrs)).toFixed(2)}/crew-hr  ` +
              `cost $${ec.cost.toFixed(2)}  profit $${ec.profit.toFixed(2)}  margin ${(ec.margin*100).toFixed(1)}%  ` +
              `crew $${(ec.crewPay/(crew*hrs)).toFixed(2)}/hr  floor trips at ${ec.floorTripHours.toFixed(1)} crew-hrs`);
  if (ec.margin < 0.20) { console.log('       !! BELOW 20% TARGET'); fails++; }
  if (ec.onFloor) { console.log('       !! ON MINIMUM WAGE'); fails++; }
}
reset('moveout',{bedrooms:6, bathrooms:3});
eq('6 bed is custom quote', E.rpPriceLabel(), 'Custom Quote');
reset('moveout',{bedrooms:4, bathrooms:2});
eq('4bed/2bath anchor', E.rpPriceLabel(), '$399');
eq('move-out flow has no tier screen', E.rpCurrentFlow().includes('moveouttiers'), 'false');
eq('move-out flow', E.rpCurrentFlow().join('>'), 'size>moveoutquestionnaire>contactgate>addons>estimate>lead>calendar');
eq('webhook tier label', E.rpBuildSharedDetails().moveout_tier, 'Move-Out Cleaning');
eq('webhook service name', E.rpBuildSharedDetails().service, 'Move-Out Cleaning');

console.log('\n--- $40/HR TIMED SERVICES ---');
reset('maintenance',{frequency:'One-Time'});
eq('Basic', E.rpFinalPrice(), 120);
eq('Basic crew', E.rpTeamSize(), '1 cleaner');
eq('Basic time', E.rpTimeEstimate(), '3 hours');
let ec = E.rpCurrentJobEconomics();
console.log(`       Basic $120: cost $${ec.cost.toFixed(2)} profit $${ec.profit.toFixed(2)} margin ${(ec.margin*100).toFixed(1)}% budgeted ${E.rpBudgetedCrewHours()} crew-hrs`);
reset('maintenance',{frequency:'One-Time', addonSecondCleaner:true});
eq('Basic + 2nd cleaner doubles', E.rpFinalPrice(), 240);
eq('Basic + 2nd cleaner crew', E.rpTeamSize(), '2 cleaners');
eq('Basic budgeted crew-hrs w/ 2nd', E.rpBudgetedCrewHours(), 6);
reset('deep');
eq('Deep', E.rpFinalPrice(), 240);
eq('Deep time', E.rpTimeEstimate(), '6 hours');
ec = E.rpCurrentJobEconomics();
console.log(`       Deep $240: cost $${ec.cost.toFixed(2)} profit $${ec.profit.toFixed(2)} margin ${(ec.margin*100).toFixed(1)}% budgeted ${E.rpBudgetedCrewHours()} crew-hrs`);
reset('deep',{addonSecondCleaner:true});
eq('Deep + 2nd cleaner doubles', E.rpFinalPrice(), 480);
reset('deep',{addonExtraHours:2});
eq('Deep + 2 extra hours @ $40', E.rpFinalPrice(), 240+80);
reset('deep',{addonExtraHours:2, addonSecondCleaner:true});
eq('Deep + 2 extra + 2nd cleaner', E.rpFinalPrice(), 240+80+(8*40));
reset('hourly',{cleanerCount:1, hourCount:3});
eq('Hourly 3h minimum', E.rpFinalPrice(), 120);
reset('hourly',{cleanerCount:2, hourCount:4});
eq('Hourly 2 cleaners 4h', E.rpFinalPrice(), 320);

console.log('\n--- FLOORS & RECURRING ---');
eq('one-time minimum', E.RP_ONE_TIME_MIN, 120);
reset('maintenance',{frequency:'Weekly'});
eq('Weekly Basic not discounted', E.rpFinalPrice(), 120);
eq('Weekly summary drops % off', E.rpFrequencySummary(), 'Weekly · 4 visits per month, same rate every visit');
reset('maintenance',{frequency:'Biweekly'});
eq('Biweekly Basic not discounted', E.rpFinalPrice(), 120);
reset('carpet',{carpetRooms:2});
eq('2-room carpet floors to 120', E.rpFinalPrice(), 120);
reset('carpet',{carpetRooms:4});
eq('4-room carpet', E.rpFinalPrice(), 200);

console.log('\n--- DEAD SYMBOLS ---');
for (const dead of ['rpDetailPassPrice','rpExpressBuyBackItems','rpExpressBuyBackTotal',
                    'rpTierNeutralAddonTotal','rpMoveoutTierBasePrice','RP_DETAIL_PASS_PRICES',
                    'RP_MOVEOUT_REFRESH_BEDROOM_TIERS','rpRefreshSqftTiers']) {
  const gone = !new RegExp('^\\\\s*(?:const|function)\\\\s+'+dead+'\\\\b','m').test(src);
  eq(`${dead} deleted`, gone, 'true');
}
eq('moveoutrefresh not a service', typeof E.rpServices.moveoutrefresh, 'undefined');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(fails?1:0);
