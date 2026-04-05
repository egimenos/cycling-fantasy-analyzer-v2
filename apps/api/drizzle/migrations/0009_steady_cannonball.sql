CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"race_type" "race_type" NOT NULL,
	"race_class" "race_class" NOT NULL,
	"year" integer NOT NULL,
	"start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "races_slug_year_unique" UNIQUE("slug","year")
);
