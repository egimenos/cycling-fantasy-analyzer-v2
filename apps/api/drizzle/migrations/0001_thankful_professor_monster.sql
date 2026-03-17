-- Migrate existing 'final' category rows to 'gc' (classic results)
UPDATE "race_results" SET "category" = 'gc' WHERE "category" = 'final';--> statement-breakpoint
ALTER TABLE "race_results" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."result_category";--> statement-breakpoint
CREATE TYPE "public"."result_category" AS ENUM('gc', 'stage', 'mountain', 'sprint');--> statement-breakpoint
ALTER TABLE "race_results" ALTER COLUMN "category" SET DATA TYPE "public"."result_category" USING "category"::"public"."result_category";
