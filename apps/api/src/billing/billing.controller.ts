import { BadRequestException, Body, Controller, Headers, Logger, Post, RawBodyRequest, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { OrgRole } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { BillingService } from "./billing.service";
import { CheckoutDto } from "./dto/checkout.dto";

@Controller("billing")
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billing: BillingService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(OrgRole.owner)
  @Post("checkout")
  createCheckout(@Body() dto: CheckoutDto) {
    return this.billing.createCheckoutSession(dto.plan);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(OrgRole.owner)
  @Post("portal")
  createPortal() {
    return this.billing.createPortalSession();
  }

  // Sin guards: Stripe llama esta ruta directamente, autenticada solo por
  // la firma del webhook (no por un JWT de usuario).
  @Post("webhook")
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature?: string) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException("Webhook de Stripe sin cuerpo o firma");
    }
    const event = this.billing.constructEvent(req.rawBody, signature);
    try {
      await this.billing.handleEvent(event);
    } catch (error) {
      this.logger.error(`Error procesando evento de Stripe ${event.type}: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
    return { received: true };
  }
}
