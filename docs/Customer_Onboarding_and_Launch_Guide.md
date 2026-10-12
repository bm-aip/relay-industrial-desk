# Q-mate customer onboarding and launch guide

**Pilot product:** Q-mate — Quote Automate  
**For:** your team operating the modular industrial distributor system  
**Prepared:** 8 October 2026  
**Branding updated:** 12 October 2026  
**First pilot:** enquiry → product matching → quote draft → human approval → delivery → follow-up → linked order, if available.

## 1. Understand the starting point

Q-mate, abbreviated from Quote Automate, is the pilot product for this modular system. The application is a functional internal prototype. It has customer workspaces, mixed catalogues, routing rules, quote review, activity history and an impact dashboard. Its external channels, business-system connections and message deliveries are **simulated**. Product matching uses SKU/alias rules; it does not call an AI model.

Selecting WhatsApp, Tally or another connector currently configures sample payload mapping. It does not authorize an account or connect the provider. The shared team password also lets every signed-in team member access every customer workspace. A workspace is not a customer access boundary.

Use the prototype for demonstrations with fictional or sanitized examples. Before ingesting real customer business data, your engineer must implement appropriate identity, access, credential and data-handling controls. Before automated live operations, the chosen adapters and reliable processing also need to be built and tested.

There are two kinds of work:

| Work | When it happens | Who owns it |
|---|---|---|
| Platform foundations: authentication, customer access boundaries, real integrations, reliable jobs, monitoring and recovery | Build once, then maintain | Your engineering team |
| Customer onboarding: catalogue, mappings, commercial policies, routing, account authorization, baseline, training and acceptance | Repeat for each customer | Your implementation lead with the customer's process owner and IT admin |
| A previously unsupported provider or unusual workflow | Separate engineering scope | Your engineer, often with the customer's software partner |

Your plug-and-play model becomes practical as you accumulate tested adapters and reusable customer configurations. Compatibility must be confirmed for the customer's exact product, release, plan and required operations.

## 2. Run the first customer meeting

Book a working session with the sales/process owner. Ask them to demonstrate a recent enquiry from receipt through quotation, follow-up and order. Include the person who actually prepares quotes; involve IT or their ERP partner for the integration assessment.

Collect these answers:

1. Where do enquiries arrive, and how many arrive in a normal week and a busy week?
2. Who reads, matches, prices, approves, sends and follows up? Where does work wait or get lost?
3. Which product identifiers do buyers use: SKU, manufacturer part number, nickname, specification, photo or drawing?
4. Where are authoritative product, price, available-stock and customer records maintained?
5. How do prices vary by buyer, quantity, brand, branch, currency or contract? Who can approve exceptions?
6. What makes a quote unsafe to send: uncertain specification, outdated stock, missing quantity, tax treatment, delivery promise or credit issue?
7. Which software and accounts are used, including editions, versions, company/branch IDs and account administrators?
8. What result would justify paying: less human work, quicker replies, fewer mistakes or more completed follow-ups? How will it be measured?
9. Who will review drafts every day, approve the pilot, authorize access and handle incidents?
10. What information may your team and service providers process, where may it be stored, and what are the retention and deletion expectations?

Ask for a small authorized sample of completed enquiries, corresponding quotes and outcomes. **About 20–50 varied examples is a useful starting sample**, not a statistical guarantee. Include straightforward and difficult cases across their mixed catalogue, unsuccessful enquiries, revisions, missing quantities and long lists. Use sanitized examples for the current demo.

Leave the meeting with a written pilot brief, a named customer owner, an inventory of their stack and a list of outstanding inputs. Use the accompanying intake form.

## 3. Agree the pilot scope before requesting access

Start with one valuable workflow, one inbound channel and one authoritative business data source. The catalogue can contain multiple industrial product categories. Select a representative subset if the full catalogue needs substantial cleanup.

Specify:

- The inbound account and eligible enquiries: for example, a sales inbox receiving text RFQs across bearings, electrical and automation products.
- Supported input formats and languages. Route unsupported PDFs, photographs, voice messages and drawings to a person until processing for those formats exists.
- The source of truth for each field, its refresh interval, maximum acceptable age at dispatch and approval expiry. Agree what must be rechecked immediately before sending.
- The output: an internal draft, an approved buyer-facing quote, a CRM task or an ERP quote record. Each write requires its own permission and test.
- Who reviews technical suitability and commercial terms, who may approve, and who covers absences.
- Whether a person approves every message or only defined message types. Begin the pilot with explicit approval for quotes and follow-ups.
- Response targets, working hours, daily volume/spend limits, stop conditions, support contacts and manual fallback.
- Pilot fee, duration, included connectors, ongoing charges and what requires a scope change.

Fill in measurable launch criteria before scheduling live work: critical tests all passed, acceptable matching/correction results on the agreed test set, response targets, sync-age limits, volume/spend caps and recovery objectives. No unresolved critical access, approval or duplicate-processing failure should be accepted. Record the test-set size and actual observations; a clean sample is not a guarantee of future error-free operation.

Procurement, dispatch, invoice collections and payment reconciliation can be later modules. Their data and permissions are separate from this sales pilot.

## 4. Collect the customer information pack

### Business and ownership

Obtain the trading/legal name, branches, relevant company identifiers, contact details, quote branding and approved commercial wording. Record a sponsor, process owner, primary and backup approvers, IT/system administrator, catalogue owner and support contact. Your team needs an implementation lead, an integration engineer and a day-to-day operator; one person may hold several roles.

Agree account ownership, authorized processing, approved service providers, access boundaries, retention, incident communication, export/deletion and offboarding. Store documents in your approved restricted folder. Use credential references in the project record; enter actual secrets through a secure authorization flow or secret store, never an intake spreadsheet, chat or source repository.

### Catalogue, stock and pricing

| Input | What to request and verify |
|---|---|
| Product identity | Unique SKU, product name, category, brand/manufacturer, manufacturer part number, specifications and safe aliases. Similar names must not collapse distinct specifications. |
| Quantity conventions | Selling unit, pack size, minimum order and conversion rules: piece, box, metre, kilogram, etc. |
| Prices | Approved selling prices, currency, effective dates, customer/contract price lists, quantity breaks and authorized discount limits. Cost/margin data only when needed and authorized. |
| Stock | Available-to-sell versus physical/reserved stock, warehouse, last refresh, backorder and lead-time policy. A stock read is not a reservation. |
| Quote terms | Validity, freight, payment terms, delivery wording, rounding and applicable line-level tax treatment, confirmed by their commercial/accounts owner. |
| Buyer master | Stable customer ID, authorized contacts, account-specific prices/terms and relevant credit restrictions. |
| References | Approved quote examples/templates and product documentation. Drawings and suitability decisions require the customer's technical reviewer. |

Choose one authoritative source per field. For example, the ERP supplies prices and available stock while an approved catalogue supplies descriptions. Write down how conflicts are resolved. Do not let a language model invent a price, replacement product, stock balance or delivery commitment.

Do not encode unknown stock as zero or invent prices to satisfy the importer. Keep those items in human review until the data model and commercial controls support unknown values.

### Process, routing and follow-ups

Collect a routing table with priority, condition, queue, responsible person, response target and escalation. Agree the behavior of enquiries containing several categories, unmatched products, high values and absent approvers. Include a default owner so every case has a destination.

Record follow-up timing, working hours, maximum attempts, approved wording, recipient permission, and cancellation rules when a buyer replies, declines, orders or opts out. The prototype creates a follow-up task; it does not send it automatically.

### System inventory

For each channel and application, record vendor/product, release/edition/plan, cloud or local installation, hosting/data region, company/tenant/branch ID, administrator, API availability, documentation, authentication method, allowed operations, quotas and test environment. Obtain a field dictionary and representative sample payloads/exports.

Ask the customer admin to authorize narrowly scoped access. Initially request only the records needed for the pilot. Separate read access from permission to create quotes, tasks or other records. A customer having a software subscription does not establish that API access or every required endpoint is included.

### Impact baseline

Measure the current process using comparable cases before launch. Record total human minutes, elapsed time to approval, corrections, follow-ups due/completed, quote outcomes and linked orders. Include checking, rework and unsuccessful cases. Record the observation period, sample size and loaded hourly cost agreed with the customer.

The pilot must also record time your own team spends supporting that customer, along with infrastructure and provider charges. This determines whether the service is profitable for you.

## 5. Technical dependencies

### Shared platform

| Dependency | Purpose and current position |
|---|---|
| GitHub and engineering access | Versioned source, reviewed changes, adapter code and release tracking. The prototype repository already exists. |
| Railway, HTTPS and separate environments | Host the application and workers. Keep staging and production databases, credentials and recipient lists separate. A custom domain is optional. |
| Node.js 24 | Required by the current application. Its present local setup has no external npm dependencies. Production extensions will add dependencies. |
| Persistent database | Current prototype: SQLite on `/app/data`, one replica. Recommended shared production design: PostgreSQL with customer-scoped records and tested migrations. **Adding `DATABASE_URL` does not convert the current SQLite implementation.** |
| User identity and authorization | Individual team accounts, roles, customer access checks and audit identity. Customer dashboard access needs dedicated customer permissions; the shared password cannot provide this. |
| Secure provider authorization | OAuth/API-token handling, encrypted credential storage, refresh/revocation and secret rotation. Not implemented. |
| Durable job processing | Process inbound events, outbound messages, retries and scheduled follow-ups across restarts. A PostgreSQL-backed queue can avoid a separate Redis dependency; Redis is conditional on the chosen queue design. Not implemented. |
| Observability and recovery | Structured, redacted logs; queue/adapter alerts; backups; restore drills; incident contacts. An HTTP health check alone does not establish that integrations are working. |
| Customer configuration | Versioned catalogue mappings, commercial rules, routing, approvers and reporting settings. Current controls cover only the simplified prototype fields. |

PostgreSQL can be provisioned on Railway and accessed through its private network. Keep it private and configure backup/recovery rather than relying on successful deployment alone. See [Railway PostgreSQL](https://docs.railway.com/databases/postgresql) and [backup and restore guidance](https://docs.railway.com/guides/postgres-backups-restores).

### Dependencies selected by the customer's stack

| Customer uses | Required input and setup |
|---|---|
| WhatsApp | An authorized WhatsApp Business Platform setup, customer-owned business/phone assets, account admin, suitable provider access, HTTPS webhooks and approved templates when required. Confirm how their existing number can be onboarded with the chosen provider before changing it. Implement inbound verification, message sending and delivery-status handling. |
| Gmail / Google Workspace | Dedicated mailbox or approved mailbox access, Cloud/OAuth application setup, appropriate scopes and customer/admin authorization. Determine verification and security-assessment obligations for the chosen scopes and app use before promising a date. |
| Microsoft 365 email | Tenant/mailbox identity, Entra application configuration, selected Microsoft Graph mail permissions and required consent. Restrict access to approved mailboxes; avoid broad organization-wide access. |
| Other email or approved forwarding | Provider-supported inbound routing plus an authorized sending route. Configure sender-domain authentication where applicable and test replies/bounces. Forwarding alone does not implement sending or synchronization. |
| Cloud ERP / CRM | Supported API and subscription permissions, organization/region IDs, OAuth or service credentials, module/field mappings, test records and limits. Test read and write operations independently. |
| Tally or another local business system | Exact release, company identity, local administrator/partner, permitted integration interface and an approved network bridge. A cloud service cannot access a customer's `localhost`. See the Tally procedure below. |
| Excel / CSV | A controlled file location, file owner, agreed schema and refresh schedule. Manual imports can support an initial assisted service, but must display data age and require a final price/stock check. No automatic spreadsheet sync exists today. |
| Web forms / custom APIs | Form ownership, approved field schema, authenticated or signed ingestion, abuse controls, provider IDs and tested response/retry behavior. The prototype sample-ingest endpoint is not a public webhook. |
| PDFs, images or voice | Attachment storage/access, file checks and extraction/OCR/transcription services, with suitability testing. Conditional engineering work; unsupported today. |
| AI extraction or drafting | Chosen model provider, billing account/key, permitted data use, structured extraction, validation, evaluation examples and fallback. Optional for a deterministic text pilot; no AI service is called today. |

WhatsApp requires recipient permission and opt-out handling. Outside its 24-hour customer service window, replies require approved templates. Design follow-ups around these rules and check channel eligibility for the customer's actual goods. [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).

Gmail read scopes can be restricted; Google's documentation describes verification and server-side security assessment requirements. The engineer must establish the applicable requirements and any documented exceptions for this deployment. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). Microsoft distinguishes delegated and application mail permissions; choose and restrict the appropriate route with customer IT. [Microsoft Graph permissions](https://learn.microsoft.com/graph/permissions-reference).

For Zoho CRM, select module/operation scopes and the correct regional API domain; authorizing one organization does not authorize another. [Zoho scopes](https://www.zoho.com/crm/developer/docs/api/v8/scopes.html), [regional domains](https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html).

## 6. What you can configure in the prototype now

Use an internal demonstration workspace with fictional or sanitized data. These steps do not enable live integrations.

1. Open the deployed application and sign in using your team's stored password.
2. Go to **Customer workspaces → Add customer**. Enter distributor name and city. Uncheck **Start with the mixed sample catalogue and simulated Email / WhatsApp channels** to create a clean workspace. Leave it checked only when you want fictional sample products/connectors.
3. In **Product catalogue**, add products or import CSV. Required headers are `sku,name,category,price,stock`. The supported additional fields are `unit,aliases,source`.

```csv
sku,name,category,unit,price,stock,aliases,source
DEMO-BRG-01,Example sealed bearing,Bearings,piece,250,40,example bearing|demo bearing,Fictional demo
DEMO-SEN-01,Example proximity sensor,Automation,piece,900,15,example sensor,Fictional demo
```

Prices and stock above are invented. Aliases in CSV use `|`. Imports support 1–5,000 products per batch and files smaller than 1.5 MB. SKUs are matched case-insensitively; importing an existing SKU replaces its product fields. Keep a copy of the previous catalogue. Supply complete approved values rather than assuming omitted fields are preserved. Brand/specification, customer-specific pricing, tax classification and other production fields require schema and code extensions; extra CSV columns do not create those capabilities.

4. In **Customer settings**, configure measured baseline effort, reference time to approval, loaded hourly cost, maximum discount, illustrative tax rate, follow-up calendar days and default owner. Currency/timezone are fixed to INR/Asia-Kolkata. Owner options are fictional sample team members; real staff provisioning needs development. Baselines are saved with new enquiries, so later changes do not rewrite existing baselines.
5. In **Routing rules**, add prioritized conditions and use **Preview routing**. The lowest priority number is evaluated first, and the first matching rule chooses a queue/owner. Current fields are channel, category, value and matching completeness. Each rule has one condition; compound rules, business-hour escalation and dynamic real-team assignment require development. Human quote approval remains required.
6. In **Channels & systems**, configure a simulated connector's capabilities and sample JSON field mappings. Run the sample payload test. This validates normalization, not provider authentication, network connectivity or delivery.
7. In **Work queue**, add a sample enquiry with a quantity and SKU per line or separated by semicolons. Resolve missing/ambiguous products, prepare a quote, review quantities, suitability, stock and commercial terms, record total human effort and approve it. Use **Simulate quote delivery** only as a demonstration. Revisions need fresh approval.
8. Check **Activity history** and **Customer impact**, and export the report. A clean workspace has zero/unavailable impact until activity exists. Fictional or simulated results cannot establish customer ROI.

The current hosting URL is [the Q-mate prototype](https://relay-industrial-desk-production.up.railway.app/). Its source is [the GitHub repository](https://github.com/bm-aip/relay-industrial-desk). The existing repository/domain names are infrastructure identifiers; Q-mate is the pilot brand. This guide verifies its configuration against local source; deployment verification is recorded separately.

## 7. Build and connect a live pilot

These steps are an engineering and implementation runbook. Production controls and provider adapters described here are requirements to implement, not completed features hidden behind settings.

### A. Prepare the environment — your engineer

1. Establish individual identities and server-side customer permissions before processing confidential customer data. Include access checks for API reads, writes, exports, jobs and attachments, and test attempts to access another customer's records.
2. Create separate staging and production environments from versioned source in Railway. Configure HTTPS, secret storage, redacted logs, alerts and named administrators. Avoid staging messages going to real buyers.
3. Implement the selected persistence and durable-job design. For PostgreSQL, add the database adapter, schema, migrations and rollback procedure, then provision the Railway database and configure its connection secret. Test backup restoration and application behavior after a restart.
4. Implement actual team/approver management and required commercial fields. If customer-specific tax, pricing or rounding rules are complex, use the existing ERP's validated calculation/output as the authority. The prototype's flat tax/discount formula is insufficient for those cases.
5. Implement provider credential encryption/refresh and a controlled way to pause ingestion, sends and business-system writes. Agree retention and approved providers before sending customer material to an AI/OCR service.

For a separate demonstration deployment of the current code: Railway uses the included Dockerfile, `/health`, target port `3000`, a volume at `/app/data` and one replica. Set `TEAM_PASSWORD` to a unique value of at least 16 characters directly in service secrets. `SEED_DEMO=false` only prevents seeding an empty database; it does not remove existing demo records. Do not delete a volume to reset a demo. Those settings do not deliver the production extensions above.

### B. Connect the authoritative business data — engineer + customer admin

1. Verify the exact API/interface and licensed operations. Obtain customer authorization and begin with read-only access.
2. Map company/customer/product IDs, units, prices, available stock and timestamps into the core schema. Record mappings and their version.
3. Compare several representative records against what the customer sees in their system. Include pack-size conversion, a customer-specific price and reserved stock where relevant.
4. Configure sync frequency, stale-data blocking, failure alerts and manual fallback. Record the last successful synchronization in the UI. Immediately before dispatch, enforce the agreed freshness and approval-expiry policy. If a material price, stock or term changes after approval, hold the send, resolve it with the reviewer and obtain a newly approved revision when the quote changes. Do not silently reprice an approved quote or treat a stock check as a reservation.
5. If writing quotes/tasks is in scope, test in a sandbox or explicitly approved test records. Use stable operation IDs to prevent duplicate records on retries; reconcile references back to the core. Keep posting invoices, dispatches or purchase orders out of scope unless separately agreed and implemented.

**Tally procedure:** ask the Tally admin/partner to identify the release, company and supported interface; enable the integration server according to that release's documentation and test a read locally. TallyPrime's XML interface requires Tally to be running with the relevant company loaded; its documented default HTTP port is 9000. [Tally integration prerequisites](https://help.tallysolutions.com/pre-requisites-for-integrations/).

Install an approved local bridge or private connectivity solution. A useful design is a bridge that calls your cloud service over outbound HTTPS, reads the permitted Tally data locally and returns normalized results; it needs implementation, authentication, monitoring and a restart procedure. Do not expose the Tally port publicly. Keep the machine awake and verify company identity on each sync. If a bridge is unavailable, use authorized timestamped exports with manual refresh and final stock/price confirmation. Check format compatibility: TallyPrime JSON import support is release-dependent. [Tally import formats](https://help.tallysolutions.com/import-data-from-xml-or-json/).

### C. Connect the inbound/outbound channel — engineer + account admin

1. Register/configure the provider application or approved provider account, identify the customer-owned account and authorize the agreed scopes. Verify sender and recipient identifiers.
2. Implement provider-specific ingestion: signed webhook verification or authenticated polling, source-message IDs, durable capture, deduplication and attachment handling or clear unsupported-format routing. Register the new production HTTPS callback with the provider. Do not reuse the sample simulation endpoint as a live webhook.
3. Send test messages only to authorized test recipients. Verify a received message becomes one enquiry in the correct customer workspace; replay the event and confirm it remains one enquiry.
4. Implement real outbound delivery using an approved immutable quote revision and stable send ID. For each adapter, document whether the provider honors an idempotency key, how acceptance can be queried/reconciled and which errors permit retry. An internal send ID alone cannot make an external API idempotent. When the result of a send is uncertain and the provider offers no reliable reconciliation, hold it for manual investigation rather than blindly retrying.
5. Store provider message IDs and available acceptance/delivery/failure events. API acceptance, delivery and reading are different states; do not display a simulated success as proof of delivery.
6. Test recipient opt-out, template/window requirements where relevant, token expiry, provider limits, bounces and replies. Ensure replies/orders/opt-outs cancel pending follow-ups as agreed. The worker must recheck cancellation, recipient permission, conversation state and approved revision immediately before dispatch, including after a retry delay. Test a reply arriving while a follow-up is queued/preparing; route a buyer's requested changes back to review rather than sending a now-outdated draft.

### D. Add intelligence only where needed — engineer + process owner

Use deterministic SKU and catalogue lookup when it is sufficient. If messy messages require AI, constrain extraction to structured fields, validate quantities/units and retrieve catalogue-backed candidates. Route uncertain matches and unsuitable substitutions to technical review. Test with the customer's held-out examples before live use. Treat text and attachments as untrusted input; they must not be able to override approvals, access checks or authorized actions.

## 8. Test, train and launch in stages

Before using real messages, establish the access/data controls above. Then progress through:

| Stage | Allowed activity | Exit evidence |
|---|---|---|
| Demonstration | Fictional/sanitized cases; simulated connectors and delivery | Customer understands the intended workflow and limitations |
| Historical replay / shadow | Authorized read-only data; internal drafts; no automated buyer sends or system writes | Mappings, matching, commercial output and routing reviewed against real examples |
| Limited live pilot | Agreed channel/cohort; every quote and follow-up explicitly reviewed; tightly scoped writes | Acceptance tests passed, trained operators, reliable processing and monitored outcomes |
| Expansion | Additional volume, channels, systems or modules | Existing pilot meets agreed quality/value criteria; each new adapter/module separately accepted |

Run these acceptance tests and retain expected result, actual result, evidence, reviewer and date:

- Normal enquiries across several categories, multi-line lists, units and customer price lists produce correct reviewed drafts.
- Missing quantities, ambiguous identifiers, unavailable products and unsupported attachments go to clarification; no invented answer is sent.
- Mixed-category routing and default/backup ownership work as agreed.
- Stale prices/stock, expired approvals, changes after approval, invalid commercial terms and out-of-policy discounts block automated delivery pending review. Quantities above stock are resolved by a person.
- An unapproved quote cannot be sent. Changing a quote after approval requires fresh approval. Delivery uses the exact approved revision and recipient.
- Duplicate inbound events and retried writes do not create duplicate enquiries, quotes or messages. Uncertain sends are reconciled.
- Revoked credentials, provider downtime, rate limits and local-bridge failures produce a visible queue/alert and workable manual fallback.
- A restart preserves queued work; backup restoration works. Restoration does not blindly replay previously delivered messages.
- Unauthorized users cannot access another customer's records through the UI, API, exports or attachments.
- Buyer replies, orders and opt-outs stop scheduled follow-ups, including one already queued/preparing. Failed sends remain failures in reporting.
- Recorded human effort, correction flags and linked orders reconcile to source evidence; failed and manual cases remain visible.

The customer process owner signs off on outputs and operating rules; their IT/admin signs off on access/connectivity; your implementation lead signs off on monitoring, recovery and operator training. Stop go-live if authorization, reliable commercial data, approval enforcement, isolation, reconciliation or fallback is unresolved.

Train the primary and backup operators to review the queue, clarify products, verify prices/stock, approve a revision, inspect actual delivery status and take over manually. Begin with a customer-agreed small cohort/volume cap, review exceptions daily and increase volume only after the agreed acceptance criteria are sustained.

## 9. Measure impact honestly

Use the same definitions before and during the pilot:

| Metric | Definition and interpretation |
|---|---|
| Human effort | Reading, matching, checking, corrections, approval and operational exception handling. Measure the full comparable workflow, including manual fallbacks. |
| Estimated capacity returned | Sum of comparable baseline minutes minus actual human minutes, divided by 60. Keep negative results. This is an estimate, not necessarily payroll savings. |
| Capacity value | Estimated hours × agreed loaded hourly cost. Display separately from fees and cash savings. |
| Turnaround | Median elapsed receipt-to-approval time, alongside human effort. Track delivery delay separately. |
| Corrections | Share of reviewed cases requiring correction, with a consistent definition and denominator. |
| Follow-up completion | Eligible follow-ups completed by deadline ÷ all eligible follow-ups due in the period; disclose exclusions/cancellations. |
| Orders | Quotes with confirmed linked orders and their recorded value. Linked order value alone does not establish incremental revenue. |
| Your service economics | Setup/support hours and vendor/infrastructure cost versus customer fees. Track cost per processed enquiry and per customer. |

Show reporting period, source, sample size, data age and exceptions. Separate one-time onboarding effort from recurring operational work, but report both. Select comparable cohorts and account for changes in volume, catalogue complexity and staffing.

**Prototype reporting limit:** its effort and correction calculations cover approved enquiries, delivery/follow-up states are simulated, and order values are manually linked examples. A live dashboard needs verified provider/system events and reporting for failed, abandoned and manual cases as well. Do not present today's report as a measured live saving. Category rows overlap for multi-category enquiries and should not be summed.

Review impact and operating cost weekly with the customer owner during the pilot. Agree the continued-service decision against the written baseline, quality targets and fee, rather than choosing a success percentage after seeing results.

## 10. Operate, recover and offboard

**Each working day:** your operator checks unassigned/aged work, exceptions, approvals waiting, delivery failures and due follow-ups. Check connector/bridge health, last successful data sync and usage/spend. Escalate technical issues to your engineer and product/commercial questions to the customer's named reviewer.

**Regularly:** review accuracy samples, routing, price-list changes, credential expiry, customer access, costs and backups. Test restores at an agreed cadence and after material database/recovery changes. Keep a versioned record of configuration changes.

**If an incident occurs:** pause the affected sends/writes and scheduled retries, preserve logs and operation IDs, notify the agreed owner and switch to the customer's existing manual process. Reconcile what already reached the provider/ERP before resuming. Restore data only through the tested procedure; restoration must not trigger duplicate historic deliveries or writes.

**At offboarding:** stop jobs/webhooks, revoke customer authorizations, return agreed exports, remove access and delete/archive data according to the agreement, including the applicable backup retention. Confirm completion to the customer through your normal authorized process.

## 11. Timing, cost and later modules

For a supported stack **after the platform foundations and adapters exist**, 2–4 weeks is a useful pilot planning range: discovery/data readiness, configuration and tests, shadow operation, then limited live use and measurement. It is not a current delivery promise. The first live customer also needs the missing platform work; estimate it after inspecting their stack. Provider approval, undocumented local software and catalogue cleanup can extend the schedule.

Quote setup and recurring costs separately. Include your implementation labour, hosting/database/backup/monitoring, channel provider charges, optional AI/OCR/transcription, storage, software API licenses, local bridge support and ongoing exception handling. Set a budget owner and alerts; consult actual provider/account pricing when costing that customer. No fixed operating cost can be established from the present prototype.

| Later module | Additional customer inputs and engineering |
|---|---|
| Procurement | Supplier master, purchase price/lead times, approved supplier policy, PO authority, comparison rules and tested purchasing interfaces |
| Orders / dispatch | Sales-order and reservation semantics, warehouses, fulfilment statuses, dispatch/carrier interfaces and authorized writes |
| Finance / collections | Invoice/receipt records, outstanding-balance authority, matching rules, authorized communication and reconciliation; separate financial approvals |
| Management | Agreed definitions, permitted cross-system data and scoped dashboards for each role |

Keep the reusable core and add capability-specific adapters and configuration. An extra channel can be an adapter project; a purchase or payment workflow may require new domain logic and controls. Reuse does not eliminate that work.

## 12. Customer handover pack

Before launch, your team should have: completed intake; signed pilot scope/access authorization; approved data mappings and commercial rules; configuration version; acceptance-test evidence; trained primary/backup operators; monitoring and incident runbook; tested recovery; measured baseline; cost/usage budget; and a date for the pilot decision.

Use [the customer intake and launch checklist](Customer_Intake_and_Launch_Checklist.md) for each customer. Clone the approved configuration for the next similar customer, then replace and re-test that customer's data, authorization, commercial policy, approvers and account mapping.

### Worked example: a distributor using email and local Tally

This is an illustrative setup, not a claim of an existing live adapter.

1. Agree a pilot for text enquiries in the sales inbox across several product categories. The sales manager reviews every quote; their deputy covers absences. Unsupported attachments go to their current manual process.
2. Obtain sanitized past enquiries for the demo and authorized source records for the later pilot. Confirm the Tally release/company, SKU and unit mapping, price authority, available-stock meaning and quote terms with the customer and their Tally partner.
3. Your engineer builds the required access controls, email adapter and read-only Tally bridge. The customer admin authorizes the selected mailbox; their partner validates the local Tally interface. If bridge access cannot be agreed, explicitly scope an assisted export-based pilot with data-age labels and final manual checks.
4. Import/map the catalogue, configure rules and real approvers, replay the historical test set in staging, then run shadow drafts. Confirm commercial output against the customer's existing quoting process.
5. Pass the acceptance tests and fill the agreed limits/criteria. Enable the small live cohort, send only approved/current revisions, reconcile deliveries and check the queue each day.
6. Review measured effort, delays, exceptions and costs weekly. Add WhatsApp or CRM write-back only after its separate account authorization, adapter work and acceptance tests.
