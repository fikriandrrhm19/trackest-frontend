/* ============================================================
   Trackest Logistics Management System
   Plain HTML + CSS + JavaScript + Supabase JS v2
   Backend contract: existing Trackest PostgreSQL schema
   ============================================================ */

const { createClient } = window.supabase;
const cfg = window.TRACKEST_CONFIG || {};

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
  console.warn('Trackest: configure supabase-config.local.js before using the app.');
}

const supabaseClient = createClient(
  cfg.SUPABASE_URL || 'https://invalid.local',
  cfg.SUPABASE_PUBLISHABLE_KEY || 'invalid-key',
  {
    db: { schema: 'public' },
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  }
);

const state = {
  session: null,
  user: null,
  profile: null,
  customer: null,
  courier: null,
  currentPage: 'dashboard',
  shipments: [],
  warehouses: [],
  routes: [],
  customers: []
};

const el = (id) => document.getElementById(id);
const pageContainer = el('page-container');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function humanize(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function initials(name) {
  return String(name || 'U').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || 'U';
}

function statusBadge(status) {
  const cls = `status-badge status-${String(status || '').replaceAll(' ', '_')}`;
  return `<span class="${cls}">${escapeHtml(humanize(status))}</span>`;
}

function showToast(message, type = '') {
  const toast = el('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`.trim();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

function showError(message) {
  showToast(message, 'error');
  console.error(message);
}

function showLogin() {
  el('login-page').classList.remove('hidden');
  el('app-shell').classList.add('hidden');
}

function showApp() {
  el('login-page').classList.add('hidden');
  el('app-shell').classList.remove('hidden');
}

function closeModal() {
  el('modal-backdrop').classList.add('hidden');
  el('modal').innerHTML = '';
}

function openModal(title, bodyHtml) {
  el('modal').innerHTML = `
    <div class="modal-header">
      <div>
        <p class="eyebrow">SHIPMENT</p>
        <h3 id="modal-title">${escapeHtml(title)}</h3>
      </div>
      <button class="modal-close" type="button" aria-label="Close" data-close-modal>×</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>`;
  el('modal-backdrop').classList.remove('hidden');
  el('modal').querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
}

function isStaff() {
  return ['staff', 'admin'].includes(state.profile?.role);
}

function isCourier() {
  return state.profile?.role === 'courier';
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('id', state.user.id)
    .single();

  if (error) throw new Error(`Profile is not available for this Auth user: ${error.message}`);
  state.profile = data;

  const { data: customer, error: customerError } = await supabaseClient
    .from('customers')
    .select('id, profile_id, phone, address, created_at')
    .eq('profile_id', state.user.id)
    .maybeSingle();
  if (customerError) throw customerError;
  state.customer = customer;

  const { data: courier, error: courierError } = await supabaseClient
    .from('couriers')
    .select('id, profile_id, courier_code, phone, active, created_at')
    .eq('profile_id', state.user.id)
    .maybeSingle();
  if (courierError) throw courierError;
  state.courier = courier;

  el('user-name').textContent = state.profile.full_name;
  el('user-role').textContent = state.profile.role;
  el('user-avatar').textContent = initials(state.profile.full_name);
  el('session-badge').innerHTML = `
    <span class="status-dot" aria-hidden="true"></span>
    ${escapeHtml(humanize(state.profile.role))} session`;
}

async function loadReferenceData() {
  const [warehousesResult, routesResult, customersResult] = await Promise.all([
    supabaseClient.from('warehouses').select('id, name, city, address').order('id'),
    supabaseClient.from('routes').select('id, courier_id, origin_warehouse_id, destination_warehouse_id, departure_at, arrival_at, status, created_at').order('id', { ascending: false }),
    supabaseClient.from('customers').select('id, profile_id, phone, address').order('id')
  ]);

  if (warehousesResult.error) throw warehousesResult.error;
  if (routesResult.error) throw routesResult.error;
  if (customersResult.error) throw customersResult.error;

  state.warehouses = warehousesResult.data || [];
  state.routes = routesResult.data || [];
  state.customers = customersResult.data || [];
}

async function loadShipments() {
  const { data, error } = await supabaseClient
    .from('shipments')
    .select('id, tracking_number, sender_id, receiver_id, origin_warehouse_id, current_warehouse_id, current_route_id, weight_kg, status, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  state.shipments = data || [];
}

async function loadAuditLogs() {
  const { data, error } = await supabaseClient
    .from('audit_logs')
    .select('id, shipment_id, action, old_status, new_status, changed_by, changed_at')
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

function warehouseName(id) {
  return state.warehouses.find((w) => w.id === id)?.name || (id ? `Warehouse #${id}` : '-');
}

function routeLabel(id) {
  const route = state.routes.find((r) => r.id === id);
  if (!route) return id ? `Route #${id}` : '-';
  return `Route #${route.id} · ${warehouseName(route.origin_warehouse_id)} → ${warehouseName(route.destination_warehouse_id)}`;
}

function customerLabel(id) {
  const customer = state.customers.find((c) => c.id === id);
  if (!customer) return `Customer #${id}`;
  return `Customer #${id}`;
}

function allowedNextStatuses(status) {
  const map = {
    created: ['picked_up', 'cancelled'],
    picked_up: ['in_transit', 'cancelled'],
    in_transit: ['at_transit_warehouse'],
    at_transit_warehouse: ['out_for_delivery'],
    out_for_delivery: ['delivered'],
    delivered: [],
    cancelled: []
  };
  return map[status] || [];
}

async function refreshCurrentPage() {
  await renderPage(state.currentPage);
}

async function renderPage(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  const titles = {
    dashboard: 'Dashboard',
    shipments: 'Shipments',
    tracking: 'Tracking',
    routes: 'Routes',
    warehouses: 'Warehouses',
    audit: 'Audit Logs'
  };
  el('page-title').textContent = titles[page] || 'Dashboard';
  pageContainer.innerHTML = '<div class="loading">Loading</div>';

  try {
    switch (page) {
      case 'dashboard': await renderDashboard(); break;
      case 'shipments': await renderShipments(); break;
      case 'tracking': renderTracking(); break;
      case 'routes': await renderRoutes(); break;
      case 'warehouses': await renderWarehouses(); break;
      case 'audit': await renderAudit(); break;
      default: await renderDashboard();
    }
  } catch (error) {
    pageContainer.innerHTML = `<div class="card"><div class="empty">${escapeHtml(error.message || 'Failed to load page.')}</div></div>`;
    showError(error.message || 'Failed to load page.');
  }
}

async function renderDashboard() {
  await Promise.all([loadShipments(), loadReferenceData()]);
  const total = state.shipments.length;
  const activeStatuses = ['created', 'picked_up', 'in_transit', 'at_transit_warehouse', 'out_for_delivery'];
  const active = state.shipments.filter((s) => activeStatuses.includes(s.status)).length;
  const delivered = state.shipments.filter((s) => s.status === 'delivered').length;
  const cancelled = state.shipments.filter((s) => s.status === 'cancelled').length;
  const recent = state.shipments.slice(0, 6);

  let summaryHtml = '';
  if (isStaff()) {
    const { data: summary, error } = await supabaseClient
      .from('mv_delivery_summary')
      .select('summary_date, warehouse_id, warehouse_name, status, shipment_count')
      .order('summary_date', { ascending: false })
      .limit(8);

    if (!error && summary?.length) {
      summaryHtml = `
        <div class="card">
          <div class="card-header">
            <h4>Delivery Summary</h4>
            <span class="muted">Materialized View</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Warehouse</th><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                ${summary.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.summary_date)}</td>
                    <td>${escapeHtml(row.warehouse_name || '-')}</td>
                    <td>${statusBadge(row.status)}</td>
                    <td><strong>${row.shipment_count}</strong></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }
  }

  const welcome = state.profile?.full_name ? `Good to see you, ${escapeHtml(state.profile.full_name)}.` : 'Operational overview';

  pageContainer.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">OVERVIEW</p>
        <h3>${welcome}</h3>
        <p>Shipment activity from the current database state.</p>
      </div>
      ${state.profile?.role === 'customer'
        ? '<button class="primary" data-action="create-shipment">Create shipment</button>'
        : ''}
    </div>

    <div class="card-grid">
      <div class="card metric">
        <div class="label">Total shipments</div>
        <div class="value">${total}</div>
        <div class="metric-note">Visible to this account</div>
      </div>
      <div class="card metric">
        <div class="label">Active</div>
        <div class="value">${active}</div>
        <div class="metric-note">Currently in progress</div>
      </div>
      <div class="card metric">
        <div class="label">Delivered</div>
        <div class="value">${delivered}</div>
        <div class="metric-note">Completed shipments</div>
      </div>
      <div class="card metric">
        <div class="label">Cancelled</div>
        <div class="value">${cancelled}</div>
        <div class="metric-note">Cancelled shipments</div>
      </div>
    </div>

    <div class="content-grid">
      <div class="card">
        <div class="card-header">
          <h4>Recent shipments</h4>
          <button class="ghost" data-page-link="shipments">View all</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tracking</th><th>Status</th><th>Warehouse</th><th>Updated</th></tr></thead>
            <tbody>
              ${recent.length ? recent.map((s) => `
                <tr>
                  <td><strong>${escapeHtml(s.tracking_number)}</strong></td>
                  <td>${statusBadge(s.status)}</td>
                  <td>${escapeHtml(warehouseName(s.current_warehouse_id))}</td>
                  <td>${escapeHtml(formatDate(s.updated_at))}</td>
                </tr>`).join('')
              : '<tr><td colspan="4"><div class="empty">No shipment data.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h4>Workspace</h4></div>
        <div class="card-body">
          <div class="info-list">
            <div class="info-row"><span>Role</span><strong>${escapeHtml(humanize(state.profile?.role))}</strong></div>
            <div class="info-row"><span>Shipments visible</span><strong>${total}</strong></div>
            <div class="info-row"><span>Warehouses</span><strong>${state.warehouses.length}</strong></div>
            <div class="info-row"><span>Routes</span><strong>${state.routes.length}</strong></div>
          </div>
        </div>
      </div>
    </div>

    ${summaryHtml}
  `;
}

async function renderShipments() {
  await Promise.all([loadShipments(), loadReferenceData()]);

  const canCreate = state.profile?.role === 'customer' || isStaff();
  const actionButton = canCreate ? '<button class="primary" data-action="create-shipment">Create shipment</button>' : '';

  pageContainer.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">OPERATIONS</p>
        <h3>Shipments</h3>
        <p>Shipment records visible through the current RLS policy.</p>
      </div>
      <div class="page-actions">${actionButton}</div>
    </div>

    <div class="card">
      <div class="card-header">
        <h4>Shipment list</h4>
        <span class="muted">${state.shipments.length} row(s)</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tracking</th><th>Sender</th><th>Receiver</th><th>Warehouse</th><th>Weight</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${state.shipments.length ? state.shipments.map((s) => {
              const canUpdate = (isStaff() || isCourier()) && allowedNextStatuses(s.status).length > 0;
              return `<tr>
                <td><strong>${escapeHtml(s.tracking_number)}</strong></td>
                <td>${escapeHtml(customerLabel(s.sender_id))}</td>
                <td>${escapeHtml(customerLabel(s.receiver_id))}</td>
                <td>${escapeHtml(warehouseName(s.current_warehouse_id))}</td>
                <td>${escapeHtml(s.weight_kg)} kg</td>
                <td>${statusBadge(s.status)}</td>
                <td>
                  <div class="page-actions">
                    <button class="ghost" data-action="view-tracking" data-tracking="${escapeHtml(s.tracking_number)}">Track</button>
                    ${canUpdate ? `<button class="secondary" data-action="update-status" data-shipment-id="${s.id}">Update</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')
            : '<tr><td colspan="7"><div class="empty">No shipments available for this account.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTracking() {
  pageContainer.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">TRACKING</p>
        <h3>Find a shipment</h3>
        <p>Search by tracking number.</p>
      </div>
    </div>

    <div class="tracking-shell">
      <div class="card tracking-search-card">
        <div class="tracking-search-head">
          <strong>Tracking number</strong>
          <span>Example: TRK000004</span>
        </div>
        <div class="search-row">
          <input id="tracking-search" aria-label="Tracking number" placeholder="TRK000004">
          <button class="primary" data-action="search-tracking">Search</button>
        </div>
      </div>
      <div id="tracking-result" class="tracking-result-shell">
        <div class="card"><div class="empty">Enter a tracking number to view shipment status and event history.</div></div>
      </div>
    </div>
  `;
}

async function searchTracking(trackingNumber) {
  const result = el('tracking-result');
  if (!trackingNumber) {
    result.innerHTML = '<div class="card"><div class="empty">Enter a tracking number.</div></div>';
    return;
  }

  result.innerHTML = '<div class="card"><div class="loading">Loading</div></div>';

  try {
    await loadReferenceData();
    const { data: shipment, error: shipmentError } = await supabaseClient
      .from('shipments')
      .select('id, tracking_number, sender_id, receiver_id, current_warehouse_id, current_route_id, weight_kg, status, created_at, updated_at')
      .eq('tracking_number', trackingNumber)
      .maybeSingle();

    if (shipmentError) throw shipmentError;

    if (!shipment) {
      result.innerHTML = '<div class="card"><div class="empty">Shipment not found or not accessible for this account.</div></div>';
      return;
    }

    const { data: events, error: eventsError } = await supabaseClient
      .from('tracking_events')
      .select('id, shipment_id, warehouse_id, route_id, status, description, event_time')
      .eq('shipment_id', shipment.id)
      .order('event_time', { ascending: true });

    if (eventsError) throw eventsError;

    result.innerHTML = `
      <div class="content-grid">
        <div class="card">
          <div class="card-header">
            <div>
              <p class="eyebrow">SHIPMENT</p>
              <h4>${escapeHtml(shipment.tracking_number)}</h4>
            </div>
            ${statusBadge(shipment.status)}
          </div>
          <div class="card-body">
            <div class="info-list">
              <div class="info-row"><span>Sender</span><strong>${escapeHtml(customerLabel(shipment.sender_id))}</strong></div>
              <div class="info-row"><span>Receiver</span><strong>${escapeHtml(customerLabel(shipment.receiver_id))}</strong></div>
              <div class="info-row"><span>Warehouse</span><strong>${escapeHtml(warehouseName(shipment.current_warehouse_id))}</strong></div>
              <div class="info-row"><span>Route</span><strong>${escapeHtml(routeLabel(shipment.current_route_id))}</strong></div>
              <div class="info-row"><span>Weight</span><strong>${escapeHtml(shipment.weight_kg)} kg</strong></div>
              <div class="info-row"><span>Updated</span><strong>${escapeHtml(formatDate(shipment.updated_at))}</strong></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>Tracking events</h4></div>
          <div class="card-body">
            <div class="timeline">
              ${events?.length ? events.map((event) => `
                <div class="timeline-item">
                  ${statusBadge(event.status)}
                  <div>${escapeHtml(event.description || '-')}</div>
                  <small>${escapeHtml(formatDate(event.event_time))} · ${escapeHtml(warehouseName(event.warehouse_id))}</small>
                </div>`).join('')
              : '<div class="empty">No tracking events.</div>'}
            </div>
          </div>
        </div>
      </div>`;
  } catch (error) {
    result.innerHTML = `<div class="card"><div class="empty">${escapeHtml(error.message || 'Failed to load tracking.')}</div></div>`;
  }
}

async function renderRoutes() {
  await loadReferenceData();
  pageContainer.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">OPERATIONS</p>
        <h3>Routes</h3>
        <p>Courier routes between transit warehouses.</p>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Route</th><th>Courier</th><th>Origin</th><th>Destination</th><th>Status</th><th>Departure</th><th>Arrival</th></tr></thead>
          <tbody>
            ${state.routes.length ? state.routes.map((r) => `
              <tr>
                <td><strong>#${r.id}</strong></td>
                <td>Courier #${r.courier_id}</td>
                <td>${escapeHtml(warehouseName(r.origin_warehouse_id))}</td>
                <td>${escapeHtml(warehouseName(r.destination_warehouse_id))}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${escapeHtml(formatDate(r.departure_at))}</td>
                <td>${escapeHtml(formatDate(r.arrival_at))}</td>
              </tr>`).join('')
            : '<tr><td colspan="7"><div class="empty">No route data.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function renderWarehouses() {
  await loadReferenceData();
  pageContainer.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">MASTER DATA</p>
        <h3>Warehouses</h3>
        <p>Transit warehouse locations.</p>
      </div>
    </div>

    <div class="warehouse-grid">
      ${state.warehouses.map((w) => `
        <div class="card warehouse-card">
          <div class="warehouse-top">
            <div class="warehouse-icon" aria-hidden="true">⌂</div>
            <span class="warehouse-city">${escapeHtml(w.city)}</span>
          </div>
          <h4>${escapeHtml(w.name)}</h4>
          <p>${escapeHtml(w.address)}</p>
        </div>
      `).join('') || '<div class="card"><div class="empty">No warehouse data.</div></div>'}
    </div>`;
}

async function renderAudit() {
  if (!isStaff()) {
    pageContainer.innerHTML = '<div class="card"><div class="empty">Audit logs are available to staff/admin users.</div></div>';
    return;
  }

  const logs = await loadAuditLogs();

  pageContainer.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">AUDIT</p>
        <h3>Audit Logs</h3>
        <p>Status changes recorded by the audit trigger.</p>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Shipment</th><th>Action</th><th>Old status</th><th>New status</th><th>Changed by</th><th>Changed at</th></tr></thead>
          <tbody>
            ${logs.length ? logs.map((log) => `
              <tr>
                <td>#${log.shipment_id}</td>
                <td><strong>${escapeHtml(log.action)}</strong></td>
                <td>${log.old_status ? statusBadge(log.old_status) : '-'}</td>
                <td>${log.new_status ? statusBadge(log.new_status) : '-'}</td>
                <td>${escapeHtml(log.changed_by || 'N/A')}</td>
                <td>${escapeHtml(formatDate(log.changed_at))}</td>
              </tr>`).join('')
            : '<tr><td colspan="6"><div class="empty">No audit log data.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function createShipmentModal() {
  const ownCustomerId = state.customer?.id;
  if (state.profile?.role === 'customer' && !ownCustomerId) {
    showError('This Auth user does not have a customer profile.');
    return;
  }

  const receiverOptions = state.customers
    .filter((c) => c.id !== ownCustomerId)
    .map((c) => `<option value="${c.id}">${escapeHtml(customerLabel(c.id))}</option>`).join('');

  const warehouseOptions = state.warehouses
    .map((w) => `<option value="${w.id}">${escapeHtml(w.name)} · ${escapeHtml(w.city)}</option>`).join('');

  openModal('Create shipment', `
    <form id="create-shipment-form">
      <div class="form-grid">
        <label>
          Tracking number
          <input name="tracking_number" required maxlength="30" placeholder="TRK000005">
        </label>
        <label>
          Receiver
          <select name="receiver_id" required>${receiverOptions}</select>
        </label>
        <label>
          Origin warehouse
          <select name="origin_warehouse_id" required>${warehouseOptions}</select>
        </label>
        <label>
          Weight (kg)
          <input name="weight_kg" type="number" step="0.01" min="0.01" required placeholder="2.50">
        </label>
      </div>
      <p class="help-text">The sender is taken from the logged-in customer profile.</p>
      <div class="form-actions">
        <button type="button" class="ghost" data-close-modal>Cancel</button>
        <button type="submit" class="primary">Create shipment</button>
      </div>
      <p id="create-error" class="error-text"></p>
    </form>`);

  const form = el('create-shipment-form');
  form.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const { error } = await supabaseClient.rpc('create_shipment', {
        p_tracking_number: values.tracking_number.trim(),
        p_sender_id: Number(ownCustomerId || values.sender_id),
        p_receiver_id: Number(values.receiver_id),
        p_origin_warehouse_id: Number(values.origin_warehouse_id),
        p_weight_kg: Number(values.weight_kg)
      });

      if (error) throw error;
      closeModal();
      showToast(`Shipment ${values.tracking_number} created.`, 'success');
      await refreshCurrentPage();
    } catch (error) {
      el('create-error').textContent = error.message || 'Failed to create shipment.';
      submitButton.disabled = false;
    }
  });
}

async function updateStatusModal(shipmentId) {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment) return;

  const next = allowedNextStatuses(shipment.status);
  if (!next.length) return;

  const warehouseOptions = state.warehouses
    .map((w) => `<option value="${w.id}" ${w.id === shipment.current_warehouse_id ? 'selected' : ''}>${escapeHtml(w.name)} · ${escapeHtml(w.city)}</option>`).join('');

  const routeOptions = [
    `<option value="">No route change</option>`,
    ...state.routes.map((r) => `<option value="${r.id}" ${r.id === shipment.current_route_id ? 'selected' : ''}>${escapeHtml(routeLabel(r.id))}</option>`)
  ].join('');

  const statusOptions = next.map((status) => `<option value="${status}">${escapeHtml(humanize(status))}</option>`).join('');

  openModal(`Update ${shipment.tracking_number}`, `
    <form id="update-status-form">
      <div class="form-grid">
        <label>
          New status
          <select name="new_status" required>${statusOptions}</select>
        </label>
        <label>
          Warehouse
          <select name="warehouse_id">${warehouseOptions}</select>
        </label>
        <label>
          Route
          <select name="route_id">${routeOptions}</select>
        </label>
        <label class="full-span">
          Description
          <textarea name="description" placeholder="Package status updated"></textarea>
        </label>
      </div>
      <p class="help-text">Status validation and row locking are handled by the database function.</p>
      <div class="form-actions">
        <button type="button" class="ghost" data-close-modal>Cancel</button>
        <button type="submit" class="primary">Update status</button>
      </div>
      <p id="update-error" class="error-text"></p>
    </form>`);

  const form = el('update-status-form');
  form.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const { error } = await supabaseClient.rpc('update_shipment_status', {
        p_shipment_id: shipment.id,
        p_new_status: values.new_status,
        p_warehouse_id: values.warehouse_id ? Number(values.warehouse_id) : null,
        p_route_id: values.route_id ? Number(values.route_id) : null,
        p_description: values.description?.trim() || null
      });

      if (error) throw error;
      closeModal();
      showToast(`Shipment ${shipment.tracking_number} updated.`, 'success');
      await refreshCurrentPage();
    } catch (error) {
      el('update-error').textContent = error.message || 'Failed to update shipment.';
      submitButton.disabled = false;
    }
  });
}

function setupEvents() {
  el('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorElement = el('login-error');
    errorElement.textContent = '';

    try {
      const email = el('login-email').value.trim();
      const password = el('login-password').value;
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      errorElement.textContent = error.message || 'Login failed.';
    }
  });

  el('logout-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) showError(error.message);
  });

  document.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-page]');
    if (nav) {
      await renderPage(nav.dataset.page);
      return;
    }

    const pageLink = event.target.closest('[data-page-link]');
    if (pageLink) {
      await renderPage(pageLink.dataset.pageLink);
      return;
    }

    const action = event.target.closest('[data-action]');
    if (!action) return;

    try {
      switch (action.dataset.action) {
        case 'create-shipment':
          await loadReferenceData();
          createShipmentModal();
          break;
        case 'update-status':
          await updateStatusModal(Number(action.dataset.shipmentId));
          break;
        case 'view-tracking':
          await renderPage('tracking');
          el('tracking-search').value = action.dataset.tracking;
          await searchTracking(action.dataset.tracking);
          break;
        case 'search-tracking':
          await searchTracking(el('tracking-search')?.value.trim());
          break;
        default:
          break;
      }
    } catch (error) {
      showError(error.message || 'Action failed.');
    }
  });

  el('modal-backdrop').addEventListener('click', (event) => {
    if (event.target === el('modal-backdrop')) closeModal();
  });
}

async function boot() {
  setupEvents();

  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    state.session = session;
    state.user = session.user;

    try {
      await loadProfile();
      showApp();
      await renderPage('dashboard');
    } catch (error) {
      await supabaseClient.auth.signOut();
      showLogin();
      showError(error.message || 'Failed to initialize user profile.');
    }
  } else {
    showLogin();
  }

  supabaseClient.auth.onAuthStateChange(async (_event, sessionValue) => {
    if (!sessionValue) {
      state.session = null;
      state.user = null;
      state.profile = null;
      showLogin();
      return;
    }

    state.session = sessionValue;
    state.user = sessionValue.user;

    try {
      await loadProfile();
      showApp();
      await renderPage(state.currentPage || 'dashboard');
    } catch (error) {
      showError(error.message || 'Failed to initialize session.');
    }
  });
}

boot();