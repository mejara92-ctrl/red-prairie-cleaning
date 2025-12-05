// netlify/functions/create-checkout-session.js

// Uses Stripe's HTTP API directly via fetch (Node 18 has global fetch).
// Expects a POST with JSON containing either:
//   { customer: {...}, booking: {...} }
// or a flat body with at least { email, total }.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.error("Missing STRIPE_SECRET_KEY env var");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Stripe not configured on server" }),
      };
    }

    const baseUrl = process.env.BASE_URL || "https://redprairiecleaning.com";

    const data = JSON.parse(event.body || "{}");

    // Try to be flexible about the body shape
    let customer = data.customer || {};
    let booking = data.booking || {};

    if (!customer.email && data.email) {
      customer.email = data.email;
    }
    if (!customer.name && data.name) {
      customer.name = data.name;
    }
    if (!booking.total && (data.total || data.amount)) {
      booking.total = Number(data.total || data.amount);
    }

    // Fallbacks for other booking fields
    booking.beds = booking.beds || data.beds || "";
    booking.baths = booking.baths || data.baths || "";
    booking.cleaningType =
      booking.cleaningType || data.cleaningType || "Cleaning";
    booking.frequency = booking.frequency || data.frequency || "One-time";
    booking.serviceLabel =
      booking.serviceLabel || data.serviceLabel || "Red Prairie Cleaning";

    const total = Number(booking.total);
    if (!customer.email || !total || Number.isNaN(total)) {
      console.error("Bad request body:", data);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing or invalid booking/customer info (need email + total).",
        }),
      };
    }

    const totalAmount = Math.round(total * 100); // dollars -> cents
    const desc = `Beds: ${booking.beds}, Baths: ${booking.baths}, Type: ${booking.cleaningType}, Frequency: ${booking.frequency}`;

    const params = new URLSearchParams();

    // Basic session config
    params.append("mode", "payment");
    params.append("payment_method_types[0]", "card");
    params.append("success_url", `${baseUrl}/?booking=success`);
    params.append("cancel_url", `${baseUrl}/?booking=cancelled`);

    // Customer
    params.append("customer_email", customer.email);

    // Line item
    params.append("line_items[0][price_data][currency]", "usd");
    params.append(
      "line_items[0][price_data][product_data][name]",
      booking.serviceLabel
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

    // Optional metadata
    const metadata = {
      customer_name: customer.name || "",
      customer_phone: customer.phone || data.phone || "",
      address: customer.address || data.address || "",
      city: customer.city || data.city || "",
      zip: customer.zip || data.zip || "",
      preferred_date: customer.preferredDate || data.preferredDate || "",
      notes: customer.notes || data.notes || "",
      beds: String(booking.beds || ""),
      baths: String(booking.baths || ""),
      cleaning_type: booking.cleaningType || "",
      frequency: booking.frequency || "",
      total: String(total),
    };

    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(`metadata[${key}]`, String(value));
      }
    });

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
        statusCode: stripeResponse.status || 500,
        body: JSON.stringify({
          error: "Stripe checkout failed",
          stripeError: session.error || session,
        }),
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
