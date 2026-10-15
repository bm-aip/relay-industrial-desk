# Q-mate 0.2 — pre-customer release

Prepared 15 October 2026. No customer accounts or live providers are required to evaluate this release.

## First login after upgrading the Railway app

1. Open Q-mate. The first-login form asks for a setup key, your name, email and a new individual password.
2. Enter the existing Railway TEAM_PASSWORD directly into **Setup key**. Alternatively, an administrator may provision BOOTSTRAP_PASSWORD in Railway. Never paste either password into a chat or commit it.
3. Choose your own email/name and a new password of at least 16 characters. Save it in your password manager.
4. After creating this account, use **email + individual password**. The old team password no longer signs anyone in.
5. In **People & access**, create individual team members. Operators prepare work, commercial approvers approve it, viewers see only their assigned impact dashboards, and administrators manage all workspaces and configuration.
6. Provision another trusted administrator before changing or disabling the original administrator. The app prevents removing the final active administrator.

The setup key is used only while no users exist. Session tokens are stored hashed in SQLite, survive application restarts and are revoked when an administrator updates an account. Cookies remain HttpOnly; production cookies require HTTPS. SSO, recovery email, MFA and invitation delivery are not implemented; administrators currently provision/reset passwords and share them securely.

## Existing data and rollback

The SQLite filename, volume path and infrastructure identifiers are retained. Existing workspaces are not deleted or reseeded.

Before adding identity/job tables to an existing legacy database, startup creates DATA_DIR/backups/pre-v0.2-TIMESTAMP.sqlite. A backup error stops the upgrade. This copy is in the same volume; copy it to an authorized separate location for protection against volume loss.

Surviving legacy quote approvals and cumulative effort are imported as legacy records. Older revisions overwritten by version 0.1 cannot be reconstructed. Unknown original matching outcomes are excluded from matching-quality percentages. Fictional legacy assignees become Unassigned.

Confirm the Railway volume still mounts at /app/data. Do not delete/reset it. For rollback, stop the app, preserve the current database, restore the complete pre-upgrade snapshot with an authorized operator and deploy the matching older application. Simply downgrading code and continuing to write upgraded records is not a supported rollback.

## Implemented

- Conservative matching holds unknown items, unrecognized SKU suffixes, negative quantities and unaccounted specifications for review.
- Reviewers can correct/add/remove product lines and quantities even when matching appeared complete.
- New drafts refresh catalogue values. Approval and dispatch check changed price/stock/unit/pack/supply terms, commercial policy, source age and approval/quote expiry.
- Pack sizes, minimum quantities, lead times, product tax rates and customer price breaks keyed by buyer ID. Backorders require explicit confirmation and a recorded lead time.
- Immutable approved snapshots, named approvers and additive review/fallback effort. Sent quotes support a new revision and fresh approval.
- Printable approved quotation: open a revision, then browser Print → Save as PDF.
- Individual identities, workspace roles, actor-attributed activity and persistent revocable sessions.
- Intake connector/message identity separate from outbound destination; stable source-message deduplication on direct and mapped sample intake.
- Persisted simulation delivery/follow-up jobs with final eligibility checks, pause, held-job review and controlled retry/cancellation.
- Operator-recorded buyer replies/declines/opt-outs stop pending follow-ups. This is not a connected inbox.
- Catalogue import preview, five prior catalogue snapshots and an administrator rollback API.
- Clean workspaces by default; fictional sample catalogues require an explicit demo choice.
- Pilot setup/readiness, actual team assignment and role-specific customer, operator and admin views.
- Impact evidence: first-approval cohorts, cumulative effort, initial-match observations, funnel, sample size, 90th-percentile turnaround and separate service economics.
- Verified backup command, automated restoration tests and CI regression/permission tests.

## Remaining boundaries

**Every provider connector is still simulated.** There are no real WhatsApp, email, ERP/CRM, AI, OCR, attachment or transcription calls. Mapping tests are not connectivity tests. The application reports zero verified live adapters; the live-connection readiness gate remains incomplete.

Simulation jobs are persisted workflow records, but a simulated outcome is not provider acceptance/delivery. A live adapter must add authentication, verified ingestion, provider operations/receipts, secure credentials, idempotency and uncertain-result reconciliation.

Keep one Railway replica. SQLite and whole-workspace documents remain for bounded evaluation. PostgreSQL/indexed records/pagination, distributed workers, external alerts and off-volume backup scheduling are later infrastructure work.

Commercial calculations need validation against a customer's approved ERP/policies before live use. Structured fields are not a complete tax engine or a guarantee of technical product suitability.

Compound routing, business-hour scheduling, backup-owner escalation, resuming an opted-out conversation under renewed permission, advanced attribution and OCR/AI remain scoped future work. Recorded responses hold the conversation; do not bypass a hold to resume communication.

## Evaluate without a customer

1. Start locally with Node 24 and no setup/team password. Select Enter sample workspace. Local-only demo: demo@qmate.local / demo-sales-desk-2026. Production never auto-provisions that identity.
2. Add an enquiry mixing a known SKU and an unknown item; verify it requires review.
3. Correct the lines, write a revision reason, draft, record additional effort and approve.
4. Export revision one. Revise it and verify earlier approvals/documents/effort remain.
5. Queue simulated delivery. Refresh after the worker runs; inspect Delivery & health.
6. Record a buyer reply and verify pending follow-up cancellation.
7. Change catalogue/policy after approval and verify the dispatch hold.
8. Create a viewer scoped to one workspace and sign in separately; verify only that impact dashboard is available.
9. Create a clean workspace and fill Pilot setup/Customer settings. Live readiness stays incomplete.

## Backup

Run npm run backup with the app's DATA_DIR. BACKUP_DIR can specify an authorized destination. The command opens the existing source without seeding, writes a new timestamped snapshot and verifies SQLite integrity; it never overwrites an existing database. The Docker image includes the script.

Configure scheduling, retention, restricted access and off-volume copying with the deployment owner. Same-volume snapshots do not provide disaster recovery. Automated tests restore fictional customer, user and job records; also perform a controlled drill on the actual hosting environment before agreeing customer recovery commitments.
