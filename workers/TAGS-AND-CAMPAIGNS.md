# Marketing tags → HighLevel

**Round 67.** Every booking and every captured lead carries a `tags` array and
a `tags_csv` string in the webhook payload, derived by `rpMarketingTags()` in
`js/rp-pricing-engine.js`.

## Why this was missing

The site already sent HighLevel forty-odd **custom fields** — bedroom count,
heavy condition, every add-on. All of it lands on the contact and none of it
was a **tag**.

A custom field is something you read *after* you've found a contact. A tag is
what you filter a smart list by and what a workflow triggers on. The only tags
that existed were in `PATCH-lead-endpoint.md`, and they tag people who **did
not book** (`website-partial-lead`, `call-no-booking`). So you could automate
follow-up to everyone who walked away and nothing at all to anyone who paid.

---

## The five tags

| Tag | Applied when |
|---|---|
| `basic-clean` | Basic Cleaning booked |
| `deep-clean` | Deep Cleaning **or** Whole-Home Reset booked |
| `move-out` | Move-Out Cleaning booked |
| `basic-detail` | Standard (3 hr) car detail — standalone **or** added to a cleaning |
| `deep-detail` | Deep (6 hr) car detail — standalone **or** added to a cleaning |

That's the whole vocabulary, and the test suite enforces it as a **closed
set** — a sixth tag fails a test. The value of five tags is that they stay
five.

**A booking can carry two.** A Deep Cleaning with a deep car detail is
`deep-clean` *and* `deep-detail`. That's correct: two purchases, two repeat
clocks. It's also the case a service-only scheme would miss, since most
detailing will be sold as an add-on rather than on its own.

### Two placements that needed a decision

**Whole-Home Reset → `deep-clean`.** It's the deepest clean on the list, and
for remarketing purposes a Reset customer is a deep-clean customer. A sixth
tag would have re-grown the thing this cut removed.

**Carpet-only → no tag.** It's neither a clean nor a detail, so it doesn't fit
the five. Flagged rather than silently decided — see "Open" below.

### Everything else still ships, as custom fields

Bedroom count, heavy vs standard, which add-ons, recurring cadence, rental vs
selling, two-storey, pet enzyme. All of it is on the same payload. It stopped
being a *tag*; it didn't stop being *data*. If you ever want to segment on one
of those, you can filter the custom field directly in a HighLevel smart list —
no site change needed.

---

## Campaigns

You said: remarket to cleans and details, skip move-out because they're gone.

| Segment | Timing | Message |
|---|---|---|
| `basic-clean` | 4–6 weeks | Book the next one |
| `deep-clean` | 4–6 months | Time for another reset |
| `basic-detail` | ~6 months | Interior's due again |
| `deep-detail` | ~6 months | Interior's due again |
| `basic-clean` **or** `deep-clean`, no detail tag | anytime | The car, next time we're out |
| `basic-detail` **or** `deep-detail`, no clean tag | anytime | We do houses too |

Those last two are the cross-sells, and they're the reason the detail tags are
worth having separately from the clean tags: the absence of a tag is as useful
as its presence.

**`move-out` exists to be excluded.** You're not marketing to them — but
without the tag there's no way to *filter them out* of a campaign aimed at
everyone else. Use it as a suppression list, not a target list.

**One suppression worth adding by hand:** recurring customers. Someone on a
fortnightly plan gets `basic-clean` like everyone else, and "book your next
clean!" lands badly on someone whose next clean is already scheduled. There's
no tag for it — filter the `frequency` custom field (it's on every booking) to
exclude anything other than `One-Time`.

---

## Worker change needed

The site **sends** the tags; the Worker has to **apply** them. In
`red-prairie-booking-worker-v28.js`, wherever the contact is created or
updated:

```js
// body.tags is already an array; body.tags_csv is the same list comma-joined.
const contactPayload = {
  ...existing,
  tags: Array.isArray(body.tags) ? body.tags : [],
};
```

Two things to get right:

1. **Merge, don't replace.** HighLevel's contact upsert replaces the tag list.
   Someone who booked a deep clean last year and a Basic today should end up
   with both — that history is what makes the segments worth having. Union
   with the existing tags, or use the add-tags endpoint rather than the
   contact update.

2. **Keep the existing no-booking tags.** `website-partial-lead` and
   `call-no-booking` still do their job. These are additive.

---

## Open

**Carpet-only customers get no tag**, so nothing can remarket to them. Carpet
is the most naturally annual thing on the price list — an 11-month reminder is
close to free money — and right now a carpet-only booking is invisible to
every campaign.

Adding `carpet` would make it six tags. Your call; it's one line if you want
it.
