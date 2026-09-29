import { prisma } from './db';

export async function seedDatabase() {
  console.log('Seeding database with financial foundation data...');

  const permissionsData = [
    { code: 'view_dashboard', name: 'View Dashboard', module: 'DASHBOARD', description: 'Access executive financial dashboard and KPI overview' },
    { code: 'upload_statement', name: 'Upload Bank Statements', module: 'STATEMENTS', description: 'Upload raw bank statement files (CSV, XLSX, PDF)' },
    { code: 'upload_gl', name: 'Upload GL Transactions', module: 'GL', description: 'Import General Ledger journal and transaction feeds' },
    { code: 'view_transactions', name: 'View Transactions', module: 'TRANSACTIONS', description: 'Inspect bank and GL transactional records' },
    { code: 'reconcile', name: 'Execute Reconciliation', module: 'RECONCILIATION', description: 'Run matching engine and manage reconciliation periods' },
    { code: 'manually_match', name: 'Manual Match Transactions', module: 'RECONCILIATION', description: 'Create 1:1, 1:Many, Many:1, Many:Many manual matches' },
    { code: 'override_match_eligibility', name: 'Override Match Eligibility', module: 'RECONCILIATION', description: 'Explicitly override automatic matching eligibility with a documented reason' },
    { code: 'resolve_exception', name: 'Resolve Exceptions', module: 'EXCEPTIONS', description: 'Assign, investigate and clear reconciliation exceptions' },
    { code: 'approve_reconciliation', name: 'Approve Reconciliation Periods', module: 'APPROVALS', description: 'Perform formal stage reviews and sign-off approvals' },
    { code: 'configure_rules', name: 'Configure Matching Rules', module: 'ADMIN', description: 'Define rule priority, required and optional criteria' },
    { code: 'configure_tolerances', name: 'Configure Tolerances', module: 'ADMIN', description: 'Set amount and date variance thresholds' },
    { code: 'manage_users', name: 'Manage Users & RBAC', module: 'ADMIN', description: 'Manage team members, roles and access permissions' },
    { code: 'view_audit_log', name: 'View Audit Trail', module: 'AUDIT', description: 'Inspect immutable, timestamped audit log events' },
  ];

  const permissions: Record<string, string> = {};
  for (const perm of permissionsData) {
    const record = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, module: perm.module, description: perm.description },
      create: perm,
    });
    permissions[perm.code] = record.id;
  }

  const rolesData = [
    {
      name: 'Administrator', code: 'ADMIN',
      description: 'Full administrative access to financial configuration, users, rules, and audit logs',
      permCodes: Object.keys(permissions),
    },
    {
      name: 'Accountant', code: 'ACCOUNTANT',
      description: 'Operations specialist: imports statements, performs matches, and resolves exceptions',
      permCodes: ['view_dashboard', 'upload_statement', 'upload_gl', 'view_transactions', 'reconcile', 'manually_match', 'resolve_exception', 'view_audit_log'],
    },
    {
      name: 'Reviewer', code: 'REVIEWER',
      description: 'Independent verification: reviews reconciliations, exceptions and submits stage approvals',
      permCodes: ['view_dashboard', 'view_transactions', 'approve_reconciliation', 'view_audit_log'],
    },
    {
      name: 'Auditor', code: 'AUDITOR',
      description: 'Read-only compliance officer with immutable audit trail inspection rights',
      permCodes: ['view_dashboard', 'view_transactions', 'view_audit_log'],
    },
  ];

  const roles: Record<string, string> = {};
  for (const roleDef of rolesData) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      update: { name: roleDef.name, description: roleDef.description },
      create: { name: roleDef.name, code: roleDef.code, description: roleDef.description, isSystemRole: true },
    });
    roles[roleDef.code] = role.id;
    for (const pCode of roleDef.permCodes) {
      const permId = permissions[pCode];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          update: {},
          create: { roleId: role.id, permissionId: permId },
        });
      }
    }
  }

  const criteriaData = [
    { code: 'AMOUNT', name: 'Transaction Amount', description: 'Exact or tolerance-bounded net currency amount', isStrong: true, dataType: 'NUMBER', comparisonOperator: 'WITHIN_TOLERANCE' },
    { code: 'REFERENCE_NUMBER', name: 'Reference Number', description: 'Bank or GL transaction reference / wire tracking code', isStrong: true, dataType: 'STRING', comparisonOperator: 'EQUALS' },
    { code: 'CHEQUE_NUMBER', name: 'Cheque / Check Number', description: 'Physical or electronic draft / cheque identifier', isStrong: true, dataType: 'STRING', comparisonOperator: 'EQUALS' },
    { code: 'ACCOUNT_NUMBER', name: 'Account Number', description: 'Counterparty or internal account number identifier', isStrong: true, dataType: 'STRING', comparisonOperator: 'EQUALS' },
    { code: 'TRANSACTION_DATE', name: 'Transaction Date / Value Date', description: 'Date the transaction posted or cleared at financial institution', isStrong: false, dataType: 'DATE', comparisonOperator: 'WITHIN_TOLERANCE' },
    { code: 'TRANSACTION_TYPE', name: 'Transaction Type', description: 'Debit, Credit, Wire, ACH, Fee, Interest, Reversal', isStrong: false, dataType: 'ENUM', comparisonOperator: 'EQUALS' },
    { code: 'CURRENCY', name: 'Currency Code', description: 'ISO-4217 3-letter currency identifier (e.g. USD, EUR, GBP)', isStrong: false, dataType: 'STRING', comparisonOperator: 'EQUALS' },
    { code: 'NARRATION', name: 'Narration / Description', description: 'Text memo, description or payment details', isStrong: false, dataType: 'STRING', comparisonOperator: 'FUZZY_MATCH' },
    { code: 'CUSTOMER_SUPPLIER', name: 'Customer / Supplier Name', description: 'Payee, payer, vendor or customer entity name', isStrong: false, dataType: 'STRING', comparisonOperator: 'FUZZY_MATCH' },
  ];
  for (const crit of criteriaData) await prisma.matchingCriterion.upsert({ where: { code: crit.code }, update: crit, create: crit });

  const agingBucketsData = [
    { name: '0–7 days', minDays: 0, maxDays: 7, displayOrder: 1 },
    { name: '8–30 days', minDays: 8, maxDays: 30, displayOrder: 2 },
    { name: '31–60 days', minDays: 31, maxDays: 60, displayOrder: 3 },
    { name: '61–90 days', minDays: 61, maxDays: 90, displayOrder: 4 },
    { name: '90+ days', minDays: 91, maxDays: null, displayOrder: 5 },
  ];
  for (const bucket of agingBucketsData) {
    const existing = await prisma.agingBucketConfig.findFirst({ where: { name: bucket.name, organizationId: null } });
    if (!existing) await prisma.agingBucketConfig.create({ data: { ...bucket, isSystemDefault: true, organizationId: null } });
  }

  const org1 = await prisma.organization.upsert({ where: { slug: 'acme-treasury' }, update: { name: 'Acme Global Treasury Corp', taxId: 'US-94-3829104', baseCurrency: 'USD', status: 'ACTIVE' }, create: { name: 'Acme Global Treasury Corp', slug: 'acme-treasury', taxId: 'US-94-3829104', baseCurrency: 'USD', status: 'ACTIVE' } });
  const org2 = await prisma.organization.upsert({ where: { slug: 'apex-holdings' }, update: { name: 'Apex Financial Holdings LLC', taxId: 'US-13-8849102', baseCurrency: 'EUR', status: 'ACTIVE' }, create: { name: 'Apex Financial Holdings LLC', slug: 'apex-holdings', taxId: 'US-13-8849102', baseCurrency: 'EUR', status: 'ACTIVE' } });
  const org2Admin = await prisma.user.upsert({ where: { email: 'elena.admin@apexholdings.eu' }, update: { fullName: 'Elena Rostova (Apex Admin)', organizationId: org2.id }, create: { email: 'elena.admin@apexholdings.eu', fullName: 'Elena Rostova (Apex Admin)', organizationId: org2.id, status: 'ACTIVE' } });
  if (roles['ADMIN']) await prisma.userRole.upsert({ where: { userId_roleId: { userId: org2Admin.id, roleId: roles['ADMIN'] } }, update: {}, create: { userId: org2Admin.id, roleId: roles['ADMIN'] } });

  await prisma.matchingControlConfig.upsert({ where: { organizationId: org1.id }, update: { minTotalCriteria: 3, minStrongCriteria: 2, allowFuzzyNarration: false, requireExactCurrency: true }, create: { organizationId: org1.id, minTotalCriteria: 3, minStrongCriteria: 2, allowFuzzyNarration: false, requireExactCurrency: true } });
  await prisma.matchingControlConfig.upsert({ where: { organizationId: org2.id }, update: { minTotalCriteria: 3, minStrongCriteria: 2, allowFuzzyNarration: false, requireExactCurrency: true }, create: { organizationId: org2.id, minTotalCriteria: 3, minStrongCriteria: 2, allowFuzzyNarration: false, requireExactCurrency: true } });

  console.log('Database seeded successfully.');
}