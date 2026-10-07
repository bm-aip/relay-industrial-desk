import test from 'node:test';
import assert from 'node:assert/strict';
import { extractItems, makeEnquiry, draftQuote, approveQuote, sendQuote, reporting, routeEnquiry } from '../src/domain.mjs';
import { seedTenants } from '../src/seed.mjs';

test('mixed-category RFQs use exact catalogue prices and quantities', () => {
  const tenant = seedTenants()[0];
  const result = extractItems('Please quote 30 × SKF-6205-2RS;\n2 × ABB-ACS355-2.2', tenant.products);
  assert.equal(result.missing.length, 0);
  assert.deepEqual(result.items.map((i) => [i.sku, i.quantity, i.unitPrice]), [['SKF-6205-2RS', 30, 420], ['ABB-ACS355-2.2', 2, 18500]]);
});
test('missing quantities, invented SKUs and ambiguous aliases require review', () => {
  const tenant = seedTenants()[0];
  assert.ok(extractItems('Quote SKF-6205-2RS', tenant.products).missing.length);
  assert.equal(extractItems('20 × UNKNOWN-MOTOR-5', tenant.products).items.length, 0);
  tenant.products[1].aliases.push('6205-2RS');
  const result = extractItems('20 × 6205-2RS', tenant.products);
  assert.equal(result.items.length, 0);
  assert.ok(result.missing.some((m) => m.includes('Ambiguous')));
});
test('routing uses first matching priority with documented fallback', () => {
  const tenant = seedTenants()[0];
  const e = makeEnquiry({ buyer: 'Test buyer', channel: 'Email', message: '4 × ABB-ACS355-2.2' }, tenant);
  assert.equal(e.route.queue, 'Sales lead');
  assert.equal(e.route.configVersion, 1);
  e.missing.push('Specification needed');
  assert.equal(routeEnquiry(e, tenant.rules, tenant.config).queue, 'Technical review');
  assert.equal(routeEnquiry(e, [], tenant.config).owner, tenant.config.defaultOwner);
});
test('quote approval, revisions and sends enforce state and discount limits', () => {
  const tenant = seedTenants()[0];
  const e = makeEnquiry({ buyer: 'Test', channel: 'Email', message: '10 × SKF-6205-2RS' }, tenant);
  assert.throws(() => sendQuote(e, tenant), /approval/);
  assert.throws(() => draftQuote(e, tenant, { discount: 11 }), /between/);
  draftQuote(e, tenant);
  assert.equal(e.quote.total, 4956);
  approveQuote(e, { manualMinutes: 8, corrected: false });
  assert.equal(approveQuote(e, { manualMinutes: 8 }), false);
  draftQuote(e, tenant, { discount: 5 });
  assert.equal(e.quote.revision, 2);
  assert.equal(e.approvedAt, null);
  assert.throws(() => sendQuote(e, tenant), /approval/);
  approveQuote(e, { manualMinutes: 10, corrected: true });
  assert.equal(sendQuote(e, tenant), true);
  assert.equal(sendQuote(e, tenant), false);
  assert.throws(() => draftQuote(e, tenant), /locked/);
});
test('disabled or inbound-only channels cannot simulate outbound delivery', () => {
  const tenant = seedTenants()[0];
  const e = makeEnquiry({ buyer: 'Test', channel: 'Web form', message: '10 × SKF-6205-2RS' }, tenant);
  draftQuote(e, tenant); approveQuote(e, { manualMinutes: 5 });
  assert.throws(() => sendQuote(e, tenant), /cannot send/);
  tenant.connectors.find((c) => c.name === 'Email').enabled = false;
  assert.throws(() => makeEnquiry({ buyer: 'Test', channel: 'Email', message: '10 × SKF-6205-2RS' }, tenant), /Enable/);
});
test('impact excludes unapproved work and retains negative savings and baseline snapshots', () => {
  const tenant = seedTenants()[0]; tenant.enquiries = [];
  const e = makeEnquiry({ buyer: 'Test', channel: 'Email', message: '10 × SKF-6205-2RS' }, tenant);
  tenant.enquiries.push(e);
  assert.equal(reporting(tenant).approved, 0);
  draftQuote(e, tenant); approveQuote(e, { manualMinutes: 30, corrected: true });
  tenant.config.baselineMinutes = 100;
  const report = reporting(tenant);
  assert.equal(report.approved, 1);
  assert.equal(report.savedHours, -.1);
  assert.equal(report.correctionRate, 100);
  assert.equal(e.baselineMinutes, 24);
  assert.equal(report.followupsDue, 0);
  assert.equal(report.onTimeRate, null);
});
