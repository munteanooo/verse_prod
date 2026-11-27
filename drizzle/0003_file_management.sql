CREATE TYPE "public"."file_purpose" AS ENUM('COVER_IMAGE', 'GALLERY_IMAGE', 'MEASUREMENT_ILLUSTRATION', 'PATTERN_SOURCE_PDF', 'PATTERN_A4_PDF', 'PATTERN_PREVIEW');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('PENDING', 'VALIDATED', 'READY', 'REJECTED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."pdf_mode" AS ENUM('A4', 'FULL');--> statement-breakpoint
CREATE TABLE "document_processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	"status" text DEFAULT 'PROCESSING' NOT NULL,
	"reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_job_status" CHECK ("document_processing_jobs"."status" in ('PROCESSING', 'READY', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "file_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"size_id" uuid,
	"piece_id" uuid,
	"definition_id" uuid,
	"provider" text NOT NULL,
	"object_key" text,
	"filename" text NOT NULL,
	"bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"media_type" text,
	"purpose" "file_purpose" NOT NULL,
	"status" "file_status" DEFAULT 'PENDING' NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"mode" "pdf_mode",
	"geometry" jsonb,
	"overview" jsonb,
	"pages" integer,
	"revision" integer,
	"reason" text,
	"confirmed_at" timestamp with time zone,
	"scale_reference" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleaned_at" timestamp with time zone,
	CONSTRAINT "file_assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "file_asset_size" CHECK ("file_assets"."bytes" > 0 and "file_assets"."position" >= 0 and "file_assets"."checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "pattern_withdrawals" (
	"pattern_id" uuid PRIMARY KEY NOT NULL,
	"withdrawn_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_patterns" (
	"user_id" text NOT NULL,
	"pattern_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_processing_jobs" ADD CONSTRAINT "document_processing_jobs_version_id_pattern_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pattern_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_version_id_pattern_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."pattern_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_creator_id_auth_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_size_fk" FOREIGN KEY ("version_id","size_id") REFERENCES "public"."pattern_size_variants"("version_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_piece_fk" FOREIGN KEY ("version_id","piece_id") REFERENCES "public"."pattern_pieces"("version_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_measurement_fk" FOREIGN KEY ("version_id","definition_id") REFERENCES "public"."pattern_required_measurements"("version_id","definition_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "pattern_withdrawals" ADD CONSTRAINT "pattern_withdrawals_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_patterns" ADD CONSTRAINT "saved_patterns_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_patterns" ADD CONSTRAINT "saved_patterns_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_jobs_active_idx" ON "document_processing_jobs" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "file_assets_version_idx" ON "file_assets" USING btree ("version_id","purpose","position");--> statement-breakpoint
CREATE INDEX "file_cleanup_idx" ON "file_assets" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "file_cover_ready" ON "file_assets" USING btree ("version_id") WHERE "file_assets"."purpose" = 'COVER_IMAGE' AND "file_assets"."status" = 'READY';--> statement-breakpoint
CREATE UNIQUE INDEX "file_print_ready" ON "file_assets" USING btree ("version_id","size_id") WHERE "file_assets"."purpose" = 'PATTERN_A4_PDF' AND "file_assets"."status" = 'READY';--> statement-breakpoint
CREATE UNIQUE INDEX "saved_patterns_owner_pattern" ON "saved_patterns" USING btree ("user_id","pattern_id");--> statement-breakpoint
DROP INDEX "public"."published_pattern_slug";
--> statement-breakpoint
CREATE INDEX "published_pattern_slug" ON "public"."pattern_versions" ("slug") WHERE "state" = 'PUBLISHED';
--> statement-breakpoint
CREATE FUNCTION "public"."guard_file_asset"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE target uuid;
current_state public.publication_state;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.version_id <> OLD.version_id THEN
    RAISE EXCEPTION 'Asset ownership cannot change' USING ERRCODE = '23514';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  SELECT state INTO current_state FROM public.pattern_versions WHERE id = target FOR SHARE;
  IF current_state IS DISTINCT FROM 'DRAFT' THEN
    IF TG_OP = 'UPDATE' AND OLD.status IN ('REJECTED','REMOVED') AND
       to_jsonb(NEW) - 'cleaned_at' = to_jsonb(OLD) - 'cleaned_at' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Historical assets cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "guard_file_asset" BEFORE INSERT OR UPDATE OR DELETE ON "file_assets"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_file_asset"();
--> statement-breakpoint
CREATE FUNCTION "public"."require_publication_actor"(actor text, session_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.auth_sessions s
   JOIN public.auth_users u ON u.id = s.user_id
   JOIN public.user_roles r ON r.user_id = u.id
   JOIN public.privileged_sessions m ON m.session_id = s.id
   WHERE s.id = session_key AND u.id = actor AND r.role = 'ADMIN'
     AND u.email_verified AND u.two_factor_enabled AND s.expires_at > now()
     AND m.verified_at > now() - interval '12 hours'
 )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."require_publication_actor"(text,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION "public"."publish_pattern_version"(target uuid, version_key uuid, expected_revision integer, actor text, session_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v public.pattern_versions%ROWTYPE;
BEGIN
  IF NOT public.require_publication_actor(actor, session_key) THEN RETURN false; END IF;
  PERFORM 1 FROM public.patterns WHERE id = target AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v FROM public.pattern_versions WHERE id = version_key AND pattern_id = target AND state = 'DRAFT'
    AND revision = expected_revision FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.categories WHERE id = v.category_id AND NOT archived FOR SHARE;
  IF NOT FOUND OR v.name = '' OR v.slug = '' OR v.short = '' OR v.description = '' OR v.materials = '' OR v.instructions = ''
     OR v.difficulty IS NULL OR (v.price_kind = 'PREMIUM' AND (v.amount IS NULL OR v.currency IS NULL))
     OR NOT EXISTS (SELECT 1 FROM public.pattern_pieces p WHERE p.version_id = v.id)
     OR EXISTS (SELECT 1 FROM public.pattern_pieces p WHERE p.version_id = v.id AND p.name = '')
     OR NOT EXISTS (SELECT 1 FROM public.pattern_required_measurements m WHERE m.version_id = v.id)
     OR NOT EXISTS (SELECT 1 FROM public.pattern_size_variants s WHERE s.version_id = v.id)
     OR NOT EXISTS (SELECT 1 FROM public.file_assets a WHERE a.version_id = v.id AND a.purpose = 'COVER_IMAGE'
       AND a.status = 'READY' AND a.object_key IS NOT NULL AND a.media_type = 'image/webp' AND a.alt <> '')
     OR EXISTS (SELECT 1 FROM public.file_assets a WHERE a.version_id = v.id AND a.status = 'PENDING')
     THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.pattern_size_variants s WHERE s.version_id = v.id AND (
      s.label = '' OR EXISTS (
        SELECT 1 FROM public.pattern_required_measurements m WHERE m.version_id = v.id AND m.required AND NOT EXISTS (
          SELECT 1 FROM public.pattern_size_measurement_ranges r WHERE r.version_id = v.id AND r.size_id = s.id AND r.definition_id = m.definition_id
        )
      ) OR NOT EXISTS (
        SELECT 1 FROM public.file_assets output WHERE output.version_id = v.id AND output.size_id = s.id
          AND output.purpose = 'PATTERN_A4_PDF' AND output.status = 'READY' AND output.revision = v.revision
          AND output.object_key IS NOT NULL AND output.media_type = 'application/pdf' AND output.pages > 0
      ) OR NOT (
        (SELECT count(*) FROM public.file_assets a WHERE a.version_id=v.id AND a.size_id=s.id
          AND a.purpose='PATTERN_SOURCE_PDF' AND a.status='VALIDATED') = 1
        AND EXISTS (SELECT 1 FROM public.file_assets a WHERE a.version_id=v.id AND a.size_id=s.id
          AND a.purpose='PATTERN_SOURCE_PDF' AND a.status='VALIDATED' AND a.piece_id IS NULL
          AND a.confirmed_at IS NOT NULL AND a.object_key IS NOT NULL)
        OR (
          NOT EXISTS (SELECT 1 FROM public.file_assets a WHERE a.version_id=v.id AND a.size_id=s.id
            AND a.purpose='PATTERN_SOURCE_PDF' AND a.status='VALIDATED' AND (a.piece_id IS NULL OR a.confirmed_at IS NULL OR a.object_key IS NULL))
          AND NOT EXISTS (SELECT 1 FROM public.pattern_pieces p WHERE p.version_id=v.id AND
            (SELECT count(*) FROM public.file_assets a WHERE a.version_id=v.id AND a.size_id=s.id AND a.piece_id=p.id
             AND a.purpose='PATTERN_SOURCE_PDF' AND a.status='VALIDATED') <> 1)
        )
      )
    )
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.pattern_size_variants a JOIN public.pattern_size_variants b
      ON a.version_id = b.version_id AND a.id < b.id
    WHERE a.version_id = v.id
      AND EXISTS (SELECT 1 FROM public.pattern_size_measurement_ranges x
        JOIN public.pattern_size_measurement_ranges y USING (version_id, definition_id)
        WHERE x.version_id=v.id AND x.size_id=a.id AND y.size_id=b.id)
      AND NOT EXISTS (SELECT 1 FROM public.pattern_size_measurement_ranges x
        JOIN public.pattern_size_measurement_ranges y USING (version_id, definition_id)
        WHERE x.version_id=v.id AND x.size_id=a.id AND y.size_id=b.id AND (x.max < y.min OR y.max < x.min))
  ) THEN RETURN false; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v.slug, 5005));
  IF EXISTS (SELECT 1 FROM public.pattern_versions w WHERE w.slug=v.slug AND w.state='PUBLISHED' AND w.pattern_id<>target)
    THEN RETURN false; END IF;
  UPDATE public.pattern_versions SET state = 'PUBLISHED', published_at = now(), updated_at = now() WHERE id = v.id;
  UPDATE public.patterns SET updated_at = now() WHERE id = target;
  DELETE FROM public.pattern_withdrawals WHERE pattern_id = target;
  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."publish_pattern_version"(uuid,uuid,integer,text,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION "public"."withdraw_pattern"(target uuid, actor text, session_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT public.require_publication_actor(actor, session_key) THEN RETURN false; END IF;
  PERFORM 1 FROM public.patterns WHERE id = target AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.pattern_versions WHERE pattern_id = target AND state = 'PUBLISHED') THEN RETURN false; END IF;
  INSERT INTO public.pattern_withdrawals (pattern_id) VALUES (target) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.patterns SET updated_at = now() WHERE id = target;
  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."withdraw_pattern"(uuid,text,text) FROM PUBLIC;
