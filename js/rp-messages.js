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
    promise: "The price you see is the price you pay.",
    promiseSpoken: "that's the full price — nothing gets added when we show up",
    /* The honest exception. This is the ONLY place the carve-outs are
       listed; if they ever change, they change once. */
    exception: "Price only changes for severe buildup, heavy trash, access problems, biohazards, or work outside what you picked — and we call you first, before the crew starts."
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

  /* ── The two move-out tiers, in one sentence each ────────────────────
     Used on /book's tier cards, /call's tier script, and the objection
     answer for "what's actually different between the two?". Was three
     separately-maintained descriptions that had already drifted. */
  tiers: {
    inspectionName: "Inspection Ready",
    expressName: "Move-Out Express",
    inspection: "The full interior reset — oven, fridge, cabinets, closets, baseboards, interior windows, ceiling fans, vents and light fixtures. Backed by the deposit guarantee.",
    express: "Kitchen, bathrooms, floors and surfaces. The right call when nobody is inspecting the place against a list.",
    /* The honest way to tell someone which one they need. This is a
       question about their situation, not an upsell. */
    chooser: "If a landlord, property manager or housing office is going to walk through and check the place after you leave, Inspection Ready is the one that protects your deposit. If nobody's checking, Express gets it clean for less.",
    expressAddable: "Oven, fridge, cabinets and a full Detail Pass can each be added to Express individually.",
    /* ── The spoken versions ──────────────────────────────────────────
       Round 37. The written copy above is for a screen someone reads at
       their own pace. These are for a person saying it out loud while
       somebody waits, which is a different job: shorter, no subordinate
       clauses, and it has to survive being said in one breath.

       Kept here rather than in /call so the CSR and the website can never
       describe the same two products differently — the whole reason this
       file exists. */
    spoken: "Inspection Ready is the full reset — inside the oven, the fridge, cabinets, baseboards, the works — and it's the one we stand behind if your landlord flags something. Express is kitchen, bathrooms, floors and surfaces. Clean, just not built for an inspection.",
    /* The question that actually decides it. Not a preference question —
       a fact about their situation, which is why it closes cleanly. */
    spokenAsk: "Is anyone walking through and checking the place after you're out?",
    /* Round 38: the sentence that makes the ladder self-explanatory. Built
       from the engine's crew and hours rather than written down, so it can
       never claim a ratio the numbers don't support -- and it renders
       nothing at all if they ever stop being a clean multiple. */
    workRatio() {
      const ir = RP_MSG.crewMath("moveout"), ex = RP_MSG.crewMath("moveoutrefresh");
      if (!ir || !ex || !ex.lo) return "";
      /* Round 51: these are exact per-bedroom-bracket figures now, not
         ranges, so the old midpoint-of-a-range arithmetic is gone. The
         ladder is built so Inspection Ready is exactly twice the crew-hours
         of Express at every size (8/4, 12/6, 16/8, 20/10) — but this still
         CHECKS rather than asserts it, because the whole value of the line
         is that a customer can verify it against the two cards next to it. */
      const r = ir.lo / ex.lo;
      if (r < 1.7 || r > 2.3) return "";
      const phrase = Math.abs(r - 2) < 0.01 ? "double" : "about double";

      const pr = RP_MSG.tiers.priceRatio();
      let priceClause = "";
      if (pr !== null) {
        if (pr >= 1.97 && pr <= 2.03)      priceClause = `, so it's ${phrase} the price`;
        else if (pr >= 1.60 && pr < 1.97)  priceClause = `, and still less than ${phrase} the price`;
        /* Above 2.03 it says nothing about price at all: "more than double"
           is true but there is no version of it worth saying out loud. */
      }

      /* Round 51: the two tiers no longer always send the same crew. At 3
         and 4 bedrooms Inspection Ready sends two cleaners and Express
         sends one; at 1–2 and 5 they match. The old line opened "Same crew
         both ways" unconditionally, which became false at exactly the two
         middle sizes — and Liz says this out loud. Two shapes now, picked
         off the real numbers. */
      if (ir.crew === ex.crew) {
        const who = ir.crew === 1 ? "one cleaner" : `${ir.crew} cleaners`;
        return `Same crew both ways — ${who}. Inspection Ready is ${phrase} the hours${priceClause}.`;
      }
      const said = (n, h) => `${n} cleaner${n === 1 ? "" : "s"} for ${h} hour${h === 1 ? "" : "s"}`;
      return `Inspection Ready is ${said(ir.crew, ir.onSite)}; Express is ${said(ex.crew, ex.onSite)}. ${phrase === "double" ? "Double" : "About double"} the work${priceClause}.`;
    },
    priceRatio(beds = (typeof rpState !== "undefined" ? rpState.bedrooms : null)) {
      if (typeof RP_MOVEOUT_BEDROOM_TIERS === "undefined") return null;
      if (typeof RP_MOVEOUT_REFRESH_BEDROOM_TIERS === "undefined") return null;
      /* Round 51: when the bedroom count is known, answer for THAT rung
         rather than for the ladder as a whole. The four rungs now run
         1.75 / 1.72 / 1.67 / 1.66, a spread of 0.09 — wide enough that the
         uniformity check below (correctly) refuses to name one number for
         all of them, which would have silently dropped the price half of
         workRatio()'s sentence on every screen. On a screen that knows the
         home's size there is an exact right answer, so use it. */
      if (Number(beds) > 0 && typeof rpMoveoutBedroomTier === "function") {
        const irT = rpMoveoutBedroomTier(beds, "moveout");
        const exT = rpMoveoutBedroomTier(beds, "moveoutrefresh");
        if (irT && exT && irT.base && exT.base) return irT.base / exT.base;
        return null;
      }
      const ir = RP_MOVEOUT_BEDROOM_TIERS, ex = RP_MOVEOUT_REFRESH_BEDROOM_TIERS;
      if (!ir.length || ir.length !== ex.length) return null;
      const ratios = [];
      for (let i = 0; i < ir.length; i++) {
        if (!ex[i] || !ex[i].base || !ir[i] || !ir[i].base) return null;
        ratios.push(ir[i].base / ex[i].base);
      }
      const lo = Math.min.apply(null, ratios), hi = Math.max.apply(null, ratios);
      if (hi - lo > 0.06) return null;      /* not one ladder, several */
      return (lo + hi) / 2;
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
         true. It holds at 2, 3 and 4+ bedrooms; at 1 bedroom the clean is
         about two thirds of a typical deposit, so that size gets the
         plainer version instead of a claim that doesn't survive a
         calculator. */
      const underHalf = price < d.low / 2;
      const opener = `${d.subject} around here is usually ${d.amount}.`;
      return underHalf
        ? `${opener} This costs less than half that — and it's the one we guarantee.`
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
  crewMath(service) {
    /* Round 38: read from the engine, not restated here, so the spoken
       line and the screen can never disagree about how many people turn up.

       Round 51: hours became a single per-bedroom-bracket number instead of
       a flat "8-10 hours" range, so this no longer parses two figures out
       of a string -- it asks the engine for crew, on-site hours and total
       crew-hours directly. `lo`/`hi` are kept on the returned object (both
       set to the same exact figure) because workRatio() and /call's
       comparison table still read them, and an exact number is just a
       range that happens to be closed.

       Returns "" until the bedroom count is known: every caller already
       renders nothing on a falsy return, and a crew or a duration quoted
       before we know the size of the home would be a made-up promise. */
    if (typeof rpMoveoutCrewSize !== "function" || typeof rpMoveoutOnSiteHours !== "function") return "";
    const crew = rpMoveoutCrewSize(service);
    const onSite = rpMoveoutOnSiteHours(service);
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
