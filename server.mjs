import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { openStore } from './src/store.mjs';
import { createTenant, SAMPLE_PRODUCTS } from './src/seed.mjs';
import { id, requiredText, numberIn, validateProduct, validateRule, makeEnquiry, draftQuote, approveQuote,
  sendQuote, routeEnquiry, reporting, DomainError, CAPABILITIES, CONNECTOR_PRESETS, TEAM } from './src/domain.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.TEAM_PASSWORD || process.env.TEAM_PASSWORD.length < 16)) {
  throw new Error('Set TEAM_PASSWORD to at least 16 characters before deploying.');
}
const salt = randomBytes(32);
const passwordHash = scryptSync(process.env.TEAM_PASSWORD || 'demo-sales-desk', salt, 64);
const store = openStore(process.env.DATA_DIR || join(root, 'data'), process.env.SEED_DEMO !== 'false');
const sessions = new Map(), failures = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8' };
const publicFiles = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'],
  ['/favicon.svg', 'favicon.svg'], ['/sample-catalogue.csv', 'sample-catalogue.csv']]);

function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function session(req) {
  const cookie = /(?:^|;\s*)relay_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  const value = cookie && sessions.get(cookie[1]);
  if (value && value.expires > Date.now()) return { ...value, token: cookie[1] };
  if (cookie) sessions.delete(cookie[1]);
  return null;
}
async function body(req) {
  let size = 0, text = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new DomainError('Request exceeds the 2 MB prototype limit.', 413);
    text += chunk.toString('utf8');
  }
  try {
    const parsed = JSON.parse(text || '{}');
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
    [tenant.name, 'Estimated human effort saved', metrics.savedHours, 'hours', 'Approved cohort; baseline minus total reported review/correction effort'],
    [tenant.name, 'Approved enquiries', metrics.approved, 'enquiries', 'Approved within selected report period'],
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
    if (req.method === 'GET' && path === '/health') return json(res, { status: 'ok', app: 'relay-desk', mode: 'prototype' });
    if (req.method === 'GET' && publicFiles.has(path)) {
      const file = publicFiles.get(path), extension = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': MIME[extension], 'Cache-Control': 'no-cache' });
      return res.end(await readFile(join(root, 'public', file)));
    }
    if (path === '/api/session' && req.method === 'GET') {
      const active = session(req);
      return json(res, { authenticated: !!active, csrf: active?.csrf, team: 'Your operations team', demoLogin: !production && !process.env.TEAM_PASSWORD });
    }
    if (path === '/api/login' && req.method === 'POST') {
      assertOrigin(req);
      const remote = req.socket.remoteAddress || 'unknown', attempt = failures.get(remote);
      if (attempt && attempt.until > Date.now() && attempt.count >= 8) throw new DomainError('Too many attempts. Try again in 10 minutes.', 429);
      const input = await body(req);
      if (typeof input.password !== 'string' || input.password.length > 512) throw new DomainError('Enter your team password.', 401);
      if (!timingSafeEqual(scryptSync(input.password, salt, 64), passwordHash)) {
        failures.set(remote, { count: attempt?.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 600000 });
        throw new DomainError('The team password is incorrect.', 401);
      }
      failures.delete(remote);
      const token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
      sessions.set(token, { csrf, expires: Date.now() + 12 * 3600000 });
      res.setHeader('Set-Cookie', 'relay_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200' + (production ? '; Secure' : ''));
      return json(res, { authenticated: true, csrf });
    }
    const active = session(req);
    if (!active) throw new DomainError('Sign in to your team workspace.', 401);
    if (req.method !== 'GET') {
      assertOrigin(req);
      if (req.headers['x-csrf-token'] !== active.csrf) throw new DomainError('Invalid session token. Refresh the page.', 403);
    }
    if (path === '/api/logout' && req.method === 'POST') {
      sessions.delete(active.token); res.setHeader('Set-Cookie', 'relay_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return json(res, { ok: true });
    }
    if (path === '/api/bootstrap' && req.method === 'GET') {
      const tenants = store.list();
      const customerId = url.searchParams.get('customer') || tenants[0]?.id;
      const tenant = customerId ? store.get(customerId) : null;
      return json(res, {
        customers: tenants.map((t) => ({ id: t.id, name: t.name, city: t.city, products: t.products.length,
          categories: new Set(t.products.map((p) => p.category)).size, enquiries: t.enquiries.length,
          connectors: t.connectors.filter((c) => c.enabled).length })),
        tenant, metrics: tenant ? reporting(tenant, daysFrom(url)) : null,
        events: tenant ? store.events(tenant.id) : [], team: TEAM, presets: CONNECTOR_PRESETS, capabilities: CAPABILITIES
      });
    }
    if (path === '/api/report.csv' && req.method === 'GET') {
      const tenant = store.get(requiredText(url.searchParams.get('customer'), 'Customer workspace'));
      res.writeHead(200, { 'Content-Type': MIME['.csv'], 'Content-Disposition': 'attachment; filename="relay-impact-report.csv"', 'Cache-Control': 'no-store' });
      return res.end(reportCSV(tenant, reporting(tenant, daysFrom(url))));
    }
    const input = req.method === 'GET' ? {} : await body(req);
    if (path === '/api/customers' && req.method === 'POST') {
      const tenant = createTenant(requiredText(input.name, 'Customer name'), { city: requiredText(input.city || 'Chennai', 'City') });
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
    if (req.method === 'POST' && resource === 'preview-rule') {
      const tenant = store.get(customerId), enquiry = makeEnquiry(input, tenant);
      return json(res, { route: enquiry.route, items: enquiry.items, missing: enquiry.missing });
    }
    const value = store.mutate(customerId, (tenant) => {
      if (resource === 'config' && req.method === 'POST') {
        const allowed = { baselineMinutes: [1, 1440], baselineApprovalMinutes: [1, 10080], hourlyCost: [0, 1e6], maxDiscount: [0, 50], taxRate: [0, 50], followupDays: [1, 30] };
        for (const [key, limits] of Object.entries(allowed)) if (Object.hasOwn(input, key)) tenant.config[key] = numberIn(input[key], key, ...limits);
        if (input.defaultOwner) tenant.config.defaultOwner = requiredText(input.defaultOwner, 'Default owner');
        tenant.config.version++;
        return { value: tenant.config, event: event('configuration.updated', tenant.name, 'Customer settings saved. Existing baseline snapshots are retained.') };
      }
      if (resource === 'products' && req.method === 'POST') {
        const products = Array.isArray(input.products) ? input.products : [input];
        if (!products.length || products.length > 5000) throw new DomainError('Import between 1 and 5,000 products.');
        const validated = products.map(validateProduct);
        if (new Set(validated.map((p) => p.sku.toLowerCase())).size !== validated.length) throw new DomainError('Duplicate SKUs in this import.');
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
          if (!['buyer', 'message', 'sku', 'name', 'price', 'stock', 'category', 'unit'].includes(field)) throw new DomainError('Unknown mapped field: ' + field);
          requiredText(value, 'Mapping path', 120);
        }
        mapPayload({}, input.mapping);
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
        const e = makeEnquiry({ ...mapped, channel: c.name }, tenant); tenant.enquiries.push(e);
        return { value: e, event: event('enquiry.received', e.reference, 'Received through a simulated ' + c.name + ' payload.') };
      }
      if (resource === 'enquiries' && !resourceId && req.method === 'POST') {
        if (input.sourceMessageId) {
          const key = requiredText(input.sourceMessageId, 'Source message ID');
          const previous = tenant.enquiries.find((e) => e.sourceMessageId === key && e.channel === input.channel);
          if (previous) return { value: previous };
        }
        const e = makeEnquiry(input, tenant);
        if (input.sourceMessageId) e.sourceMessageId = input.sourceMessageId;
        tenant.enquiries.push(e);
        return { value: e, event: event('enquiry.received', e.reference, e.buyer + ' · ' + e.channel + ' · ' + e.route.reason) };
      }
      if (resource === 'enquiries' && resourceId && req.method === 'POST') {
        const e = findEnquiry(tenant, resourceId);
        let detail, changed = true;
        if (action === 'draft') { draftQuote(e, tenant, input); detail = 'Revision ' + e.quote.revision + ' prepared. Human approval required.'; }
        else if (action === 'approve') {
          expectedRevision(e, input);
          if (input.reviewConfirmed !== true) throw new DomainError('Confirm the commercial review before approving.');
          changed = approveQuote(e, { ...input, corrected: e.corrected || input.corrected });
          detail = 'Approved by your team. Total reported human effort: ' + e.manualMinutes + ' minutes.';
        } else if (action === 'send') {
          expectedRevision(e, input); changed = sendQuote(e, tenant); detail = 'Simulated ' + e.channel + ' delivery. No external message was sent.';
        } else if (action === 'clarify') {
          if (['sent', 'won'].includes(e.status)) throw new DomainError('Sent quotes are locked.', 409);
          if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new DomainError('Choose at least one catalogue product.');
          e.items = input.items.map((line) => {
            const p = tenant.products.find((p) => p.sku === line.sku);
            if (!p) throw new DomainError('Product not found in this customer catalogue.');
            return { sku: p.sku, name: p.name, category: p.category, unit: p.unit, unitPrice: p.price, stock: p.stock,
              quantity: numberIn(line.quantity, 'Quantity', .01, 1e6), match: 'Team-confirmed', source: p.source, priceCheckedAt: p.updatedAt };
          });
          e.missing = []; e.quote = null; e.approvedAt = null; e.manualMinutes = null; e.corrected = true; e.status = 'new';
          e.route = routeEnquiry(e, tenant.rules, tenant.config); detail = 'Product selection confirmed by your team; quote approval is still required.';
        } else if (action === 'outbound') {
          if (['sent', 'won'].includes(e.status)) throw new DomainError('Delivery channel is locked after sending.', 409);
          const c = tenant.connectors.find((c) => c.name === input.channel && c.enabled && c.kind === 'channel' && c.capabilities.includes('send_message'));
          if (!c) throw new DomainError('Choose an enabled outbound channel.');
          e.channel = c.name; detail = 'Outbound channel selected: ' + c.name;
        } else if (action === 'followup') {
          if (e.status !== 'sent' || !e.followup) throw new DomainError('Follow-up requires a sent quote.', 409);
          const c = tenant.connectors.find((c) => c.name === e.channel && c.enabled && c.capabilities.includes('send_message'));
          if (!c) throw new DomainError('The outbound channel is disabled or unavailable.');
          changed = !e.followup.sentAt;
          if (changed) { e.followup.sentAt = new Date().toISOString(); e.followup.status = 'sent'; }
          detail = 'Simulated follow-up receipt recorded. No external message was sent.';
        } else if (action === 'won') {
          if (e.status === 'won') changed = false;
          else {
            if (e.status !== 'sent') throw new DomainError('Record an order only after the quote is sent.', 409);
            e.orderValue = numberIn(input.orderValue ?? e.quote.total, 'Linked order value', 0, 1e10);
            e.status = 'won'; e.wonAt = new Date().toISOString();
            if (e.followup) e.followup.status = 'cancelled';
          }
          detail = 'Demo order linked. This value is not attributed incremental revenue.';
        } else throw new DomainError('Unknown enquiry action.', 404);
        return { value: e, event: changed ? event('quote.' + action, e.reference, detail) : null };
      }
      throw new DomainError('Unsupported operation.', 404);
    });
    json(res, value);
  } catch (error) {
    if (!(error instanceof DomainError)) console.error('Request failed:', error.message);
    if (!res.headersSent) json(res, { error: error instanceof DomainError ? error.message : 'The server could not complete this request.' }, error.status || 500);
    else res.end();
  }
});
server.requestTimeout = 30000;
server.listen(Number(process.env.PORT || 3000), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => {
  console.log('Relay Industrial Desk listening on port ' + server.address().port + ' (' + (production ? 'protected deployment' : 'local prototype') + ').');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
