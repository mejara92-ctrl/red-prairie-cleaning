/* =========================================================================
   RED PRAIRIE — SHARED MESSAGE LIBRARY  ("Red Prairie 3.0")
   =========================================================================
   What rp-pricing-engine.js is to numbers, this file is to words.

   WHY IT EXISTS
   -------------
   The site had been saying the same six or seven things for a while, but
   never twice the same way. A grep across /book, /call, /pricing and the
   landing pages found:

     the "your price won't change" promise ..... 6 different phrasings
     the "we come back free" guarantee ......... 6 different phrasings
     licensed / insured / veteran-owned ........ 5 different phrasings
     the Google review count ................... 5 phrasings, and one of
                                                 them said 57+ while every
                                                 other page said 61+

   That last one is the whole argument for this file. A customer who reads
   /pricing and then the estimator is told two different numbers about how
   many people have reviewed this business. Nobody typed that on purpose;
   it happened because the claim lived in twenty places and only nineteen
   got updated.

   THE RULE
   --------
   A claim this business makes to a customer is written ONCE, here, and
   read from here everywhere. If you want to change how something is said,
   change it here and it changes everywhere at once. Never paste one of
   these strings into a page — reference it.

   WHAT DOESN'T BELONG HERE
   ------------------------
   Page-specific copy that is genuinely said once (a headline, a step
   title, a single screen's sub-line) stays on its page. This file is for
   the claims that recur — the promises, the credentials, the numbers we
   quote about ourselves. If a string is only ever used in one place, it
   isn't a message, it's copy.

   Loaded by /book and /call before their own scripts. Nothing here
   executes at parse time, so load order relative to the pricing engine
   doesn't matter — the functions read rpState/engine values only when
   called.
   ========================================================================= */

const RP_MSG = {

  /* ── Facts about the business ────────────────────────────────────────
     One place. If the review count moves, it moves here, and
     tools/check-prices.py will fail the build if a page hardcodes a
     different one. */
  facts: {
    reviewCount: 65,
    rating: "5.0",
    phone: "(580) 215-0915",
    phoneDigits: "5802150915"
  },

  /* ── The trust line ──────────────────────────────────────────────────
     Was appearing as "Veteran-owned & insured", "Licensed, Insured &
     Veteran-Owned", "licensed and insured, veteran-owned", and "veteran-
     owned local company, fully insured". Same three facts, four ways. */
  trust() {
    return `★ ${RP_MSG.facts.rating} · ${RP_MSG.facts.reviewCount}+ reviews · Veteran-owned & insured`;
  },
  trustSpoken() {
    return `we're a veteran-owned local company, fully insured, with over ${RP_MSG.facts.reviewCount} five-star reviews right here in the Lawton area`;
  },

  /* ── The price promise ───────────────────────────────────────────────
     The most-repeated claim on the site and the most inconsistently
     worded. It is also the one with a real exception attached, so the
     short form and the exact form are separated deliberately: say the
     short one where you're selling, show the exact one where you're
     quoting. Never invent a third. */
  price: {
    /* ROUND 54 — THE PROMISE IS NOW SCOPED, AND IT HAD TO BE.
       It read "The price you see is the price you pay." Flat, unconditional,
       and on the homepage as "no upcharges at the door". Meanwhile the
       exception below has always said price can change for heavy buildup
       and trash. Both were true of a normal house and only one of them was
       true of a bad one, which is the version a customer remembers when a
       crew asks for more money in their driveway.

       Direct instruction: "make them understand if the house is
       non-standard or has heavy trash, grime, an additional fee may be
       applied upon arrival."

       So the promise now carries its own condition. It is a smaller claim
       and a much more defensible one: a standard home in standard
       condition pays exactly what it was quoted, and anything else is a
       conversation BEFORE work starts, never an invoice after. That is
       still a stronger promise than a competitor who won't publish a
       number at all, and it is one this business can keep. */
    /* ROUND 57 — THE CLAUSES WERE THE WRONG WAY ROUND.
       It read "Standard home in standard condition — the price you see is
       the price you pay." Which opens on the caveat and closes on the
       promise, so a skimmer reads the qualifier and leaves. The promise is
       the reason to keep reading; the condition is what makes it true.
       Same words, same claim, reversed: reassurance first, qualifier
       second. */
    promise: "The price you see is the price you pay — for a standard home in standard condition.",
    promiseSpoken: "for a standard home that's the full price, nothing gets added when we show up",
    /* The honest exception. This is the ONLY place the carve-outs are
       listed; if they ever change, they change once. */
    exception: "Price only changes for severe buildup, heavy trash, access problems, biohazards, or work outside what you picked — and we call you first, before the crew starts.",
    /* The same fact in the two other lengths the funnel needs it in. Kept
       here rather than written into a screen so the booking page, the
       estimate, the CSR script and the landing pages cannot end up
       describing this policy differently. */
    conditionShort: "Heavy buildup is a published 25% — quoted when you book, never added later.",
    /* The estimate screen's fine print. One sentence, because it sits under
       a CTA and nobody reads three. It has to carry both halves: what the
       quote covers, and that anything beyond it is agreed BEFORE work, not
       billed after. */
    /* ROUND 66 — REWRITTEN. This shows on the estimate of anyone who did
       NOT flag heavy buildup (the flagged version is flaggedLead/flaggedBody
       above), and it used to promise "standard home, standard condition --
       that's the price" while describing an arrival re-quote as the only
       way the number could move.

       Half of that is now wrong: heavy buildup has a published 25% the
       customer can choose at booking, so "we price it with you before the
       crew starts" is no longer the whole mechanism -- it is what happens
       only when someone said standard and the home is not. Saying so is
       also the honest nudge: a customer reading this who knows their home
       is rough learns that declaring it is the way to get a firm number. */
    /* ROUND 66c — SERVICE-AWARE, because the round-66b rewrite put a
       move-out-only policy on every estimate in the funnel.

       The 25% heavy surcharge exists on Move-Out alone: it is the one
       product that quotes a flat price for a whole home sight-unseen. A
       Basic Cleaning customer reading "heavy buildup is a flat 25%" under a
       $120 three-hour booking is being warned about a charge that cannot
       happen to them, which is worse than saying nothing -- it invents the
       doubt this line exists to remove.

       Timed services answer a heavier home with more hours, which the
       customer buys themselves on the stepper, so their version says that
       instead. Kept as a function rather than two constants so there is
       still exactly one place this promise is written. */
    fineprint(service) {
      /* Round 66c: car detailing is not a house, so neither the heavy
         surcharge nor "the home you described" applies to it. */
      if (service === "cardetailing") {
        return "This is the full price for the tier you picked. Pet hair is the only thing that changes it, and you've already chosen. Nothing is added afterward.";
      }
      const timed = ["maintenance", "deep", "reset"].includes(service);
      if (timed) {
        return "This is the price for the hours you picked. If the home needs more than that, the crew will say so on the day rather than working faster — you can add time then or book a second visit. Nothing is ever added to your bill without your say-so.";
      }
      return "This is the price for the home you described. If it turns out to be heavier than that, the crew prices the difference with you before they start — never after. Heavy buildup you tell us about up front is a flat 25%, and that number is firm.";
    },
    conditionFull: "Tell us at booking that the home has heavy buildup and we add a flat 25% for the extra time — that price is then firm, and the crew will not re-price it on arrival. If instead the crew arrives to heavy trash, heavy grease, pet mess or anything well outside what was described, they stop and quote the difference with you before any work starts — you can approve it or keep the standard clean at your quoted price. Nothing is ever added to your bill afterward.",
    /* ROUND 57 — WHAT THE FLAGGED CUSTOMER IS ACTUALLY AFRAID OF.
       Every version of this message so far has said the same two things:
       the price covers a standard clean, and extra gets agreed before the
       crew starts. Both true, and both beside the point. The customer who
       ticked "no, it's heavy" is not worried that it will cost more. They
       are worried about standing in an empty house with a crew who has
       already started and a number they did not agree to.

       So the clause that was missing from all of it, and that this entry
       exists to carry: THEY CAN SAY NO AND STILL GET THE CLEAN THEY
       BOOKED, at the price on the screen. That is the sentence that
       removes the fear, and it costs the business nothing to say, because
       it is what the SOP is supposed to do anyway.

       Written as two spans so the screen can bold the first half. */
    /* Round 58: echoes the answer they gave in their words. They picked
       "heavy build up"; saying it back is what makes the panel read
       as a reply rather than a system notice. */
    /* ROUND 66 — REWRITTEN, because the old body described a mechanism that
       no longer runs.

       It said "the price above covers a standard clean" and then explained
       an arrival re-quote. As of round 66 a declared-heavy move-out is
       priced at +25% up front (see rpConditionKey in the engine), and that
       surcharge is an itemised row on this very screen. Telling the
       customer the number above them is a standard-clean price, directly
       underneath a breakdown showing a heavy-buildup line, would read as
       either a mistake or a trick.

       The new body confirms what the breakdown already shows and then makes
       the promise that is now the point: it is firm. That is what the
       customer gets in exchange for having answered honestly, and it is the
       reason the surcharge does not simply teach people to click
       "Standard". Both halves have to stay true together. */
    flaggedLead: "You told us there's heavy build up — that's priced in above.",
    flaggedBody: "Homes like this take longer, so the total includes 25% for the extra time. What you see is what you pay: the crew won't re-price anything on arrival, and nothing is ever added afterward."
    /* Round 37 (direct instruction): the price-ceiling claim is gone. The
       top of the move-out ladder is still the top of the ladder — we just
       don't make a promise out of it any more. Deleted rather than left
       unused, so nothing can quietly start saying it again. */
  },

  /* ── Payment terms ───────────────────────────────────────────────────
     The easiest true thing this business can say, and until round 31 it
     appeared nowhere on the website at all. */
  payment: {
    short: "No deposit. Nothing due today.",
    full: "No deposit, and nothing due today — you pay after the clean is done and you've seen it.",
    spoken: "There's no deposit and nothing due today — we take payment after the clean is done and you've seen it."
  },

  /* ── The guarantees ──────────────────────────────────────────────────
     Two products, two different promises, and keeping them straight
     matters more than any other copy on the site: promising deposit
     protection on the tier that doesn't carry it is the one mistake that
     costs real money. Both are stated from the same shared 48-hour
     mechanic so they can never drift apart on the timing. */
  /* ROUND 54 — WHAT THE MOVE-OUT ACTUALLY IS.
     Direct instruction: "This is an inspection-ready clean! Includes the
     full interior cleaning of the home designed for inspections."

     Round 52 collapsed the two tiers and named the survivor "Move-Out
     Cleaning", which is what people search for and is right as a product
     name. What got lost in the collapse was the WHY: the old tier was
     called Inspection Ready and the name did the explaining by itself.
     "Everything inside the home" describes the scope accurately and says
     nothing about what it is FOR.

     These lines put the purpose back without reviving the tier. The
     product is still one Move-Out Cleaning at one price; it is simply
     described by the standard it is built to meet. */
  moveout: {
    /* The one-liner, for the service list. */
    short: "Inspection-ready. The full interior, cleaned to pass a walkthrough.",
    /* The fuller version, for the screens that have room. */
    long: "This is an inspection-ready clean: the full interior of the home, cleaned to the standard a landlord, property manager or housing office checks against at move-out.",
    /* What "the full interior" actually means, said once. */
    scope: "Inside the oven and refrigerator, inside cabinets and closets, bathrooms top to bottom, baseboards, doors and trim, interior windows, sills and tracks, ceiling fans, vents and light fixtures, and every floor.",
    /* What it is not. Short, because all four are outside the home. */
    excludes: "Exterior windows, the garage floor, carpet extraction and junk removal aren't included — add any of them while you book."
  },

  /* ROUND 54 — DEEP AND BASIC ARE BLOCKS OF TIME.
     Direct instruction: "Make sure customers understand deep or basic is
     just hourly."

     They always were. RP_DEEP_ANCHOR_PRICE is six hours at $40 and
     RP_BASIC_ANCHOR_PRICE is three at the same rate -- the identical rate
     Hourly Cleaning charges. But the copy described them as outcomes
     ("a detailed, top-to-bottom clean of every room", "keep an
     already-tidy home fresh"), which is a promise of COMPLETION, and a
     three-hour Basic cannot promise a finished house.

     That gap is where bad reviews come from: the customer was told
     "top to bottom" and got three hours. The fix is not to sell it
     smaller, it is to sell the right thing -- hours of a professional's
     time, spent where the customer says it matters most. That is a good
     product and an easy one to be happy with, as long as nobody expected
     something else. */
  timed: {
    /* Said the same way for both, with the hours swapped in, so the two
       screens cannot drift apart. */
    frame(hours, rate) {
      return `${hours} hours of cleaning at $${rate} an hour, one cleaner. You tell us what matters most and we work down that list.`;
    },
    honest: "It's time, not a finished checklist — the same way our hourly cleaning works. If the home needs more than the hours booked, add time or a second cleaner.",
    deepWhen: "Best when it's been a while, or nobody's deep-cleaned it yet.",
    basicWhen: "Best for a home that's already tidy and just needs keeping that way.",
    /* The line that steers someone to the right product. A move-out is
       scope-priced and inspection-backed; these are not. */
    notMoveout: "Moving out? A Move-Out Cleaning is the one priced for a full interior and backed for an inspection.",
    /* ROUND 57: the same warning, short enough to sit on the includes
       screen as its own line rather than at the tail of a four-sentence
       fine print. Somebody booking three hours of Basic to pass a housing
       inspection is the single worst outcome this funnel can produce -- the
       clean will be fine and the inspection will still fail -- and until
       now the only thing standing in the way was the last sentence of a
       paragraph under a Continue button. */
    notMoveoutShort: "This is hourly cleaning, not a move-out. If you need to pass an inspection, book Move-Out Cleaning instead."
  },

  guarantee: {
    window: "48 hours",
    depositName: "Defend Your Deposit™",
    /* Inspection Ready. Always paired with what it actually does —
       "Defend Your Deposit" on its own means nothing to a first-time
       reader. */
    deposit() {
      return `If your landlord flags something we missed, tell us within ${RP_MSG.guarantee.window} and we come back and fix it, free. That's ${RP_MSG.guarantee.depositName}.`;
    },
    depositShort: "Protects your security deposit",
    /* Everything else, Express included. */
    satisfaction() {
      return `Not happy with something we cleaned? Tell us within ${RP_MSG.guarantee.window} and we come back and fix it, free.`;
    },
    satisfactionShort: "Satisfaction Guaranteed",
    /* What NOT to say. Kept here so it's answered the same way every
       time it comes up, on the phone and on the page. */
    limit: "We re-clean — we don't decide whether a landlord returns a deposit, and we'd never promise that."
  },

  /* ── What a Move-Out Cleaning is, in one sentence ───────────────────
     Round 52 rewrote this whole block. It used to hold two product
     descriptions (Inspection Ready and Move-Out Express), the honest
     "which one do you need" chooser question, the spoken versions of
     both, and two computed functions -- workRatio(), which built the
     sentence "same crew both ways, double the hours, so double the price"
     out of the engine's own crew and hours rather than asserting it, and
     priceRatio(), which checked whether the ladder's four rungs were a
     uniform enough multiple to be described with one number at all.

     Both functions were careful and both are deleted, because they
     answered a question about a second tier. What is left is the single
     product, said once for the page and once for the phone. */
  tiers: {
    name: "Move-Out Cleaning",
    /* Round 52: `inspectionName` and `expressName` were read by /call's
       explain sheet and by /pricing. `name` replaces both. */
    description: "The full interior reset — oven, fridge, cabinets, closets, baseboards, interior windows, ceiling fans, vents and light fixtures. One price for your home's size, backed by the deposit guarantee.",
    /* What it does NOT cover. With one tier this is the whole exclusion
       list, and it is short because every item on it is outside the home.
       Naming it is what makes "everything inside" credible. */
    excludes: "Exterior windows, the garage floor, carpet extraction and junk removal aren't included — each can be added while booking.",
    /* Round 52: the chooser question is gone. It asked whether a landlord
       was going to inspect the place, and it was the right question when
       the answer picked a product. It no longer changes anything: the
       scope, the price and the guarantee are the same either way. The
       spoken line below leads with the scope instead. */
    spoken: "It's the full reset — inside the oven, the fridge, cabinets, baseboards, the works — one price for the size of the place, and we stand behind it if your landlord flags something.",
    spokenAsk: "How many bedrooms, and how many full baths?",
    /* The sentence that makes a given rung self-explanatory. Round 52:
       this used to be workRatio(), comparing the two tiers' crew-hours.
       It reads the one ladder now and says what THIS home actually buys,
       which is the honest answer to "why does it cost that" and the only
       version of the question that survives having one product. Returns
       "" rather than guessing when the size isn't known yet. */
    workSpoken(beds = (typeof rpState !== "undefined" ? rpState.bedrooms : null)) {
      if (typeof RP_MSG.crewMath !== "function") return "";
      const m = RP_MSG.crewMath("moveout", beds);
      if (!m || !m.crew || !m.onSite) return "";
      const who = m.crew === 1 ? "one cleaner" : `${m.crew} cleaners`;
      return `That's ${who} for ${m.onSite} hour${m.onSite === 1 ? "" : "s"} — the whole interior, not the main rooms.`;
    }
  },

  /* ── Basic vs Deep, said out loud ───────────────────────────────────
     Round 37, asked for directly: the console could articulate the two
     move-out tiers and had nothing at all for these two, which are
     confused just as often on the phone. Same shape as tiers.spoken
     above, and the same rule — the difference is about the state of the
     home, not about how much someone wants to spend. */
  cleans: {
    spoken: "Basic is upkeep — a place that's already in decent shape, kept that way. Deep is the one that gets what upkeep misses: inside the oven, the baseboards, the buildup you stop noticing. If it's been a while, you want the deep one.",
    spokenAsk: "When was it last cleaned top to bottom?",
    basicWhen: "Under a month, and it's tidy",
    deepWhen: "Longer than that, or never"
  },

  /* ── What's actually at risk ─────────────────────────────────────────
     The strongest argument this business has, and until now it was
     nowhere in the funnel: a customer comparing our 3-bedroom price against
     a cheaper cleaner is answering the wrong question. The real comparison
     is that price against the deposit they're trying to get back. (Figures
     named in this comment used to be $499; they move, the argument doesn't,
     so the live number comes from the engine at call time.)

     Figures are Lawton-area house rents with a deposit at roughly one
     month's rent, which is the local norm. They are ESTIMATES ABOUT THE
     MARKET, not a claim about any one lease, and every string below is
     hedged to say so — "usually", "around here", "typically". Nothing
     here promises anyone gets a deposit back; that is the landlord's
     call and RP_MSG.guarantee.limit is what we say about it.

     Ranges are per BEDROOM COUNT, not per price tier, because a
     1-bedroom and a 2-bedroom pay the same 1-2 bedroom price but have very different
     amounts on the line — and quoting a 2-bedroom's deposit to someone
     in a 1-bedroom would be the kind of small dishonesty that costs more
     than it earns. */
  deposit: {
    note: "Deposits around here usually run about a month's rent. Yours will depend on your lease.",
    table: [
      { beds: 1, low: 600,  high: 600  },
      { beds: 2, low: 850,  high: 900  },
      { beds: 3, low: 1100, high: 1200 },
      { beds: 4, low: 1300, high: 1400 }   /* 4+ */
    ],
    for(beds) {
      const n = Math.max(1, Math.min(4, Number(beds) || 0));
      if (!beds) return null;
      const row = RP_MSG.deposit.table.find(r => r.beds === n);
      if (!row) return null;
      const money = v => "$" + v.toLocaleString("en-US");
      return Object.assign({}, row, {
        range: row.low === row.high ? money(row.low) : `${money(row.low)}–${money(row.high)}`,
        /* A 5- or 6-bedroom clamps to the 4-bedroom row for the FIGURE
           (the largest we have data for), but it must not be called a
           4-bedroom to someone standing in a 6-bedroom house — so bigger
           homes get their own subject phrase and an "at least". */
        subject: Number(beds) > 4 ? "A deposit on a home this size" : `A ${n}-bedroom deposit`,
        amount: Number(beds) > 4
          ? `at least ${row.low === row.high ? money(row.low) : money(row.low) + "\u2013" + money(row.high)}`
          : (row.low === row.high ? money(row.low) : money(row.low) + "\u2013" + money(row.high))
      });
    },
    /* The on-screen anchor. Returns "" rather than guessing if we don't
       know the bedroom count yet. */
    line(beds, price) {
      const d = RP_MSG.deposit.for(beds);
      if (!d || !price) return "";
      /* Only make the "less than half" claim where it is arithmetically
         true. Round 52: it now holds at EVERY size -- the round-45 ladder
         had a 1-bedroom clean at roughly two thirds of a typical deposit,
         which is why the plainer fallback below exists. At $199 against a
         $600 deposit it is a third. The check stays because the claim must
         survive a calculator, not because it is expected to fail.

         The old line ended "and it's the one we guarantee", which drew a
         contrast with Move-Out Express. There is nothing to contrast with
         now, so it states the guarantee instead of implying a choice. */
      const underHalf = price < d.low / 2;
      const opener = `${d.subject} around here is usually ${d.amount}.`;
      return underHalf
        ? `${opener} This costs less than half that, and it's guaranteed.`
        : `${opener} This is what protects it.`;
    },
    /* Liz's version, for the phone. Same numbers, said out loud. */
    spoken(beds, price) {
      const d = RP_MSG.deposit.for(beds);
      if (!d || !price) return "";
      return `${d.subject} around here usually runs ${d.amount}, so you're protecting ${d.amount} for $${price}. That's really the comparison — not us against a cheaper cleaner.`;
    }
  },

  /* ── What the price buys ─────────────────────────────────────────────
     Reads crew size and hours off the pricing engine, so it can never
     promise a crew or a duration the price wasn't built on. Returns "" if
     the engine can't answer, rather than guessing. */
  crewMath(service, beds = (typeof rpState !== "undefined" ? rpState.bedrooms : null)) {
    /* Round 38: read from the engine, not restated here, so the spoken
       line and the screen can never disagree about how many people turn up.

       Round 51: hours became a single per-bedroom-bracket number instead of
       a flat "8-10 hours" range, so this no longer parses two figures out
       of a string -- it asks the engine for crew, on-site hours and total
       crew-hours directly. `lo`/`hi` are kept on the returned object (both
       set to the same exact figure) for any caller still reading a range;
       an exact number is just a range that happens to be closed. Round 52
       deleted workRatio(), which was the main one.

       Returns "" until the bedroom count is known: every caller already
       renders nothing on a falsy return, and a crew or a duration quoted
       before we know the size of the home would be a made-up promise. */
    if (typeof rpMoveoutCrewSize !== "function" || typeof rpMoveoutOnSiteHours !== "function") return "";
    /* Round 52: takes an explicit bedroom count so a caller can ask about
       a specific home without mutating rpState. Both engine accessors
       already default to rpState.bedrooms, so passing null is the old
       behaviour exactly. */
    const crew = rpMoveoutCrewSize(service, beds || undefined);
    const onSite = rpMoveoutOnSiteHours(service, beds || undefined);
    if (!crew || !onSite) return "";
    const total = crew * onSite;
    const people = `${crew} cleaner${crew === 1 ? "" : "s"}`;
    const hoursSaid = `${onSite} hour${onSite === 1 ? "" : "s"}`;
    /* On a 1-cleaner job crew-hours and on-site hours are the same number,
       so the trailing "— 8 hours of work" was printing "8 hours" twice in
       one sentence. It only tells the customer something when more than one
       pair of hands is on the job. */
    return { crew, onSite, lo: total, hi: total, hours: rpMoveoutTierHours(service),
      short: `${total} hours of work`,
      full: crew > 1
        ? `${people} on site for ${hoursSaid} — ${total} hours of work`
        : `${people} on site for ${hoursSaid}` };
  },

  /* ── Access & preparation ────────────────────────────────────────────
     Asked on nearly every call and answered ad-hoc every time. */
  access: {
    notHome: "You don't need to be home — most move-outs are empty. A key, a lockbox code, or the property manager's contact is all we need.",
    empty: "It cleans best empty, and move-outs usually are. We can work around belongings, but heavy clutter or trash changes the scope.",
    utilities: "Water and power need to be on. Without them the job can't be done properly and we'd rather sort that out before the date than turn up and stop."
  },

  /* ── Scheduling ──────────────────────────────────────────────────────
     Real availability only. There is deliberately no "spots are filling
     up" string in this file: the low-availability line in /book and
     /call is computed from live calendar data and renders nothing at all
     when availability is healthy. If a scarcity claim is ever wanted
     here, it has to be one that can be checked. */
  scheduling: {
    reschedule: "Move dates slip all the time. Call or text and we'll move it — there's no deposit riding on it either way.",
    window: "We use a 30-minute arrival window so the crew can finish the job before yours properly and get to you safely."
  },

  /* ── Service area ────────────────────────────────────────────────────
     One list. It was written out longhand in eleven places, and two of
     them had a different set of towns. */
  areaTowns: ["Lawton", "Fort Sill", "Cache", "Elgin", "Medicine Park", "Duncan"],
  areaFootnote() {
    return `Serving ${RP_MSG.areaSentence()} and the surrounding Southwest Oklahoma communities.`;
  },
  area() { return RP_MSG.areaTowns.join(" · "); },
  areaSentence() {
    const t = RP_MSG.areaTowns;
    return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
  }
};

/* Convenience for template literals, so a page reads
   ${rpMsg("payment.short")} instead of reaching into the object. Returns
   "" for an unknown path rather than "undefined" leaking onto a page in
   front of a customer. */
function rpMsg(path) {
  const value = String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), RP_MSG);
  if (typeof value === "function") return value();
  return value == null ? "" : value;
}

/* Static markup can use the library too. Any element carrying
   data-rp-msg="path" has its text filled from RP_MSG at boot, so a claim
   sitting in plain HTML (the FAQ panel, a footer note) is still written in
   exactly one place. Called once from each page's boot sequence. */
function rpHydrateMessages(root) {
  (root || document).querySelectorAll("[data-rp-msg]").forEach(function (el) {
    const text = rpMsg(el.getAttribute("data-rp-msg"));
    if (text) el.textContent = text;
  });
}
