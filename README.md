# Trackest Frontend

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
![Status](https://img.shields.io/badge/Status-UTS%20Project-orange?style=flat-square)

Frontend for **Trackest Logistics Management System**, a UTS project for the Advanced Database Systems course.

The application is built with HTML, CSS, JavaScript, and `@supabase/supabase-js` v2. The backend uses Supabase PostgreSQL, which has been prepared for shipment, tracking, route, warehouse, audit, RPC, and RLS requirements.

## Features

- Supabase Auth for login
- Role-based access for customer, courier, staff, and admin
- Create shipment through PostgreSQL function and Supabase RPC
- Update shipment status with database-level validation
- Shipment tracking by tracking number
- Route and transit warehouse listing
- Audit log for status changes
- Shipment summary dashboard
- RLS on `profiles`, `shipments`, and `tracking_events`

## Tech Stack

| Tool | Purpose |
| --- | --- |
| HTML5 | Application structure |
| CSS3 | UI and responsive layout |
| JavaScript | Frontend logic and Supabase client |
| Supabase | Auth, API, RPC, and PostgreSQL backend |
| PostgreSQL | Database, function, trigger, view, index, transaction, and RLS |
| DBeaver | Database administration and testing |

## Backend Contract

The frontend uses the database implemented for the UTS project.

### Tables

```text
profiles
customers
couriers
warehouses
routes
shipments
tracking_events
audit_logs
```

### Functions

```text
create_shipment()
update_shipment_status()
```

### Views

```text
v_shipment_tracking
mv_delivery_summary
```

### RLS

```text
profiles
shipments
tracking_events
```

## Application Flow

```text
Login
  ↓
Dashboard
  ↓
Create Shipment
  ↓
create_shipment() via Supabase RPC
  ↓
Shipment + tracking event
  ↓
Update Status
  ↓
update_shipment_status() via Supabase RPC
  ↓
Transaction + row locking
  ↓
Tracking event + audit trigger
```

## Pages

```text
Dashboard
Shipments
Tracking
Routes
Warehouses
Audit Logs
```

Audit Logs are available to users with staff/admin access according to the RLS policy.

## Project Structure

```text
frontend/
├── index.html
├── style.css
├── app.js
├── supabase-config.js
├── supabase-config.local.js
├── .gitignore
└── README.md
```

`supabase-config.js` contains the configuration template. `supabase-config.local.js` contains the local configuration and is not included in the repository because it is ignored by Git.

## Supabase Configuration

Create `supabase-config.local.js` in the same directory as `index.html`.

```js
window.TRACKEST_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'YOUR-PUBLISHABLE-KEY'
};
```

Use a publishable key for browser applications. Do not use the `service_role` or secret key in the frontend.

The `supabase-config-local.js` file must not be committed.

## Auth Users

Demo accounts used in the project:

```text
customer1@dbas4.test  → Andi Pratama  → customer
customer2@dbas4.test  → Budi Santoso → customer
courier1@dbas4.test   → Rizky         → courier
admin@dbas4.test      → Administrator → admin
```

`auth.users.id` must match `profiles.id` and the related customer/courier profile.

## Run Locally

Use a static HTTP server.

```bash
python3 -m http.server 5500
```

Open:

```text
http://localhost:5500
```

Do not run the application using `file://` because the frontend requires the Supabase client and a browser origin.

## Demo Flow

```text
Customer login
  ↓
Create shipment
  ↓
Shipment created
  ↓
Tracking
  ↓
Courier access
  ↓
Update status
  ↓
Audit log
  ↓
Admin dashboard
```

## Scope

The project focuses on shipment operations:

- shipment
- customer and courier
- route
- transit warehouse
- tracking history
- audit log
- authentication and RLS

The project does not include payment gateway, real-time GPS, marketplace integration, route optimization, or other external services.

## Notes

The frontend follows the existing database schema and logic. Changes to tables, functions, triggers, views, indexes, or RLS should be made on the database side first before updating the frontend.