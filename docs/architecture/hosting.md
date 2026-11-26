# Hosting and recovery

Initial development runs locally with a zero infrastructure cost target. GitHub Actions and Vercel are optional while working locally. Vercel Hobby is restricted to personal, non-commercial use, including on a custom domain. Review account eligibility, build and function quotas, short runtime log retention and repository ownership restrictions before connecting a project. Evaluate providers or plans that explicitly permit commercial use before launching commercially. Use portable interfaces and approve billing separately. Sources are the [Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel limits](https://vercel.com/docs/limits) and [terms](https://vercel.com/legal/terms).

Neon and Cloudflare R2 are proposed for later phases. Confirm current terms, quotas, billing requirements, connectivity, egress, recoverability and retention before using either. Use serverless-compatible PostgreSQL connections and an S3-compatible API. Account for function execution time, memory and request size, and avoid persistent local files and background processes.

## Future recovery procedure

Plan encrypted backups in failure-independent storage. Export PostgreSQL with `pg_dump`, including authentication data, pattern versions and file metadata. Copy or back up object data independently, with restic where appropriate. Keep versioned manifests tying database snapshots to assets. Restore with `pg_restore` and recover assets into isolated infrastructure. Verify row counts, integrity, checksums and authorized access using synthetic accounts. Set retention, recovery point and recovery time targets before launch and document tested results. No backup or restore has been performed in Phase 1.
