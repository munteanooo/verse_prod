# File management and pattern distribution

## Storage and lifecycle

Phase 5 adds `file_assets`, `document_processing_jobs`, `pattern_withdrawals` and `saved_patterns`. File records bind each object to a single version and, where used, a size, piece or measurement from that same version using composite foreign keys. The bounded binary files stay outside PostgreSQL. The draft save replaces ordered child rows within a transaction, so file association foreign keys are deferred until commit. Remove an attachment before permanently removing its corresponding piece, size or measurement.

The ObjectStorage interface covers upload grants, metadata, reading, writing, deletion and authorized delivery. With S3, the browser receives a five-minute PUT grant for a random quarantine key, with the expected byte count in the signature. A separate completion request independently checks object length and SHA-256, parses the content and moves validated bytes or a raster derivative to a new server-only object key. No browser gets a write grant to a validated key. Image derivatives are WebP, auto-oriented and stripped of metadata, up to 1,600 pixels along either dimension. Only derivatives are delivered publicly, after checking the active published version. PDFs remain private. Completion is idempotent once the status is final.

The local adapter requires explicit configuration, a private absolute path outside the web root and a loopback canonical origin. It is disabled on Vercel. Local upload PUTs require MFA, the original uploading administrator and a signed binding to the byte count, object and expiry. Local downloads are attachments from the authorized endpoint. Hosted storage uses private S3 objects and attachment redirects with 60-second signed URLs. The browser requests a grant through a same-origin JSON mutation before navigating to it.

Use the cleanup control in the wizard review for expired sessions and rejected or removed objects. Configure a separate S3 lifecycle rule expiring only the quarantine prefix `q/` after one day. The runtime never applies automatic expiry to trusted objects. Successful local validation removes the temporary quarantine object. An abrupt process or storage failure can leave a trusted object without a referenced row. Reconcile such objects through an operator inventory after checking active jobs and all historical references before deletion. Keep backups and storage lifecycle decisions separate from application access.

## Processing geometry

PDFs must start with the PDF signature and parse without accepting invalid objects or encryption. Reject annotations, attachments, JavaScript, launch actions, interactive forms, external file references and other unsupported interactive features. Decoding and structural inspection are format validation, not malware scanning.

Use PDF's 72 points per inch and 25.4 mm per inch. A4 is exactly 210 × 297 mm. Accept user unit 1, an in-bounds CropBox with finite coordinates, nonzero origins and quarter-turn page rotations. Validate existing A4 to within 0.5 mm on each axis. A single verified pre-tiled source is delivered byte for byte. A combined job can copy pre-tiled pages and tile other pages in the same output. No scaling transform is applied to any pattern page.

For each axis use a stride of printable extent minus overlap. Tile count is `1 + max(0, ceil((extent - printable - epsilon) / stride))`, with epsilon `1e-7` PDF points. Clip to the visible source window, normalize origin and rotation, translate at unit scale, and emit tiles in row-major order, top to bottom. Use a dedicated A4 guide sheet for the 50 mm calibration square and assembly overview. Add alignment marks in the margins outside source geometry. Reopen and revalidate generated output before storing it. The administrator certifies the source scale against an independent known reference. The customer must print at 100% and measure the control mark physically.

## Limits and deployment configuration

| Variable               |    Default | Allowed range                                          |
| ---------------------- | ---------: | ------------------------------------------------------ |
| `STORAGE_PDF_BYTES`    |  8,000,000 | 1,000–16,000,000 per source and per size job aggregate |
| `STORAGE_IMAGE_BYTES`  |  3,000,000 | 1,000–8,000,000 input bytes                            |
| `STORAGE_SOURCE_PAGES` |          8 | 1–16 pages per complete job                            |
| `STORAGE_SOURCE_MM`    |      1,800 | 297–3,000 mm in each axis                              |
| `STORAGE_OUTPUT_PAGES` |         70 | 2–150 pages including the guide                        |
| `STORAGE_OUTPUT_BYTES` | 12,000,000 | 1,000–24,000,000 output bytes                          |
| `STORAGE_WORKER_MS`    |      6,500 | 500–12,000 ms                                          |
| `STORAGE_CONCURRENT`   |          2 | 1–4 concurrent render leases                           |

Image decoding limits input to 24 million pixels, 6,500 pixels per axis and a two-million-byte output. PDF work runs in a worker thread with a 128 MiB old-generation heap limit and a hard termination timer. Render requests acquire PostgreSQL leases across instances and also have a per-process worker cap. The route awaits processing and storage before returning. Expired leases stop counting against concurrency. No background promise is relied on for completion. The hosted route declares a 45-second function budget and uses direct S3 uploads and signed downloads, keeping PDF transfers outside Vercel's request and response payload limits. Vercel documents a 4.5 MB default payload limit. [Vercel function limits](https://vercel.com/docs/functions/limitations)

A local synthetic 1,051-byte vector PDF of 320 × 430 mm produced a five-page, 6,315-byte A4 PDF in 14 ms in one in-process render, excluding worker startup, network, storage and database work. The geometry test checks the embedded 100 mm ruler, a 50 mm guide dimension, A4 size and quarter-turn transforms. A separate worker-thread run took 96 ms including startup and termination. These measurements are specific to the synthetic input. The worker heap cap does not bound all native codec or ArrayBuffer memory. Exercise large and adversarial samples in the target runtime during the deployment security review.

Set `STORAGE_PROVIDER=local` and `STORAGE_LOCAL_ROOT` for loopback development or set `STORAGE_PROVIDER=s3`, `STORAGE_ENDPOINT` (HTTPS S3 origin), `STORAGE_REGION` (`auto` for R2), `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` for approved hosting. Missing configuration leaves file operations closed.

Cloudflare R2 currently offers Standard storage allowances of 10 GB-month, 1 million Class A operations and 10 million Class B operations per month, with free Internet egress. Enabling R2 requires subscription checkout, and usage above the allowances can incur charges. Enable only after approval. Keep the bucket private and use object-level credentials scoped to that bucket. Configure CORS with the exact canonical application origin, PUT and the required headers, including Content-Type. Hosted uploads need the S3 endpoint, since R2 presigned URLs do not use custom domains. The application permits that HTTPS origin in the relevant CSP directives. Verify signed lengths, CORS, attachment redirects and object-level permissions against the approved bucket before enabling hosted publication. [R2 quickstart](https://developers.cloudflare.com/r2/get-started/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Presigning](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) · [CORS](https://developers.cloudflare.com/r2/buckets/cors/)

## Publication, access and runtime grants

Publication runs in one transaction with audit. The application validates current draft metadata and checks the required cover and printable objects. A security-definer function with a fixed search path checks current verified administrator MFA, locks the pattern and draft revision, checks associated sources, scale confirmation, ready A4 per size, cover, category, sizing and absence of pending uploads. It serializes the publication slug so competing patterns cannot claim it. Runtime credentials do not get direct version-state updates. Published versions and their assets stay immutable. A changed draft revision requires regenerating the printable document. Starting a new draft from published content preserves the previous version and requires attaching files to the new draft.

Withdrawal hides the published pattern without rewriting any historical row. Republishing requires a new prepared draft. Archive also hides the stable identity. Guest PDF delivery rechecks the current release and requested version, associated size, ready artifact and FREE pricing. Premium PDFs remain private and require a future entitlement design. A signed URL already issued can be used until expiry. The library holds owner-scoped references to free patterns and hides entries when the current pattern is withdrawn, archived or premium. It does not retain access to withdrawn downloads.

Apply the following in addition to the Phase 2–4 grants after running the migration as the operator.

```sql
GRANT SELECT, INSERT, UPDATE ON file_assets, document_processing_jobs TO verse_runtime;
GRANT SELECT ON pattern_withdrawals TO verse_runtime;
GRANT SELECT, INSERT, DELETE ON saved_patterns TO verse_runtime;
GRANT EXECUTE ON FUNCTION publish_pattern_version(uuid,uuid,integer,text,text) TO verse_runtime;
GRANT EXECUTE ON FUNCTION withdraw_pattern(uuid,text,text) TO verse_runtime;
```

The operator owns DDL and the publication functions. Keep AWS request logging and request-body logging disabled. Run provider tests, malware risk review, storage recovery checks and physical print verification before hosted use.
