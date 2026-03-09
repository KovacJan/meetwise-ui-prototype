import {NextRequest, NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {getStripeClient} from "@/lib/stripe";

type Body = {
  locale?: string;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const stripe = getStripeClient();

    let body: Body = {};
    try {
      body = await req.json();
    } catch {
      // optional body; ignore parse errors
    }

    const locale = body.locale || "en";
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const priceId = process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        {error: "STRIPE_PRO_PRICE_ID is not configured"},
        {status: 500},
      );
    }

    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {error: "Unauthorized"},
        {status: 401},
      );
    }

    // Load team for this manager/user
    const {data: team, error: teamError} = await supabase
      .from("teams")
      .select("id, name, plan, stripe_customer_id")
      .eq("manager_id", user.id)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        {error: "Team not found for current user"},
        {status: 400},
      );
    }

    // Create or reuse Stripe customer
    let customerId = team.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: team.name,
        metadata: {team_id: team.id},
      });
      customerId = customer.id;

      await supabase
        .from("teams")
        .update({stripe_customer_id: customerId})
        .eq("id", team.id);
    }

    const successUrl = `${baseUrl}/${locale}/upgrade/success`;
    const cancelUrl = `${baseUrl}/${locale}/upgrade`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        team_id: team.id,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        {error: "Failed to create checkout session"},
        {status: 500},
      );
    }

    return NextResponse.json({url: session.url});
  } catch (err) {
    console.error("Stripe create-checkout error", err);
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error while creating checkout session.";
    return NextResponse.json({error: message}, {status: 500});
  }
}

