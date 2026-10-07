import { randomUUID } from 'node:crypto';

export const id = (prefix) => prefix + '_' + randomUUID().replaceAll('-', '').slice(0, 12);
export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const TEAM = ['Priya Nair', 'Arjun Mehta', 'Karthik Rao'];
export const CAPABILITIES = ['receive_message', 'send_message', 'read_products', 'read_prices', 'read_stock', 'read_customers', 'write_quote', 'write_task'];
export const CONNECTOR_PRESETS = [
  { name: 'WhatsApp', kind: 'channel', capabilities: ['receive_message', 'send_message'], color: '#277e56', initials: 'WA' },
  { name: 'Email', kind: 'channel', capabilities: ['receive_message', 'send_message'], color: '#5178a0', initials: 'EM' },
  { name: 'Web form', kind: 'channel', capabilities: ['receive_message'], color: '#876247', initials: 'WF' },
  { name: 'Voice', kind: 'channel', capabilities: ['receive_message', 'send_message'], color: '#946a88', initials: 'VO' },
  { name: 'SMS', kind: 'channel', capabilities: ['receive_message', 'send_message'], color: '#857334', initials: 'SM' },
  { name: 'Telegram', kind: 'channel', capabilities: ['receive_message', 'send_message'], color: '#3788a6', initials: 'TG' },
  { name: 'Slack / Teams', kind: 'channel', capabilities: ['receive_message', 'send_message'], color: '#6c708b', initials: 'ST' },
  { name: 'Zoho CRM', kind: 'system', capabilities: ['read_customers', 'write_quote', 'write_task'], color: '#b45b43', initials: 'ZO' },
  { name: 'Tally', kind: 'system', capabilities: ['read_products', 'read_prices', 'read_stock', 'read_customers'], color: '#4f7b79', initials: 'TA' },
  { name: 'Odoo', kind: 'system', capabilities: ['read_products', 'read_prices', 'read_stock', 'read_customers', 'write_quote'], color: '#826578', initials: 'OD' },
  { name: 'Salesforce', kind: 'system', capabilities: ['read_customers', 'write_quote', 'write_task'], color: '#4487a4', initials: 'SF' },
  { name: 'SAP / Dynamics', kind: 'system', capabilities: ['read_products', 'read_prices', 'read_stock', 'read_customers', 'write_quote'], color: '#677a9a', initials: 'ER' },
  { name: 'Sheets / Excel', kind: 'system', capabilities: ['read_products', 'read_prices', 'read_stock'], color: '#57835e', initials: 'SH' },
  { name: 'Custom API / webhook', kind: 'system', capabilities: [], color: '#727872', initials: 'API' }
];

export class DomainError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requiredText(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new DomainError(label + ' is required (maximum ' + max + ' characters).');
  return value.trim();
}
export function numberIn(value, label, min, max) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') throw new DomainError(label + ' is required.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new DomainError(label + ' must be between ' + min + ' and ' + max + '.');
  return n;
}
export function validateProduct(p) {
  return {
    id: p.id || id('product'), sku: requiredText(p.sku, 'SKU', 80),
    name: requiredText(p.name, 'Product name'), category: requiredText(p.category, 'Category', 100),
    unit: requiredText(p.unit || 'unit', 'Unit', 40),
    price: numberIn(p.price, 'Unit price', 0, 1e8),
    stock: numberIn(p.stock, 'Stock', 0, 1e8),
    aliases: Array.isArray(p.aliases) ? p.aliases.map((v) => requiredText(v, 'Alias', 120)).slice(0, 10) : [],
    source: requiredText(p.source || 'Imported catalogue', 'Source', 100), updatedAt: new Date().toISOString()
  };
}
export function validateRule(r) {
  if (!['channel', 'category', 'value', 'match'].includes(r.field)) throw new DomainError('Unknown routing condition.');
  if (!['eq', 'gte', 'contains'].includes(r.operator)) throw new DomainError('Unknown routing operator.');
  if (r.field === 'value' && r.operator !== 'gte') throw new DomainError('Quote value rules use the at-least operator.');
  return {
    id: r.id || id('rule'), name: requiredText(r.name, 'Rule name'),
    priority: numberIn(r.priority, 'Priority', 1, 999), enabled: r.enabled !== false,
    field: r.field, operator: r.operator,
    value: r.field === 'value' ? String(numberIn(r.value, 'Threshold', 0, 1e10)) : requiredText(r.value, 'Condition value'),
    queue: requiredText(r.queue, 'Queue'), owner: requiredText(r.owner, 'Owner')
  };
}
function escapedRegex(text) { return text.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'); }
function locateTerm(text, term) {
  return new RegExp('(^|[^a-z0-9])(' + escapedRegex(term) + ')(?=$|[^a-z0-9])', 'i').exec(text);
}
export function extractItems(message, products) {
  // Deterministic matching for this prototype; no external LLM is called.
  // Exact identifiers/unique aliases are accepted; incomplete requests go to review.
  const chunks = message.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  const items = [];
  const missing = [];
  for (const chunk of chunks) {
    const matches = products.map((p) => {
      const exact = locateTerm(chunk, p.sku);
      const alias = p.aliases.map((a) => locateTerm(chunk, a)).find(Boolean);
      return exact || alias ? { p, hit: exact || alias, kind: exact ? 'Exact SKU' : 'Catalogue alias' } : null;
    }).filter(Boolean);
    if (!matches.length) {
      if (/\d|motor|pump|bearing|drive|valve|quote|suitable|equivalent|glove|cable|filter|tool|bolt/i.test(chunk)) missing.push(chunk);
      continue;
    }
    for (const match of matches) {
      const overlap = matches.some((other) => other !== match && other.hit.index === match.hit.index);
      if (overlap) { missing.push('Ambiguous product: ' + chunk); continue; }
      const start = match.hit.index + match.hit[1].length;
      const before = chunk.slice(0, start);
      const after = chunk.slice(start + match.hit[2].length);
      const beforeQuantity = before.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*(?:x|×|pcs?|pieces?|units?|nos?\.?|sets?)?\s*$/i);
      const afterQuantity = after.match(/^\s*(?:[,:-]\s*)?(?:qty\s*[:=]?\s*|x\s*|×\s*)(\d+(?:\.\d+)?)/i);
      const quantity = Number((beforeQuantity || afterQuantity)?.[1]);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) { missing.push('Quantity needed for ' + match.p.sku); continue; }
      const existing = items.find((i) => i.sku === match.p.sku);
      if (existing) existing.quantity += quantity;
      else items.push({
        sku: match.p.sku, name: match.p.name, category: match.p.category, unit: match.p.unit,
        quantity, unitPrice: match.p.price, stock: match.p.stock, match: match.kind, source: match.p.source,
        priceCheckedAt: match.p.updatedAt
      });
    }
  }
  if (!items.length && !missing.length) missing.push('Product identifiers and quantities are required.');
  return { items, missing: [...new Set(missing)] };
}
export function quoteTotals(items, discount, tax) {
  const subtotal = round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const discountAmount = round(subtotal * discount / 100);
  const taxable = round(subtotal - discountAmount);
  const taxAmount = round(taxable * tax / 100);
  return { subtotal, discountAmount, taxAmount, total: round(taxable + taxAmount) };
}
export function routeEnquiry(enquiry, rules, config) {
  const ordered = rules.filter((r) => r.enabled).toSorted((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const rule of ordered) {
    let actual = '';
    if (rule.field === 'channel') actual = enquiry.channel;
    if (rule.field === 'category') actual = enquiry.items.map((i) => i.category).join('|');
    if (rule.field === 'value') actual = String(enquiry.quote?.total ?? quoteTotals(enquiry.items, 0, config.taxRate).total);
    if (rule.field === 'match') actual = enquiry.missing.length ? 'incomplete' : 'matched';
    const a = actual.toLowerCase(), b = rule.value.toLowerCase();
    const matches = rule.operator === 'gte' ? Number(actual) >= Number(rule.value) :
      rule.operator === 'contains' ? a.includes(b) : rule.field === 'category' ? a.split('|').includes(b) : a === b;
    if (matches) return { queue: rule.queue, owner: rule.owner, ruleId: rule.id, reason: rule.name, configVersion: config.version };
  }
  return { queue: 'Sales review', owner: config.defaultOwner, ruleId: null, reason: 'Default customer routing', configVersion: config.version };
}
export function makeEnquiry(input, tenant) {
  const message = requiredText(input.message, 'Enquiry message', 12000);
  const channel = requiredText(input.channel, 'Channel', 100);
  if (!tenant.connectors.some((c) => c.enabled && c.name === channel && c.kind === 'channel' && c.capabilities.includes('receive_message'))) {
    throw new DomainError('Enable a channel with receive_message capability before using it.');
  }
  const extracted = extractItems(message, tenant.products);
  const enquiry = {
    id: id('enquiry'), reference: 'RFQ-' + String(tenant.nextReference++).padStart(4, '0'),
    buyer: requiredText(input.buyer, 'Buyer'), channel, message,
    items: extracted.items, missing: extracted.missing, status: 'new',
    createdAt: new Date().toISOString(), approvedAt: null, manualMinutes: null,
    baselineMinutes: tenant.config.baselineMinutes, corrected: false,
    quote: null, followup: null, orderValue: 0, archived: false
  };
  enquiry.route = routeEnquiry(enquiry, tenant.rules, tenant.config);
  if (enquiry.missing.length) enquiry.status = 'needs_review';
  return enquiry;
}
export function draftQuote(enquiry, tenant, input = {}) {
  if (['sent', 'won'].includes(enquiry.status)) throw new DomainError('Sent quotes are locked in this prototype.', 409);
  if (enquiry.missing.length || !enquiry.items.length) throw new DomainError('Resolve the product and quantity questions before drafting.');
  const discount = numberIn(input.discount ?? 0, 'Discount', 0, tenant.config.maxDiscount);
  enquiry.quote = {
    id: enquiry.quote?.id || id('quote'), revision: (enquiry.quote?.revision || 0) + 1,
    discount, taxRate: tenant.config.taxRate, ...quoteTotals(enquiry.items, discount, tenant.config.taxRate),
    draftedAt: new Date().toISOString(), approvedRevision: null
  };
  enquiry.approvedAt = null; enquiry.manualMinutes = null; enquiry.status = 'awaiting_approval';
  enquiry.route = routeEnquiry(enquiry, tenant.rules, tenant.config);
}
export function approveQuote(enquiry, input) {
  if (enquiry.status === 'approved') return false;
  if (enquiry.status !== 'awaiting_approval' || !enquiry.quote || enquiry.missing.length) throw new DomainError('Only complete quotation drafts can be approved.', 409);
  enquiry.manualMinutes = numberIn(input.manualMinutes, 'Total human effort in minutes', 0, 1440);
  enquiry.corrected = input.corrected === true; enquiry.approvedAt = new Date().toISOString();
  enquiry.quote.approvedRevision = enquiry.quote.revision; enquiry.status = 'approved';
  return true;
}
export function sendQuote(enquiry, tenant) {
  if (['sent', 'won'].includes(enquiry.status)) return false;
  if (enquiry.status !== 'approved' || enquiry.quote?.approvedRevision !== enquiry.quote?.revision) throw new DomainError('This quote needs approval before simulated delivery.', 409);
  const connector = tenant.connectors.find((c) => c.enabled && c.kind === 'channel' && c.name === enquiry.channel);
  if (!connector?.capabilities.includes('send_message')) throw new DomainError('This channel cannot send messages. Select an enabled outbound channel first.');
  enquiry.status = 'sent'; enquiry.sentAt = new Date().toISOString();
  enquiry.followup = {
    dueAt: new Date(Date.now() + tenant.config.followupDays * 86400000).toISOString(),
    sentAt: null, status: 'scheduled', simulated: true
  };
  return true;
}
export function median(values) {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function reporting(tenant, days = 30, end = new Date()) {
  const cutoff = new Date(end.getTime() - days * 86400000);
  const inPeriod = (stamp) => stamp && new Date(stamp) >= cutoff && new Date(stamp) <= end;
  const received = tenant.enquiries.filter((e) => inPeriod(e.createdAt));
  // Approved cohort is the denominator for effort and quality.
  const completed = tenant.enquiries.filter((e) => inPeriod(e.approvedAt) && Number.isFinite(e.manualMinutes));
  const baselineMinutes = completed.reduce((s, e) => s + e.baselineMinutes, 0);
  const humanMinutes = completed.reduce((s, e) => s + e.manualMinutes, 0);
  const savedHours = round((baselineMinutes - humanMinutes) / 60);
  const due = tenant.enquiries.filter((e) => e.followup && e.followup.status !== 'cancelled' && inPeriod(e.followup.dueAt));
  const onTime = due.filter((e) => e.followup.sentAt && new Date(e.followup.sentAt) <= new Date(e.followup.dueAt));
  const daily = [];
  for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
    const date = new Date(end.getTime() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const rows = completed.filter((e) => new Date(e.approvedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === date);
    daily.push({
      date, count: rows.length,
      baseline: round(rows.reduce((s, e) => s + e.baselineMinutes, 0) / 60),
      actual: round(rows.reduce((s, e) => s + e.manualMinutes, 0) / 60)
    });
  }
  const categories = [...new Set(tenant.products.map((p) => p.category))].map((category) => {
    const rows = received.filter((e) => e.items.some((p) => p.category === category));
    return { category, enquiries: rows.length, approvals: rows.filter((e) => e.approvedAt).length,
      products: tenant.products.filter((p) => p.category === category).length };
  }).toSorted((a, b) => b.enquiries - a.enquiries);
  return {
    days, from: cutoff.toISOString(), to: end.toISOString(), received: received.length, approved: completed.length,
    savedHours, baselineHours: round(baselineMinutes / 60), actualHours: round(humanMinutes / 60),
    capacityValue: round(savedHours * tenant.config.hourlyCost),
    medianApprovalMinutes: median(completed.map((e) => Math.max(0, (new Date(e.approvedAt) - new Date(e.createdAt)) / 60000))),
    onTimeRate: due.length ? round(onTime.length / due.length * 100) : null,
    followupsDue: due.length, followupsOnTime: onTime.length,
    correctionRate: completed.length ? round(completed.filter((e) => e.corrected).length / completed.length * 100) : null,
    matchedRate: received.length ? round(received.filter((e) => !e.missing.length).length / received.length * 100) : null,
    pendingApprovals: tenant.enquiries.filter((e) => e.status === 'awaiting_approval').length,
    needsReview: tenant.enquiries.filter((e) => e.status === 'needs_review').length,
    overdue: tenant.enquiries.filter((e) => e.status !== 'won' && e.followup && !e.followup.sentAt && new Date(e.followup.dueAt) < end).length,
    linkedOrderValue: tenant.enquiries.filter((e) => e.status === 'won' && inPeriod(e.wonAt)).reduce((s, e) => s + e.orderValue, 0),
    daily, categories
  };
}
