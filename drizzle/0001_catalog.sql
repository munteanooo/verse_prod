CREATE TYPE "public"."pattern_difficulty" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED');--> statement-breakpoint
CREATE TYPE "public"."pattern_length_unit" AS ENUM('mm', 'cm');--> statement-breakpoint
CREATE TYPE "public"."pattern_price_kind" AS ENUM('FREE', 'PREMIUM');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "category_order_positive" CHECK ("categories"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "measurement_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"unit" "pattern_length_unit" NOT NULL,
	"precision" integer,
	"min" integer NOT NULL,
	"max" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_definitions_key_unique" UNIQUE("key"),
	CONSTRAINT "definition_bounds" CHECK ("measurement_definitions"."min" >= 0 and "measurement_definitions"."max" >= "measurement_definitions"."min" and "measurement_definitions"."max" <= 10000000),
	CONSTRAINT "definition_precision" CHECK ("measurement_definitions"."precision" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "pattern_required_measurements" (
	"version_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"required" boolean NOT NULL,
	"min" integer,
	"max" integer,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"unit" "pattern_length_unit" NOT NULL,
	"precision" integer,
	"default_min" integer NOT NULL,
	"default_max" integer NOT NULL,
	CONSTRAINT "pattern_required_measurements_version_id_definition_id_pk" PRIMARY KEY("version_id","definition_id"),
	CONSTRAINT "pattern_required_measurements_version_id_position_unique" UNIQUE("version_id","position"),
	CONSTRAINT "required_measurement_bounds" CHECK (coalesce("pattern_required_measurements"."min", "pattern_required_measurements"."default_min") >= "pattern_required_measurements"."default_min" and coalesce("pattern_required_measurements"."max", "pattern_required_measurements"."default_max") <= "pattern_required_measurements"."default_max" and coalesce("pattern_required_measurements"."min", "pattern_required_measurements"."default_min") <= coalesce("pattern_required_measurements"."max", "pattern_required_measurements"."default_max"))
);
--> statement-breakpoint
CREATE TABLE "pattern_pieces" (
	"version_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"fabric" text NOT NULL,
	"fold" boolean NOT NULL,
	"mirrored" boolean NOT NULL,
	"grainline" text NOT NULL,
	"seam" integer,
	CONSTRAINT "pattern_pieces_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "pattern_pieces_version_id_position_unique" UNIQUE("version_id","position"),
	CONSTRAINT "piece_limits" CHECK ("pattern_pieces"."position" >= 0 and "pattern_pieces"."quantity" between 1 and 100 and ("pattern_pieces"."seam" is null or "pattern_pieces"."seam" between 0 and 10000000))
);
--> statement-breakpoint
CREATE TABLE "pattern_size_variants" (
	"version_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "pattern_size_variants_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "pattern_size_variants_version_id_position_unique" UNIQUE("version_id","position")
);
--> statement-breakpoint
CREATE TABLE "pattern_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"state" "publication_state" DEFAULT 'DRAFT' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"slug" text DEFAULT '' NOT NULL,
	"short" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"materials" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"category_name" text,
	"category_slug" text,
	"difficulty" "pattern_difficulty",
	"price_kind" "pattern_price_kind" DEFAULT 'FREE' NOT NULL,
	"amount" integer,
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "pattern_versions_pattern_id_number_unique" UNIQUE("pattern_id","number"),
	CONSTRAINT "version_numbers_positive" CHECK ("pattern_versions"."number" > 0 and "pattern_versions"."revision" >= 0),
	CONSTRAINT "version_price" CHECK (("pattern_versions"."amount" is null or "pattern_versions"."amount" > 0) and ("pattern_versions"."currency" is null or "pattern_versions"."currency" ~ '^[A-Z]{3}$') and ("pattern_versions"."price_kind" <> 'FREE' or ("pattern_versions"."amount" is null and "pattern_versions"."currency" is null)))
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_size_measurement_ranges" (
	"version_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"min" integer NOT NULL,
	"max" integer NOT NULL,
	CONSTRAINT "size_ranges_pk" PRIMARY KEY("version_id","size_id","definition_id"),
	CONSTRAINT "size_range_bounds" CHECK ("pattern_size_measurement_ranges"."min" >= 0 and "pattern_size_measurement_ranges"."max" >= "pattern_size_measurement_ranges"."min" and "pattern_size_measurement_ranges"."max" <= 10000000)
);
--> statement-breakpoint
ALTER TABLE "pattern_required_measurements" ADD CONSTRAINT "pattern_required_measurements_version_id_pattern_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pattern_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_required_measurements" ADD CONSTRAINT "required_measurement_definition_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."measurement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_pieces" ADD CONSTRAINT "pattern_pieces_version_id_pattern_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pattern_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_size_variants" ADD CONSTRAINT "pattern_size_variants_version_id_pattern_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pattern_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_versions" ADD CONSTRAINT "pattern_versions_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_versions" ADD CONSTRAINT "pattern_versions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_size_measurement_ranges" ADD CONSTRAINT "size_ranges_variant_fk" FOREIGN KEY ("version_id","size_id") REFERENCES "public"."pattern_size_variants"("version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_size_measurement_ranges" ADD CONSTRAINT "size_ranges_measurement_fk" FOREIGN KEY ("version_id","definition_id") REFERENCES "public"."pattern_required_measurements"("version_id","definition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_order_idx" ON "categories" USING btree ("position","id");--> statement-breakpoint
CREATE INDEX "measurement_name_idx" ON "measurement_definitions" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "required_definition_idx" ON "pattern_required_measurements" USING btree ("definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "size_label_per_version" ON "pattern_size_variants" USING btree ("version_id",lower("label")) WHERE "pattern_size_variants"."label" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "one_draft_per_pattern" ON "pattern_versions" USING btree ("pattern_id") WHERE "pattern_versions"."state" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "published_pattern_slug" ON "pattern_versions" USING btree ("slug") WHERE "pattern_versions"."state" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "versions_category_idx" ON "pattern_versions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "versions_state_idx" ON "pattern_versions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "patterns_owner_idx" ON "patterns" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "patterns_updated_idx" ON "patterns" USING btree ("updated_at","id");--> statement-breakpoint
CREATE INDEX "size_ranges_definition_idx" ON "pattern_size_measurement_ranges" USING btree ("version_id","definition_id");--> statement-breakpoint
CREATE FUNCTION "public"."guard_pattern_version"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'DRAFT' THEN
      RAISE EXCEPTION 'Versions begin as drafts' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR OLD.state <> 'DRAFT' THEN
    RAISE EXCEPTION 'Historical versions cannot be modified' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.pattern_id <> OLD.pattern_id OR NEW.number <> OLD.number THEN
    RAISE EXCEPTION 'Version identity cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "guard_pattern_version"
BEFORE INSERT OR UPDATE OR DELETE ON "pattern_versions"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_pattern_version"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_pattern_version_child"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  version_key uuid;
  version_state public.publication_state;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.version_id <> NEW.version_id THEN
    RAISE EXCEPTION 'Version ownership cannot change' USING ERRCODE = '23514';
  END IF;
  version_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  SELECT state INTO version_state FROM "public"."pattern_versions" WHERE id = version_key FOR SHARE;
  IF version_state IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Historical version details cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "guard_pattern_piece" BEFORE INSERT OR UPDATE OR DELETE ON "pattern_pieces"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_pattern_version_child"();
--> statement-breakpoint
CREATE TRIGGER "guard_pattern_measurement" BEFORE INSERT OR UPDATE OR DELETE ON "pattern_required_measurements"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_pattern_version_child"();
--> statement-breakpoint
CREATE TRIGGER "guard_pattern_size" BEFORE INSERT OR UPDATE OR DELETE ON "pattern_size_variants"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_pattern_version_child"();
--> statement-breakpoint
CREATE TRIGGER "guard_size_range" BEFORE INSERT OR UPDATE OR DELETE ON "pattern_size_measurement_ranges"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_pattern_version_child"();
