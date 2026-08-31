# Bank Reconciliation & Financial Verification Platform (VERIFIN)
**Phase 1: Foundation & Architecture**

---

## 1. Project Purpose & Scope

The **Bank Reconciliation & Financial Verification Platform** is an enterprise-grade financial integrity system designed to automate, match, verify, and audit complex multi-entity bank transactions against General Ledger (GL) cash records.

This implementation delivers the complete **Phase 1: Foundation & Architecture**, establishing:
- A fully normalized, relational financial database schema supporting multi-tenant isolation.
- Institutional banking hierarchy (Entities, Banks, Bank Accounts, Statements, Statement Pages).
- Dual transaction ingestion foundations (Bank Feed and GL Journals) preserving original raw data payloads intact for non-repudiation.
- Topological multi-item matching data models (supporting 1:1, 1:Many, Many:1, and Many:Many match structures).
- 9 Matching Criteria with Strong (Amount, Reference#, Cheque#, Account#) vs. Additional (Date, Type, Currency, Narration, Counterparty) classification.
- Configurable Matching Controls (Default policy: Minimum 3 total criteria, minimum 2 strong criteria).
- Multi-tiered Amount and Date Tolerances (Organization, Account, and Rule scopes).
- 10 Financial Exception categories with aging analysis across standard buckets (0–7d, 8–30d, 31–60d, 61–90d, 90+d).
- A cryptographically consistent, append-only, immutable financial audit trail.
- Granular Role-Based Access Control (RBAC) across 4 standard roles (Administrator, Accountant, Reviewer, Auditor).
- Real-time executive dashboard calculating honest figures directly from database records.

---

## 2. Tech Stack

- **Backend / Runtime:** Node.js, Express 4, TypeScript 5.8
- **ORM & Data Layer:** Prisma 6.4.1 (with SQLite/PostgreSQL compatibility)
- **Validation Engine:** Zod 4.5.4 (Strict server-side request parsing & input sanitation)
- **Frontend / Client:** React 19, Vite 6, Tailwind CSS 4, Lucide Icons, Motion
- **Testing Framework:** Vitest 4.1.11

---

## 3. Architecture & Separation of Concerns

The codebase is organized into modular layers with clear boundaries:

```
├── prisma/
│   └── schema.prisma           # Relational schema (16 models, constraints, indexes)
├── server/
│   ├── db.ts                   # Prisma client singleton & connection probe
│   ├── seed.ts                 # Database seed script for standard roles, criteria & accounts
│   ├── services/
│   │   └── auditService.ts     # Immutable, append-only audit event service
│   ├── middleware/
│   │   ├── auth.ts             # Auth context & active role header extraction
│   │   ├── rbac.ts             # Granular permission verification middleware
│   │   └── organizationIsolation.ts # Strict multi-tenant isolation middleware
│   ├── validators/
│   │   └── schemas.ts          # Zod validation schemas for all financial payloads
│   └── routes/
│       ├── systemRoutes.ts     # Health checks, DB introspection & seed triggers
│       ├── authRoutes.ts       # User context & role permissions endpoints
│       ├── bankRoutes.ts       # Bank and Bank Account management
│       ├── statementRoutes.ts  # Statement registration and OCR page tracking
│       ├── transactionRoutes.ts# Bank & GL transaction ingestion
│       ├── reconciliationRoutes.ts # Reconciliation periods & matching junction
│       ├── matchingRoutes.ts   # Criteria directory, controls, rules & tolerances
│       ├── exceptionRoutes.ts  # Exception logging & resolution
│       ├── agingRoutes.ts      # Real outstanding aging calculation
│       ├── auditRoutes.ts      # Immutable audit trail viewer
│       └── dashboardRoutes.ts  # Real aggregate KPI metrics
├── src/
│   ├── types.ts                # Shared TypeScript models and API contracts
│   ├── services/api.ts         # Frontend API client
│   └── components/             # React views
│       ├── Header.tsx          # Institutional header & RBAC switcher
│       ├── DashboardView.tsx   # Executive dashboard with honest metrics
│       ├── BankStructureView.tsx # Banks & accounts register
│       ├── StatementsView.tsx  # Statement register with OCR tracking
│       ├── TransactionsView.tsx # Bank vs GL tables with raw JSON inspector
│       ├── ReconciliationsView.tsx # Reconciliation periods & match topology
│       ├── MatchingControlsView.tsx # 9 Criteria, 3/2 controls, rules & tolerances
│       ├── ExceptionsAgingView.tsx # Exception management & live aging buckets
│       ├── AuditLogView.tsx    # Cryptographic audit log viewer
│       └── SystemHealthModal.tsx # Schema introspection & health probe
├── tests/
│   ├── database.test.ts        # Connectivity, models, and relationships
│   ├── organization-isolation.test.ts # Tenant isolation enforcement
│   ├── rbac-permissions.test.ts# 4 standard roles & 12 granular permissions
│   └── matching-controls-tolerances.test.ts # Criteria, controls, rules & tolerances
├── server.ts                   # Express entry point with Vite middleware
└── package.json
```

---

## 4. Database Structure & Relational Integrity

### Entity Hierarchy:
1. **Organization** (Multi-tenant partition key)
2. **User & Roles & Permissions** (RBAC junction models: `UserRole`, `RolePermission`)
3. **Bank & BankAccount** (Unique per org + bank + account number; tracks GL code and balances)
4. **BankStatement & StatementPage** (Tracks file type, OCR extraction status, confidence, and page metadata)
5. **BankTransaction & GlTransaction** (Preserves `originalImportedData` and `originalData` JSON, SHA-256 fingerprint)
6. **ReconciliationPeriod** (Prepared by, Reviewed by, Approved by workflow with locking state)
7. **ReconciliationMatch & Junctions** (`BankTransactionMatch`, `GlTransactionMatch` enabling 1:1, 1:Many, Many:1, Many:Many matches)
8. **MatchingCriterion** (9 predefined criteria with `isStrong` classification)
9. **MatchingControlConfig** (Min total criteria, min strong criteria thresholds)
10. **MatchingRule & ToleranceConfig** (Rule priorities, fixed/percent amounts, date tolerance days)
11. **ExceptionRecord** (10 standard categories, risk level, priority, resolution audit)
12. **AgingBucketConfig** (Default buckets: 0–7d, 8–30d, 31–60d, 61–90d, 90+d)
13. **AuditEvent** (Immutable timestamped ledger with actor, differential before/after JSON, and reason)

---

## 5. Security, RBAC & Multi-Tenant Isolation

### 4 Standard Financial Roles:
- **Administrator (`ADMIN`):** Full configuration, user management, and rule setup.
- **Accountant (`ACCOUNTANT`):** Upload statements/GL, perform reconciliations, resolve exceptions.
- **Reviewer (`REVIEWER`):** Review reconciliations, approve period closes, inspect exceptions.
- **Auditor (`AUDITOR`):** Read-only compliance access to audit trails, transactions, and metrics.

### 12 Granular Permissions:
`view_dashboard`, `upload_statement`, `upload_gl`, `view_transactions`, `reconcile`, `manually_match`, `resolve_exception`, `approve_reconciliation`, `configure_rules`, `configure_tolerances`, `manage_users`, `view_audit_log`.

---

## 6. How to Run & Test

### Environment Variables
Ensure `.env` contains:
```env
PORT=3000
DATABASE_URL="file:./dev.db"
NODE_ENV=development
```

### Running Tests
Execute the Vitest suite covering database integrity, organization isolation, RBAC permissions, and matching controls:
```bash
npm test
```

### Running the Development Server
```bash
npm run dev
```
The server binds to `0.0.0.0:3000`.

---

## 7. Major Design Decisions & Trade-Offs

1. **Junction Table Matching Architecture:** Rather than linking a bank transaction directly to a single GL transaction via a foreign key, we implemented `ReconciliationMatch` with `BankTransactionMatch` and `GlTransactionMatch` junction tables. This allows native representation of split deposits (1:Many), consolidated fee settlements (Many:1), and complex multi-entry adjustments (Many:Many).
2. **Preservation of Raw Financial Data:** All transactions retain raw JSON payloads (`originalImportedData` and `originalData`) alongside structured columns to guarantee non-repudiation and auditability during subsequent automated parsing phases.
3. **Strict Server-Side Authorization:** RBAC is enforced strictly at the Express route middleware layer using `requirePermission`, preventing security reliance on client-side state.
4. **Honest Database Metrics:** The dashboard executes live aggregation queries against the database and renders an empty state if no records exist, strictly avoiding fabricated demo figures.
