# Worker patch — separate website partial leads from phone leads

**File:** `rpc-booking-api` Worker (the one at
`https://rpc-booking-api.aged-breeze-c9a5.workers.dev`)

**Why:** `/lead` currently hardcodes phone-call labels — source
`"RPC Call Console (no booking)"` and the tag `call-no-booking` — on
every lead it receives. The website contact gate now posts to the same
endpoint, so without this patch every website abandon would show up in
GHL as one of Christa's phone calls and corrupt your call reporting.

Three small replacements. Nothing else in the Worker changes, and phone
leads from `/call` behave exactly as they do today.

---

## 1 of 3 — read the new `lead_type` field

**FIND** (inside the `/lead` handler, with the other `const lead*` lines):

```js
      const leadSubmittedAt = cleanString(leadBody.submitted_at, 60) || new Date().toISOString();
```

**REPLACE WITH:**

```js
      const leadSubmittedAt = cleanString(leadBody.submitted_at, 60) || new Date().toISOString();

      /* Website partial leads (the /book contact gate) and phone leads
         (the /call console) both land here, because /lead is the only
         endpoint that accepts a contact with no appointment. They need
         different sources and tags or website abandons pollute the CSR
         call reporting. Defaults to phone so existing /call posts, which
         don't send lead_type, are completely unaffected. */
      const leadType = cleanString(leadBody.lead_type, 40) === "website_partial"
        ? "website_partial"
        : "phone_csr";
      const isWebsitePartial = leadType === "website_partial";
```

---

## 2 of 3 — label the note header

**FIND:**

```js
      const leadNoteBody = [
        `\u260E PHONE LEAD \u2014 NO BOOKING`,
        `Outcome: ${leadOutcome}`,
```

**REPLACE WITH:**

```js
      const leadNoteBody = [
        isWebsitePartial
          ? `\u{1F5A5} WEBSITE LEAD \u2014 SAW PRICE, DID NOT BOOK`
          : `\u260E PHONE LEAD \u2014 NO BOOKING`,
        `Outcome: ${leadOutcome}`,
```

---

## 3 of 3 — source and tags

**FIND:**

```js
        source: "RPC Call Console (no booking)",
        tags: [
          "call-no-booking",
          `outcome-${leadOutcome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
        ],
```

**REPLACE WITH:**

```js
        source: isWebsitePartial
          ? "Red Prairie Website (price viewed, no booking)"
          : "RPC Call Console (no booking)",
        tags: isWebsitePartial
          ? ["website-partial-lead", "price-viewed-no-booking"]
          : [
              "call-no-booking",
              `outcome-${leadOutcome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
            ],
```

---

## After deploying

**Verify it works** — from a terminal:

```
curl -X POST https://rpc-booking-api.aged-breeze-c9a5.workers.dev/lead \
  -H "Content-Type: application/json" \
  -d '{"lead_type":"website_partial","full_name":"Test Gate",
       "phone":"5805550123","service":"Move-In / Move-Out Cleaning",
       "quoted_price":"$379.00","call_outcome":"Saw price online - did not book",
       "csr_lead_source":"Website Estimator","details":"test"}'
```

You should get `{"ok": true, ...}` and a contact in GHL tagged
`website-partial-lead`. Delete the test contact afterwards.

---

## !! CHECK THIS BEFORE YOU DEPLOY !!

The website used to send **nothing** before a confirmed booking —
`rpSendEstimateToGoHighLevel()` is a no-op stub with a comment saying
the confirmation should only come from the appointment-booked trigger.
That stub was almost certainly written to stop GHL from texting
confirmations to people who hadn't booked.

You're now creating contacts before any booking exists. So before
deploying, check every GHL workflow that triggers on **contact created**
or **tag added** and confirm none of them send a customer-facing
confirmation. Partial leads should trigger an **internal** notification
or land on a callback list — never a "your cleaning is confirmed" text.

## What to build once it's live

A GHL workflow/smart list on tag `website-partial-lead` where no
appointment exists. Those are people who entered their number, saw your
price, and walked. It's the most qualified callback list you'll ever
have, and right now nothing picks it up.
