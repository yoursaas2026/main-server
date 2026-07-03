CREATE TABLE "marketing_campaign_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"subscriber_id" integer,
	"email" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"error_message" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"html_content" text NOT NULL,
	"text_content" text,
	"list_id" integer NOT NULL,
	"template_id" integer,
	"status" varchar(20) DEFAULT 'draft',
	"from_email" varchar(255) NOT NULL,
	"from_name" varchar(120) NOT NULL,
	"created_by_marketing_user_id" integer,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"total_recipients" integer DEFAULT 0,
	"sent_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_by_marketing_user_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"source" varchar(40) DEFAULT 'footer',
	"unsubscribe_token" varchar(64) NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "marketing_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token"),
	CONSTRAINT "marketing_subscribers_list_id_email_unique" UNIQUE("list_id","email")
);
--> statement-breakpoint
CREATE TABLE "marketing_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"html_content" text NOT NULL,
	"created_by_marketing_user_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"mailbox_email" text,
	"profile_picture" text,
	"status" varchar(20) DEFAULT 'active',
	"created_by_admin_id" integer,
	"reset_password_token" text,
	"reset_password_expiry" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "marketing_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DROP TABLE "newsletter_subscribers" CASCADE;--> statement-breakpoint
ALTER TABLE "marketing_campaign_sends" ADD CONSTRAINT "marketing_campaign_sends_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaign_sends" ADD CONSTRAINT "marketing_campaign_sends_subscriber_id_marketing_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."marketing_subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_list_id_marketing_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."marketing_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_template_id_marketing_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."marketing_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_marketing_user_id_marketing_users_id_fk" FOREIGN KEY ("created_by_marketing_user_id") REFERENCES "public"."marketing_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_subscribers" ADD CONSTRAINT "marketing_subscribers_list_id_marketing_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."marketing_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_templates" ADD CONSTRAINT "marketing_templates_created_by_marketing_user_id_marketing_users_id_fk" FOREIGN KEY ("created_by_marketing_user_id") REFERENCES "public"."marketing_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_users" ADD CONSTRAINT "marketing_users_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;