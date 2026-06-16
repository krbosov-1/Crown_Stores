# Crown Stores Retail Management System (CSRMS)

## Overview

The Crown Stores Retail Management System (CSRMS) is a robust, custom-built, full-stack application serving multi-branch supermarket operations. Designed to replace disconnected legacy systems, CSRMS unifies inventory handling, procurement, point-of-sale transactions, and branch performance analytics into a single authoritative source of truth.

It uses a structured Role-Based Access Control (RBAC) architecture separating logic per region, guaranteeing that Directors perceive global oversight while Managers operate within isolated local environments. It strictly employs an un-opinionated database-first approach utilizing vanilla PostgreSQL parameterization, thereby stripping opaque ORM latency and guaranteeing full transaction integrity.

## Tech Stack

| Component         | Technology                      |
|-------------------|---------------------------------|
| **Backend**       | Node.js (v20+), Express.js      |
| **Database**      | PostgreSQL (v15+), pg client    |
| **View Engine**   | EJS with ejs-mate               |
| **Frontend**      | Vanilla JS, Bootstrap 5.3 CDN   |
| **Charts/Visuals**| Chart.js                        |
| **PDF Generation**| PDFKit                          |

## Prerequisites
- Node.js v20+
- PostgreSQL v15+

## Installation

1. Clone the repository:
   ```bash
   git clone <repository_url>
   cd csrms
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Setup Environment Variables:
   ```bash
   cp .env.example .env
   ```
4. Create the PostgreSQL database:
   ```bash
   createdb csrms_db
   ```
5. Initialize the database schema and triggers:
   ```bash
   psql -d csrms_db -f database/schema.sql
   ```
6. Seed the database with initial branches, users, categories, products, and sales:
   ```bash
   psql -d csrms_db -f database/seed.sql
   ```
7. Start the development server:
   ```bash
   npm run dev
   ```
8. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Default Login Credentials

| Role            | Username   | Password    |
|-----------------|------------|-------------|
| Director        | director   | Crown@1234  |
| Manager (Main)  | manager1   | Crown@1234  |
| Manager (North) | manager2   | Crown@1234  |
| Agent (Main)    | agent1     | Crown@1234  |
| Agent (North)   | agent2     | Crown@1234  |

## Complete Route Reference

| Method | Path                           | Role                  | Description                           |
|--------|--------------------------------|-----------------------|---------------------------------------|
| GET    | `/login`                       | Public                | Show login page                       |
| POST   | `/login`                       | Public                | Authenticate user                     |
| GET    | `/dashboard`                   | All Logged In         | Redirect to role-specific dashboard   |
| GET    | `/dashboard/director`          | Director              | View global KPIs and branch metrics   |
| GET    | `/dashboard/manager`           | Manager               | View branch specific KPIs             |
| GET    | `/dashboard/agent`             | Agent                 | View personal active sales metrics    |
| GET    | `/categories`                  | Manager               | Complete category CRUD interface      |
| GET    | `/products`                    | Manager               | View and manage master products       |
| GET    | `/products/:id/barcodes`       | Manager               | Manage individual product SKU barcodes|
| GET    | `/procurement`                 | Manager               | Purchase orders / stock receiving list|
| GET    | `/inventory`                   | Manager               | Manage store specific stock items     |
| GET    | `/sales`                       | Manager, Director     | Aggregate sales histories             |
| GET    | `/sales/pos`                   | Agent                 | Main point of sale interface          |
| POST   | `/sales/api/process`           | Agent                 | Securely commit sales & adjust stock  |
| GET    | `/receipts/:id`                | All Logged In         | HTML presentation of thermal receipt  |
| GET    | `/receipts/:id/pdf`            | All Logged In         | PDF version of the transaction receipt|
| GET    | `/cashier-balancing`           | Manager, Director     | Shift-end cashier transaction recaps  |
| POST   | `/cashier-balancing/approve`   | Manager, Director     | Approve discrepancies overages/shorts |
| GET    | `/reports`                     | Manager, Director     | View visual chart and tabulated stats |
| GET    | `/reports/pdf`                 | Director              | High-level global PDF summary payload |
| GET    | `/notifications`               | All Logged In         | System global updates payload         |

## Module Overview
- **Authentication**: Strict bcrypt-based hashing, active session limits, IP brute-force protection
- **Dashboards**: Configured with explicit scope filtering (Director=All, Manager=Branch, Agent=Self)
- **Product Masters**: Global categorical structures enforcing consistency across branches
- **Procurements**: Track inbound supplier stock linking directly to cost basis updates
- **Inventory Engine**: Postgres triggers guarantee absolute delta precision during sales executions
- **Point of Sale (POS)**: Rapid barcoding support with cart caching and final invoice processing
- **Auditing**: Tamper-evident ledger logging for balance approvals and critical status patches
- **Reporting Generator**: Granular time-based exports across transactions and performance KPIs
- **Notifications Engine**: Proactive alert loops monitoring low inventory metrics natively

## Project Structure
```
csrms/
├── src/
│   ├── config/          # Central database pooling and setup
│   ├── controllers/     # Handlers for system routes per vertical
│   ├── middleware/      # Authentication, role access, globals
│   ├── routes/          # Express route structures and controllers
│   └── utils/           # Time, string, and number formatting
├── views/
│   ├── layouts/         # Base EJS global template structure
│   ├── pages/           # Dedicated route rendering components
│   └── partials/        # Injected nav bars, sidebars, alerts
├── public/
│   ├── css/             # Stylesheets (custom extensions over Bootstrap)
│   └── js/              # Client-side scripts like POS and charts
├── database/            # Essential raw SQL schemas and seeded tests
├── app.js               # Primary Node instantiation and pipeline config
├── .env.example         # Template for environment security properties
└── package.json         # Node infrastructure packaging definitions
```

## Environment Variables

| Variable       | Description                                  | Example                             |
|----------------|----------------------------------------------|-------------------------------------|
| `PORT`         | Port number for the application              | `3000`                              |
| `DB_NAME`      | Target PostgreSQL database name              | `csrms_db`                          |
| `DB_USER`      | Target PostgreSQL database user              | `postgres`                          |
| `DB_PASSWORD`  | Default target password for credentials      | `mysecret`                          |
| `DB_HOST`      | URL mapping of the target PostgreSQL instance| `127.0.0.1`                         |
| `DB_PORT`      | Configured port routing for postgres         | `5432`                              |
| `SESSION_SECRET`| Cryptographic encryption key for user sessions| `complex_production_grade_token`    |
| `NODE_ENV`     | Switch logic routing between prod and dev    | `development`                       |
