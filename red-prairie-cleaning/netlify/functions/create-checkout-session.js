// netlify/functions/create-checkout-session.js

// Node 18+ on Netlify has global fetch available, so we don't need any npm packages.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { customer, booking } = body;

    if (!booking || !booking.total || !customer || !customer.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing booking or customer info" }),
      };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.error("Missing STRIPE_SECRET_KEY env var");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Stripe not configured on server" }),
      };
    }

    const totalAmount = Math.round(Number(booking.total) * 100); // dollars -> cents
    const serviceName = booking.serviceLabel || "Red Prairie Cleaning service";

    const desc = `Beds: ${booking.beds}, Baths: ${booking.baths}, Type: ${booking.cleaningType}, Frequency: ${booking.frequency}`;

    const baseUrl = process.env.BASE_URL || "https://redprairiecleaning.com";

    const params = new URLSearchParams();

    // Basic session config
    params.append("mode", "payment");
    params.append("payment_method_types[0]", "card");
    params.append("success_url", `${baseUrl}/?booking=success`);
    params.append("cancel_url", `${baseUrl}/?booking=cancelled`);

    // Customer email
    params.append("customer_email", customer.email);

    // Line item (single service)
    params.append("line_items[0][price_data][currency]", "usd");
    params.append(
      "line_items[0][price_data][product_data][name]",
      serviceName
    );
    params.append(
      "line_items[0][price_data][product_data][description]",
      desc
    );
    params.append(
      "line_items[0][price_data][unit_amount]",
      String(totalAmount)
    );
    params.append("line_items[0][quantity]", "1");

    // Metadata so you see everything in Stripe Dashboard
    const metadata = {
      customer_name: customer.name || "",
      customer_phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      zip: customer.zip || "",
      preferred_date: customer.preferredDate || "",
      notes: customer.notes || "",
      beds: String(booking.beds || ""),
      baths: String(booking.baths || ""),
      cleaning_type: booking.cleaningType || "",
      frequency: booking.frequency || "",
      addons: (booking.addons || [])
        .map((a) => `${a.label} ($${a.price || 0})`)
        .join(", "),
      base: String(booking.base || ""),
      addons_total: String(booking.addonsTotal || ""),
      discount_amount: String(booking.discountAmount || ""),
      total: String(booking.total || ""),
    };

    Object.entries(metadata).forEach(([key, value]) => {
      params.append(`metadata[${key}]`, value);
    });

    // Call Stripe's API directly
    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error("Stripe API error:", session);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Stripe checkout failed" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ sessionId: session.id }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create checkout session" }),
    };
  }
};
