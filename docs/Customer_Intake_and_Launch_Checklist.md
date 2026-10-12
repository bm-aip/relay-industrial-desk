# Q-mate customer intake and launch checklist

**Pilot product:** Q-mate — Quote Automate  
**Branding updated:** 12 October 2026

**Use one copy per customer.** Refer to the accompanying launch guide for current prototype limits and implementation procedures. Record credential references only; do not enter passwords, access tokens or client secrets here.

## A. Owners and objective

| Field | Customer response |
|---|---|
| Customer trading/legal name, branch/company ID | |
| Customer sponsor and pilot decision maker | |
| Sales/process owner | |
| Product/catalogue owner | |
| Primary technical/commercial approvers | |
| Backup approvers and coverage hours | |
| IT administrator / ERP implementation partner | |
| Incident and escalation contacts | |
| Your implementation lead, engineer and operator | |
| Current problem and desired measurable result | |
| Normal/peak weekly enquiry volume and typical line count | |
| Current human minutes per case and elapsed turnaround | |
| Pilot scope, fee, target decision date and success criteria | |

## B. Pilot boundaries

- Workflow and eligible enquiry types:
- Pilot product selection, covering representative mixed categories:
- Inbound channel/account:
- Business data source and exact company/branch:
- Allowed input formats/languages:
- Supported outputs and separately authorized writes:
- Approvals required for quotes/messages/system writes:
- Out-of-scope actions and manual handling:
- Response targets, working hours and daily usage/spend limits:
- Maximum permitted price/stock age at dispatch, final recheck and approval expiry:
- Changes after approval that hold delivery or require a new approved revision:
- Stop conditions and manual fallback owner:
- Requirements for customer-facing dashboard access:

## C. Channel and application inventory

Copy this table for **each** channel/application. Include local desktop software and spreadsheet workflows.

| Field | Customer response / evidence |
|---|---|
| Vendor, product, release, edition and subscription plan | |
| Cloud/local, hosting region and account owner | |
| Organization/company/tenant/branch identifiers | |
| Account admin and software partner | |
| Documentation/API/interface and licensed access | |
| Required operations: read messages/products/prices/stock/customers; send messages; create quotes/tasks | |
| Authentication method and approved permission scopes | |
| Secure credential reference and expiry/renewal owner | |
| Dedicated test account/recipient list/sandbox | |
| Field dictionary and sample payload/export location | |
| Quotas, data refresh needs and acceptable staleness | |
| Inbound callback/polling and retry/delivery semantics | |
| Provider idempotency support and uncertain-send reconciliation/manual procedure | |
| Existing adapter status: simulated / needs building / tested live | |
| Local bridge, company-loaded/uptime requirements if applicable | |
| Administrator authorization recorded where | |

For WhatsApp, also record business/phone ownership, current app/provider, onboarding eligibility, messaging permissions, approved templates and opt-out handling. For email, record the exact mailbox, reply handling and authorized sender/domain. For local Tally, record release, loaded company, approved local interface and secure bridge/export procedure.

## D. Data and commercial policy

| Dataset or rule | Source/owner | Format/location | Updated at / refresh | Verified? |
|---|---|---|---|---|
| Unique SKUs and product descriptions/categories | | | | |
| Manufacturer part numbers, brands, specs and aliases | | | | |
| Units, pack sizes, minimum quantities and conversions | | | | |
| Standard selling prices/currency/effective dates | | | | |
| Customer/contract prices and quantity breaks | | | | |
| Discount/margin policy and exception authority | | | | |
| Available stock/reservations/warehouse/lead times | | | | |
| Buyer master IDs and permitted contacts | | | | |
| Commercial/tax/rounding/freight/payment/credit rules | | | | |
| Approved quote template and validity/delivery wording | | | | |
| Historical enquiries, quotes, revisions and outcomes | | | | |
| Technical documents for supported products | | | | |

Source-of-truth conflicts and resolution:

Unknown/missing values and human-review handling:

The current demonstration CSV supports only `sku,name,category,unit,price,stock,aliases,source`. Required fields are `sku,name,category,price,stock`; aliases use `|`. Other production fields need an extended schema/adapter. Do not upload confidential real data to the shared demo or use invented commercial values for a live quote.

## E. Routing and follow-ups

| Priority | Condition | Queue / owner | Backup | Response target / escalation |
|---|---|---|---|---|
| | Missing/ambiguous product or quantity | | | |
| | High value / commercial exception | | | |
| | Category/channel rule | | | |
| | Enquiry spanning several categories | | | |
| | Default case | | | |

The prototype supports ordered, single-condition rules and fictional team choices. Real team management, compound rules and timed escalation must be implemented if required.

- Follow-up delay, working hours and maximum attempts:
- Approved message/template and approver:
- Recipient permission evidence and opt-out handling:
- Cancellation triggers: reply, order, decline, opt-out, other:
- Final pre-dispatch cancellation/conversation/revision check and race-test evidence:
- Failed/uncertain delivery handling:

## F. Data access and reporting

- Authorized data and processing purpose:
- Approved team/customer roles and access boundaries:
- Approved hosting/service providers and regions:
- Authorized AI/OCR/transcription use, if any:
- Retention, export, deletion and backup retention:
- Incident notification contact and agreed procedure:
- Secure authorization/agreement reference:
- Baseline period, sample size and case selection:
- Total human effort, including rework/fallbacks:
- Turnaround definition and response target:
- Correction/follow-up definitions and denominators:
- Linked order source; method for measuring any revenue claim:
- Agreed loaded hourly cost:
- Your setup/support hours and vendor cost tracking:
- Dashboard recipients, review schedule and decision criteria:

### Measurable acceptance and operating limits

Complete applicable rows and obtain customer/implementation approval before scheduling live work. Mark an item inapplicable with a reason rather than leaving it blank. The recommended launch gate is that all critical tests pass with no unresolved critical access, approval or duplicate-processing failures.

| Criterion | Agreed threshold / unit | Test or baseline sample size | Observed result / evidence | Approver |
|---|---|---|---|---|
| Critical acceptance tests | All pass; no unresolved critical failures | | | |
| Correct product/quantity/unit extraction and safe clarification | | | | |
| Commercial accuracy and permissible correction rate | | | | |
| Turnaround / human-effort target | | | | |
| Maximum price/stock age and approval validity | | | | |
| Daily enquiry/message volume and spend cap | | | | |
| Exception/incident response target | | | | |
| Backup retention, recovery time and tolerable data loss | | | | |

## G. Readiness gates

### Before setup is scheduled

- [ ] Named process owner, primary/backup reviewer and account admin.
- [ ] Pilot scope, commercial agreement and processing authorization recorded.
- [ ] Exact stack inventoried; adapter gaps and provider approvals identified.
- [ ] Representative authorized samples and usable product/commercial data received.
- [ ] Data source, refresh policy, metrics and pilot acceptance criteria agreed.

### Before real data is ingested

- [ ] Individual identities and customer access checks implemented and tested.
- [ ] Appropriate staging/production separation, secret handling and data controls.
- [ ] Only authorized data/records/scopes are accessed.
- [ ] Approved providers and retention established; logs redact confidential details.

### Before live sends or business-system writes

- [ ] Selected real adapters implemented; sample-mapping tests alone are insufficient.
- [ ] Validated commercial output and stale-data rules.
- [ ] Send-time freshness, approval expiry and changes-after-approval handling tested.
- [ ] Real approver identities and immutable approved revisions.
- [ ] Signed/authenticated ingestion, deduplication and durable jobs.
- [ ] Outbound/write idempotency and uncertain-result reconciliation.
- [ ] Delivery failures, replies and follow-up cancellation tested.
- [ ] Final dispatch checks prevent a queued follow-up after reply/order/opt-out.
- [ ] Limits, alerts, credential expiry and manual fallback tested.
- [ ] Backup restoration and restart/recovery tested without duplicate sends/writes.
- [ ] Primary/backup operators trained; limited cohort/volume cap agreed.
- [ ] Customer process/IT owners and your implementation lead accepted the pilot.
- [ ] Applicable measurable thresholds/limits above are completed and accepted.

## H. Acceptance-test record

Copy rows as needed. Include normal cases across mixed categories, ambiguous products, missing quantities, stale data, pricing/units, multi-category routing, revisions, duplicate events, uncertain delivery, provider/bridge failures, unauthorized access, replies/opt-outs, recovery and reporting.

| Test ID and scenario | Expected result | Actual result / evidence | Pass/fail | Reviewer / date |
|---|---|---|---|---|
| | | | | |

Unresolved blocking failures:

Approved launch configuration/release version:

Staging/live account and company mapping evidence:

Launch approvers and dates:

## I. Operating handover

| Item | Owner / record |
|---|---|
| Daily queue, exceptions and delivery review | |
| Data sync / local bridge health | |
| Follow-up queue and customer escalation | |
| Engineering incident contact and response coverage | |
| Backup schedule, restore evidence and recovery objective | |
| Usage/cost limits and alerts | |
| Credential renewal/revocation | |
| Weekly impact and service-economics review | |
| Pilot decision meeting | |
| Offboarding export/deletion/revocation procedure | |

When onboarding the next customer, reuse the structure and tested adapter, then independently authorize and verify their accounts, data, prices, routing, approvers and reporting baseline.
