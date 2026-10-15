import { randomUUID } from 'node:crypto';
import { normaliseTenant, freshItems, assertCommercial, archiveQuote, addEffort, lineTotals } from './workflow.mjs';

export const id = (prefix) => prefix + '_' + randomUUID().replaceAll('-', '').slice(0, 12);
export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const TEAM = ['Unassigned'];
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
    packSize: numberIn(p.packSize ?? 1, 'Pack size', .001, 1e6),
    minimumQuantity: numberIn(p.minimumQuantity ?? .01, 'Minimum quantity', .001, 1e6),
    leadTime: typeof p.leadTime === 'string' ? p.leadTime.trim().slice(0, 200) : '',
    taxRate: p.taxRate === '' || p.taxRate == null ? null : numberIn(p.taxRate, 'Product tax rate', 0, 50),
    customerPrices: Array.isArray(p.customerPrices) ? p.customerPrices.slice(0, 200).map((r) => ({
      buyerId: requiredText(r.buyerId, 'Buyer ID', 100), minQuantity: numberIn(r.minQuantity ?? 0, 'Price break quantity', 0, 1e6),
      price: numberIn(r.price, 'Contract unit price', 0, 1e8)
    })) : [],
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
  return new RegExp('(^|[^a-z0-9_./-])(' + escapedRegex(term) + ')(?=$|[^a-z0-9_./-]|[.,]$)', 'i').exec(text);
}
export function extractItems(message, products) {
  // Deliberately conservative: unaccounted request text is never silently discarded.
  const chunks = message.split(/[;\n]+|\s+(?:and|&)\s+|,\s+(?=[+-]?\d)/i).map((s) => s.trim()).filter(Boolean);
  const items = [];
  const missing = [];
  for (const chunk of chunks) {
    const matches = products.map((p) => {
      const exact = locateTerm(chunk, p.sku);
      const alias = p.aliases.map((a) => locateTerm(chunk, a)).find(Boolean);
      return exact || alias ? { p, hit: exact || alias, kind: exact ? 'Exact SKU' : 'Catalogue alias' } : null;
    }).filter(Boolean);
    if (!matches.length) {
      if (!/^(?:hi|hello|dear team|thanks|thank you|regards)[.! ]*$/i.test(chunk)) missing.push('Unresolved request: ' + chunk);
      continue;
    }
    for (const match of matches) {
      const overlap = matches.some((other) => other !== match && other.hit.index === match.hit.index);
      if (overlap) { missing.push('Ambiguous product: ' + chunk); continue; }
      const start = match.hit.index + match.hit[1].length;
      const before = chunk.slice(0, start);
      const after = chunk.slice(start + match.hit[2].length);
      const beforeQuantity = before.match(/(?:^|[^a-z0-9.+-])([+-]?\d+(?:\.\d+)?)\s*(?:x|×|pcs?|pieces?|units?|nos?\.?|sets?)?\s*$/i);
      const afterQuantity = after.match(/^\s*(?:[,:]\s*)?(?:qty\s*[:=]?\s*|x\s*|×\s*)([+-]?\d+(?:\.\d+)?)/i);
      const quantity = Number((beforeQuantity || afterQuantity)?.[1]);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) { missing.push('Quantity needed for ' + match.p.sku); continue; }
      if (matches.length > 1) { missing.push('Use one requested product per line or confirm each line: ' + chunk); continue; }
      const residualBefore = beforeQuantity ? before.slice(0, beforeQuantity.index) : before;
      const residualAfter = afterQuantity ? after.slice(afterQuantity[0].length) : after;
      const residual = (residualBefore + ' ' + residualAfter).replace(/\b(?:please|quote|quotation|for|need|supply|pcs|pieces|units|nos)\b/gi, '').replace(/[.,:!?()\s]/g, '');
      if (residual) missing.push('Confirm remaining specifications or terms: ' + chunk);
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
    buyer: requiredText(input.buyer, 'Buyer'), buyerId: String(input.buyerId || '').slice(0, 100),
    recipient: String(input.recipient || '').slice(0, 200), channel, originalChannel: channel, outboundChannel: channel,
    sourceConnectorId: input.sourceConnectorId || tenant.connectors.find((c) => c.name === channel)?.id,
    sourceMessageId: input.sourceMessageId || null, message,
    items: extracted.items, missing: extracted.missing, status: 'new',
    createdAt: new Date().toISOString(), approvedAt: null, manualMinutes: null,
    baselineMinutes: tenant.config.baselineMinutes, corrected: false,
    quote: null, quoteHistory: [], approvals: [], effort: [], messages: [], version: 1,
    initiallyMatched: !extracted.missing.length, followup: null, followupHistory: [],
    orderValue: 0, archived: false, simulated: tenant.mode !== 'live'
  };
  enquiry.route = routeEnquiry(enquiry, tenant.rules, tenant.config);
  if (enquiry.missing.length) enquiry.status = 'needs_review';
  return enquiry;
}
export function draftQuote(enquiry, tenant, input = {}) {
  normaliseTenant(tenant);
  if (['won', 'lost'].includes(enquiry.status)) throw new DomainError('Closed enquiries cannot be revised.', 409);
  if (enquiry.missing.length || !enquiry.items.length) throw new DomainError('Resolve the product and quantity questions before drafting.');
  archiveQuote(enquiry);
  if (enquiry.followup) {
    enquiry.followupHistory.push(structuredClone(enquiry.followup));
    enquiry.followup.status = 'cancelled'; enquiry.followup.reason = 'Quote revised';
  }
  enquiry.items = freshItems(enquiry, tenant);
  const discount = numberIn(input.discount ?? 0, 'Discount', 0, tenant.config.maxDiscount);
  enquiry.quote = {
    id: enquiry.quote?.id || id('quote'), revision: (enquiry.quote?.revision || 0) + 1,
    discount, taxRate: tenant.config.taxRate, ...lineTotals(enquiry.items, discount, tenant.config.taxRate, tenant.config.freight),
    items: structuredClone(enquiry.items), seller: tenant.name, buyer: enquiry.buyer, buyerId: enquiry.buyerId,
    recipient: enquiry.recipient, outboundChannel: enquiry.outboundChannel,
    terms: Object.fromEntries(['paymentTerms', 'deliveryTerms', 'validityDays', 'freight'].map((k) => [k, tenant.config[k]])),
    backorderConfirmed: input.backorderConfirmed === true,
    validUntil: new Date(Date.now() + tenant.config.validityDays * 86400000).toISOString(),
    draftedAt: new Date().toISOString(), approvedRevision: null,
    revisionReason: requiredText(input.reason || 'Initial quotation / catalogue refresh', 'Revision reason', 300)
  };
  enquiry.approvedAt = null; enquiry.status = 'awaiting_approval';
  enquiry.route = routeEnquiry(enquiry, tenant.rules, tenant.config);
}
export function approveQuote(enquiry, input, tenant) {
  if (enquiry.status === 'approved') return false;
  if (enquiry.status !== 'awaiting_approval' || !enquiry.quote || enquiry.missing.length) throw new DomainError('Only complete quotation drafts can be approved.', 409);
  if (!tenant) throw new DomainError('Commercial source validation is required.');
  assertCommercial(enquiry, tenant, true);
  const minutes = numberIn(input.manualMinutes, 'Additional human effort in minutes', 0, 1440);
  if (minutes) addEffort(enquiry, { minutes, note: 'Commercial review / corrections for revision ' + enquiry.quote.revision }, input.actor);
  enquiry.manualMinutes ??= 0;
  enquiry.corrected = input.corrected === true; enquiry.approvedAt = new Date().toISOString();
  enquiry.firstApprovedAt ||= enquiry.approvedAt;
  enquiry.quote.approvedRevision = enquiry.quote.revision; enquiry.status = 'approved';
  enquiry.quote.approvedAt = enquiry.approvedAt; enquiry.quote.approvedBy = input.actor || 'Unknown';
  enquiry.approvals.push({ id: id('approval'), at: enquiry.approvedAt, actor: input.actor || 'Unknown',
    revision: enquiry.quote.revision, corrected: enquiry.corrected, snapshot: structuredClone(enquiry.quote) });
  archiveQuote(enquiry);
  return true;
}
export function sendQuote(enquiry, tenant) {
  if (['sent', 'won'].includes(enquiry.status)) return false;
  if (enquiry.status !== 'approved' || enquiry.quote?.approvedRevision !== enquiry.quote?.revision) throw new DomainError('This quote needs approval before simulated delivery.', 409);
  assertCommercial(enquiry, tenant);
  const connector = tenant.connectors.find((c) => c.enabled && c.kind === 'channel' && c.name === enquiry.outboundChannel);
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
  normaliseTenant(tenant);
  const cutoff = new Date(end.getTime() - days * 86400000);
  const inPeriod = (stamp) => stamp && new Date(stamp) >= cutoff && new Date(stamp) <= end;
  const received = tenant.enquiries.filter((e) => inPeriod(e.createdAt));
  // Approved cohort is the denominator for effort and quality.
  const completed = tenant.enquiries.map((e) => {
    const first = e.approvals[0];
    return first ? { ...e, approvedAt: first.at, corrected: e.approvals.some((a) => a.corrected && new Date(a.at) <= end),
      manualMinutes: e.effort.filter((x) => new Date(x.at) <= end).reduce((s, x) => s + x.minutes, 0) } : null;
  }).filter((e) => e && inPeriod(e.approvedAt));
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
    return { category, enquiries: rows.length, approvals: rows.filter((e) => e.approvals.some((a) => new Date(a.at) <= end)).length,
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
    matchedRate: received.some((e) => typeof e.initiallyMatched === 'boolean') ? round(received.filter((e) => e.initiallyMatched === true).length / received.filter((e) => typeof e.initiallyMatched === 'boolean').length * 100) : null,
    matchingSampleSize: received.filter((e) => typeof e.initiallyMatched === 'boolean').length,
    p90ApprovalMinutes: completed.length ? completed.map((e) => Math.max(0, (new Date(e.approvedAt) - new Date(e.createdAt)) / 60000)).toSorted((a, b) => a - b)[Math.ceil(completed.length * .9) - 1] : null,
    sampleSize: completed.length,
    measuredBaseline: tenant.config.baselineSampleSize > 0 && !!tenant.config.baselineFrom && !!tenant.config.baselineTo,
    periodEffortMinutes: round(tenant.enquiries.flatMap((e) => e.effort).filter((x) => inPeriod(x.at)).reduce((s, x) => s + x.minutes, 0)),
    funnel: {
      received: received.length,
      drafted: received.filter((e) => e.quote || e.quoteHistory.length).length,
      approved: received.filter((e) => e.approvals.length).length,
      simulatedDispatches: received.filter((e) => e.sentAt && e.simulated).length,
      actualDispatches: received.filter((e) => e.sentAt && !e.simulated).length,
      linkedOrders: received.filter((e) => e.status === 'won').length
    },
    economics: { setupHours: round(tenant.config.setupMinutes / 60), supportHours: round(tenant.config.supportMinutes / 60),
      monthlyFee: tenant.config.monthlyFee, operatingCost: tenant.config.operatingCost },
    pendingApprovals: tenant.enquiries.filter((e) => e.status === 'awaiting_approval').length,
    needsReview: tenant.enquiries.filter((e) => e.status === 'needs_review').length,
    overdue: tenant.enquiries.filter((e) => !['won', 'lost'].includes(e.status) && e.followup && e.followup.status !== 'cancelled' && !e.followup.sentAt && new Date(e.followup.dueAt) < end).length,
    linkedOrderValue: tenant.enquiries.filter((e) => e.status === 'won' && inPeriod(e.wonAt)).reduce((s, e) => s + e.orderValue, 0),
    daily, categories
  };
}
