import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { makeEnquiry, draftQuote, approveQuote, sendQuote, reporting, extractItems, validateProduct } from '../src/domain.mjs';
import { commercialIssues, normaliseTenant, recordResponse, addEffort } from '../src/workflow.mjs';
import { seedTenants } from '../src/seed.mjs';
import { openStore } from '../src/store.mjs';
import { deliveryJob, processJobs } from '../src/jobs.mjs';
import { hashPassword, verifyPassword, roleFor, requireRole } from '../src/auth.mjs';
import { quotationHTML } from '../src/quotation.mjs';

function fixture() {
  const t = normaliseTenant(seedTenants()[0]); t.enquiries = [];
  const e = makeEnquiry({ buyer: 'Fictional customer', buyerId: 'BUYER-1', recipient: 'buyer@example.test',
    channel: 'Email', message: '10 × SKF-6205-2RS', sourceMessageId: 'MSG-1' }, t);
  t.enquiries.push(e);
  return { t, e };
}
function approve(t, e, minutes = 5) { draftQuote(e, t); approveQuote(e, { manualMinutes: minutes, actor: 'Named reviewer' }, t); }
function scratch(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'qmate-hardening-'));
  try { fn(dir); } finally {
    const safe = resolve(dir);
    assert.ok(safe.startsWith(resolve(tmpdir()) + sep) && safe.includes('qmate-hardening-'));
    rmSync(safe, { recursive: true, force: true });
  }
}

test('unknown lines, SKU suffixes, negative and malformed quantities never become complete quotes', () => {
  const { t } = fixture();
  for (const message of ['10 × SKF-6205-2RS and 5 × UNKNOWN-X', '5 × SKF-6205-2RS-C3', '-5 × SKF-6205-2RS',
    '10 × SKF-6205-2RS; nitrile aprons', '10 × SKF-6205-2RS, also quote unknown sleeves', '1,000 × SKF-6205-2RS']) {
    assert.ok(extractItems(message, t.products).missing.length, message);
  }
});
test('fresh revision uses current price and dispatch blocks all material changes and expired approval', () => {
  for (const change of [(t) => { t.products[0].price *= 2; }, (t) => { t.products[0].stock = 0; },
    (t) => { t.config.maxDiscount = 0; }, (t) => { t.config.paymentTerms = 'Changed'; },
    (t) => { t.products[0].updatedAt = new Date(Date.now() - 3 * 86400000).toISOString(); }]) {
    const { t, e } = fixture(); draftQuote(e, t, { discount: 5 });
    approveQuote(e, { manualMinutes: 5, actor: 'Reviewer' }, t); change(t);
    assert.throws(() => sendQuote(e, t), /changed|policy|stale|stock/);
  }
  const { t, e } = fixture(); approve(t, e);
  e.approvedAt = new Date(Date.now() - 25 * 3600000).toISOString();
  assert.throws(() => sendQuote(e, t), /expired/);
  t.products[0].price = 840; draftQuote(e, t);
  assert.equal(e.quote.items[0].unitPrice, 840);
});
test('immutable approved snapshots and additive rework survive a revision without erasing past approvals', () => {
  const { t, e } = fixture(); approve(t, e, 8);
  const snapshot = structuredClone(e.approvals[0]);
  draftQuote(e, t, { discount: 5, reason: 'New request' });
  assert.equal(reporting(t).approved, 1);
  assert.equal(reporting(t).actualHours, .13);
  approveQuote(e, { manualMinutes: 3, corrected: true, actor: 'Second reviewer' }, t);
  assert.deepEqual(e.approvals[0], snapshot);
  assert.equal(e.approvals.length, 2);
  assert.equal(e.manualMinutes, 11);
  assert.equal(reporting(t).approved, 1);
  assert.equal(reporting(t).actualHours, .18);
  const html = quotationHTML(t, e, e.approvals[0]);
  assert.match(html, /Revision 1/); assert.match(html, /Named reviewer/);
});
test('customer price breaks, pack quantities and product tax rates follow catalogue authority', () => {
  const { t, e } = fixture();
  t.products[0] = validateProduct({ ...t.products[0], packSize: 5, taxRate: 12,
    customerPrices: [{ buyerId: 'BUYER-1', minQuantity: 10, price: 400 }] });
  draftQuote(e, t); assert.equal(e.quote.items[0].unitPrice, 400); assert.equal(e.quote.taxAmount, 480);
  e.items[0].quantity = 11; assert.throws(() => draftQuote(e, t), /pack size/);
});
test('stock shortage needs explicit backorder confirmation and a recorded lead time', () => {
  const { t, e } = fixture(); t.products[0].stock = 0;
  draftQuote(e, t, { backorderConfirmed: true }); assert.ok(commercialIssues(e, t).some((s) => s.includes('lead time')));
  t.products[0].leadTime = 'Two weeks, subject to supplier confirmation';
  draftQuote(e, t, { backorderConfirmed: true }); approveQuote(e, { manualMinutes: 5, actor: 'Reviewer' }, t);
  assert.equal(sendQuote(e, t), true);
});
test('recorded reply prevents a queued follow-up at final dispatch and new revisions cancel old queued work', () => scratch((dir) => {
  const store = openStore(dir, false);
  try {
    const { t, e } = fixture(); approve(t, e); store.insert(t);
    const j = deliveryJob(e, t, 'quote', 'Reviewer');
    store.mutate(t.id, () => ({ jobs: [j] }));
    processJobs(store);
    assert.equal(store.jobs(t.id).find((x) => x.id === j.id).status, 'simulated');
    const followup = store.jobs(t.id).find((x) => x.kind === 'followup');
    followup.dueAt = new Date().toISOString(); store.saveJob(followup);
    store.mutate(t.id, (v) => recordResponse(v.enquiries[0], { kind: 'reply', text: 'Please wait' }, 'Operator'));
    processJobs(store);
    assert.equal(store.jobs(t.id).find((x) => x.kind === 'followup').status, 'cancelled');
    assert.equal(store.get(t.id).enquiries[0].followup.sentAt, null);
  } finally { store.close(); }
}));
test('queued delivery is held for stale data, can be paused and survives database reopening', () => scratch((dir) => {
  let store = openStore(dir, false);
  const { t, e } = fixture(); approve(t, e); t.config.paused = true; store.insert(t);
  // Queue before pausing, exactly as an administrator can pause existing work.
  t.config.paused = false; const j = deliveryJob(e, t, 'quote', 'Reviewer');
  store.mutate(t.id, () => ({ jobs: [j] })); store.close();
  store = openStore(dir, false);
  try {
    processJobs(store); assert.equal(store.jobs(t.id)[0].status, 'queued');
    store.mutate(t.id, (v) => { v.config.paused = false; v.products[0].price = 900; });
    processJobs(store); assert.equal(store.jobs(t.id)[0].status, 'held');
    assert.notEqual(store.get(t.id).enquiries[0].status, 'sent');
  } finally { store.close(); }
}));
test('backup snapshot restores users, workspace data and durable job records', () => scratch((dir) => {
  const original = join(dir, 'original'), restored = join(dir, 'restored'); mkdirSync(restored);
  const store = openStore(original, false);
  const { t, e } = fixture(); approve(t, e); store.insert(t);
  store.saveUser({ id: 'test-user', email: 'test@example.test', name: 'Backup owner', passwordHash: 'test-only-hash',
    admin: true, active: true, memberships: [] });
  const j = deliveryJob(e, t, 'quote', 'Reviewer'); store.mutate(t.id, () => ({ jobs: [j] }));
  store.backup(join(restored, 'relay.sqlite')); store.close();
  const recovered = openStore(restored, false);
  try { assert.equal(recovered.userCount(), 1); assert.equal(recovered.jobs(t.id).length, 1); assert.equal(recovered.get(t.id).enquiries[0].approvals.length, 1); }
  finally { recovered.close(); }
}));
test('identity passwords are salted and workspace permissions follow the actual user', async () => {
  const password = 'test-individual-password-123';
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b); assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
  const u = { active: true, admin: false, memberships: [{ customerId: 'a', role: 'viewer' }] };
  assert.equal(roleFor(u, 'a'), 'viewer'); assert.throws(() => requireRole(u, 'b'), /permission/);
  assert.throws(() => requireRole(u, 'a', ['admin', 'approver']), /permission/);
});
test('legacy surviving history migrates without inventing lost revisions and initial-match quality stays immutable', () => {
  const { t, e } = fixture(); approve(t, e);
  delete e.approvals; delete e.effort; normaliseTenant(t);
  assert.equal(e.approvals.length, 1); assert.equal(e.approvals[0].legacy, true);
  e.initiallyMatched = false; e.missing = [];
  addEffort(e, { minutes: 2, note: 'Manual fallback' }, 'Operator');
  assert.equal(reporting(t).matchedRate, 0);
  assert.equal(e.manualMinutes, 7);
});

test('legacy database is snapshotted before schema migration without losing the original workspace', () => scratch((dir) => {
  const { t } = fixture();
  const legacy = new DatabaseSync(join(dir, 'relay.sqlite'));
  legacy.exec('CREATE TABLE customers (id TEXT PRIMARY KEY, document TEXT NOT NULL)');
  legacy.prepare('INSERT INTO customers VALUES(?,?)').run(t.id, JSON.stringify(t)); legacy.close();
  const migrated = openStore(dir, false);
  try {
    assert.equal(migrated.get(t.id).name, t.name);
    const snapshots = readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('pre-v0.2-'));
    assert.equal(snapshots.length, 1);
    const backup = new DatabaseSync(join(dir, 'backups', snapshots[0]), { readOnly: true });
    try {
      assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 1);
      assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(), undefined);
    } finally { backup.close(); }
  } finally { migrated.close(); }
}));
test('backup CLI opens the existing source without seeding and verifies the resulting snapshot', () => scratch((dir) => {
  const store = openStore(dir, false); const { t } = fixture(); store.insert(t); store.close();
  const result = spawnSync(process.execPath, ['scripts/backup.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATA_DIR: dir, BACKUP_DIR: join(dir, 'copies') }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout);
  assert.equal(record.customers, 1); assert.ok(record.verifiedAt);
}));
