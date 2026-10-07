import { id, quoteTotals, routeEnquiry, TEAM, CONNECTOR_PRESETS } from './domain.mjs';

export const SAMPLE_PRODUCTS = [
  ['SKF-6205-2RS', 'SKF sealed deep-groove bearing', 'Bearings', 'piece', 420, 480, ['6205-2RS']],
  ['ABB-ACS355-2.2', 'ABB variable-frequency drive · 2.2 kW', 'Automation', 'unit', 18500, 18, ['ACS355']],
  ['CG-MTR-3HP', 'Crompton three-phase motor · 3 HP', 'Motors', 'unit', 14200, 24, ['3HP-CG']],
  ['KSB-ETN-40', 'KSB end-suction centrifugal pump', 'Pumps', 'unit', 32500, 9, ['ETN-40']],
  ['SCH-MCB-32A', 'Schneider 32 A miniature circuit breaker', 'Electrical', 'piece', 380, 320, ['MCB-32A']],
  ['FES-DSNU-25', 'Festo pneumatic cylinder · 25 mm bore', 'Pneumatics', 'unit', 3200, 64, ['DSNU-25']],
  ['DAN-PV-1IN', 'Danfoss brass ball valve · 1 inch', 'Valves', 'piece', 1250, 160, ['PV-1IN']],
  ['BOS-GWS-750', 'Bosch angle grinder · 750 W', 'Tools', 'unit', 3450, 38, ['GWS-750']],
  ['3M-GLV-CUT', '3M cut-resistant work gloves', 'Safety', 'pair', 280, 800, ['GLV-CUT']],
  ['UNB-M12-50', 'Unbrako hex bolt · M12 × 50 mm', 'Fasteners', 'piece', 42, 2400, ['M12-50']],
  ['WIKA-PG-10', 'WIKA pressure gauge · 0–10 bar', 'Instrumentation', 'unit', 1850, 72, ['PG-10']],
  ['ESAB-E6013', 'ESAB E6013 welding electrodes · 5 kg', 'Welding', 'pack', 1150, 95, ['E6013']]
];
export function createTenant(name, options = {}) {
  return {
    id: id('customer'), name, city: options.city || 'Chennai', mode: 'prototype',
    config: { version: 1, defaultOwner: TEAM[0], baselineMinutes: 24, baselineApprovalMinutes: 90,
      hourlyCost: 400, maxDiscount: 10, taxRate: 18, followupDays: 2, currency: 'INR', timezone: 'Asia/Kolkata' },
    products: [], rules: [], connectors: [], enquiries: [], nextReference: 1001, createdAt: new Date().toISOString()
  };
}
function ago(days, minutes = 0) { return new Date(Date.now() - days * 86400000 - minutes * 60000).toISOString(); }
function item(p, quantity) {
  return { sku: p.sku, name: p.name, category: p.category, unit: p.unit, quantity, unitPrice: p.price,
    stock: p.stock, match: 'Exact SKU', source: p.source, priceCheckedAt: p.updatedAt };
}
export function seedTenants() {
  return ['Meridian Industrial Supply', 'Deccan Engineering Traders'].map((name, index) => {
    const tenant = createTenant(name, { city: index ? 'Pune' : 'Chennai' });
    tenant.config.baselineMinutes = index ? 28 : 24;
    tenant.config.hourlyCost = index ? 450 : 400;
    tenant.products = SAMPLE_PRODUCTS.map(([sku, productName, category, unit, price, stock, aliases]) => ({
      id: id('product'), sku, name: productName, category, unit, price: Math.round(price * (index ? 1.04 : 1)),
      stock: index ? Math.floor(stock * .7) : stock, aliases: [...aliases], source: index ? 'ERP demo catalogue' : 'Tally demo catalogue',
      updatedAt: ago(0, 35)
    }));
    tenant.connectors = ['WhatsApp', 'Email', 'Web form', 'Tally', 'Zoho CRM', 'Sheets / Excel'].map((name) => {
      const preset = CONNECTOR_PRESETS.find((p) => p.name === name);
      return { ...preset, id: id('connector'), mode: 'simulation', enabled: true,
        mapping: preset.kind === 'channel' ? { buyer: 'customer.name', message: 'message.text' } :
          { sku: 'item.code', name: 'item.name', price: 'item.price', stock: 'item.stock', category: 'item.category' },
        testedAt: ago(0, 45), description: 'Sample adapter. No external account is connected.' };
    });
    tenant.rules = [
      { id: id('rule'), name: 'Incomplete requests to technical review', priority: 1, enabled: true,
        field: 'match', operator: 'eq', value: 'incomplete', queue: 'Technical review', owner: TEAM[2] },
      { id: id('rule'), name: 'High-value quotations to sales lead', priority: 2, enabled: true,
        field: 'value', operator: 'gte', value: '75000', queue: 'Sales lead', owner: TEAM[0] },
      { id: id('rule'), name: 'Automation products to specialist', priority: 3, enabled: true,
        field: 'category', operator: 'eq', value: 'Automation', queue: 'Automation desk', owner: TEAM[1] }
    ];
    const buyers = ['Aster Manufacturing', 'Nexus Fabrication', 'Lakshmi Engineering', 'Coastal Process Systems',
      'Vantage Components', 'Orbit Packaging', 'Southern Maintenance', 'Prakash Industries'];
    for (let day = 28; day >= 0; day--) {
      for (let j = 0; j < 3 + day % 4 + index; j++) {
        const p = tenant.products[(day * 3 + j * 5 + index) % tenant.products.length];
        const quantity = p.price > 10000 ? 1 + j % 3 : 10 + (day + j) % 8 * 5;
        const e = {
          id: id('enquiry'), reference: 'RFQ-' + String(tenant.nextReference++).padStart(4, '0'),
          buyer: buyers[(day + j) % buyers.length], channel: ['WhatsApp', 'Email', 'Web form'][(day + j) % 3],
          message: 'Please quote ' + quantity + ' × ' + p.sku + '. Delivery to ' + tenant.city + '.',
          items: [item(p, quantity)], missing: [], status: 'sent',
          createdAt: ago(day, 160 + j * 10), approvedAt: ago(day, 130 + j * 10),
          manualMinutes: 6 + (day + j) % 7, baselineMinutes: tenant.config.baselineMinutes,
          corrected: (day + j) % 11 === 0, quote: null, followup: null, orderValue: 0
        };
        e.quote = { id: id('quote'), revision: 1, discount: 0, taxRate: 18,
          ...quoteTotals(e.items, 0, 18), draftedAt: ago(day, 150 + j * 10), approvedRevision: 1 };
        e.sentAt = ago(day, 120 + j * 10);
        if (day > 2) {
          const late = (day + j) % 9 === 0;
          e.followup = { dueAt: ago(day - 2, 120 + j * 10),
            sentAt: ago(day - 2, late ? 90 : 140 + j * 10), status: 'sent', simulated: true };
        } else e.followup = { dueAt: new Date(new Date(e.sentAt).getTime() + 2 * 86400000).toISOString(), sentAt: null, status: 'scheduled', simulated: true };
        if ((day + j) % 7 === 0 && day > 3) {
          e.status = 'won'; e.orderValue = e.quote.total; e.wonAt = ago(day - 3); e.followup.status = 'cancelled';
        }
        e.route = routeEnquiry(e, tenant.rules, tenant.config);
        tenant.enquiries.push(e);
      }
    }
    [tenant.products[1], tenant.products[3], tenant.products[0], tenant.products[8]].forEach((p, i) => {
      const quantity = i === 0 ? 4 : i === 1 ? 2 : 50;
      const e = {
        id: id('enquiry'), reference: 'RFQ-' + String(tenant.nextReference++).padStart(4, '0'),
        buyer: buyers[i], channel: ['WhatsApp', 'Email'][i % 2],
        message: 'Please quote ' + quantity + ' × ' + p.sku + '. Confirm availability and delivery.',
        items: [item(p, quantity)], missing: [], status: 'awaiting_approval', createdAt: ago(0, 35 + i * 12),
        approvedAt: null, manualMinutes: null, baselineMinutes: tenant.config.baselineMinutes, corrected: false,
        quote: { id: id('quote'), revision: 1, discount: 0, taxRate: 18,
          ...quoteTotals([item(p, quantity)], 0, 18), draftedAt: ago(0, 20 + i * 10), approvedRevision: null },
        followup: null, orderValue: 0
      };
      e.route = routeEnquiry(e, tenant.rules, tenant.config);
      tenant.enquiries.push(e);
    });
    for (let i = 0; i < 2; i++) {
      const e = {
        id: id('enquiry'), reference: 'RFQ-' + String(tenant.nextReference++).padStart(4, '0'),
        buyer: buyers[i + 4], channel: 'WhatsApp', message: i ? 'Need a suitable pump for hot water, 2 units.' : 'Please quote 10 industrial motors, equivalent to our current model.',
        items: [], missing: ['Application specifications and exact product identifier needed.'], status: 'needs_review',
        createdAt: ago(0, 90 + i * 30), approvedAt: null, manualMinutes: null,
        baselineMinutes: tenant.config.baselineMinutes, corrected: false, quote: null, followup: null, orderValue: 0
      };
      e.route = routeEnquiry(e, tenant.rules, tenant.config);
      tenant.enquiries.push(e);
    }
    return tenant;
  });
}
