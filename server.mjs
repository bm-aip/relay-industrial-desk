import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openStore } from './src/store.mjs';
import { createTenant, SAMPLE_PRODUCTS } from './src/seed.mjs';
import { id, requiredText, numberIn, validateProduct, validateRule, makeEnquiry, draftQuote, approveQuote,
  sendQuote, routeEnquiry, reporting, DomainError, CAPABILITIES, CONNECTOR_PRESETS, TEAM } from './src/domain.mjs';
import { hashPassword, verifyPassword, tokenHash, emailAddress, safeUser, requireRole, roleFor } from './src/auth.mjs';
import { normaliseTenant, freshItems, commercialIssues, archiveQuote, recordResponse, addEffort, readiness } from './src/workflow.mjs';
import { deliveryJob, processJobs } from './src/jobs.mjs';
import { quotationHTML } from './src/quotation.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';
const store = openStore(process.env.DATA_DIR || join(root, 'data'), process.env.SEED_DEMO === 'true' || (!production && process.env.SEED_DEMO !== 'false'));
const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD || process.env.TEAM_PASSWORD;
if (production && !store.userCount() && (!bootstrapPassword || bootstrapPassword.length < 16)) throw new Error('Set BOOTSTRAP_PASSWORD (16+ characters) to create the first administrator.');
const demoLogin = !production && !bootstrapPassword && process.env.SEED_DEMO !== 'false';
if (demoLogin && !store.userCount()) store.saveUser({ id: id('user'), email: 'demo@qmate.local', name: 'Demo administrator',
  passwordHash: await hashPassword('demo-sales-desk-2026'), admin: true, active: true, memberships: [] });
const bootstrapHash = bootstrapPassword ? await hashPassword(bootstrapPassword) : null;
const failures = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8' };
const publicFiles = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'],
  ['/favicon.svg', 'favicon.svg'], ['/sample-catalogue.csv', 'sample-catalogue.csv']]);

function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function session(req) {
  const cookie = /(?:^|;\s*)relay_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  const value = cookie && store.session(tokenHash(cookie[1]));
  const user = value && store.user(value.userId);
  if (user?.active) return { ...value, user, token: cookie[1] };
  return null;
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new DomainError('Request exceeds the 2 MB prototype limit.', 413);
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new DomainError('A JSON object is required.'); }
}
function assertOrigin(req) {
  if (req.headers.origin) {
    let host;
    try { host = new URL(req.headers.origin).host; } catch { throw new DomainError('Invalid request origin.', 403); }
    if (host !== req.headers.host) throw new DomainError('Cross-origin mutations are not allowed.', 403);
  }
}
function event(type, subject, detail) { return { type, subject, detail }; }
function findEnquiry(tenant, enquiryId) {
  const e = tenant.enquiries.find((e) => e.id === enquiryId);
  if (!e) throw new DomainError('Enquiry not found in this workspace.', 404);
  return e;
}
function expectedRevision(enquiry, input) {
  if (enquiry.quote?.revision !== Number(input.revision)) throw new DomainError('The quote changed. Refresh it before continuing.', 409);
}
function expectedVersion(enquiry, input) {
  if (enquiry.version !== Number(input.version)) throw new DomainError('This enquiry changed. Refresh it before continuing.', 409);
}
function issueSession(res, user) {
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
  store.createSession(tokenHash(token), user.id, csrf, Date.now() + 12 * 3600000);
  res.setHeader('Set-Cookie', 'relay_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200' + (production ? '; Secure' : ''));
  return { authenticated: true, csrf, user: safeUser(user) };
}
function mapPayload(payload, mapping) {
  const result = {};
  for (const [field, path] of Object.entries(mapping)) {
    if (typeof path !== 'string' || !path || path.split('.').some((p) => ['__proto__', 'constructor', 'prototype'].includes(p))) throw new DomainError('Mapping paths must use safe dot notation.');
    result[field] = path.split('.').reduce((o, k) => o && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined, payload);
  }
  return result;
}
function daysFrom(url) { return numberIn(url.searchParams.get('days') || 30, 'Report period', 1, 90); }
function csvEscape(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function reportCSV(tenant, metrics) {
  const rows = [['Customer', 'Metric', 'Value', 'Unit', 'Basis'],
    [tenant.name, 'Estimated human effort saved', metrics.savedHours, 'hours', 'Distinct first-approved cohort; baseline minus cumulative recorded effort through reporting end'],
    [tenant.name, 'Approved enquiries', metrics.approved, 'enquiries', 'First approved within selected report period; revisions do not double-count'],
    [tenant.name, 'All recorded effort in period', metrics.periodEffortMinutes, 'minutes', 'Includes recorded rework and fallback on other enquiry cohorts'],
    [tenant.name, 'Initial matching observation count', metrics.matchingSampleSize, 'enquiries', 'Unknown legacy extraction outcomes excluded'],
    [tenant.name, 'Actual dispatches', metrics.funnel.actualDispatches, 'enquiries', 'Received cohort; simulated jobs excluded'],
    [tenant.name, 'Median approval turnaround', metrics.medianApprovalMinutes ?? '', 'minutes', 'Receipt to human approval; elapsed time'],
    [tenant.name, 'Follow-ups completed on time', metrics.onTimeRate ?? '', '%', metrics.followupsOnTime + '/' + metrics.followupsDue + ' due in period'],
    [tenant.name, 'Quote correction rate', metrics.correctionRate ?? '', '%', 'Approved cohort'],
    [tenant.name, 'Estimated capacity value', metrics.capacityValue, 'INR', 'Estimated hours × configured hourly cost; not cash savings'],
    [tenant.name, 'Linked order value', metrics.linkedOrderValue, 'INR', 'Recorded orders; no incremental-revenue attribution'],
    [tenant.name, 'Reporting from', metrics.from, 'date', 'Asia/Kolkata display timezone'],
    [tenant.name, 'Reporting to', metrics.to, 'date', 'All external deliveries and seed data are simulated']];
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    if (req.method === 'GET' && path === '/health') return json(res, { status: 'ok', app: 'q-mate', version: '0.2.0', mode: 'pre-customer', integrations: 'simulation' });
    if (req.method === 'GET' && publicFiles.has(path)) {
      const file = publicFiles.get(path), extension = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': MIME[extension], 'Cache-Control': 'no-cache' });
      return res.end(await readFile(join(root, 'public', file)));
    }
    if (path === '/api/session' && req.method === 'GET') {
      const active = session(req);
      return json(res, { authenticated: !!active, csrf: active?.csrf, user: safeUser(active?.user), setupRequired: !store.userCount(), demoLogin });
    }
    if (['/api/login', '/api/setup'].includes(path) && req.method === 'POST') {
      assertOrigin(req);
      const remote = req.socket.remoteAddress || 'unknown', attempt = failures.get(remote);
      if (attempt && attempt.until > Date.now() && attempt.count >= 8) throw new DomainError('Too many attempts. Try again in 10 minutes.', 429);
      const input = await body(req);
      if (failures.size > 1000) for (const [key, value] of failures) if (value.until < Date.now()) failures.delete(key);
      const setup = path === '/api/setup';
      const user = setup ? null : store.userByEmail(emailAddress(input.email));
      const valid = setup ? !store.userCount() && await verifyPassword(input.bootstrapPassword, bootstrapHash) :
        await verifyPassword(input.password, user?.passwordHash);
      if (!valid || (!setup && !user?.active)) {
        failures.set(remote, { count: attempt?.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 600000 });
        throw new DomainError('The sign-in details are incorrect, or setup is no longer available.', 401);
      }
      failures.delete(remote);
      if (setup) {
        const passwordHash = await hashPassword(input.password);
        if (store.userCount()) throw new DomainError('An administrator has already been created.', 409);
        const created = store.saveUser({ id: id('user'), email: emailAddress(input.email), name: requiredText(input.name, 'Name'),
          passwordHash, admin: true, active: true, memberships: [] });
        return json(res, issueSession(res, created));
      }
      return json(res, issueSession(res, user));
    }
    const active = session(req);
    if (!active) throw new DomainError('Sign in to your team workspace.', 401);
    if (req.method !== 'GET') {
      assertOrigin(req);
      if (req.headers['x-csrf-token'] !== active.csrf) throw new DomainError('Invalid session token. Refresh the page.', 403);
    }
    if (path === '/api/logout' && req.method === 'POST') {
      store.deleteSession(tokenHash(active.token)); res.setHeader('Set-Cookie', 'relay_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return json(res, { ok: true });
    }
    if (path === '/api/bootstrap' && req.method === 'GET') {
      const tenants = store.list().filter((t) => roleFor(active.user, t.id));
      const customerId = url.searchParams.get('customer') || tenants[0]?.id;
      if (customerId) requireRole(active.user, customerId);
      const tenant = customerId ? store.get(customerId) : null;
      const role = tenant ? roleFor(active.user, tenant.id) : active.user.admin ? 'admin' : 'viewer';
      const metrics = tenant ? reporting(tenant, daysFrom(url)) : null;
      if (role === 'viewer' && metrics) delete metrics.economics;
      const members = tenant ? store.users().filter((u) => u.active && roleFor(u, tenant.id)).map((u) => ({ id: u.id, name: u.name, role: roleFor(u, tenant.id) })) : [];
      const visibleTenant = role === 'viewer' && tenant ? { id: tenant.id, name: tenant.name, city: tenant.city, mode: tenant.mode,
        config: { baselineApprovalMinutes: tenant.config.baselineApprovalMinutes }, products: [], enquiries: [], connectors: [], rules: [] } : tenant;
      return json(res, {
        customers: tenants.map((t) => ({ id: t.id, name: t.name, city: t.city, products: t.products.length,
          categories: new Set(t.products.map((p) => p.category)).size, enquiries: t.enquiries.length,
          connectors: t.connectors.filter((c) => c.enabled).length })),
        tenant: visibleTenant, metrics, user: safeUser(active.user), role, members,
        readiness: tenant && role !== 'viewer' ? readiness(tenant, members) : [],
        jobs: tenant && role !== 'viewer' ? store.jobs(tenant.id).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200) : [],
        commercialHolds: tenant && role !== 'viewer' ? Object.fromEntries(tenant.enquiries.filter((e) => e.quote && !['won', 'lost'].includes(e.status)).map((e) => [e.id, commercialIssues(e, tenant)])) : {},
        users: active.user.admin ? store.users().map(safeUser) : [],
        events: tenant && role !== 'viewer' ? store.events(tenant.id) : [], team: ['Unassigned', ...members.filter((u) => u.role !== 'viewer').map((u) => u.name)],
        presets: role === 'admin' ? CONNECTOR_PRESETS : [], capabilities: role === 'admin' ? CAPABILITIES : []
      });
    }
    if (path === '/api/report.csv' && req.method === 'GET') {
      const customerId = requiredText(url.searchParams.get('customer'), 'Customer workspace');
      requireRole(active.user, customerId);
      const tenant = store.get(customerId);
      res.writeHead(200, { 'Content-Type': MIME['.csv'], 'Content-Disposition': 'attachment; filename="q-mate-impact-report.csv"', 'Cache-Control': 'no-store' });
      return res.end(reportCSV(tenant, reporting(tenant, daysFrom(url))));
    }
    const input = req.method === 'GET' ? {} : await body(req);
    if (path === '/api/users' && req.method === 'POST') {
      if (!active.user.admin) throw new DomainError('Administrator access required.', 403);
      const old = input.id ? store.user(input.id) : null;
      if (input.id && !old) throw new DomainError('User not found.', 404);
      const memberships = Array.isArray(input.memberships) ? input.memberships : [];
      if (memberships.length > 200 || new Set(memberships.map((m) => m.customerId)).size !== memberships.length) throw new DomainError('Use distinct workspace memberships.');
      for (const m of memberships) {
        store.get(m.customerId);
        if (!['viewer', 'operator', 'approver'].includes(m.role)) throw new DomainError('Choose viewer, operator or approver.');
      }
      const u = { id: old?.id || id('user'), email: emailAddress(input.email), name: requiredText(input.name, 'Name'),
        passwordHash: input.password ? await hashPassword(input.password) : old?.passwordHash,
        admin: input.admin === true, active: input.active !== false, memberships };
      if (!u.passwordHash) throw new DomainError('Set an initial user password.');
      return json(res, safeUser(store.saveUser(u)));
    }
    if (path === '/api/customers' && req.method === 'POST') {
      if (!active.user.admin) throw new DomainError('Administrator access required.', 403);
      const tenant = createTenant(requiredText(input.name, 'Customer name'), { city: requiredText(input.city || 'Chennai', 'City') });
      tenant.createdBy = active.user.name; tenant.mode = input.sampleCatalogue === true ? 'demo' : 'preparation';
      if (input.sampleCatalogue === true) {
        tenant.products = SAMPLE_PRODUCTS.map(([sku, name, category, unit, price, stock, aliases]) =>
          validateProduct({ sku, name, category, unit, price, stock, aliases, source: 'Sample catalogue' }));
        tenant.connectors = CONNECTOR_PRESETS.filter((c) => ['Email', 'WhatsApp'].includes(c.name)).map((c) =>
          ({ ...c, id: id('connector'), enabled: true, mode: 'simulation', mapping: { buyer: 'customer.name', message: 'message.text' } }));
      }
      return json(res, store.insert(tenant), 201);
    }
    const match = /^\/api\/customers\/([^/]+)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(path);
    if (!match) throw new DomainError('Endpoint not found.', 404);
    const [, customerId, resource, resourceId, action] = match;
    const role = requireRole(active.user, customerId);
    if (req.method === 'GET' && resource === 'export') {
      if (role !== 'admin') throw new DomainError('Administrator access required.', 403);
      res.setHeader('Content-Disposition', 'attachment; filename="q-mate-workspace-export.json"');
      return json(res, { exportedAt: new Date().toISOString(), tenant: store.get(customerId), jobs: store.jobs(customerId), events: store.events(customerId) });
    }
    if (req.method === 'GET' && resource === 'quote') {
      const t = store.get(customerId), e = findEnquiry(t, resourceId);
      if (role === 'viewer') throw new DomainError('Operator access required for quotation documents.', 403);
      const revision = Number(url.searchParams.get('revision') || e.quote?.revision);
      const approval = e.approvals.find((a) => a.revision === revision);
      if (!approval) throw new DomainError('Only an approved revision can be exported.', 409);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(quotationHTML(t, e, approval));
    }
    if (req.method !== 'GET' && role === 'viewer') throw new DomainError('This account has read-only dashboard access.', 403);
    if (['config', 'products', 'rules', 'connectors', 'onboarding'].includes(resource) && role !== 'admin') throw new DomainError('Administrator access required for customer configuration.', 403);
    if (action === 'approve' && !['approver', 'admin'].includes(role)) throw new DomainError('Commercial approver access required.', 403);
    if (req.method === 'POST' && resource === 'preview-rule') {
      const tenant = store.get(customerId), enquiry = makeEnquiry(input, tenant);
      return json(res, { route: enquiry.route, items: enquiry.items, missing: enquiry.missing });
    }
    const value = store.mutate(customerId, (tenant) => {
      if (resource === 'jobs' && resourceId && req.method === 'POST') {
        const job = store.jobs(customerId).find((j) => j.id === resourceId);
        if (!job) throw new DomainError('Job not found.', 404);
        if (action === 'cancel' && ['queued', 'held'].includes(job.status)) { job.status = 'cancelled'; job.result = 'Cancelled by ' + active.user.name; }
        else if (action === 'retry' && job.status === 'held') {
          const e = findEnquiry(tenant, job.enquiryId);
          if (e.quote?.revision !== job.revision || e.conversationHold) throw new DomainError('Revision or conversation changed. Queue the current approved revision instead.', 409);
          deliveryJob(e, tenant, job.kind, active.user.name);
          job.status = 'queued'; job.result = '';
        } else throw new DomainError('This job is no longer eligible for that action.', 409);
        store.saveJob(job);
        return { value: job, event: event('job.' + action, job.enquiryId, 'Job reviewed by ' + active.user.name) };
      }
      if (resource === 'config' && req.method === 'POST') {
        const allowed = { baselineMinutes: [1, 1440], baselineApprovalMinutes: [1, 10080], hourlyCost: [0, 1e6], maxDiscount: [0, 50], taxRate: [0, 50], followupDays: [1, 30],
          maxDataAgeMinutes: [1, 43200], approvalExpiryHours: [1, 720], validityDays: [1, 365], freight: [0, 1e8],
          baselineSampleSize: [0, 1e6], setupMinutes: [0, 1e7], supportMinutes: [0, 1e7], monthlyFee: [0, 1e8], operatingCost: [0, 1e8] };
        for (const [key, limits] of Object.entries(allowed)) if (Object.hasOwn(input, key)) tenant.config[key] = numberIn(input[key], key, ...limits);
        for (const key of ['paymentTerms', 'deliveryTerms', 'baselineScope', 'baselineFrom', 'baselineTo']) if (Object.hasOwn(input, key)) {
          if (typeof input[key] !== 'string' || input[key].length > 1000) throw new DomainError('Invalid ' + key);
          if (['baselineFrom', 'baselineTo'].includes(key) && input[key] && !/^\d{4}-\d{2}-\d{2}$/.test(input[key])) throw new DomainError('Use an ISO baseline date.');
          tenant.config[key] = input[key].trim();
        }
        if (tenant.config.baselineFrom && tenant.config.baselineTo && tenant.config.baselineFrom > tenant.config.baselineTo) throw new DomainError('Baseline end must follow its start.');
        if (Object.hasOwn(input, 'paused')) tenant.config.paused = input.paused === true;
        if (input.defaultOwner) tenant.config.defaultOwner = requiredText(input.defaultOwner, 'Default owner');
        tenant.config.version++;
        return { value: tenant.config, event: event('configuration.updated', tenant.name, 'Customer settings saved. Existing baseline snapshots are retained.') };
      }
      if (resource === 'products' && req.method === 'POST') {
        const products = Array.isArray(input.products) ? input.products : [input];
        if (!products.length || products.length > 5000) throw new DomainError('Import between 1 and 5,000 products.');
        const validated = products.map((p) => {
          const old = tenant.products.find((v) => v.sku.toLowerCase() === String(p.sku).toLowerCase());
          return validateProduct({ ...old, ...p, id: old?.id || id('product') });
        });
        if (new Set(validated.map((p) => p.sku.toLowerCase())).size !== validated.length) throw new DomainError('Duplicate SKUs in this import.');
        if (input.preview === true) return { value: { imported: validated.length, added: validated.filter((p) => !tenant.products.some((v) => v.sku === p.sku)).length,
          updated: validated.filter((p) => tenant.products.some((v) => v.sku === p.sku)).length, rows: validated.slice(0, 20) } };
        tenant.catalogueHistory ||= [];
        tenant.catalogueHistory.push({ id: id('catalogue'), at: new Date().toISOString(), actor: active.user.name, products: structuredClone(tenant.products) });
        tenant.catalogueHistory = tenant.catalogueHistory.slice(-5);
        for (const p of validated) {
          const index = tenant.products.findIndex((old) => old.sku.toLowerCase() === p.sku.toLowerCase());
          if (index < 0) tenant.products.push(p); else tenant.products[index] = { ...p, id: tenant.products[index].id };
        }
        return { value: { imported: validated.length }, event: event('catalogue.updated', tenant.name, validated.length + ' product records added or updated.') };
      }
      if (resource === 'rules' && req.method === 'POST') {
        const rule = validateRule(input), index = tenant.rules.findIndex((r) => r.id === rule.id);
        if (tenant.rules.some((r) => r.id !== rule.id && r.priority === rule.priority)) throw new DomainError('Use a unique priority for each rule.');
        if (index < 0) tenant.rules.push(rule); else tenant.rules[index] = rule;
        tenant.config.version++;
        return { value: rule, event: event('routing.updated', rule.name, 'Routing configuration version ' + tenant.config.version + '.') };
      }
      if (resource === 'rules' && resourceId && req.method === 'DELETE') {
        const rule = tenant.rules.find((r) => r.id === resourceId);
        if (!rule) throw new DomainError('Rule not found.', 404);
        tenant.rules = tenant.rules.filter((r) => r.id !== resourceId); tenant.config.version++;
        return { value: { deleted: true }, event: event('routing.removed', rule.name, 'Rule removed from future routing.') };
      }
      if (resource === 'connectors' && req.method === 'POST' && !action) {
        if (!['channel', 'system'].includes(input.kind)) throw new DomainError('Choose channel or business system.');
        const capabilities = Array.isArray(input.capabilities) ? [...new Set(input.capabilities)] : [];
        if (capabilities.some((c) => !CAPABILITIES.includes(c))) throw new DomainError('Unsupported connector capability.');
        if (!input.mapping || typeof input.mapping !== 'object' || Array.isArray(input.mapping) || Object.keys(input.mapping).length > 12) throw new DomainError('Provide a field-mapping object.');
        for (const [field, value] of Object.entries(input.mapping)) {
          if (!['buyer', 'buyerId', 'recipient', 'sourceMessageId', 'message', 'sku', 'name', 'price', 'stock', 'category', 'unit'].includes(field)) throw new DomainError('Unknown mapped field: ' + field);
          requiredText(value, 'Mapping path', 120);
        }
        mapPayload({}, input.mapping);
        if (input.id && !tenant.connectors.some((c) => c.id === input.id)) throw new DomainError('Connector not found.', 404);
        const c = { id: input.id || id('connector'), name: requiredText(input.name, 'Connector name', 100),
          kind: input.kind, capabilities, mapping: input.mapping, mode: 'simulation', enabled: input.enabled !== false,
          color: '#5e7970', initials: input.name.slice(0, 2).toUpperCase(), testedAt: null };
        if (tenant.connectors.some((old) => old.id !== c.id && old.name.toLowerCase() === c.name.toLowerCase())) throw new DomainError('A connector with this name already exists.');
        const index = tenant.connectors.findIndex((old) => old.id === c.id);
        if (index < 0) tenant.connectors.push(c); else tenant.connectors[index] = c;
        return { value: c, event: event('connector.configured', c.name, 'Simulation adapter saved. No live account is connected.') };
      }
      if (resource === 'connectors' && resourceId && ['test', 'ingest'].includes(action) && req.method === 'POST') {
        const c = tenant.connectors.find((c) => c.id === resourceId);
        if (!c) throw new DomainError('Connector not found.', 404);
        const mapped = mapPayload(input.payload, c.mapping);
        if (c.kind === 'channel') { requiredText(mapped.buyer, 'Mapped buyer'); requiredText(mapped.message, 'Mapped message', 12000); }
        else {
          if (c.capabilities.includes('read_products')) validateProduct({ ...mapped, unit: mapped.unit || 'unit', source: c.name });
          if (c.capabilities.includes('read_prices')) numberIn(mapped.price, 'Mapped price', 0, 1e8);
          if (c.capabilities.includes('read_stock')) numberIn(mapped.stock, 'Mapped stock', 0, 1e8);
        }
        if (action === 'test') {
          c.testedAt = new Date().toISOString();
          return { value: { mapped, mode: 'simulation', valid: true }, event: event('connector.tested', c.name, 'Sample payload mapping validated. This is not a live connectivity test.') };
        }
        if (c.kind !== 'channel') throw new DomainError('Only channel payloads can create enquiries.');
        if (!mapped.sourceMessageId) throw new DomainError('Map a stable sourceMessageId before ingesting a payload. Testing a mapping does not require one.');
        const key = requiredText(mapped.sourceMessageId, 'Mapped source message ID');
        const prior = tenant.enquiries.find((e) => e.sourceConnectorId === c.id && e.sourceMessageId === key);
        if (prior) return { value: prior };
        const e = makeEnquiry({ ...mapped, sourceConnectorId: c.id, channel: c.name }, tenant); tenant.enquiries.push(e);
        return { value: e, event: event('enquiry.received', e.reference, 'Received through a simulated ' + c.name + ' payload.') };
      }
      if (resource === 'enquiries' && !resourceId && req.method === 'POST') {
        if (input.sourceMessageId) {
          const key = requiredText(input.sourceMessageId, 'Source message ID');
          const connectorId = tenant.connectors.find((c) => c.name === input.channel)?.id;
          const previous = tenant.enquiries.find((e) => e.sourceMessageId === key && e.sourceConnectorId === connectorId);
          if (previous) return { value: previous };
        }
        const e = makeEnquiry(input, tenant);
        if (input.sourceMessageId) e.sourceMessageId = input.sourceMessageId;
        tenant.enquiries.push(e);
        return { value: e, event: event('enquiry.received', e.reference, e.buyer + ' · ' + e.channel + ' · ' + e.route.reason) };
      }
      if (resource === 'enquiries' && resourceId && req.method === 'POST') {
        const e = findEnquiry(tenant, resourceId);
        expectedVersion(e, input);
        let detail, changed = true;
        if (action === 'draft') { draftQuote(e, tenant, input); detail = 'Revision ' + e.quote.revision + ' prepared. Human approval required.'; }
        else if (action === 'approve') {
          expectedRevision(e, input);
          if (input.reviewConfirmed !== true) throw new DomainError('Confirm the commercial review before approving.');
          changed = approveQuote(e, { ...input, actor: active.user.name, corrected: e.corrected || input.corrected }, tenant);
          detail = 'Approved by your team. Total reported human effort: ' + e.manualMinutes + ' minutes.';
        } else if (action === 'send') {
          expectedRevision(e, input);
          const job = deliveryJob(e, tenant, 'quote', active.user.name);
          return { value: { ...e, queued: true }, jobs: [job], event: event('delivery.queued', e.reference, 'Simulated delivery job persisted. No external message sent.') };
        } else if (action === 'clarify') {
          if (['won', 'lost'].includes(e.status)) throw new DomainError('Closed enquiries cannot be edited.', 409);
          if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new DomainError('Choose at least one catalogue product.');
          archiveQuote(e);
          const previousQuote = e.quote;
          e.items = freshItems(e, tenant, input.items);
          e.missing = []; e.corrected = true;
          draftQuote(e, tenant, { discount: Math.min(previousQuote?.discount || 0, tenant.config.maxDiscount), reason: requiredText(input.reason, 'Correction reason', 300) });
          e.route = routeEnquiry(e, tenant.rules, tenant.config); detail = 'Product selection confirmed by your team; quote approval is still required.';
        } else if (action === 'outbound') {
          if (['sent', 'won'].includes(e.status)) throw new DomainError('Delivery channel is locked after sending.', 409);
          const c = tenant.connectors.find((c) => c.name === input.channel && c.enabled && c.kind === 'channel' && c.capabilities.includes('send_message'));
          if (!c) throw new DomainError('Choose an enabled outbound channel.');
          if (e.quote?.approvedRevision) throw new DomainError('Prepare a new revision before changing an approved recipient or channel.', 409);
          e.outboundChannel = c.name;
          e.recipient = requiredText(input.recipient, 'Buyer recipient', 200);
          e.buyerId = typeof input.buyerId === 'string' ? input.buyerId.slice(0, 100) : e.buyerId;
          if (e.quote) draftQuote(e, tenant, { discount: e.quote.discount, reason: 'Delivery destination updated' });
          detail = 'Outbound destination recorded. Original intake channel retained.';
        } else if (action === 'followup') {
          const job = deliveryJob(e, tenant, 'followup', active.user.name);
          return { value: { queued: true, dueAt: job.dueAt }, jobs: [job], event: event('followup.queued', e.reference, 'Follow-up remains scheduled for its due time.') };
        } else if (action === 'response') {
          recordResponse(e, input, active.user.name); detail = 'Buyer response recorded; pending follow-up held or cancelled.';
        } else if (action === 'effort') {
          addEffort(e, input, active.user.name); detail = 'Additional review or fallback effort recorded.';
        } else if (action === 'assign') {
          const u = store.user(input.userId);
          if (!u?.active || !['admin', 'approver', 'operator'].includes(roleFor(u, customerId))) throw new DomainError('Choose an active workspace operator.');
          e.route.owner = u.name; e.route.ownerId = u.id; e.route.reason = 'Assigned by ' + active.user.name;
          detail = 'Owner assigned to ' + u.name;
        } else if (action === 'won') {
          if (e.status === 'won') changed = false;
          else {
            if (e.status !== 'sent') throw new DomainError('Record an order only after the quote is sent.', 409);
            e.orderValue = numberIn(input.orderValue ?? e.quote.total, 'Linked order value', 0, 1e10);
            e.status = 'won'; e.wonAt = new Date().toISOString();
            if (e.followup && !e.followup.sentAt) e.followup.status = 'cancelled';
          }
          detail = 'Demo order linked. This value is not attributed incremental revenue.';
        } else throw new DomainError('Unknown enquiry action.', 404);
        if (changed && ['draft', 'clarify', 'outbound', 'response', 'won'].includes(action)) {
          for (const job of store.jobs(customerId).filter((j) => j.enquiryId === e.id && ['queued', 'held'].includes(j.status))) {
            job.status = 'cancelled'; job.result = 'Cancelled after ' + action + ' by ' + active.user.name; store.saveJob(job);
          }
        }
        if (changed) e.version++;
        return { value: e, event: changed ? event('quote.' + action, e.reference, detail) : null };
      }
      if (resource === 'onboarding' && req.method === 'POST') {
        for (const key of ['scope', 'formats', 'processOwner', 'technicalOwner', 'acceptance', 'recoveryEvidence']) {
          if (Object.hasOwn(input, key)) tenant.onboarding[key] = typeof input[key] === 'string' ? input[key].trim().slice(0, 2000) : '';
        }
        tenant.onboarding.acceptedAt = input.accepted === true && tenant.onboarding.recoveryEvidence ? new Date().toISOString() : null;
        return { value: tenant.onboarding, event: event('onboarding.updated', tenant.name, 'Pilot scope and readiness evidence updated.') };
      }
      if (resource === 'catalogue-restore' && req.method === 'POST') {
        if (role !== 'admin') throw new DomainError('Administrator access required.', 403);
        const snapshot = tenant.catalogueHistory?.find((h) => h.id === input.snapshotId);
        if (!snapshot) throw new DomainError('Catalogue snapshot not found.', 404);
        const restored = structuredClone(snapshot.products);
        tenant.catalogueHistory.push({ id: id('catalogue'), at: new Date().toISOString(), actor: active.user.name, products: structuredClone(tenant.products) });
        tenant.catalogueHistory = tenant.catalogueHistory.slice(-5);
        tenant.products = restored;
        return { value: { restored: true }, event: event('catalogue.restored', tenant.name, 'Catalogue restored; quote dispatch still revalidates current data.') };
      }
      throw new DomainError('Unsupported operation.', 404);
    }, active.user.name);
    json(res, value);
  } catch (error) {
    if (!(error instanceof DomainError)) console.error('Request failed:', error.message);
    if (!res.headersSent) json(res, { error: error instanceof DomainError ? error.message : 'The server could not complete this request.' }, error.status || 500);
    else res.end();
  }
});
server.requestTimeout = 30000;
server.listen(Number(process.env.PORT || 3000), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => {
  console.log('Q-mate (Quote Automate) listening on port ' + server.address().port + ' (' + (production ? 'protected deployment' : 'local prototype') + ').');
});
const worker = setInterval(() => { try { processJobs(store); } catch { console.error('Job scan failed. Operator review required.'); } }, 1000);
worker.unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(worker); server.close(() => { store.close(); process.exit(0); }); });
