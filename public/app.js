const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const state = { customer: null, page: 'impact', days: 30, queue: 'active', channel: '', query: '', data: null, csrf: '', navOpen: false };
const icons = {
  impact: '<path d="M3 17l6-6 4 3 7-9"/><path d="M15 5h5v5"/>',
  queue: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  catalogue: '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  connectors: '<path d="M9 7H6a4 4 0 0 0 0 8h3M15 7h3a4 4 0 0 1 0 8h-3M8 11h8"/>',
  rules: '<path d="M6 3v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v5M6 12v9"/><path d="M3 6l3-3 3 3M15 18l3 3 3-3"/>',
  customers: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M3 11h18M10 11v3h4v-3"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M5 18v3h14v-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
  alert: '<path d="M12 3L2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  logout: '<path d="M10 4H4v16h6M10 12h11M17 8l4 4-4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  edit: '<path d="M16 3l5 5-12 12H4v-5L16 3ZM13 6l5 5"/>'
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (name, size = 17) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.queue) + '</svg>';
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const num = (n, decimals = 0) => n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: decimals });
const date = (stamp, withTime = false) => stamp ? new Date(stamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—';
const tenant = () => state.data?.tenant;
function button(text, action, icon, secondary = false, extra = '') {
  return '<button type="button" class="button' + (secondary ? ' secondary' : '') + '" data-action="' + esc(action) + '" ' + extra + '>' + (icon ? ico(icon, 14) : '') + esc(text) + '</button>';
}
function field(label, content, hint = '') { return '<label>' + esc(label) + content + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</label>'; }
function input(name, value = '', type = 'text', extra = '') { return '<input name="' + esc(name) + '" type="' + type + '" value="' + esc(value) + '" ' + extra + '>'; }
function select(name, options, value = '', extra = '') {
  return '<select name="' + esc(name) + '" ' + extra + '>' + options.map((o) => {
    const key = typeof o === 'string' ? o : o.value, label = typeof o === 'string' ? o : o.label;
    return '<option value="' + esc(key) + '"' + (String(key) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('') + '</select>';
}
function empty(title, detail, action = '') { return '<div class="empty"><h3>' + esc(title) + '</h3><p>' + esc(detail) + '</p>' + action + '</div>'; }
function pill(text, color = '') { return '<span class="pill ' + color + '">' + esc(text) + '</span>'; }
function statusPill(status) {
  const names = { new: ['Ready to draft', 'blue'], needs_review: ['Needs clarification', 'red'], awaiting_approval: ['Awaiting approval', 'amber'],
    approved: ['Approved', ''], sent: ['Demo quote sent', 'gray'], won: ['Order linked', ''] };
  return pill(...(names[status] || [status, 'gray']));
}
function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4500);
}
async function api(path, method = 'GET', data) {
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-CSRF-Token': state.csrf } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') { modal.close(); await initialize(); }
    throw new Error(result.error || 'This request could not be completed.');
  }
  return result;
}
const base = () => '/api/customers/' + state.customer;
let loadSequence = 0;
async function load(customer = state.customer) {
  const sequence = ++loadSequence;
  const query = new URLSearchParams({ days: String(state.days), ...(customer ? { customer } : {}) });
  app.inert = true;
  app.setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/bootstrap?' + query);
    if (sequence !== loadSequence) return;
    state.data = data; state.customer = data.tenant?.id || null;
    render();
  } finally {
    if (sequence === loadSequence) { app.inert = false; app.removeAttribute('aria-busy'); }
  }
}
async function initialize() {
  try {
    const session = await api('/api/session');
    if (session.authenticated) { state.csrf = session.csrf; await load(); }
    else renderLogin(session.demoLogin);
  } catch (error) { app.innerHTML = empty('Unable to open the workspace', error.message, button('Try again', 'reload', 'arrow')); }
}
function renderLogin(demoLogin) {
  app.innerHTML = '<main class="login" id="main"><section class="login-story"><div class="brand"><span class="brand-symbol">r</span><span>relay<small>industrial desk</small></span></div>' +
    '<div><div class="eyebrow">YOUR TEAM’S OPERATING DESK</div><h1>From incoming enquiry.<br>To approved quote.</h1><p>One place to review work, configure customer workflows and see the effort your system saves.</p></div>' +
    '<div class="eyebrow">BUILT AROUND THE WAY YOUR CUSTOMERS WORK</div></section><section class="login-form"><div><div class="eyebrow">TEAM ACCESS</div><h2>Welcome to your desk.</h2>' +
    '<p>Sign in to manage your customer workspaces. This prototype uses sample data and simulated delivery.</p><form data-form="login">' +
    field('Team password', input('password', '', 'password', 'required autocomplete="current-password"')) +
    '<p class="error-message" id="login-error" role="alert"></p><button class="button" type="submit">Open workspace ' + ico('arrow', 15) + '</button></form>' +
    (demoLogin ? '<div class="login-demo"><p>Review the local prototype with two sample distributors and a mixed industrial catalogue.</p>' + button('Enter sample workspace', 'demo-login', 'arrow', true) + '</div>' : '') +
    '</div></section></main>';
}
const pages = [['impact', 'Customer impact'], ['queue', 'Work queue'], ['catalogue', 'Product catalogue'], ['connectors', 'Channels & systems'],
  ['rules', 'Routing rules'], ['customers', 'Customer workspaces'], ['activity', 'Activity history'], ['settings', 'Customer settings']];
function render() {
  const t = tenant(), m = state.data.metrics;
  app.innerHTML = '<div class="shell' + (state.navOpen ? ' nav-open' : '') + '"><aside class="sidebar" aria-label="Workspace navigation">' +
    '<div class="brand"><span class="brand-symbol">r</span><span>relay<small>industrial desk</small></span></div><div class="nav-label">YOUR WORKSPACE</div><nav>' +
    pages.slice(0, 2).map(([key, label]) => nav(key, label, key === 'queue' ? (m?.pendingApprovals || 0) + (m?.needsReview || 0) : null)).join('') +
    '<div class="nav-label" style="margin-top:24px">CONFIGURE & MANAGE</div>' + pages.slice(2).map(([key, label]) => nav(key, label)).join('') +
    '</nav><div class="sidebar-bottom"><div class="workspace-card"><div class="eyebrow">CUSTOMER PORTFOLIO</div><p><strong>' + state.data.customers.length + ' workspaces</strong><br>Separate catalogues.<br>Customer-specific rules.</p></div>' +
    '<div class="team-card"><span class="avatar">OT</span><div><b>Operations team</b><small>Internal team access</small></div></div></div></aside>' +
    '<div class="main-wrap"><header class="topbar"><div class="workspace-switch"><button class="icon-button mobile-nav" data-action="mobile-nav" aria-label="Toggle navigation">' + ico('menu') + '</button>' +
    '<span class="icon-box">' + ico('customers', 16) + '</span>' +
    select('workspace', state.data.customers.map((c) => ({ value: c.id, label: c.name })), state.customer, 'class="workspace-select" aria-label="Customer workspace"') +
    '</div><div class="top-actions"><time>' + date(new Date()) + '</time>' + pill('Sample data', 'amber') +
    '<span class="avatar" title="Your operations team">OT</span><button class="icon-button" data-action="logout" aria-label="Sign out">' + ico('logout', 16) + '</button></div></header>' +
    '<main id="main" class="content" tabindex="-1">' + (t ? page() : noCustomers()) + '</main></div></div>';
}
function nav(key, label, count) {
  return '<button class="nav-button' + (state.page === key ? ' active' : '') + '" data-page="' + key + '"' + (state.page === key ? ' aria-current="page"' : '') + '>' +
    ico(key) + '<span>' + label + '</span>' + (count ? '<span class="count">' + count + '</span>' : '') + '</button>';
}
function pageHead(title, description, actions = '', eyebrow = 'SALES DESK / ' + tenant().city) {
  return '<div class="page-head"><div><div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1><p>' + esc(description) + '</p></div><div class="toolbar">' + actions + '</div></div>';
}
function demoStrip() {
  return '<div class="demo-strip">' + ico('info', 13) + '<span><b>Functional prototype.</b> Historical records are fictional. All channel delivery and system connections are simulated.</span><a href="#" data-action="method">How impact is measured ↗</a></div>';
}
function noCustomers() { return pageHead('Your customer portfolio', 'Start with a workspace, catalogue and an inbound channel.', button('Add customer', 'add-customer', 'plus')) + empty('No customer workspaces yet', 'Your team manages setup for each distributor.'); }
function page() {
  return ({ impact: impactPage, queue: queuePage, catalogue: cataloguePage, connectors: connectorsPage,
    rules: rulesPage, customers: customersPage, activity: activityPage, settings: settingsPage }[state.page] || impactPage)();
}
function metric(label, value, unit, footer, icon) {
  return '<article class="stat"><div class="stat-label"><span>' + label + '</span><span class="icon-box">' + ico(icon, 14) + '</span></div>' +
    '<div class="stat-value">' + value + '<small>' + unit + '</small></div><p class="stat-footer">' + footer + '</p></article>';
}
function impactPage() {
  const m = state.data.metrics, t = tenant();
  const speed = m.medianApprovalMinutes === null ? null : Math.round((1 - m.medianApprovalMinutes / t.config.baselineApprovalMinutes) * 100);
  const actions = select('period', [{ value: 7, label: 'Last 7 days' }, { value: 30, label: 'Last 30 days' }, { value: 90, label: 'Last 90 days' }], state.days, 'aria-label="Reporting period"') +
    '<a class="button secondary" download href="/api/report.csv?customer=' + esc(state.customer) + '&days=' + state.days + '">' + ico('down', 14) + 'Export report</a>';
  return pageHead('Customer impact', 'A clear view of effort, quote speed and follow-through across your customer’s industrial catalogue.', actions) +
    demoStrip() + '<div class="stats">' +
    metric('Estimated time returned', num(m.savedHours, 1), 'hrs', '<strong>' + money(m.capacityValue) + ' capacity value</strong> · not cash savings', 'clock') +
    metric('Median time to approval', num(m.medianApprovalMinutes, 0), 'min', speed === null ? 'Awaiting completed quote records' : '<strong>' + Math.abs(speed) + '% ' + (speed >= 0 ? 'faster' : 'slower') + '</strong> than ' + t.config.baselineApprovalMinutes + ' min reference', 'impact') +
    metric('Follow-ups on time', num(m.onTimeRate, 0), m.onTimeRate === null ? '' : '%', '<strong>' + m.followupsOnTime + ' of ' + m.followupsDue + '</strong> follow-ups due in this period', 'check') +
    metric('Quotes approved', num(m.approved), '', '<strong>' + num(m.correctionRate, 1) + '% needed corrections</strong> · review effort included', 'queue') +
    '</div><div class="grid-two"><section class="panel"><div class="panel-head"><div><h2>Human effort over time</h2><p>Last ' + Math.min(state.days, 30) + ' days · baseline and reported effort, grouped in up to 5-day intervals</p></div><div class="legend"><span><i class="baseline"></i>Baseline</span><span><i></i>With your desk</span></div></div>' +
    '<div class="panel-body">' + effortChart(m.daily) + '<div class="chart-tip">' + ico('info', 13) + '<span>' + num(m.actualHours, 1) + ' hours reported against ' + num(m.baselineHours, 1) + ' baseline hours · ' + m.approved + ' approved enquiries in selected period</span></div></div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2>Needs your team’s attention</h2><p>Current work, across all dates</p></div>' + ico('arrow', 17) + '</div><div class="panel-body">' +
    attention('Quotes to approve', 'Ready for a human decision', m.pendingApprovals, 'awaiting_approval', 'queue', 'amber') +
    attention('Product questions', 'Specifications or quantities needed', m.needsReview, 'needs_review', 'alert', 'red') +
    attention('Overdue follow-ups', 'Customer responses still pending', m.overdue, 'overdue', 'clock', '') +
    '</div><div class="panel-note">Quotes are reviewed by your team before any simulated delivery.</div></section></div>' +
    '<div class="grid-two"><section class="panel"><div class="panel-head"><div><h2>A mixed catalogue. One sales workflow.</h2><p>' + new Set(t.products.map((p) => p.category)).size + ' product categories · ' + m.received + ' enquiries received</p></div>' +
    button('View catalogue', 'go-catalogue', 'arrow', true) + '</div><div class="table-wrap"><table><thead><tr><th>Product category</th><th>Enquiries</th><th>Approved</th><th>Coverage</th></tr></thead><tbody>' +
    m.categories.slice(0, 6).map((c) => '<tr><td><span class="category-name"><i class="category-dot"></i>' + esc(c.category) + '</span></td><td>' + c.enquiries + '</td><td>' + c.approvals +
      '</td><td><div class="mini-bar"><i style="width:' + (c.enquiries ? Math.round(c.approvals / c.enquiries * 100) : 0) + '%"></i></div></td></tr>').join('') +
    '</tbody></table>' + (!m.categories.length ? empty('No catalogue yet', 'Add or import products to begin.') : '') + '</div><div class="panel-note">Multi-category enquiries appear in each relevant category. Category rows are not additive.</div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2>Recent activity</h2><p>Actions with a traceable record</p></div>' + button('All activity', 'go-activity', '', true) + '</div><div class="panel-body">' +
    activityList(state.data.events.slice(0, 5)) + '</div></section></div>' +
    '<div class="footer-line"><span><span class="dot">●</span> Updated ' + date(new Date(), true) + ' IST · ' + esc(t.name) + '</span><span>Estimated impact uses customer-specific baselines.</span></div>';
}
function effortChart(rows) {
  const groups = [];
  for (let i = 0; i < rows.length; i += 5) {
    const segment = rows.slice(i, i + 5);
    groups.push({ date: segment[0].date, baseline: segment.reduce((s, r) => s + r.baseline, 0), actual: segment.reduce((s, r) => s + r.actual, 0) });
  }
  const max = Math.max(1, Math.ceil(Math.max(...groups.map((g) => g.baseline), ...groups.map((g) => g.actual), 0) / 2) * 2);
  const width = 620, height = 200, left = 34, bottom = 175, top = 15, plotWidth = 568;
  const point = (g, index, key) => [left + index * plotWidth / Math.max(1, groups.length - 1), bottom - g[key] / max * (bottom - top)];
  const points = (key) => groups.map((g, i) => point(g, i, key).join(',')).join(' ');
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const y = bottom - i / 4 * (bottom - top);
    grid += '<line x1="' + left + '" x2="610" y1="' + y + '" y2="' + y + '" class="chart-grid"/><text x="0" y="' + (y + 3) + '">' + num(max * i / 4, 1) + 'h</text>';
  }
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Human effort chart, baseline versus reported hours for approved enquiries">' +
    grid + '<polygon points="' + left + ',' + bottom + ' ' + points('actual') + ' ' + (left + plotWidth) + ',' + bottom + '" fill="#e7eee0" opacity=".8"/>' +
    '<polyline points="' + points('baseline') + '" fill="none" stroke="#c0aa85" stroke-width="2" stroke-dasharray="5 5"/>' +
    '<polyline points="' + points('actual') + '" fill="none" stroke="#427858" stroke-width="2.5" stroke-linejoin="round"/>' +
    groups.map((g, i) => {
      const [x, y] = point(g, i, 'actual');
      return '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="#fffefa" stroke="#427858" stroke-width="2"><title>' + esc(g.date) +
        ': ' + num(g.actual, 1) + ' hours reported; ' + num(g.baseline, 1) + ' baseline hours</title></circle><text x="' + x + '" y="196" text-anchor="' +
        (i === 0 ? 'start' : i === groups.length - 1 ? 'end' : 'middle') + '">' + esc(date(g.date)) + '</text>';
    }).join('') + '</svg>';
}
function attention(title, detail, count, filter, icon, color) {
  return '<button class="attention-row ' + color + '" data-action="filter-queue" data-filter="' + filter + '"><span class="icon-box">' + ico(icon, 16) + '</span><span><strong>' + title +
    '</strong><small>' + detail + '</small></span><span class="num">' + count + '</span>' + ico('arrow', 13) + '</button>';
}
function activityList(events) {
  return events.length ? '<ul class="activity-list">' + events.map((e) => '<li class="activity-item"><i class="event-dot"></i><div><b>' + esc(e.subject) +
    '</b><p>' + esc(e.detail) + '</p></div><time>' + date(e.at) + '</time></li>').join('') + '</ul>' : empty('No recorded actions', 'Workspace changes will appear here.');
}
function queuePage() {
  return pageHead('Your work queue', 'Review enquiries, approve quotes and keep follow-ups moving.', button('Add enquiry', 'add-enquiry', 'plus')) + demoStrip() +
    '<div class="filters"><div class="search-field">' + ico('search', 16) + '<input id="queue-search" aria-label="Search enquiries" placeholder="Search buyer, RFQ, SKU or owner…" value="' + esc(state.query) + '"></div>' +
    select('queue-filter', [{ value: 'active', label: 'Active work' }, { value: 'all', label: 'All enquiries' }, { value: 'awaiting_approval', label: 'Awaiting approval' },
      { value: 'needs_review', label: 'Needs clarification' }, { value: 'approved', label: 'Approved, ready to send' }, { value: 'overdue', label: 'Overdue follow-ups' }, { value: 'won', label: 'Orders linked' }], state.queue, 'aria-label="Filter by status"') +
    select('channel-filter', [{ value: '', label: 'All channels' }, ...tenant().connectors.filter((c) => c.kind === 'channel').map((c) => c.name)], state.channel, 'aria-label="Filter by channel"') +
    '</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Enquiry / buyer</th><th>Channel</th><th>Quote value</th><th>Owner</th><th>Status</th><th>Received</th></tr></thead><tbody id="queue-rows">' +
    queueRows() + '</tbody></table></div></section>';
}
function filteredEnquiries() {
  return tenant().enquiries.filter((e) => {
    const active = ['new', 'needs_review', 'awaiting_approval', 'approved'].includes(e.status) || (e.status === 'sent' && e.followup && !e.followup.sentAt);
    const overdue = e.status === 'sent' && e.followup && !e.followup.sentAt && new Date(e.followup.dueAt) < new Date();
    return (state.queue === 'all' || (state.queue === 'active' ? active : state.queue === 'overdue' ? overdue : e.status === state.queue)) &&
      (!state.channel || e.channel === state.channel) &&
      (!state.query || (e.buyer + e.reference + e.route.owner + e.items.map((p) => p.sku).join(' ')).toLowerCase().includes(state.query.toLowerCase()));
  }).toSorted((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function queueRows() {
  const rows = filteredEnquiries();
  return rows.length ? rows.map((e) => '<tr class="clickable" data-enquiry="' + esc(e.id) + '"><td><button class="button quiet" style="padding:0" data-enquiry="' + esc(e.id) + '">' + esc(e.reference) +
    '</button><span class="subtext">' + esc(e.buyer) + '</span></td><td>' + pill(e.channel, e.channel === 'Email' ? 'blue' : 'gray') + '</td><td>' + (e.quote ? money(e.quote.total) : '—') +
    '<span class="subtext">' + e.items.length + ' line item' + (e.items.length === 1 ? '' : 's') + '</span></td><td>' + esc(e.route.owner) + '<span class="subtext">' + esc(e.route.queue) +
    '</span></td><td>' + statusPill(e.status) + '</td><td>' + date(e.createdAt, true) + '</td></tr>').join('') :
    '<tr><td colspan="6">' + empty('No enquiries match these filters', 'Try another status or add an enquiry to test the workflow.') + '</td></tr>';
}
function cataloguePage() {
  const products = tenant().products;
  return pageHead('A catalogue without category limits', 'Bearings, motors, pumps, tools and more. Match enquiries against each customer’s approved records.',
    '<a href="/sample-catalogue.csv" class="button secondary" download>' + ico('down', 14) + 'Sample CSV</a>' + button('Import CSV', 'import-catalogue', 'down', true) + button('Add product', 'add-product', 'plus')) + demoStrip() +
    '<input type="file" id="catalogue-upload" accept=".csv,text/csv" hidden><div class="filters"><div class="search-field">' + ico('search', 16) +
    '<input id="product-search" aria-label="Search catalogue" placeholder="Search SKU, product or category…"></div><span class="pill gray">' + products.length + ' products · ' +
    new Set(products.map((p) => p.category)).size + ' categories</span></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>SKU / product</th><th>Category</th><th>Unit price</th><th>Stock</th><th>Source</th><th></th></tr></thead><tbody id="product-rows">' +
    productRows(products) + '</tbody></table></div></section>';
}
function productRows(products) {
  return products.length ? products.map((p) => '<tr><td><span class="sku">' + esc(p.sku) + '</span><span class="subtext">' + esc(p.name) +
    '</span></td><td>' + pill(p.category, 'gray') + '</td><td>' + money(p.price) + '<span class="subtext">per ' + esc(p.unit) + '</span></td><td>' +
    num(p.stock) + '</td><td>' + esc(p.source) + '<span class="subtext">' + date(p.updatedAt) + '</span></td><td><button class="icon-button" data-action="edit-product" data-id="' +
    esc(p.id) + '" aria-label="Edit ' + esc(p.sku) + '">' + ico('edit', 15) + '</button></td></tr>').join('') : '<tr><td colspan="6">' + empty('No products yet', 'Import a CSV or add your first catalogue record.') + '</td></tr>';
}
function connectorsPage() {
  const configured = tenant().connectors, names = new Set(configured.map((c) => c.name));
  return pageHead('Use the systems your customer has', 'Configure channels, business systems and custom payload mappings. Every adapter in this release runs in simulation.',
    button('Custom connector', 'add-connector', 'plus')) + demoStrip() +
    '<div class="section-label">Configured for this customer</div><div class="connector-grid">' +
    configured.map((c) => connectorCard(c, true)).join('') + (!configured.length ? empty('No connectors configured', 'Choose a preset below or create a custom connector.') : '') +
    '</div><div class="section-label">Available configuration presets</div><div class="connector-grid">' +
    state.data.presets.filter((p) => !names.has(p.name)).map((c) => connectorCard(c, false)).join('') + '</div>';
}
function connectorCard(c, configured) {
  return '<article class="connector-card"><div class="connector-top"><span class="connector-logo" style="color:' + esc(c.color) + '">' + esc(c.initials) +
    '</span><div><h3>' + esc(c.name) + '</h3><small>' + (c.kind === 'channel' ? 'Communication channel' : 'Business system') + '</small></div>' +
    (configured ? pill(c.enabled ? 'Simulation' : 'Disabled', c.enabled ? '' : 'gray') : '') + '</div><div class="capabilities">' +
    c.capabilities.map((cap) => '<span class="capability">' + esc(cap.replaceAll('_', ' ')) + '</span>').join('') +
    '</div><p>' + (configured ? 'Field mappings saved for this workspace. ' + (c.testedAt ? 'Sample payload checked ' + date(c.testedAt) + '.' : 'Sample payload not checked yet.') : 'Add this preset, map the available fields and test a sample payload.') +
    '</p><div class="toolbar">' + button(configured ? 'Configure' : 'Add preset', configured ? 'edit-connector' : 'preset-connector', 'settings', true,
      'data-id="' + esc(configured ? c.id : c.name) + '"') +
    (configured ? button('Test payload', 'test-connector', 'check', true, 'data-id="' + esc(c.id) + '"') : '') + '</div></article>';
}
function rulesPage() {
  return pageHead('Route work with clear rules', 'The lowest priority number wins. Each enquiry keeps the rule and configuration version used when it was routed.',
    button('Preview routing', 'preview-rule', 'rules', true) + button('Add rule', 'add-rule', 'plus')) + demoStrip() +
    tenant().rules.toSorted((a, b) => a.priority - b.priority).map((r) => '<article class="rule-card"><span class="priority">' + r.priority + '</span><div><h3>' +
      esc(r.name) + ' ' + (!r.enabled ? pill('Disabled', 'gray') : '') + '</h3><p>If <span class="condition">' + esc(r.field) + ' ' + esc(r.operator === 'gte' ? '≥' : r.operator === 'contains' ? 'contains' : '=') +
      ' ' + esc(r.value) + '</span> → <strong>' + esc(r.queue) + '</strong> · ' + esc(r.owner) + '</p></div><div class="toolbar">' +
      button('Edit', 'edit-rule', 'edit', true, 'data-id="' + esc(r.id) + '"') + '</div></article>').join('') +
    '<article class="rule-card"><span class="priority">↳</span><div><h3>Default route</h3><p>When no rule matches → <strong>Sales review</strong> · ' + esc(tenant().config.defaultOwner) +
    '</p></div>' + button('Settings', 'go-settings', 'settings', true) + '</article><div class="panel-note" style="border-radius:8px;margin-top:18px">Routing selects an owner and queue. Every quote still needs explicit human approval.</div>';
}
function customersPage() {
  return pageHead('One desk. Many customer workspaces.', 'Your team manages each distributor’s catalogue, connectors, rules and baseline separately.', button('Add customer', 'add-customer', 'plus'), 'OPERATIONS / CUSTOMER PORTFOLIO') +
    '<div class="customer-grid">' + state.data.customers.map((c) => '<article class="customer-card"><div class="toolbar" style="justify-content:space-between;margin:0 0 15px">' +
    pill(c.id === state.customer ? 'Current workspace' : 'Prototype workspace', c.id === state.customer ? '' : 'gray') + '<span class="eyebrow">' + esc(c.city) + '</span></div><h3>' + esc(c.name) +
    '</h3><p>Mixed industrial products · Managed by your operations team</p><div class="customer-facts"><div><strong>' + c.products + '</strong><small>Products</small></div><div><strong>' +
    c.categories + '</strong><small>Categories</small></div><div><strong>' + c.connectors + '</strong><small>Demo adapters</small></div></div><div class="toolbar">' +
    button('Open workspace', 'open-customer', 'arrow', true, 'data-id="' + esc(c.id) + '"') + '</div></article>').join('') + '</div>';
}
function activityPage() {
  return pageHead('Every action has a record', 'Review routing, catalogue changes, quote decisions and simulated delivery receipts.') + demoStrip() +
    '<section class="panel"><div class="panel-head"><div><h2>Workspace action history</h2><p>Latest 250 recorded events · ' + esc(tenant().name) + '</p></div></div><div class="panel-body">' +
    activityList(state.data.events) + '</div></section>';
}
function settingsPage() {
  const c = tenant().config;
  return pageHead('Customer settings', 'Set the comparison baseline and commercial limits your team uses for this workspace.') +
    '<section class="panel form-panel"><h2>Measurement and operating rules</h2><p>Baseline effort is saved on new enquiries. Changing this setting does not rewrite existing enquiry baselines.</p><form data-form="settings"><div class="form-grid">' +
    field('Baseline effort per enquiry (minutes)', input('baselineMinutes', c.baselineMinutes, 'number', 'required min="1" max="1440" step=".1"'), 'Use measured, comparable human effort, including corrections.') +
    field('Reference time to approval (minutes)', input('baselineApprovalMinutes', c.baselineApprovalMinutes, 'number', 'required min="1" max="10080"'), 'A comparison reference; elapsed time is distinct from human effort.') +
    field('Loaded hourly cost (INR)', input('hourlyCost', c.hourlyCost, 'number', 'required min="0" max="1000000"'), 'Used for estimated capacity value, not cash savings.') +
    field('Maximum permitted discount (%)', input('maxDiscount', c.maxDiscount, 'number', 'required min="0" max="50" step=".1"')) +
    field('Tax rate (%)', input('taxRate', c.taxRate, 'number', 'required min="0" max="50" step=".1"'), 'Illustrative quote setting; verify tax treatment before live use.') +
    field('Follow-up after (calendar days)', input('followupDays', c.followupDays, 'number', 'required min="1" max="30" step="1"'), 'This prototype schedules a task; it does not send automatically.') +
    field('Default owner', select('defaultOwner', state.data.team, c.defaultOwner)) +
    field('Timezone and currency', '<input value="Asia/Kolkata · INR" disabled>') +
    '</div><div class="form-footer"><span class="muted" style="margin-right:auto;font-size:11px">Configuration version ' + c.version + '</span><button class="button" type="submit">' +
    ico('check', 14) + 'Save customer settings</button></div></form></section>';
}

function openModal(title, subtitle, content) {
  modal.innerHTML = '<header class="modal-head"><div><h2 id="modal-title">' + esc(title) + '</h2><p>' + esc(subtitle) + '</p></div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">' +
    ico('close') + '</button></header><div class="modal-body">' + content + '<div id="modal-error" class="error-message" role="alert"></div></div>';
  if (!modal.open) modal.showModal();
}
function formFooter(label) { return '<div class="form-footer">' + button('Cancel', 'close-modal', '', true) + '<button class="button" type="submit">' + esc(label) + ' ' + ico('arrow', 14) + '</button></div>'; }
function channelOptions(outbound = false) {
  return tenant().connectors.filter((c) => c.kind === 'channel' && c.enabled && c.capabilities.includes(outbound ? 'send_message' : 'receive_message')).map((c) => c.name);
}
function enquiryForm(preview = false) {
  openModal(preview ? 'Preview your routing' : 'Add a sample enquiry', preview ? 'Test rules without creating a record.' : 'The prototype matches catalogue identifiers and quantities. No external AI service is called.',
    '<form data-form="' + (preview ? 'preview-rule' : 'enquiry') + '"><div class="form-grid">' +
    field('Buyer / company', input('buyer', 'Aster Manufacturing', 'text', 'required maxlength="200"')) +
    field('Incoming channel', select('channel', channelOptions())) +
    '<div class="full">' + field('Enquiry message', '<textarea name="message" required maxlength="12000">Please quote 30 × SKF-6205-2RS;\n2 × ABB-ACS355-2.2</textarea>',
      'Use one product per line, or separate products with semicolons. Unknown products go to technical review.') + '</div></div>' +
    formFooter(preview ? 'Preview route' : 'Receive enquiry') + '<div id="preview-result"></div></form>');
}
function showEnquiry(enquiryId) {
  const e = tenant().enquiries.find((e) => e.id === enquiryId);
  if (!e) return toast('This enquiry is no longer available.');
  const stages = ['Received', 'Matched', 'Drafted', 'Approved', 'Delivered'];
  const position = ({ new: 1, needs_review: 0, awaiting_approval: 2, approved: 3, sent: 4, won: 4 })[e.status];
  let content = '<div class="row-flex" style="justify-content:space-between">' + statusPill(e.status) + '<span class="muted" style="font-size:10px">' + date(e.createdAt, true) + ' IST</span></div>' +
    '<div class="stepper">' + stages.map((s, i) => '<span class="' + (i < position ? 'done' : i === position ? 'current' : '') + '">' + s + '</span>').join('') +
    '</div><h3>Original enquiry · ' + esc(e.channel) + '</h3><div class="raw-message">' + esc(e.message) + '</div>' +
    '<div class="route-note"><strong>' + esc(e.route.queue) + '</strong> · ' + esc(e.route.owner) + '<br>' + esc(e.route.reason) + ' · configuration v' + e.route.configVersion + '</div>';
  if (e.missing.length) content += '<div class="warning"><strong>Your team needs to resolve:</strong><br>' + e.missing.map(esc).join('<br>') + '</div>' +
    button('Confirm catalogue products', 'clarify-enquiry', 'catalogue', false, 'data-id="' + e.id + '"');
  if (e.items.length) {
    content += '<h3 style="margin-top:22px">Catalogue matches and quoted terms</h3><div class="table-wrap"><table class="quote-table"><thead><tr><th>Product / source</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>' +
      e.items.map((i) => '<tr><td><span class="sku">' + esc(i.sku) + '</span><span class="subtext">' + esc(i.name) + '</span><span class="subtext">' + esc(i.match) + ' · ' + esc(i.source) +
        '</span></td><td>' + num(i.quantity, 2) + '<span class="subtext">Stock snapshot: ' + num(i.stock) + '</span></td><td>' + money(i.unitPrice) + '</td><td>' + money(i.quantity * i.unitPrice) + '</td></tr>').join('') + '</tbody></table></div>';
    if (e.items.some((i) => i.quantity > i.stock)) content += '<div class="warning">Requested quantity exceeds recorded stock for one or more items. Confirm availability and delivery terms during review.</div>';
  }
  if (e.quote) content += '<div class="quote-total"><span>Subtotal ' + money(e.quote.subtotal) + ' · discount ' + e.quote.discount + '% · tax ' + e.quote.taxRate +
    '%</span><span>Quote revision ' + e.quote.revision + '<b>' + money(e.quote.total) + '</b></span></div>';
  const idAttr = 'data-id="' + e.id + '"';
  if (e.status === 'new' || e.status === 'awaiting_approval' || e.status === 'approved') {
    content += '<form data-form="draft" data-id="' + e.id + '"><div class="form-grid">' +
      field('Discount (%)', input('discount', e.quote?.discount || 0, 'number', 'required min="0" max="' + tenant().config.maxDiscount + '" step=".1"')) +
      '<div style="align-self:end"><button type="submit" class="button secondary">' + (e.quote ? 'Revise quote draft' : 'Prepare quote draft') + '</button></div></div>' +
      '<p class="subtext">A revised draft needs a fresh approval.</p></form>';
  }
  if (e.status === 'awaiting_approval') content += '<div class="spacer"></div><form data-form="approve" data-id="' + e.id + '" data-revision="' + e.quote.revision + '">' +
    field('Total human effort (minutes)', input('manualMinutes', '', 'number', 'required min="0" max="1440" step=".1"'), 'Include reading, checking, corrections and approval. This is used in impact reporting.') +
    '<label class="checkbox-label" style="margin-top:15px"><input type="checkbox" name="corrected"' + (e.corrected ? ' checked' : '') + '> This enquiry required corrections</label>' +
    '<label class="checkbox-label" style="margin-top:12px"><input type="checkbox" name="reviewConfirmed" required> I checked product suitability, availability, prices and delivery terms</label>' +
    formFooter('Approve quote') + '</form>';
  else if (e.status === 'approved') content += '<div class="warning" style="margin-top:20px">Sending records a simulated delivery receipt. It does not contact the buyer.</div>' +
    '<form data-form="outbound" data-id="' + e.id + '"><div class="form-grid">' + field('Delivery channel', select('channel', channelOptions(true), e.channel)) +
    '<div style="align-self:end"><button class="button secondary" type="submit">Set channel</button></div></div></form><div class="form-footer">' +
    button('Simulate quote delivery', 'send-quote', 'arrow', false, idAttr + ' data-revision="' + e.quote.revision + '"') + '</div>';
  else if (e.status === 'sent') content += '<div class="route-note">Simulated quote delivery recorded ' + date(e.sentAt, true) + '.<br>Follow-up ' +
    (e.followup?.sentAt ? 'recorded ' + date(e.followup.sentAt, true) : 'due ' + date(e.followup?.dueAt, true)) + '.</div><div class="form-footer">' +
    (!e.followup?.sentAt ? button('Simulate follow-up', 'send-followup', 'clock', true, idAttr) : '') + button('Link demo order', 'link-order', 'check', false, idAttr) + '</div>';
  else if (e.status === 'won') content += '<div class="route-note"><strong>' + money(e.orderValue) + ' demo order linked.</strong><br>Recorded order value does not establish incremental revenue. Follow-up is stopped.</div>';
  openModal(e.reference + ' · ' + e.buyer, 'Review this enquiry and progress it through the sales workflow.', content);
}
function productForm(product = {}) {
  openModal(product.id ? 'Edit catalogue product' : 'Add a catalogue product', 'Approved source records drive matching and quotation prices.',
    '<form data-form="product"><div class="form-grid">' + field('SKU / part number', input('sku', product.sku, 'text', 'required maxlength="80"' + (product.id ? ' readonly' : ''))) +
    field('Category', input('category', product.category, 'text', 'required maxlength="100"')) +
    '<div class="full">' + field('Product name', input('name', product.name, 'text', 'required maxlength="200"')) + '</div>' +
    field('Unit', input('unit', product.unit || 'unit', 'text', 'required maxlength="40"')) +
    field('Unit price (INR)', input('price', product.price ?? '', 'number', 'required min="0" max="100000000" step=".01"')) +
    field('Available stock', input('stock', product.stock ?? '', 'number', 'required min="0" max="100000000" step=".01"')) +
    field('Record source', input('source', product.source || 'Team catalogue', 'text', 'required maxlength="100"')) +
    '<div class="full">' + field('Known aliases, separated by commas', input('aliases', product.aliases?.join(', ') || ''), 'Ambiguous aliases are sent for review.') + '</div></div>' +
    formFooter('Save product') + '</form>');
}
function customerForm() {
  openModal('Add a customer workspace', 'Each distributor gets separate data, connector mappings and operating rules.',
    '<form data-form="customer"><div class="form-grid">' + field('Distributor name', input('name', '', 'text', 'required maxlength="200"')) +
    field('City', input('city', '', 'text', 'required maxlength="200"')) +
    '<label class="checkbox-label full"><input type="checkbox" name="sampleCatalogue" checked> Start with the mixed sample catalogue and simulated Email / WhatsApp channels</label></div>' +
    formFooter('Create workspace') + '</form>');
}
function ruleForm(rule = {}) {
  openModal(rule.id ? 'Edit routing rule' : 'Add routing rule', 'Rules are evaluated in priority order. Human quote approval remains required.',
    '<form data-form="rule" data-id="' + esc(rule.id || '') + '"><div class="form-grid"><div class="full">' + field('Rule name', input('name', rule.name, 'text', 'required')) + '</div>' +
    field('Priority (lowest number first)', input('priority', rule.priority || Math.max(0, ...tenant().rules.map((r) => r.priority)) + 1, 'number', 'required min="1" max="999"')) +
    field('Condition field', select('field', ['channel', 'category', 'value', 'match'], rule.field || 'channel')) +
    field('Operator', select('operator', [{ value: 'eq', label: 'Equals' }, { value: 'gte', label: 'At least (value only)' }, { value: 'contains', label: 'Contains' }], rule.operator || 'eq')) +
    field('Condition value', input('value', rule.value || '', 'text', 'required'), 'Examples: WhatsApp, Automation, 75000, or incomplete.') +
    field('Route to queue', input('queue', rule.queue || 'Sales review', 'text', 'required')) +
    field('Owner', select('owner', state.data.team, rule.owner || state.data.team[0])) +
    '<label class="checkbox-label full"><input type="checkbox" name="enabled"' + (rule.enabled !== false ? ' checked' : '') + '> Rule enabled</label></div>' +
    '<div class="form-footer">' + (rule.id ? button('Remove rule', 'delete-rule', '', true, 'data-id="' + esc(rule.id) + '"') : '') +
    '<button class="button" type="submit">Save routing rule ' + ico('check', 14) + '</button></div></form>');
}
function connectorForm(connector = {}) {
  const kind = connector.kind || 'system';
  const mapping = connector.mapping || (kind === 'channel' ? { buyer: 'customer.name', message: 'message.text' } :
    { sku: 'item.code', name: 'item.name', category: 'item.category', price: 'item.price', stock: 'item.stock' });
  openModal(connector.id ? 'Configure ' + connector.name : 'Configure a connector', 'Declare available capabilities and normalize sample payloads. No account credentials are stored.',
    '<form data-form="connector" data-id="' + esc(connector.id || '') + '"><div class="form-grid">' +
    field('Connector name', input('name', connector.name || '', 'text', 'required maxlength="100"')) +
    field('Connector type', select('kind', [{ value: 'channel', label: 'Communication channel' }, { value: 'system', label: 'Business system' }], kind)) +
    '<div class="full"><h3>Available capabilities</h3><div class="form-grid">' + state.data.capabilities.map((cap) =>
      '<label class="checkbox-label"><input name="capability" type="checkbox" value="' + cap + '"' + (connector.capabilities?.includes(cap) ? ' checked' : '') + '> ' + cap.replaceAll('_', ' ') + '</label>').join('') +
    '</div></div><div class="full">' + field('Field mapping (JSON)', '<textarea name="mapping" required spellcheck="false" style="font-family:var(--mono);min-height:160px">' +
    esc(JSON.stringify(mapping, null, 2)) + '</textarea>', 'Map standard fields to dot-separated paths in the customer’s payload.') + '</div>' +
    '<label class="checkbox-label full"><input type="checkbox" name="enabled"' + (connector.enabled !== false ? ' checked' : '') + '> Enable this simulation adapter</label></div>' +
    formFooter('Save connector') + '</form>');
}
function connectorTest(connectorId) {
  const c = tenant().connectors.find((c) => c.id === connectorId);
  const payload = c.kind === 'channel' ? { customer: { name: 'Nexus Fabrication' }, message: { text: 'Please quote 20 × SKF-6205-2RS' } } :
    { item: { code: 'SKF-6205-2RS', name: 'Sealed bearing', category: 'Bearings', price: 420, stock: 480 } };
  openModal('Test ' + c.name + ' payload', 'Validates field mapping against sample JSON. This does not test a live connection.',
    '<form data-form="connector-test" data-id="' + c.id + '">' + field('Sample payload (JSON)', '<textarea name="payload" required spellcheck="false" style="min-height:210px;font-family:var(--mono)">' +
    esc(JSON.stringify(payload, null, 2)) + '</textarea>') + '<div class="form-footer">' +
    (c.kind === 'channel' ? '<button class="button secondary" name="operation" value="ingest" type="submit">Create sample enquiry</button>' : '') +
    '<button class="button" name="operation" value="test" type="submit">Validate mapping ' + ico('check', 14) + '</button></div><div id="mapping-result"></div></form>');
}
function clarifyForm(enquiryId) {
  const e = tenant().enquiries.find((e) => e.id === enquiryId);
  openModal('Confirm products · ' + e.reference, 'Your team resolves the specification question. Choose exact catalogue items.',
    '<form data-form="clarify" data-id="' + e.id + '"><div id="clarification-lines">' + clarificationLine() +
    '</div><div class="spacer"></div>' + button('Add another product', 'add-clarification-line', 'plus', true) + formFooter('Confirm selection') + '</form>');
}
function clarificationLine() {
  return '<div class="form-grid" style="margin-bottom:12px">' + field('Catalogue product', select('sku', tenant().products.map((p) => ({ value: p.sku, label: p.sku + ' · ' + p.name })))) +
    field('Quantity', input('quantity', 1, 'number', 'required min=".01" max="1000000" step=".01"')) + '</div>';
}
function methodology() {
  openModal('How impact is measured', 'Every number comes from recorded events and an explicit comparison method.',
    '<p class="muted" style="font-size:12px;line-height:1.8">All seeded records are fictional. New actions are recorded by this prototype; external deliveries remain simulated.</p><div class="method-grid">' +
    [
      ['Estimated human effort saved', 'For enquiries approved in the selected period: sum of each enquiry’s saved baseline minutes minus total reported human minutes, divided by 60. Review and correction time are included. Negative savings are retained.'],
      ['Median approval turnaround', 'Elapsed minutes from enquiry receipt to human approval. This includes waiting time and is separate from active human effort. Comparison uses the customer’s configured reference.'],
      ['Follow-ups on time', 'Follow-ups due in the selected period with a simulated delivery timestamp on or before their deadline, divided by all non-cancelled follow-ups due in that period.'],
      ['Correction rate', 'Approved enquiries marked as requiring corrections, divided by approved enquiries with reported human effort. Unresolved enquiries remain visible in the work queue.'],
      ['Estimated capacity value', 'Estimated hours saved multiplied by the configured loaded hourly cost. This is an estimate of capacity value, not money saved or realised ROI.'],
      ['Linked order value', 'Recorded orders linked to sent quotes. This reports associated value; it does not claim the system caused additional revenue.']
    ].map(([title, detail]) => '<div class="method-item"><b>' + title + '</b><p>' + detail + '</p></div>').join('') +
    '</div><div class="form-footer">' + button('View customer baselines', 'go-settings', 'settings') + '</div>');
}

document.addEventListener('click', async (event) => {
  const control = event.target.closest('[data-action],[data-page],[data-enquiry]');
  if (!control) return;
  event.preventDefault();
  if (control.dataset.page) { state.page = control.dataset.page; state.navOpen = false; render(); return; }
  if (control.dataset.enquiry) return showEnquiry(control.dataset.enquiry);
  const action = control.dataset.action, itemId = control.dataset.id;
  try {
    if (action === 'close-modal') return modal.close();
    if (action === 'mobile-nav') { state.navOpen = !state.navOpen; return render(); }
    if (action.startsWith('go-')) { modal.close(); state.page = action.slice(3); state.query = ''; return render(); }
    if (action === 'reload') return initialize();
    if (action === 'method') return methodology();
    if (action === 'demo-login') { const result = await api('/api/login', 'POST', { password: 'demo-sales-desk' }); state.csrf = result.csrf; return load(); }
    if (action === 'logout') { await api('/api/logout', 'POST'); return initialize(); }
    if (action === 'add-enquiry') return enquiryForm();
    if (action === 'preview-rule') return enquiryForm(true);
    if (action === 'add-customer') return customerForm();
    if (action === 'open-customer') { state.page = 'impact'; state.query = ''; return load(itemId); }
    if (action === 'add-product') return productForm();
    if (action === 'edit-product') return productForm(tenant().products.find((p) => p.id === itemId));
    if (action === 'import-catalogue') return document.querySelector('#catalogue-upload').click();
    if (action === 'add-rule') return ruleForm();
    if (action === 'edit-rule') return ruleForm(tenant().rules.find((r) => r.id === itemId));
    if (action === 'delete-rule') {
      await api(base() + '/rules/' + itemId, 'DELETE', {}); modal.close(); await load(); return toast('Rule removed from future routing.');
    }
    if (action === 'add-connector') return connectorForm();
    if (action === 'preset-connector') return connectorForm(state.data.presets.find((c) => c.name === itemId));
    if (action === 'edit-connector') return connectorForm(tenant().connectors.find((c) => c.id === itemId));
    if (action === 'test-connector') return connectorTest(itemId);
    if (action === 'clarify-enquiry') return clarifyForm(itemId);
    if (action === 'add-clarification-line') return document.querySelector('#clarification-lines').insertAdjacentHTML('beforeend', clarificationLine());
    if (action === 'filter-queue') { state.page = 'queue'; state.queue = control.dataset.filter; state.query = ''; return render(); }
    if (action === 'send-quote' || action === 'send-followup' || action === 'link-order') {
      control.disabled = true;
      const operation = { 'send-quote': 'send', 'send-followup': 'followup', 'link-order': 'won' }[action];
      await api(base() + '/enquiries/' + itemId + '/' + operation, 'POST', { revision: Number(control.dataset.revision) });
      await load(); showEnquiry(itemId); return toast(operation === 'won' ? 'Demo order linked. Follow-up stopped.' : 'Simulated delivery recorded. No external message sent.');
    }
  } catch (error) { toast(error.message); if (control.isConnected) control.disabled = false; }
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form), values = Object.fromEntries(data), kind = form.dataset.form;
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  const errorEl = document.querySelector(kind === 'login' ? '#login-error' : '#modal-error');
  if (errorEl) errorEl.textContent = '';
  try {
    if (kind === 'login') { const result = await api('/api/login', 'POST', values); state.csrf = result.csrf; return await load(); }
    if (kind === 'customer') {
      const result = await api('/api/customers', 'POST', { ...values, sampleCatalogue: data.has('sampleCatalogue') });
      modal.close(); state.page = 'impact'; await load(result.id); return toast('Customer workspace created.');
    }
    if (kind === 'enquiry') {
      const result = await api(base() + '/enquiries', 'POST', { ...values, sourceMessageId: crypto.randomUUID() });
      modal.close(); state.page = 'queue'; state.queue = 'active'; await load(); showEnquiry(result.id); return toast('Enquiry received and routed.');
    }
    if (kind === 'preview-rule') {
      const result = await api(base() + '/preview-rule', 'POST', values);
      document.querySelector('#preview-result').innerHTML = '<div class="route-note"><strong>' + esc(result.route.queue) + '</strong> · ' + esc(result.route.owner) + '<br>' +
        esc(result.route.reason) + '<br>' + result.items.length + ' catalogue matches · ' + result.missing.length + ' questions to resolve</div>'; return;
    }
    if (kind === 'product') {
      await api(base() + '/products', 'POST', { ...values, aliases: values.aliases.split(',').map((a) => a.trim()).filter(Boolean) });
    } else if (kind === 'rule') {
      await api(base() + '/rules', 'POST', { ...values, id: form.dataset.id || undefined, enabled: data.has('enabled') });
    } else if (kind === 'connector') {
      await api(base() + '/connectors', 'POST', { ...values, id: form.dataset.id || undefined, capabilities: data.getAll('capability'),
        mapping: JSON.parse(values.mapping), enabled: data.has('enabled') });
    } else if (kind === 'connector-test') {
      const operation = submit?.value || 'test';
      const result = await api(base() + '/connectors/' + form.dataset.id + '/' + operation, 'POST', { payload: JSON.parse(values.payload) });
      if (operation === 'ingest') { modal.close(); state.page = 'queue'; state.queue = 'active'; await load(); showEnquiry(result.id); return toast('Sample payload created an enquiry.'); }
      document.querySelector('#mapping-result').innerHTML = '<div class="result-box">Mapping valid · simulation only\n' + esc(JSON.stringify(result.mapped, null, 2)) + '</div>';
      const saved = await api('/api/bootstrap?customer=' + state.customer + '&days=' + state.days); state.data = saved; return;
    } else if (kind === 'settings') {
      await api(base() + '/config', 'POST', values); await load(); return toast('Customer settings saved.');
    } else if (['draft', 'approve', 'outbound', 'clarify'].includes(kind)) {
      const payload = kind === 'approve' ? { ...values, revision: Number(form.dataset.revision), corrected: data.has('corrected'), reviewConfirmed: data.has('reviewConfirmed') } :
        kind === 'clarify' ? { items: data.getAll('sku').map((sku, i) => ({ sku, quantity: data.getAll('quantity')[i] })) } : values;
      await api(base() + '/enquiries/' + form.dataset.id + '/' + kind, 'POST', payload);
      await load(); showEnquiry(form.dataset.id); return toast(kind === 'approve' ? 'Quote approved. Impact report updated.' : 'Enquiry updated.');
    }
    modal.close(); await load(); toast('Saved for this customer workspace.');
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Enter valid JSON using the displayed sample structure.' : error.message;
    if (errorEl) errorEl.textContent = message; else toast(message);
  } finally { if (submit?.isConnected) submit.disabled = false; }
});
document.addEventListener('change', async (event) => {
  const el = event.target;
  try {
    if (el.name === 'workspace') { state.query = ''; await load(el.value); }
    if (el.name === 'period') { state.days = Number(el.value); await load(); }
    if (el.name === 'queue-filter') { state.queue = el.value; document.querySelector('#queue-rows').innerHTML = queueRows(); }
    if (el.name === 'channel-filter') { state.channel = el.value; document.querySelector('#queue-rows').innerHTML = queueRows(); }
    if (el.id === 'catalogue-upload' && el.files[0]) {
      if (el.files[0].size > 1500000) throw new Error('Use a CSV smaller than 1.5 MB.');
      const rows = parseCSV(await el.files[0].text());
      const headers = rows.shift()?.map((h) => h.trim().toLowerCase());
      for (const h of ['sku', 'name', 'category', 'price', 'stock']) if (!headers?.includes(h)) throw new Error('CSV requires sku, name, category, price and stock columns.');
      const products = rows.filter((r) => r.some((v) => v.trim())).map((r) => {
        const obj = Object.fromEntries(headers.map((h, i) => [h, r[i] || '']));
        return { ...obj, unit: obj.unit || 'unit', source: obj.source || 'CSV import', aliases: (obj.aliases || '').split('|').map((a) => a.trim()).filter(Boolean) };
      });
      const result = await api(base() + '/products', 'POST', { products }); await load(); toast(result.imported + ' catalogue records imported.');
    }
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'queue-search') { state.query = event.target.value; document.querySelector('#queue-rows').innerHTML = queueRows(); }
  if (event.target.id === 'product-search') {
    const query = event.target.value.toLowerCase();
    document.querySelector('#product-rows').innerHTML = productRows(tenant().products.filter((p) => (p.sku + p.name + p.category).toLowerCase().includes(query)));
  }
});
function parseCSV(text) {
  const rows = [], row = []; let cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push([...row]); row.length = 0; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
await initialize();

