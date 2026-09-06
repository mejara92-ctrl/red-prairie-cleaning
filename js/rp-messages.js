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
    reviewCount: 61,
    rating: "5.0",
    phone: "(580) 215-0915",
    phoneDigits: "5802150915",
    priceCeiling: 599
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
    exception: "Price only changes for severe buildup, heavy trash, access problems, biohazards, or work outside what you picked — and we call you first, before the crew starts.",
    ceiling() { return `No move-out over $${RP_MSG.facts.priceCeiling}.`; }
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
    expressAddable: "Oven, fridge, cabinets and a full Detail Pass can each be added to Express individually."
  },

  /* ── What's actually at risk ─────────────────────────────────────────
     The strongest argument this business has, and until now it was
     nowhere in the funnel: a customer comparing $499 against a cheaper
     cleaner is answering the wrong question. The real comparison is $499
     against the deposit they're trying to get back.

     Figures are Lawton-area house rents with a deposit at roughly one
     month's rent, which is the local norm. They are ESTIMATES ABOUT THE
     MARKET, not a claim about any one lease, and every string below is
     hedged to say so — "usually", "around here", "typically". Nothing
     here promises anyone gets a deposit back; that is the landlord's
     call and RP_MSG.guarantee.limit is what we say about it.

     Ranges are per BEDROOM COUNT, not per price tier, because a
     1-bedroom and a 2-bedroom pay the same $399 but have very different
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
    const crew = service === "moveout" ? 3 : 2;
    const hrs = (typeof rpMoveoutTierHours === "function"
      ? (rpMoveoutTierHours(service).match(/\d+(?:\.\d+)?/g) || []).map(Number) : []);
    if (hrs.length < 2) return "";
    const lo = Math.round(crew * hrs[0]), hi = Math.round(crew * hrs[1]);
    return { crew, lo, hi, hours: rpMoveoutTierHours(service),
      short: `${lo}–${hi} hours of work`,
      full: `${crew} cleaners on site for ${rpMoveoutTierHours(service)} — ${lo}–${hi} hours of work` };
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

  /* ── The military discount ───────────────────────────────────────────
     Rate and cap come from the pricing engine, never retyped. */
  military() {
    const pct = Math.round((typeof MILITARY_DISCOUNT_RATE !== "undefined" ? MILITARY_DISCOUNT_RATE : 0.10) * 100);
    const cap = (typeof MILITARY_DISCOUNT_CAP !== "undefined" ? MILITARY_DISCOUNT_CAP : 25);
    return {
      pct, cap,
      offer: `Military or first responder? Take ${pct}% off.`,
      detail: `Up to $${cap} off, as a thank-you for your service. Can't be combined with other promotional offers.`,
      spoken: `And are you or your spouse military or a first responder? I can take ${pct}% off if so.`
    };
  },

  /* ── Service area ────────────────────────────────────────────────────
     One list. It was written out longhand in eleven places, and two of
     them had a different set of towns. */
  areaTowns: ["Lawton", "Fort Sill", "Cache", "Elgin", "Medicine Park", "Duncan"],
  areaFootnote() {
    const m = RP_MSG.military();
    return `Serving ${RP_MSG.areaSentence()} and the surrounding Southwest Oklahoma communities. Military and first responders save ${m.pct}%, up to $${m.cap}.`;
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
