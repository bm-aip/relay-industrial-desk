import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = mkdtempSync(join(tmpdir(), 'relay-test-'));
let child, origin, cookie, csrf, data;
async function request(path, method = 'GET', value, authenticated = true, headers = {}) {
  const action = /^\/api\/customers\/([^/]+)\/enquiries\/([^/]+)\/[^/]+$/.exec(path);
  if (method === 'POST' && action && value && value.version === undefined) {
    const current = await request('/api/bootstrap?customer=' + action[1]);
    value = { ...value, version: current.parsed.tenant?.enquiries.find((e) => e.id === action[2])?.version };
  }
  const response = await fetch(origin + path, { method, headers: {
    'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie || '', 'X-CSRF-Token': csrf || '' } : {}), ...headers
  }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const parsed = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, parsed, response };
}
before(async () => {
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', DATA_DIR: scratch, TEAM_PASSWORD: 'test-team-password-123', SEED_DEMO: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out.')), 20000);
    child.stdout.on('data', (chunk) => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) { origin = 'http://127.0.0.1:' + match[1]; clearTimeout(timer); resolveReady(); }
    });
    child.on('error', reject);
    child.on('exit', (code) => { if (!origin) { clearTimeout(timer); reject(new Error('Server exited with ' + code)); } });
  });
  const login = await request('/api/setup', 'POST', { bootstrapPassword: 'test-team-password-123', email: 'owner@example.test', name: 'Test owner', password: 'individual-password-123' }, false);
  assert.equal(login.status, 200);
  cookie = login.response.headers.get('set-cookie').split(';')[0]; csrf = login.parsed.csrf;
  data = (await request('/api/bootstrap')).parsed;
});
after(async () => {
  if (child && child.exitCode === null) {
    await new Promise((done) => { child.once('exit', done); child.kill(); });
  }
  const safe = resolve(scratch);
  if (!safe.startsWith(resolve(tmpdir()) + sep) || !safe.includes('relay-test-')) throw new Error('Unsafe test cleanup path.');
  rmSync(safe, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
test('health is public; workspace records require authentication', async () => {
  assert.equal((await request('/health', 'GET', undefined, false)).status, 200);
  assert.equal((await request('/api/bootstrap', 'GET', undefined, false)).status, 401);
  assert.equal((await request('/data/relay.sqlite')).status, 404);
});
test('mutations require CSRF and the same origin', async () => {
  const path = '/api/customers/' + data.tenant.id + '/config';
  assert.equal((await request(path, 'POST', { hourlyCost: 400 }, true, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await request(path, 'POST', { hourlyCost: 400 }, true, { Origin: 'https://unrelated.example' })).status, 403);
});
test('full workflow persists, updates reporting and prevents duplicate deliveries', async () => {
  const root = '/api/customers/' + data.tenant.id;
  const payload = { buyer: 'API test buyer', channel: 'Email', message: '30 × SKF-6205-2RS; 2 × ABB-ACS355-2.2', sourceMessageId: 'duplicate-message-test' };
  const created = await request(root + '/enquiries', 'POST', payload);
  assert.equal(created.status, 200);
  const e = created.parsed;
  assert.equal(e.items.length, 2);
  const duplicate = await request(root + '/enquiries', 'POST', payload);
  assert.equal(duplicate.parsed.id, e.id);
  assert.equal((await request(root + '/enquiries/' + e.id + '/send', 'POST', { revision: 1 })).status, 409);
  const draft = (await request(root + '/enquiries/' + e.id + '/draft', 'POST', { discount: 0 })).parsed;
  assert.equal(draft.quote.total, 58528);
  assert.equal((await request(root + '/enquiries/' + e.id + '/approve', 'POST', { revision: 1, manualMinutes: 8 })).status, 400);
  assert.equal((await request(root + '/enquiries/' + e.id + '/approve', 'POST', { revision: 99, manualMinutes: 8, reviewConfirmed: true })).status, 409);
  assert.equal((await request(root + '/enquiries/' + e.id + '/approve', 'POST', { revision: 1, manualMinutes: 8, reviewConfirmed: true })).status, 200);
  await request(root + '/enquiries/' + e.id + '/send', 'POST', { revision: 1 });
  await request(root + '/enquiries/' + e.id + '/send', 'POST', { revision: 1 });
  for (let i = 0; i < 30; i++) {
    const snapshot = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed;
    if (snapshot.tenant.enquiries.find((v) => v.id === e.id)?.status === 'sent') break;
    await new Promise((done) => setTimeout(done, 100));
  }
  const afterData = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed;
  assert.equal(afterData.metrics.approved, data.metrics.approved + 1);
  assert.equal(afterData.events.filter((v) => v.type === 'delivery.simulated' && v.subject === e.reference).length, 1);
  const other = data.customers.find((c) => c.id !== data.tenant.id);
  assert.equal((await request('/api/customers/' + other.id + '/enquiries/' + e.id + '/draft', 'POST', {})).status, 404);
  await request(root + '/enquiries/' + e.id + '/won', 'POST', {});
  assert.equal((await request(root + '/enquiries/' + e.id + '/followup', 'POST', {})).status, 409);
});
test('new customer workspaces start without fabricated impact', async () => {
  const created = (await request('/api/customers', 'POST', { name: 'Empty test distributor', city: 'Pune', sampleCatalogue: false })).parsed;
  const fresh = (await request('/api/bootstrap?customer=' + created.id)).parsed;
  assert.equal(fresh.metrics.savedHours, 0);
  assert.equal(fresh.metrics.approved, 0);
  assert.equal(fresh.metrics.onTimeRate, null);
  assert.equal(fresh.tenant.products.length, 0);
});
test('catalogue imports roll back completely on invalid rows', async () => {
  const root = '/api/customers/' + data.tenant.id;
  const beforeData = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed;
  const result = await request(root + '/products', 'POST', { products: [
    { sku: 'NEW-VALID', name: 'Valid', category: 'Tools', price: 10, stock: 2 },
    { sku: 'NEW-INVALID', name: 'Invalid', category: 'Tools', price: -10, stock: 2 }
  ] });
  assert.equal(result.status, 400);
  const afterData = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed;
  assert.equal(afterData.tenant.products.length, beforeData.tenant.products.length);
  assert.ok(!afterData.tenant.products.some((p) => p.sku === 'NEW-VALID'));
});
test('custom channel mappings can normalize sample payloads into enquiries', async () => {
  const root = '/api/customers/' + data.tenant.id;
  const configured = (await request(root + '/connectors', 'POST', {
    name: 'Custom trade portal', kind: 'channel', enabled: true,
    capabilities: ['receive_message', 'send_message'], mapping: { buyer: 'contact.company', message: 'rfq.body', sourceMessageId: 'rfq.id' }
  })).parsed;
  const payload = { contact: { company: 'Custom payload buyer' }, rfq: { id: 'test-rfq-123', body: '20 × ESAB-E6013' } };
  const normalized = await request(root + '/connectors/' + configured.id + '/test', 'POST', { payload });
  assert.equal(normalized.parsed.mode, 'simulation');
  assert.equal(normalized.parsed.mapped.buyer, 'Custom payload buyer');
  const result = await request(root + '/connectors/' + configured.id + '/ingest', 'POST', { payload });
  assert.equal(result.parsed.channel, 'Custom trade portal');
  assert.equal(result.parsed.items[0].quantity, 20);
  const duplicate = await request(root + '/connectors/' + configured.id + '/ingest', 'POST', { payload });
  assert.equal(duplicate.parsed.id, result.parsed.id);
  assert.equal((await request(root + '/connectors', 'POST', {
    name: 'Unsafe mapping', kind: 'channel', capabilities: [], mapping: { buyer: '__proto__.secret' }
  })).status, 400);
});

async function account(name, role, customerId) {
  const email = name + '@example.test', password = 'test-individual-password-123';
  const created = await request('/api/users', 'POST', { email, name, password, admin: false, active: true,
    memberships: [{ customerId, role }] });
  assert.equal(created.status, 200);
  const login = await request('/api/login', 'POST', { email, password }, false);
  assert.equal(login.status, 200);
  return { user: created.parsed, headers: { Cookie: login.response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': login.parsed.csrf } };
}
test('operator and viewer APIs cannot cross workspace boundaries or bypass role permissions', async () => {
  const own = data.tenant.id, other = data.customers.find((c) => c.id !== own).id;
  const op = await account('operator', 'operator', own);
  assert.equal((await request('/api/bootstrap?customer=' + other, 'GET', undefined, true, op.headers)).status, 403);
  assert.equal((await request('/api/report.csv?customer=' + other, 'GET', undefined, true, op.headers)).status, 403);
  assert.equal((await request('/api/customers/' + other + '/enquiries', 'POST', { buyer: 'Unauthorized', channel: 'Email', message: '10 × SKF-6205-2RS' }, true, op.headers)).status, 403);
  assert.equal((await request('/api/customers/' + own + '/config', 'POST', { maxDiscount: 50 }, true, op.headers)).status, 403);
  assert.equal((await request('/api/users', 'POST', {}, true, op.headers)).status, 403);
  const created = (await request('/api/customers/' + own + '/enquiries', 'POST', { buyer: 'Permission check', channel: 'Email', message: '10 × SKF-6205-2RS' })).parsed;
  await request('/api/customers/' + own + '/enquiries/' + created.id + '/draft', 'POST', {});
  const current = (await request('/api/bootstrap?customer=' + own)).parsed.tenant.enquiries.find((e) => e.id === created.id);
  assert.equal((await request('/api/customers/' + own + '/enquiries/' + created.id + '/approve', 'POST',
    { version: current.version, revision: current.quote.revision, manualMinutes: 3, reviewConfirmed: true }, true, op.headers)).status, 403);
  const view = await account('viewer', 'viewer', own);
  const payload = (await request('/api/bootstrap?customer=' + own, 'GET', undefined, true, view.headers)).parsed;
  assert.equal(payload.customers.length, 1); assert.equal(payload.tenant.enquiries.length, 0);
  assert.equal(payload.tenant.products.length, 0); assert.equal(payload.users.length, 0); assert.equal(payload.jobs.length, 0);
  assert.equal(payload.metrics.economics, undefined);
  assert.equal((await request('/api/customers/' + own + '/enquiries', 'POST', {}, true, view.headers)).status, 403);
  assert.equal((await request('/api/customers/' + own + '/export', 'GET', undefined, true, view.headers)).status, 403);
});
test('stale edits conflict and the original intake identity survives outbound channel changes', async () => {
  const root = '/api/customers/' + data.tenant.id;
  const payload = { buyer: 'Source identity test', channel: 'Email', sourceMessageId: 'immutable-source-id', message: '10 × SKF-6205-2RS' };
  const e = (await request(root + '/enquiries', 'POST', payload)).parsed;
  const moved = await request(root + '/enquiries/' + e.id + '/outbound', 'POST', { version: e.version, channel: 'WhatsApp', recipient: '+919999999999' });
  assert.equal(moved.status, 200);
  assert.equal(moved.parsed.originalChannel, 'Email'); assert.equal(moved.parsed.outboundChannel, 'WhatsApp');
  assert.equal((await request(root + '/enquiries', 'POST', payload)).parsed.id, e.id);
  assert.equal((await request(root + '/enquiries/' + e.id + '/draft', 'POST', { version: e.version })).status, 409);
});
test('user revocation invalidates existing sessions and shared-password sign-in cannot bypass identity setup', async () => {
  const op = await account('revoked', 'operator', data.tenant.id);
  const disabled = await request('/api/users', 'POST', { ...op.user, active: false });
  assert.equal(disabled.status, 200);
  assert.equal((await request('/api/bootstrap', 'GET', undefined, true, op.headers)).status, 401);
  assert.equal((await request('/api/login', 'POST', { password: 'test-team-password-123' }, false)).status, 400);
  assert.equal((await request('/api/setup', 'POST', { bootstrapPassword: 'test-team-password-123', email: 'attacker@example.test', name: 'Attacker', password: 'another-password-123' }, false)).status, 401);
});

test('catalogue preview is non-destructive and rollback retains a way to restore the displaced catalogue', async () => {
  const root = '/api/customers/' + data.tenant.id;
  const product = { sku: 'ROLLBACK-TEST', name: 'Fictional rollback product', category: 'Tools', price: 25.5, stock: 10 };
  const before = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed.tenant;
  assert.equal((await request(root + '/products', 'POST', { products: [product], preview: true })).status, 200);
  assert.equal((await request('/api/bootstrap?customer=' + data.tenant.id)).parsed.tenant.products.length, before.products.length);
  await request(root + '/products', 'POST', { products: [product] });
  const after = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed.tenant;
  const snapshot = after.catalogueHistory.at(-1);
  assert.equal((await request(root + '/catalogue-restore', 'POST', { snapshotId: snapshot.id })).status, 200);
  const restored = (await request('/api/bootstrap?customer=' + data.tenant.id)).parsed.tenant;
  assert.deepEqual(restored.products, before.products);
  assert.ok(restored.catalogueHistory.at(-1).products.some((p) => p.sku === product.sku));
});
