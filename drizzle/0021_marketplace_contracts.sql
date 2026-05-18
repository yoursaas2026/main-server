CREATE TABLE "contract_amendments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"amendment_number" integer NOT NULL,
	"proposed_by_client" boolean NOT NULL,
	"proposer_id" integer NOT NULL,
	"scope_text" text NOT NULL,
	"deadline_at" timestamp NOT NULL,
	"additional_amount_paise" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) NOT NULL,
	"counterparty_approved_at" timestamp,
	"razorpay_order_id" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contract_disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"opened_by_client" boolean NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"admin_resolution" text,
	"refund_client_paise" integer DEFAULT 0,
	"release_developer_paise" integer DEFAULT 0,
	"retain_platform_paise" integer DEFAULT 0,
	"resolved_at" timestamp,
	"resolved_by_admin_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"from_status" varchar(48),
	"to_status" varchar(48) NOT NULL,
	"actor_role" varchar(24) NOT NULL,
	"actor_id" integer,
	"meta_json" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"amendment_id" integer,
	"purpose" varchar(32) NOT NULL,
	"order_id" varchar(100),
	"payment_id" varchar(100),
	"amount_paise" integer NOT NULL,
	"status" varchar(20) DEFAULT 'created',
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(36) NOT NULL,
	"client_id" integer NOT NULL,
	"developer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"status" varchar(48) NOT NULL,
	"plan_tier" varchar(16),
	"scope_text" text NOT NULL,
	"deliverables_text" text,
	"deadline_at" timestamp NOT NULL,
	"gross_amount_paise" integer NOT NULL,
	"non_refundable_fee_paise" integer DEFAULT 0 NOT NULL,
	"escrow_amount_paise" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'INR',
	"locked_fields_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp,
	"completed_at" timestamp,
	"client_decision_deadline_at" timestamp,
	"escrow_frozen" boolean DEFAULT false,
	"developer_released_paise" integer,
	"platform_released_paise" integer,
	"payout_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "contracts_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_disputes" ADD CONSTRAINT "contract_disputes_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_disputes" ADD CONSTRAINT "contract_disputes_resolved_by_admin_id_admins_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_amendment_id_contract_amendments_id_fk" FOREIGN KEY ("amendment_id") REFERENCES "public"."contract_amendments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_product_id_developer_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."developer_products"("id") ON DELETE no action ON UPDATE no action;