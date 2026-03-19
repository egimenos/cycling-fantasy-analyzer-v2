CREATE TYPE "public"."parcours_type" AS ENUM('p1', 'p2', 'p3', 'p4', 'p5');--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "parcours_type" "parcours_type";--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "is_itt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "is_ttt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "race_results" ADD COLUMN "profile_score" integer;