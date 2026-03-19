CREATE TABLE "startlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_slug" varchar(255) NOT NULL,
	"year" integer NOT NULL,
	"rider_id" uuid NOT NULL,
	"team_name" varchar(255),
	"bib_number" integer,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "startlist_entries_unique" UNIQUE("race_slug","year","rider_id")
);
--> statement-breakpoint
ALTER TABLE "startlist_entries" ADD CONSTRAINT "startlist_entries_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "startlist_entries_race_idx" ON "startlist_entries" USING btree ("race_slug","year");