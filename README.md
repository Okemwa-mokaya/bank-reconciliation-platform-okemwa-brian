# Bank Reconciliation & Financial Verification Platform (VERIFIN)
**Phase 1: Foundation & Architecture (Hardened)**

---

## 1. Project Purpose & Scope

The **Bank Reconciliation & Financial Verification Platform** is an enterprise-grade financial integrity system designed to automate, match, verify, and audit complex multi-entity bank transactions against General Ledger (GL) cash records.

This implementation delivers the complete **Phase 1: Foundation & Architecture**, establishing:
- **PostgreSQL Relational Schema:** A fully normalized, PostgreSQL database schema managed via Prisma migrations with multi-tenant organization isolation.
- **Strict Database Connection Safety:** Requires explicit `DATABASE_URL` PostgreSQL configuration from the environment with clear diagnostic error handling and credential sanitization (no SQLite or in-memory fallback).
- **Financial Precision:** Strict `Decimal` numeric representation across all balance, debit, credit, allocation, and tolerance fields, avoiding floating-point rounding errors.
- **Server-Authoritative Authentication:** Cryptographically signed Bearer session tokens with server-verified user and organization contexts (no client-controlled identity headers).
- **Institutional Banking Hierarchy:** Multi-entity hierarchy (`Organization`, `Bank`, `BankAccount`, `BankStatement`, `StatementPage`).
- **Honest Statement Lifecycle:** Initial statement registration statuses (`PENDING`, `NOT_CHECKED`, `NOT_REQUIRED`) reflecting real intake state without fabricated extraction or OCR scores.
- **Dual Transaction Ingestion:** Bank feed and GL transaction ingestion models preserving raw JSON payloads for non-repudiation and SHA-256 deduplication fingerprints.
- **Topological Matching Model:** Multi-item matching data models supporting 1:1, 1:Many, Many:1, and Many:Many match structures with allocated amount tracking.
- **9 Matching Criteria & Rules:** 4 Strong criteria (Amount, Reference#, Cheque#, Account#) and 5 Additional criteria (Date, Type, Currency, Narration, Counterparty).
- **Configurable Controls & Tolerances:** Default minimum 3 criteria with 2 strong criteria, plus multi-level amount/date tolerance configurations.
- **Formal Workflow State Machine:** Strict linear stage transitions (`PREPARED` → `REVIEWED` → `APPROVED` → `CLOSED`), disallowing skipping stages or arbitrary mutations.
- **Locked Period Protection:** Closed and locked reconciliation periods prevent financial mutations, match additions, or unmatching.
- **Append-Only Audit Logging:** Server-scoped audit records tracking actor identity from authenticated server context with no mutation or deletion endpoints.
- **Granular RBAC:** 4 standard roles (Administrator, Accountant, Reviewer, Auditor) and 12 granular permissions.

---

## 2. Tech Stack

- **Backend / Runtime:** Node.js, Express, TypeScript
- **ORM & Data Layer:** Prisma ORM with PostgreSQL schema (`provider = "postgresql"`)
- **Validation Engine:** Zod (Strict server-side request parsing & input sanitation)
- **Frontend / Client:** React, Vite, Tailwind CSS, Lucide Icons, Motion
- **Testing Framework:** Vitest

---

## 3. Architecture & Separation of Concerns

The codebase is organized into modular layers with clear boundaries:

```
├── prisma/
│   ├── schema.prisma           # PostgreSQL relational schema (24 models, constraints, indexes)
│   ├── migrations/             # Standard PostgreSQL migration SQL scripts
│   └── migrations/migration_lock.toml # Declares PostgreSQL provider
├── server/
│   ├── db.ts                   # Prisma client singleton & connection safety probe
│   ├── seed.ts                 # Database seed script for standard roles, criteria & accounts
│   ├── services/
│   │   ├── authService.ts      # Server-side cryptographic session token management
│   │   └── auditService.ts     # Immutable, append-only audit event service
│   ├── middleware/
│   │   ├── auth.ts             # Server-authoritative Bearer token verification
│   │   ├── rbac.ts             # Granular permission verification middleware
│   │   └── organizationIsolation.ts # Multi-tenant isolation middleware
│   ├── validators/
│   │   └── schemas.ts          # Zod validation schemas for all financial payloads
│   └── routes/
│       ├── systemRoutes.ts     # Health checks, DB introspection & seed triggers
│       ├── authRoutes.ts       # Login, session verification & demo accounts
│       ├── bankRoutes.ts       # Bank and Bank Account management
│       ├── statementRoutes.ts  # Statement registration and honest status tracking
│       ├── transactionRoutes.ts# Bank & GL transaction ingestion with Decimal precision
│       ├── reconciliationRoutes.ts # Reconciliation periods, matching junction & workflow
│       ├── matchingRoutes.ts   # Criteria directory, controls, rules & tolerances
│       ├── exceptionRoutes.ts  # Exception logging & resolution
│       ├── agingRoutes.ts      # Real outstanding aging calculation
│       ├── auditRoutes.ts      # Immutable audit trail viewer
│       └── dashboardRoutes.ts  # Real aggregate KPI metrics
├── src/
│   ├── types.ts                # Shared TypeScript models and API contracts
│   ├── services/api.ts         # Frontend API client with Bearer session auth
│   └── components/             # React views
│       ├── Header.tsx          # Institutional header & server-authenticated user switcher
│       ├── DashboardView.tsx   # Executive dashboard with honest metrics
│       ├── BankStructureView.tsx # Banks & accounts register
│       ├── StatementsView.tsx  # Statement register with honest lifecycle tracking
│       ├── TransactionsView.tsx # Bank vs GL tables with raw JSON inspector
│       ├── ReconciliationsView.tsx # Reconciliation periods & match topology
│       ├── MatchingControlsView.tsx # 9 Criteria, 3/2 controls, rules & tolerances
│       ├── ExceptionsAgingView.tsx # Exception management & live aging buckets
│       ├── AuditLogView.tsx    # Audit log viewer
│       └── SystemHealthModal.tsx # Schema introspection & health probe
├── tests/
│   ├── auth-isolation.test.ts  # Server session token signing & verification
│   ├── workflow-matching.test.ts # State machine transitions, locked periods & Decimal precision
│   ├── rbac-permissions.test.ts# 4 standard roles & 12 granular permissions
│   ├── organization-isolation.test.ts # Tenant isolation enforcement
│   ├── matching-controls-tolerances.test.ts # Criteria, controls, rules & tolerances
│   └── database.test.ts        # Database connection safety, configuration & entity structure
├── server.ts                   # Express entry point with Vite middleware
└── package.json
```

---

## 4. Security & Hardening Controls

### Authentication & Tenant Isolation
- **Session Tokens:** Authentication uses HMAC SHA-256 signed session tokens issued via `POST /api/auth/login`.
- **Identity Derivation:** Tenant organization and user role context are derived strictly on the server from the authenticated session and database records.
- **Tenant Protection:** Inbound requests targeting resources or query parameters from other organizations are rejected with HTTP 403 Forbidden.

### Financial Precision
- All monetary balances, debit/credit values, allocated match amounts, and tolerances utilize `Decimal` (mapped to PostgreSQL `DECIMAL(18,4)` / `DECIMAL(18,2)`).
- Floating-point calculations are eliminated in monetary routes and services.

### Approval Workflow State Machine
- Linear stage progression: `PREPARED` → `REVIEWED` → `APPROVED` → `CLOSED`.
- Reopening closed or approved periods requires administrative privileges (`manage_users` permission).
- Closed and locked periods strictly block new matches, unmatching, and financial edits.

---

## 5. Database Configuration & Setup

### Environment Variable Requirement
The application requires `DATABASE_URL` to be explicitly defined in the environment.
- **Required Protocol:** `postgresql://` or `postgres://`
- **Format:** `postgresql://<user>:<password>@<host>:<port>/<database>?schema=public`

If `DATABASE_URL` is omitted, the application and connection health probe report an explicit configuration error:
`DATABASE_URL environment variable is missing or empty. Please configure a valid PostgreSQL connection string in your environment.`

No fallback SQLite database or in-memory mock is used.

### Schema Migration & Deployment
```bash
# Validate Prisma schema
DATABASE_URL="postgresql://user:pass@localhost:5432/bank_reconciliation" npx prisma validate

# Push schema changes to PostgreSQL
DATABASE_URL="postgresql://user:pass@localhost:5432/bank_reconciliation" npx prisma db push
```

### Running Tests
```bash
npm test -- --run
```

---

## 6. Phase 1 Capabilities & Boundaries

### Phase 1 Implemented Capabilities
- **Relational Data Foundation:** PostgreSQL database schema with complete multi-tenant relational modeling.
- **Server Authentication:** Cryptographically signed Bearer session tokens with server-verified identities and granular RBAC.
- **Tenant Scope Enforcement:** Server-side ownership verification preventing cross-tenant leakage across transactions, bank accounts, rules, tolerances, exceptions, and audit logs.
- **Topological Matching Model:** Data schemas supporting 1:1, 1:Many, Many:1, and Many:Many transaction junctions with allocated amounts.
- **Criteria & Control Framework:** 9 Matching criteria (4 strong, 5 additional) with minimum 3 total / 2 strong criteria rules and multi-level tolerances.
- **State Machine Protection:** Linear workflow state machine with locked period mutation prevention.
- **Append-Only Audit Trail:** Server-managed audit log recording all administrative, financial, and matching operations without mutation/deletion endpoints.

### Phase 1 Intentional Scope Limitations
- **Honest Statement Intake:** Statement uploads initialize in `PENDING` status.
- **No Phase 2 Parsing Engines:** CSV/XLSX/PDF file parsing, OCR engines, and automated extraction pipelines belong to Phase 2 and are intentionally omitted in Phase 1.
- **No Mock Machine Learning:** No fabricated OCR confidence scores or synthetic extraction metrics are generated.
