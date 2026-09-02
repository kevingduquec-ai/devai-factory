-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "stripe_price_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

