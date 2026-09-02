import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { SubscriptionPlan } from "@devai-factory/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";

type SelfServicePlan = "starter" | "team";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly priceIds: Record<SelfServicePlan, string | undefined>;
  private readonly appUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
  ) {
    const secretKey = config.get<string>("STRIPE_SECRET_KEY");
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.priceIds = {
      starter: config.get<string>("STRIPE_PRICE_STARTER"),
      team: config.get<string>("STRIPE_PRICE_TEAM"),
    };
    this.appUrl = config.get<string>("APP_URL", "http://localhost:3000");
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        "La facturación con Stripe todavía no está configurada en este entorno. Configura STRIPE_SECRET_KEY para activarla.",
      );
    }
    return this.stripe;
  }

  async createCheckoutSession(plan: SelfServicePlan): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const priceId = this.priceIds[plan];
    if (!priceId) {
      throw new BadRequestException(
        `No hay un precio de Stripe configurado para el plan "${plan}" (falta STRIPE_PRICE_${plan.toUpperCase()} en el entorno).`,
      );
    }

    const orgId = this.tenant.currentUser.orgId;
    const org = await this.tenant.client.organization.findUniqueOrThrow({ where: { id: orgId } });
    const user = await this.tenant.client.user.findUniqueOrThrow({ where: { id: this.tenant.currentUser.userId } });

    const customerId = org.billingCustomerId ?? (await this.createCustomer(org.id, org.name, user.email));

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.appUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${this.appUrl}/dashboard/billing?checkout=canceled`,
      client_reference_id: orgId,
      subscription_data: { metadata: { orgId } },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new BadRequestException("Stripe no devolvió una URL de checkout");
    }
    return { url: session.url };
  }

  async createPortalSession(): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const orgId = this.tenant.currentUser.orgId;
    const org = await this.tenant.client.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (!org.billingCustomerId) {
      throw new BadRequestException("Esta organización todavía no tiene una suscripción de Stripe activa.");
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: org.billingCustomerId,
      return_url: `${this.appUrl}/dashboard/billing`,
    });
    return { url: session.url };
  }

  private async createCustomer(orgId: string, orgName: string, email: string): Promise<string> {
    const stripe = this.requireStripe();
    const customer = await stripe.customers.create({ name: orgName, email, metadata: { orgId } });
    await this.tenant.client.organization.update({ where: { id: orgId }, data: { billingCustomerId: customer.id } });
    return customer.id;
  }

  /** Verifica la firma del webhook contra el raw body — solo el controller tiene acceso a él. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new BadRequestException("STRIPE_WEBHOOK_SECRET no está configurado");
    }
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.client_reference_id;
        if (orgId && typeof session.customer === "string") {
          await this.prisma.bypassRls().organization.update({
            where: { id: orgId },
            data: { billingCustomerId: session.customer },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.syncSubscription(event.data.object as Stripe.Subscription, false);
        break;
      case "customer.subscription.deleted":
        await this.syncSubscription(event.data.object as Stripe.Subscription, true);
        break;
      default:
        break;
    }
  }

  private planForPriceId(priceId: string | undefined): SubscriptionPlan | null {
    if (!priceId) return null;
    if (priceId === this.priceIds.starter) return SubscriptionPlan.STARTER;
    if (priceId === this.priceIds.team) return SubscriptionPlan.TEAM;
    return null;
  }

  private async syncSubscription(subscription: Stripe.Subscription, canceled: boolean): Promise<void> {
    const db = this.prisma.bypassRls();
    let orgId = subscription.metadata?.orgId;
    if (!orgId) {
      const org = await db.organization.findFirst({ where: { billingCustomerId: subscription.customer as string } });
      if (!org) {
        this.logger.warn(`Webhook de Stripe sin organización identificable para customer ${subscription.customer}`);
        return;
      }
      orgId = org.id;
    }

    const priceId = subscription.items.data[0]?.price.id;
    const plan = this.planForPriceId(priceId);
    const periodEndSeconds = subscription.items.data[0]?.current_period_end;

    await db.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        orgId,
        plan: plan ?? SubscriptionPlan.STARTER,
        status: canceled ? "canceled" : mapStripeStatus(subscription.status),
        currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
        seats: subscription.items.data[0]?.quantity ?? 1,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
      },
      update: {
        plan: plan ?? undefined,
        status: canceled ? "canceled" : mapStripeStatus(subscription.status),
        currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
        seats: subscription.items.data[0]?.quantity ?? 1,
        stripePriceId: priceId,
      },
    });

    if (canceled) {
      // Sin suscripción activa en Stripe = sin acceso — igual que una
      // organización que nunca se suscribió, queda confinada a Facturación
      // hasta que pague de nuevo o el super-admin la reactive a mano. El
      // plan queda registrado (no se borra) para saber qué tenía contratado.
      await db.organization.update({ where: { id: orgId }, data: { subscriptionActive: false } });
    } else if (plan) {
      // Suscripción confirmada por Stripe — activa el acceso igual que lo
      // haría el super-admin manualmente.
      await db.organization.update({ where: { id: orgId }, data: { plan, subscriptionActive: true } });
    }
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "canceled" | "trialing" {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "trialing":
      return "trialing";
    default:
      return "canceled";
  }
}
