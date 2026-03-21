ALTER TYPE "public"."result_category" ADD VALUE 'gc_daily';--> statement-breakpoint
ALTER TYPE "public"."result_category" ADD VALUE 'mountain_pass';--> statement-breakpoint
ALTER TYPE "public"."result_category" ADD VALUE 'sprint_intermediate';--> statement-breakpoint
ALTER TYPE "public"."result_category" ADD VALUE 'regularidad_daily';--> statement-breakpoint
ALTER TABLE "race_results" DROP CONSTRAINT "race_results_unique";--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "climb_category" varchar(4);--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "climb_name" varchar(100);--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "sprint_name" varchar(100);--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "km_marker" real;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_unique" UNIQUE("rider_id","race_slug","year","category","stage_number","climb_name","sprint_name");