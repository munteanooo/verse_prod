# Hosting and recovery

Initial development runs locally with a zero infrastructure cost target. GitHub Actions and Vercel are optional while working locally. Vercel Hobby is restricted to personal, non-commercial use, including on a custom domain. Review account eligibility, build and function quotas, short runtime log retention and repository ownership restrictions before connecting a project. Evaluate providers or plans that explicitly permit commercial use before launching commercially. Use portable interfaces and approve billing separately. Sources are the [Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel limits](https://vercel.com/docs/limits) and [terms](https://vercel.com/legal/terms).

Neon and Cloudflare R2 are proposed hosted options. Confirm current terms, quotas, billing requirements, connectivity, egress, recoverability and retention before using either. Use serverless-compatible PostgreSQL connections and an S3-compatible API. Account for function execution time, memory and request size, and avoid persistent local files and background processes.

## Future recovery procedure

Plan encrypted backups in failure-independent storage. Export PostgreSQL with `pg_dump`, including authentication data, pattern versions and file metadata. Copy or back up object data independently, with restic where appropriate. Keep versioned manifests tying database snapshots to assets. Restore with `pg_restore` and recover assets into isolated infrastructure. Verify row counts, integrity, checksums and authorized access using synthetic accounts. Set retention, recovery point and recovery time targets before launch and document tested results. No backup or restore has been performed in Phase 1.

## Phase 2 PostgreSQL and email

Neon remains optional and requires approval. Its Free plan documentation lists 1 GB of storage, 100 CU-hours and 5 GB of monthly public transfer per project, five-minute idle suspension and six hours of restore history. Running out of compute or transfer can suspend database connections. Storage exhaustion can prevent writes. Recheck quotas, region, latency and policies before provisioning. [Neon plans](https://neon.com/docs/introduction/plans)

Use Neon only for PostgreSQL. Once approved, create the `verse_prod` database with separate runtime and operator logins. Use a pooled endpoint for `DATABASE_URL` and a direct endpoint for `DATABASE_MIGRATION_URL`. Use `sslmode=verify-full` for both. Run migrations manually and grant runtime privileges as described in [Identity database](identity.md). [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

Set `VERSE_SITE_URL`, `DATABASE_URL` and a generated `BETTER_AUTH_SECRET` in approved Vercel environments. Keep the migration URL outside Vercel. For real delivery, configure an approved SMTP service with a verified sender as `VERSE_EMAIL_FROM` and a TLS-verified `smtps://` endpoint as `VERSE_SMTP_URL`. Confirm both flows with a real recipient. Mailpit is for local testing. Provider selection, sender DNS, verifying that platform logs omit auth request bodies, alerting and restore testing remain deployment work.
