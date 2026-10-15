import { DomainError, id, numberIn, requiredText, quoteTotals } from './domain.mjs';

export const DEFAULT_POLICY = {
  maxDataAgeMinutes: 1440, approvalExpiryHours: 24, validityDays: 14,
  paymentTerms: '', deliveryTerms: '', freight: 0, paused: false,
  baselineSampleSize: 0, baselineFrom: '', baselineTo: '', baselineScope: '',
  setupMinutes: 0, supportMinutes: 0, monthlyFee: 0, operatingCost: 0
};

export function normaliseTenant(t) {
  t.config = { ...DEFAULT_POLICY, ...t.config };
  if (['Priya Nair', 'Arjun Mehta', 'Karthik Rao'].includes(t.config.defaultOwner)) t.config.defaultOwner = 'Unassigned';
  t.mode ||= 'preparation';
  t.buyers ||= [];
  for (const rule of t.rules) if (['Priya Nair', 'Arjun Mehta', 'Karthik Rao'].includes(rule.owner)) rule.owner = 'Unassigned';
  t.onboarding ||= { scope: '', formats: '', processOwner: '', technicalOwner: '', acceptance: '', acceptedAt: null };
  for (const p of t.products) {
    p.packSize ??= 1; p.minimumQuantity ??= .01; p.customerPrices ||= []; p.leadTime ||= ''; p.taxRate ??= null;
  }
  for (const e of t.enquiries) {
    if (['Priya Nair', 'Arjun Mehta', 'Karthik Rao'].includes(e.route?.owner)) e.route.owner = 'Unassigned';
    e.version ??= 1;
    e.originalChannel ||= e.channel;
    e.outboundChannel ||= e.channel;
    e.sourceConnectorId ||= t.connectors.find((c) => c.name === e.originalChannel)?.id || e.originalChannel;
    e.quoteHistory ||= [];
    e.initiallyMatched ??= null; // Earlier parser quality cannot be inferred after manual corrections.
    if (e.followup?.status === 'cancelled' && e.followup.sentAt) e.followup.status = 'sent';
    e.buyerId ||= ''; e.recipient ||= '';
    e.messages ||= []; e.followupHistory ||= [];
    // Recover only the surviving legacy revision. Earlier lost history cannot be invented.
    if (!e.approvals) e.approvals = e.approvedAt && e.quote ? [{
      id: 'legacy_' + e.id, at: e.approvedAt, revision: e.quote.revision,
      actor: 'Legacy team approval', corrected: e.corrected, legacy: true,
      snapshot: { ...structuredClone(e.quote), items: structuredClone(e.items) }
    }] : [];
    if (!e.effort) e.effort = Number.isFinite(e.manualMinutes) ? [{
      id: 'legacy_effort_' + e.id, at: e.approvedAt || e.createdAt,
      minutes: e.manualMinutes, actor: 'Legacy team record', note: 'Surviving legacy cumulative effort'
    }] : [];
    if (e.quote) {
      e.quote.items ||= structuredClone(e.items);
      e.quote.terms ||= { paymentTerms: '', deliveryTerms: '', validityDays: 14, freight: 0 };
      e.quote.buyer ||= e.buyer; e.quote.buyerId ||= e.buyerId;
      e.quote.recipient ??= e.recipient;
      e.quote.outboundChannel ||= e.outboundChannel;
    }
    e.simulated ??= true;
  }
  return t;
}

export function priceFor(p, buyerId, quantity) {
  const applicable = (p.customerPrices || []).filter((r) => r.buyerId === buyerId && quantity >= r.minQuantity)
    .toSorted((a, b) => b.minQuantity - a.minQuantity);
  return applicable[0]?.price ?? p.price;
}

export function freshItems(e, tenant, lines = e.items) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw new DomainError('Choose between 1 and 100 line items.');
  const seen = new Set();
  return lines.map((line) => {
    const p = tenant.products.find((p) => p.sku === line.sku);
    if (!p || seen.has(p.sku)) throw new DomainError('Choose valid, distinct catalogue products.');
    seen.add(p.sku);
    const quantity = numberIn(line.quantity, 'Quantity', .001, 1e6);
    if (quantity < (p.minimumQuantity ?? .01)) throw new DomainError(p.sku + ': quantity is below the minimum.');
    const pack = p.packSize ?? 1;
    if (Math.abs(quantity / pack - Math.round(quantity / pack)) > 1e-7) throw new DomainError(p.sku + ': quantity must be a multiple of pack size ' + pack + '.');
    return { sku: p.sku, name: p.name, category: p.category, unit: p.unit, quantity,
      unitPrice: priceFor(p, e.buyerId, quantity), stock: p.stock, packSize: pack,
      minimumQuantity: p.minimumQuantity, taxRate: p.taxRate ?? tenant.config.taxRate,
      leadTime: p.leadTime || '', match: line.match || 'Team-confirmed', source: p.source, priceCheckedAt: p.updatedAt };
  });
}

export function commercialIssues(e, t, now = new Date(), approval = false) {
  const q = e.quote;
  if (!q) return ['Prepare a quotation first.'];
  const issues = [];
  if (q.discount > t.config.maxDiscount) issues.push('Discount policy changed. Prepare a new revision.');
  if (q.taxRate !== t.config.taxRate) issues.push('Default tax policy changed. Prepare a new revision.');
  const bound = ['paymentTerms', 'deliveryTerms', 'validityDays', 'freight'];
  if (bound.some((k) => q.terms?.[k] !== t.config[k])) issues.push('Commercial terms changed. Prepare a new revision.');
  for (const line of q.items || []) {
    const p = t.products.find((p) => p.sku === line.sku);
    if (!p) { issues.push(line.sku + ': removed from catalogue.'); continue; }
    const age = (now - new Date(p.updatedAt)) / 60000;
    if (!Number.isFinite(age) || age < -5 || age > t.config.maxDataAgeMinutes) issues.push(line.sku + ': catalogue data is stale; refresh the source.');
    if (priceFor(p, q.buyerId, line.quantity) !== line.unitPrice || p.unit !== line.unit ||
      p.stock !== line.stock || (p.taxRate ?? t.config.taxRate) !== line.taxRate ||
      (p.packSize ?? 1) !== line.packSize || p.minimumQuantity !== line.minimumQuantity ||
      (p.leadTime || '') !== line.leadTime) issues.push(line.sku + ': price, stock, unit or supply terms changed. Prepare a new revision.');
    if (line.quantity > p.stock && !(q.backorderConfirmed && line.leadTime)) issues.push(line.sku + ': insufficient stock. Record a lead time and explicitly approve backordering.');
  }
  if (q.validUntil && now > new Date(q.validUntil)) issues.push('Quote validity has expired.');
  if (!approval && e.approvedAt && now - new Date(e.approvedAt) > t.config.approvalExpiryHours * 3600000) issues.push('Approval expired. Prepare a new revision for review.');
  if (q.buyerId !== e.buyerId || q.recipient !== e.recipient || q.outboundChannel !== e.outboundChannel) issues.push('Buyer or delivery destination changed. Prepare a new revision.');
  return [...new Set(issues)];
}

export function assertCommercial(e, t, approval = false) {
  const issues = commercialIssues(e, t, new Date(), approval);
  if (issues.length) throw new DomainError(issues.join(' '), 409);
}

export function archiveQuote(e) {
  if (!e.quote) return;
  const at = e.quoteHistory.findIndex((q) => q.revision === e.quote.revision);
  if (at === -1) e.quoteHistory.push(structuredClone(e.quote));
  else if (!e.quoteHistory[at].approvedRevision) e.quoteHistory[at] = structuredClone(e.quote);
}

export function addEffort(e, input, actor = 'Unknown') {
  const minutes = numberIn(input.minutes, 'Additional human effort in minutes', .01, 1440);
  e.effort.push({ id: id('effort'), minutes, at: new Date().toISOString(), actor, note: requiredText(input.note || 'Review and corrections', 'Effort note', 300) });
  e.manualMinutes = e.effort.reduce((s, x) => s + x.minutes, 0);
}

export function recordResponse(e, input, actor) {
  const kind = input.kind || 'reply';
  if (!['reply', 'decline', 'opt_out', 'pause'].includes(kind)) throw new DomainError('Unknown response type.');
  e.messages.push({ id: id('message'), kind, text: requiredText(input.text, 'Response / reason', 4000), at: new Date().toISOString(), actor });
  e.conversationHold = kind;
  if (e.followup && !e.followup.sentAt) { e.followup.status = 'cancelled'; e.followup.reason = kind; }
  if (kind === 'decline') e.status = 'lost';
}

export function readiness(t, users = []) {
  const rows = [
    ['scope', 'Pilot scope and acceptance criteria', !!(t.onboarding.scope && t.onboarding.acceptance)],
    ['owners', 'Named process owner and reviewer', !!t.onboarding.processOwner && users.some((u) => u.admin || ['approver', 'admin'].includes(u.role))],
    ['catalogue', 'Validated catalogue', t.products.length > 0],
    ['terms', 'Payment and delivery terms', !!t.config.paymentTerms && !!t.config.deliveryTerms],
    ['baseline', 'Measured baseline and sample size', t.config.baselineSampleSize > 0 && !!t.config.baselineScope && !!t.config.baselineFrom && !!t.config.baselineTo],
    ['channel', 'Verified live inbound and outbound connection', false],
    ['recovery', 'Customer-specific recovery and acceptance evidence', !!t.onboarding.acceptedAt]
  ];
  return rows.map(([key, label, complete]) => ({ key, label, complete }));
}

export function lineTotals(items, discount, fallbackTax, freight = 0) {
  const base = quoteTotals(items, discount, fallbackTax);
  const taxAmount = Math.round(items.reduce((s, l) => s + l.quantity * l.unitPrice * (1 - discount / 100) * (l.taxRate ?? fallbackTax) / 100, 0) * 100) / 100;
  return { ...base, taxAmount, freight, total: Math.round((base.subtotal - base.discountAmount + taxAmount + freight) * 100) / 100 };
}
