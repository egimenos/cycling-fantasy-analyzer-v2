CREATE TABLE "ml_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"race_slug" varchar(255) NOT NULL,
	"year" integer NOT NULL,
	"predicted_score" real NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ml_scores_unique" UNIQUE("rider_id","race_slug","year","model_version")
);
--> statement-breakpoint
ALTER TABLE "ml_scores" ADD CONSTRAINT "ml_scores_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ml_scores_race_version_idx" ON "ml_scores" USING btree ("race_slug","year","model_version");--> statement-breakpoint
CREATE INDEX "ml_scores_version_idx" ON "ml_scores" USING btree ("model_version");