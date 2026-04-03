CREATE TABLE "developer_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"developer_id" integer NOT NULL,
	"order_id" varchar(100),
	"payment_id" varchar(100),
	"plan" varchar(20),
	"billing_cycle" varchar(20),
	"amount" integer,
	"currency" varchar(10) DEFAULT 'USD',
	"status" varchar(20) DEFAULT 'created',
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "plan_start_date" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "plan_end_date" timestamp;--> statement-breakpoint
ALTER TABLE "developer_payments" ADD CONSTRAINT "developer_payments_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;