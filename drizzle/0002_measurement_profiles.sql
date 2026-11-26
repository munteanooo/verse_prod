CREATE TABLE "measurement_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_revision_nonnegative" CHECK ("measurement_profiles"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "measurement_values" (
	"profile_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"length" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"unit" "pattern_length_unit" NOT NULL,
	"precision" integer,
	"min" integer NOT NULL,
	"max" integer NOT NULL,
	CONSTRAINT "profile_definition_pk" PRIMARY KEY("profile_id","definition_id"),
	CONSTRAINT "profile_measurement_bounds" CHECK ("measurement_values"."min" >= 0 and "measurement_values"."max" <= 10000000 and "measurement_values"."length" between "measurement_values"."min" and "measurement_values"."max" and ("measurement_values"."precision" is null or "measurement_values"."precision" between 0 and 3))
);
--> statement-breakpoint
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_values" ADD CONSTRAINT "measurement_values_profile_id_measurement_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."measurement_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_values" ADD CONSTRAINT "measurement_values_definition_id_measurement_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."measurement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurement_profiles_owner_idx" ON "measurement_profiles" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "measurement_values_definition_idx" ON "measurement_values" USING btree ("definition_id");