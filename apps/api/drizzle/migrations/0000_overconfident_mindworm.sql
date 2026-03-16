CREATE TYPE "public"."race_class" AS ENUM('UWT', 'Pro', '1');--> statement-breakpoint
CREATE TYPE "public"."race_type" AS ENUM('grand_tour', 'classic', 'mini_tour');--> statement-breakpoint
CREATE TYPE "public"."result_category" AS ENUM('gc', 'stage', 'mountain', 'sprint', 'final');--> statement-breakpoint
CREATE TYPE "public"."scrape_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "race_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"race_slug" varchar(255) NOT NULL,
	"race_name" varchar(255) NOT NULL,
	"race_type" "race_type" NOT NULL,
	"race_class" "race_class" NOT NULL,
	"year" integer NOT NULL,
	"category" "result_category" NOT NULL,
	"position" integer,
	"stage_number" integer,
	"dnf" boolean DEFAULT false NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_results_unique" UNIQUE("rider_id","race_slug","year","category","stage_number")
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pcs_slug" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"current_team" varchar(255),
	"nationality" char(2),
	"last_scraped_at" timestamp with time zone,
	CONSTRAINT "riders_pcs_slug_unique" UNIQUE("pcs_slug")
);
--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_slug" varchar(255) NOT NULL,
	"year" integer NOT NULL,
	"status" "scrape_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"records_upserted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE cascade ON UPDATE no action;