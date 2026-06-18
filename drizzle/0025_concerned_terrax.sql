ALTER TABLE "contract_amendments" RENAME COLUMN "razorpay_order_id" TO "payment_order_id";--> statement-breakpoint
ALTER TABLE "developers" RENAME COLUMN "payout_razorpay_fund_account_id" TO "payout_cashfree_beneficiary_id";--> statement-breakpoint
ALTER TABLE "developers" DROP COLUMN "payout_razorpay_contact_id";