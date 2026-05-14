import {NextRequest, NextResponse} from "next/server";
import Stripe from "stripe";
import {getStripeClient} from "@/lib/stripe";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const supabaseAdmin = createSupabaseAdminClient();

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      {error: "Missing STRIPE_WEBHOOK_SECRET"},
      {status: 500},
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      {error: "Missing Stripe signature"},
      {status: 400},
    );
  }

  const rawBody = await req.arrayBuffer();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(rawBody),
      sig,
      WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({error: "Invalid signature"}, {status: 400});
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const teamId = session.metadata?.team_id;
        const subscriptionId = session.subscription as string | null;

        if (teamId && subscriptionId) {
          await supabaseAdmin
            .from("teams")
            .update({
              plan: "pro",
              stripe_subscription_id: subscriptionId,
              plan_expires_at: null,
            })
            .eq("id", teamId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        await supabaseAdmin
          .from("teams")
          .update({
            plan: "free",
            stripe_subscription_id: null,
          })
          .eq("stripe_subscription_id", subscriptionId);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("Stripe invoice payment failed", {
          invoiceId: invoice.id,
          customerId: invoice.customer,
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Error handling Stripe webhook event", err);
    return NextResponse.json({received: true}, {status: 500});
  }

  return NextResponse.json({received: true});
}

