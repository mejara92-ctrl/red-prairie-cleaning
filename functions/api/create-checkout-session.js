export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    const amount = Number(data.amount || 0);
    const amountInCents = Math.max(0, Math.round(amount * 100));

    if (!amountInCents) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams();

    params.append("mode", "payment");
    params.append(
      "success_url",
      `${env.SITE_URL || "https://redprairiecleaning.com"}?success=true`
    );
    params.append(
      "cancel_url",
      `${env.SITE_URL || "https://redprairiecleaning.com"}?canceled=true`
    );

    params.append("line_items[0][price_data][currency]", "usd");
    params.append(
      "line_items[0][price_data][product_data][name]",
      "Red Prairie Cleaning"
    );
    params.append(
      "line_items[0][price_data][product_data][description]",
      `${data.cleanType || "cleaning"} • ${data.bedrooms || "N/A"} bed / ${
        data.bathrooms || "N/A"
      } bath • ${data.frequency || "one-time"}`
    );
    params.append(
      "line_items[0][price_data][unit_amount]",
      String(amountInCents)
    );
    params.append("line_items[0][quantity]", "1");

    const addonsString = (data.addons || []).join(", ");

    params.append("metadata[bedrooms]", data.bedrooms || "");
    params.append("metadata[bathrooms]", data.bathrooms || "");
    params.append("metadata[cleanType]", data.cleanType || "");
    params.append("metadata[frequency]", data.frequency || "");
    params.append("metadata[name]", data.name || "");
    params.append("metadata[email]", data.email || "");
    params.append("metadata[phone]", data.phone || "");
    params.append("metadata[notes]", data.notes || "");
    params.append("metadata[isGift]", data.isGift ? "yes" : "no");
    params.append("metadata[giftAmount]", data.giftAmount || "");
    params.append("metadata[addons]", addonsString);

    if (data.email) {
      params.append("customer_email", data.email);
    }

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const stripeData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error("Stripe error:", stripeData);
      return new Response(
        JSON.stringify({ error: "Stripe error", details: stripeData }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ url: stripeData.url }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Worker error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
