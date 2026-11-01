# TraceGuard
Smart Supply Chain & Product Recall Intelligence System.

TraceGuard is an academic ADBMS full-stack prototype for tracking products, batches, facilities and shipments, and tracing downstream recipients when a batch is recalled.

## Stack
- React + Vite frontend
- Express + Node.js API
- MySQL 8 transactional database
- Optional Neo4j / Redis / MongoDB extensions (not required for the core demo)

## Quick start
1. Install Node.js 20+ and MySQL 8.
2. Create a database and load the schema:
   `mysql -u root -p < database/schema.sql`
   `mysql -u root -p traceguard < database/seed.sql`
3. Backend:
   `cd server && cp .env.example .env`
   Edit DB credentials, then `npm install && npm run dev`.
4. If you already have an existing database, install the authentication table once:\n   `mysql -u root -p traceguard < database/auth-migration.sql`\n   For a fresh database, the users table is already included in `database/schema.sql`.\n5. Set a long random `AUTH_SECRET` in `server/.env` before deployment. Do not commit `.env`.\n6. Frontend (new terminal):
   `cd client && npm install && npm run dev`
7. Open http://localhost:5173

The Vite dev server proxies `/api` to http://localhost:4000. The app opens at a registration/sign-in gate; create the first account from the UI. API data endpoints require a signed session token. Passwords are hashed with Node.js `scrypt`; the API token is HMAC-signed and expires after seven days. Configure a unique, long `AUTH_SECRET` for any shared or deployed environment. This academic prototype does not yet include email verification, password reset, MFA, account lockout, or persistent server-side session revocation.

## Demo flow
1. Open Overview and inspect live database-backed metrics.
2. Browse Products, Batches, Locations and Shipments.
3. Open Recall Center and initiate a recall for batch `TG-BAT-104`.
4. Open the generated impact report to inspect downstream shipment destinations.
5. Check Audit Log for persisted actions.

## Project structure
- `client/`: responsive React app, authentication gate, five persistent visual themes, motion system, dashboard
- `server/`: Express API, MySQL access layer, password hashing and signed-session authentication
- `database/`: normalized schema and deterministic seed data

## Core data model
Products 1—N Batches; Batches 1—N Shipments; Locations participate as shipment source/destination; Batches 1—N Recalls; Audit logs record mutations.

## Safety and accuracy boundaries
This is a demonstration prototype using fictional data. "Affected locations" means locations reachable from recorded shipment events; it does not establish physical on-hand inventory or perform external notifications. A recall blocks future dispatches in this application.

## Environment
See `server/.env.example`. Never commit real credentials.
