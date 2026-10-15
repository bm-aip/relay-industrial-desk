const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
export function quotationHTML(tenant, enquiry, approval) {
  const q = approval.snapshot;
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escape(enquiry.reference) + ' · Revision ' + q.revision + '</title><style>' +
    'body{font:14px/1.6 Georgia,serif;color:#20382b;max-width:900px;margin:45px auto;padding:0 25px}header{display:flex;justify-content:space-between;border-bottom:3px solid #355c46;padding-bottom:20px}' +
    'h1{font-size:34px;margin:0}h2{font-size:20px}p{margin:8px 0}small{color:#626f64}table{width:100%;border-collapse:collapse;margin:30px 0}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #d7ddd4}th{font-size:12px;background:#eff2eb}' +
    '.total{text-align:right;font-size:18px}.notice{padding:15px;background:#f5f0e1}.terms{border-top:1px solid #ddd;padding-top:20px;white-space:pre-wrap}footer{margin-top:40px;color:#626f64;font-size:12px}@media print{body{margin:0;max-width:none}.print-note{display:none}tr{break-inside:avoid}thead{display:table-header-group}}</style>' +
    '<body><p class="print-note">Approved quotation. Use your browser’s Print → Save as PDF to retain a PDF copy.</p>' +
    '<header><div><small>QUOTATION / Q-MATE</small><h1>' + escape(q.seller || tenant.name) + '</h1></div><div>' + escape(enquiry.reference) + '<br>Revision ' + q.revision + '</div></header>' +
    '<h2>Prepared for ' + escape(q.buyer || enquiry.buyer) + '</h2><p>Buyer reference: ' + escape(q.buyerId || 'Not supplied') +
    '<br>Recipient: ' + escape(q.recipient || 'Not supplied') + '</p>' +
    (enquiry.simulated ? '<p class="notice">DEMONSTRATION — external delivery is simulated. This document is not evidence of a live customer quotation or sale.</p>' : '') +
    '<table><thead><tr><th>Product</th><th>Quantity / unit</th><th>Unit price</th><th>Line value</th></tr></thead><tbody>' +
    (q.items || []).map((l) => '<tr><td><b>' + escape(l.sku) + '</b><br>' + escape(l.name) + '</td><td>' + escape(l.quantity) + ' ' + escape(l.unit) +
      '</td><td>' + money(l.unitPrice) + '</td><td>' + money(l.quantity * l.unitPrice) + '</td></tr>').join('') +
    '</tbody></table><p class="total">Subtotal: ' + money(q.subtotal) + '<br>Discount (' + q.discount + '%): ' + money(q.discountAmount) +
    '<br>Tax: ' + money(q.taxAmount) + '<br>Freight: ' + money(q.freight) + '<br><strong>Total: ' + money(q.total) + '</strong></p>' +
    '<div class="terms"><b>Commercial terms</b><p>Payment: ' + escape(q.terms?.paymentTerms || 'Not specified — demonstration only') +
    '<br>Delivery: ' + escape(q.terms?.deliveryTerms || 'Not specified — demonstration only') +
    '<br>Valid until: ' + escape(q.validUntil ? new Date(q.validUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'Not recorded in legacy revision') +
    '</p>' + (q.backorderConfirmed ? '<p>Backorder approved: ' + (q.items || []).filter((i) => i.quantity > i.stock).map((i) => escape(i.sku + ': ' + i.leadTime)).join('; ') + '</p>' : '') + '</div>' +
    '<footer>Approved by ' + escape(approval.actor) + ' · ' + escape(approval.at) + '<br>Revision reason: ' + escape(q.revisionReason || 'Legacy revision') +
    '<br>Q-mate preserves this approved revision separately from later changes.</footer></body></html>';
}
