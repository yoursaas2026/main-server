CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" text NOT NULL,
	"phone" varchar(20),
	"password" text NOT NULL,
	"name" text NOT NULL,
	"profile_picture" text,
	"role" varchar(20) DEFAULT 'admin',
	"permissions" text,
	"is_super_admin" boolean DEFAULT false,
	"can_manage_developers" boolean DEFAULT true,
	"can_manage_clients" boolean DEFAULT true,
	"can_manage_admins" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'active',
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "admins_username_unique" UNIQUE("username"),
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" varchar(20),
	"password" text NOT NULL,
	"profile_picture" text,
	"company_name" text,
	"company_website" text,
	"industry" varchar(100),
	"address" text,
	"city" varchar(100),
	"country" varchar(100),
	"tax_id" varchar(50),
	"billing_address" text,
	"is_verified" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "clients_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" varchar(20),
	"password" text NOT NULL,
	"profile_picture" text,
	"bio" text,
	"skills" text,
	"experience" integer,
	"portfolio_url" text,
	"github_url" text,
	"linkedin_url" text,
	"is_verified" boolean DEFAULT false,
	"is_available" boolean DEFAULT true,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "developers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DROP TABLE "users" CASCADE;