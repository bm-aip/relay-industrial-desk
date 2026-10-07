# Relay Industrial Desk

A functional prototype of a configurable sales desk for distributors with mixed industrial catalogues. Your operations team manages separate customer workspaces, catalogues, routing rules, channel mappings, quote review and impact reports. The shared workflow stays the same as customer configuration changes. No n8n is used.

**Prototype scope:** all historical records are fictional, all external connections and deliveries are simulated, and extraction uses deterministic SKU/alias matching. There are no live WhatsApp, email, ERP, CRM or AI calls. Selecting a connector configures a capability contract and sample payload mapping; it does not connect that provider.

## Run locally

Requires Node.js 24. No packages or external services are required.

```sh
npm start
```

Open `http://127.0.0.1:3000` and select **Enter sample workspace**. The local demo password is `demo-sales-desk`; this shortcut is disabled in production. Node's experimental SQLite warning is expected.

```sh
npm run check
npm test
```

## Deploy on Railway

1. Create a Railway project from this GitHub repository. Railway detects the included Dockerfile. In service Settings, set Healthcheck Path to `/health`, Healthcheck Timeout to `120`, and On Failure restart retries to `3`.
2. Add a persistent volume to the application service mounted at `/app/data`. Keep **one replica**; this prototype uses a local SQLite database, not a distributed database.
3. In service Variables, set `TEAM_PASSWORD` to a unique password of at least 16 characters. Enter it directly in Railway; never commit it. Set `PORT=3000`. `NODE_ENV=production`, `HOST=0.0.0.0` and `DATA_DIR=/app/data` are set by the Dockerfile. Set `SEED_DEMO=true` to load sample customers on an empty database, or `false` to start empty.
4. Deploy and generate an HTTPS Railway domain with target port `3000`, matching the service's `PORT` variable.
5. Check `/health` returns `status: ok`, then sign in with the team password. Add an enquiry, draft and review a quote, record a simulated send, and check Activity history.

New Railway services cannot opt into the deprecated `railway.json` configuration, so this prototype uses dashboard settings. See [Railway configuration documentation](https://docs.railway.com/config-as-code), [health checks](https://docs.railway.com/deployments/healthchecks) and [persistent volumes](https://docs.railway.com/volumes).

The production server refuses to start without a password of at least 16 characters. Records persist only if the volume is mounted correctly. Sessions are held in memory and end on service restart. Back up the volume before destructive changes; do not delete it to reset a demo. Database seeding only happens when the customer table is empty; changing `SEED_DEMO` does not erase existing data.

## Walk through the prototype

1. Review **Customer impact**, its methodology and the CSV report. Switch between two sample distributors.
2. In **Work queue**, add an enquiry such as `Please quote 30 × SKF-6205-2RS; 2 × ABB-ACS355-2.2`. Use one item per line or separate items with semicolons.
3. Check the matched catalogue products and routing decision. Missing quantities, unknown products and ambiguous aliases require clarification.
4. Draft a quote. Verify prices, quantities, stock and discounts against the catalogue. Record all review/correction effort and confirm commercial review before approval.
5. Record a simulated send; this creates a follow-up task. Follow-ups require a manual action in this version. Link a fictional order to complete the example.
6. Change customer routing rules or connector payload mappings, and use the sample payload test. Import the included sample CSV or add products manually.
7. Create a new customer workspace. It starts without historical activity and displays zero or unavailable impact metrics until work is recorded.

## Impact methodology

- Estimated effort returned: each approved enquiry's baseline snapshot minus all reported review and correction minutes; negative savings are retained.
- Capacity value: estimated hours multiplied by the customer's configured hourly cost. It is not cash savings.
- Quote turnaround: median elapsed minutes from receipt to approval. This is separate from human effort.
- On-time follow-ups: non-cancelled follow-ups due in the reporting period with a simulated send recorded on or before the deadline, divided by all non-cancelled follow-ups due in that period.
- Correction rate: approved enquiries in the period that required corrections, divided by approved enquiries in the period.
- Linked order value: recorded orders, without claiming incremental revenue or causal attribution.

Headline metrics support 7, 30 and 90 days; the effort chart shows the most recent 30 days at most. Multi-category enquiries appear in each relevant category, so category rows are not additive. Sample data cannot validate real customer ROI; pilot baseline and effort measurements are required.

## Architecture and extension points

`src/domain.mjs` owns validation, catalogue matching, routing, quote transitions and reporting. `src/store.mjs` provides SQLite transactions and customer-scoped activity records. `server.mjs` provides the authenticated JSON API and serves the interface in `public/`. `src/seed.mjs` supplies fictional demonstration data. Data lives in `DATA_DIR/relay.sqlite`.

Customer configuration includes catalogue, pricing/stock snapshots, enabled connector capabilities, safe dot-path payload mappings, ordered routing rules, defaults, quote policy and impact baselines. Supported capability contracts are `receive_message`, `send_message`, `read_products`, `read_prices`, `read_stock`, `read_customers`, `write_quote` and `write_task`.

To connect a real provider, implement its authentication, inbound signature verification, capability-specific API calls, idempotency, retries and delivery receipts behind these contracts. Replace simulated receipt creation only after provider results are verified. Keep human quote approval and catalogue-backed prices. Adapter implementation is necessary for each provider; choosing a name alone cannot make every application compatible.

Authenticated endpoints use `/api/customers/:customerId/...` for enquiries, products, rules, connectors and settings. `/api/bootstrap` returns the selected workspace; `/api/report.csv` exports its impact. Mutations require the session's `X-CSRF-Token`. Connector test/ingest endpoints accept sample JSON payloads; they are not public provider webhook endpoints. See `test/api.test.mjs` for request examples.

## Limits before a real customer pilot

This is an internal team prototype with a shared password, not customer-level authentication. All team members can access all customer workspaces. It has no per-user roles, SSO, billing, background job worker, live integration, OCR/attachment processing, voice transcription, AI extraction or production monitoring. Quote sent/won transitions lock editing; catalogue changes do not silently reprice existing drafts. Basic source-message deduplication applies to direct enquiry intake; the simulated mapped-payload ingest endpoint has no provider retry contract.

Use a proper identity provider, per-customer access controls, managed database, encrypted provider credentials, durable job queue, inbound verification, observability and backup policy before processing real business data at scale. These are extension milestones, not claims of completed features.

