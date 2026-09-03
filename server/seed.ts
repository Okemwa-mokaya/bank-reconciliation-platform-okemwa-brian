import { prisma } from './db';

export async function seedDatabase() {
  console.log('Seeding database with financial foundation data...');

  // 1. Seed Permissions
  const permissionsData = [
    { code: 'view_dashboard', name: 'View Dashboard', module: 'DASHBOARD', description: 'Access executive financial dashboard and KPI overview' },
    { code: 'upload_statement', name: 'Upload Bank Statements', module: 'STATEMENTS', description: 'Upload raw bank statement files (CSV, XLSX, PDF)' },
    { code: 'upload_gl', name: 'Upload GL Transactions', module: 'GL', description: 'Import General Ledger journal and transaction feeds' },
    { code: 'view_transactions', name: 'View Transactions', module: 'TRANSACTIONS', description: 'Inspect bank and GL transactional records' },
    { code: 'reconcile', name: 'Execute Reconciliation', module: 'RECONCILIATION', description: 'Run matching engine and manage reconciliation periods' },
    { code: 'manually_match', name: 'Manual Match Transactions', module: 'RECONCILIATION', description: 'Create 1:1, 1:Many, Many:1, Many:Many manual matches' },
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

  // 2. Seed Roles
  const rolesData = [
    {
      name: 'Administrator',
      code: 'ADMIN',
      description: 'Full administrative access to financial configuration, users, rules, and audit logs',
      permCodes: Object.keys(permissions),
    },
    {
      name: 'Accountant',
      code: 'ACCOUNTANT',
      description: 'Operations specialist: imports statements, performs matches, and resolves exceptions',
      permCodes: [
        'view_dashboard',
        'upload_statement',
        'upload_gl',
        'view_transactions',
        'reconcile',
        'manually_match',
        'resolve_exception',
        'view_audit_log',
      ],
    },
    {
      name: 'Reviewer',
      code: 'REVIEWER',
      description: 'Independent verification: reviews reconciliations, exceptions and submits stage approvals',
      permCodes: [
        'view_dashboard',
        'view_transactions',
        'approve_reconciliation',
        'view_audit_log',
      ],
    },
    {
      name: 'Auditor',
      code: 'AUDITOR',
      description: 'Read-only compliance officer with immutable audit trail inspection rights',
      permCodes: [
        'view_dashboard',
        'view_transactions',
        'view_audit_log',
      ],
    },
  ];

  const roles: Record<string, string> = {};
  for (const roleDef of rolesData) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      update: { name: roleDef.name, description: roleDef.description },
      create: {
        name: roleDef.name,
        code: roleDef.code,
        description: roleDef.description,
        isSystemRole: true,
      },
    });
    roles[roleDef.code] = role.id;

    // Link RolePermissions
    for (const pCode of roleDef.permCodes) {
      const permId = permissions[pCode];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permId,
          },
        });
      }
    }
  }

  // 3. Seed Matching Criteria (Strong vs Additional Metadata)
  const criteriaData = [
    // Strong Criteria (1-4)
    {
      code: 'AMOUNT',
      name: 'Transaction Amount',
      description: 'Exact or tolerance-bounded net currency amount',
      isStrong: true,
      dataType: 'NUMBER',
      comparisonOperator: 'WITHIN_TOLERANCE',
    },
    {
      code: 'REFERENCE_NUMBER',
      name: 'Reference Number',
      description: 'Bank or GL transaction reference / wire tracking code',
      isStrong: true,
      dataType: 'STRING',
      comparisonOperator: 'EQUALS',
    },
    {
      code: 'CHEQUE_NUMBER',
      name: 'Cheque / Check Number',
      description: 'Physical or electronic draft / cheque identifier',
      isStrong: true,
      dataType: 'STRING',
      comparisonOperator: 'EQUALS',
    },
    {
      code: 'ACCOUNT_NUMBER',
      name: 'Account Number',
      description: 'Counterparty or internal account number identifier',
      isStrong: true,
      dataType: 'STRING',
      comparisonOperator: 'EQUALS',
    },
    // Additional Criteria (5-9)
    {
      code: 'TRANSACTION_DATE',
      name: 'Transaction Date / Value Date',
      description: 'Date the transaction posted or cleared at financial institution',
      isStrong: false,
      dataType: 'DATE',
      comparisonOperator: 'WITHIN_TOLERANCE',
    },
    {
      code: 'TRANSACTION_TYPE',
      name: 'Transaction Type',
      description: 'Debit, Credit, Wire, ACH, Fee, Interest, Reversal',
      isStrong: false,
      dataType: 'ENUM',
      comparisonOperator: 'EQUALS',
    },
    {
      code: 'CURRENCY',
      name: 'Currency Code',
      description: 'ISO-4217 3-letter currency identifier (e.g. USD, EUR, GBP)',
      isStrong: false,
      dataType: 'STRING',
      comparisonOperator: 'EQUALS',
    },
    {
      code: 'NARRATION',
      name: 'Narration / Description',
      description: 'Text memo, description or payment details',
      isStrong: false,
      dataType: 'STRING',
      comparisonOperator: 'FUZZY_MATCH',
    },
    {
      code: 'CUSTOMER_SUPPLIER',
      name: 'Customer / Supplier Name',
      description: 'Payee, payer, vendor or customer entity name',
      isStrong: false,
      dataType: 'STRING',
      comparisonOperator: 'FUZZY_MATCH',
    },
  ];

  for (const crit of criteriaData) {
    await prisma.matchingCriterion.upsert({
      where: { code: crit.code },
      update: crit,
      create: crit,
    });
  }

  // 4. Seed Standard Aging Buckets
  const agingBucketsData = [
    { name: '0–7 days', minDays: 0, maxDays: 7, displayOrder: 1 },
    { name: '8–30 days', minDays: 8, maxDays: 30, displayOrder: 2 },
    { name: '31–60 days', minDays: 31, maxDays: 60, displayOrder: 3 },
    { name: '61–90 days', minDays: 61, maxDays: 90, displayOrder: 4 },
    { name: '90+ days', minDays: 91, maxDays: null, displayOrder: 5 },
  ];

  for (const bucket of agingBucketsData) {
    const existing = await prisma.agingBucketConfig.findFirst({
      where: { name: bucket.name, organizationId: null },
    });
    if (!existing) {
      await prisma.agingBucketConfig.create({
        data: {
          name: bucket.name,
          minDays: bucket.minDays,
          maxDays: bucket.maxDays,
          displayOrder: bucket.displayOrder,
          isSystemDefault: true,
          organizationId: null,
        },
      });
    }
  }

  // 5. Seed Primary Organization
  const org1 = await prisma.organization.upsert({
    where: { slug: 'acme-treasury' },
    update: {
      name: 'Acme Global Treasury Corp',
      taxId: 'US-94-3829104',
      baseCurrency: 'USD',
      status: 'ACTIVE',
    },
    create: {
      name: 'Acme Global Treasury Corp',
      slug: 'acme-treasury',
      taxId: 'US-94-3829104',
      baseCurrency: 'USD',
      status: 'ACTIVE',
    },
  });

  // Seed Multi-tenant Test Org 2 for verification of organization isolation
  const org2 = await prisma.organization.upsert({
    where: { slug: 'apex-holdings' },
    update: {
      name: 'Apex Financial Holdings LLC',
      taxId: 'US-13-8849102',
      baseCurrency: 'EUR',
      status: 'ACTIVE',
    },
    create: {
      name: 'Apex Financial Holdings LLC',
      slug: 'apex-holdings',
      taxId: 'US-13-8849102',
      baseCurrency: 'EUR',
      status: 'ACTIVE',
    },
  });

  // Seed Admin user for Org2
  const org2Admin = await prisma.user.upsert({
    where: { email: 'elena.admin@apexholdings.eu' },
    update: { fullName: 'Elena Rostova (Apex Admin)', organizationId: org2.id },
    create: {
      email: 'elena.admin@apexholdings.eu',
      fullName: 'Elena Rostova (Apex Admin)',
      organizationId: org2.id,
      status: 'ACTIVE',
    },
  });

  if (roles['ADMIN']) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: org2Admin.id,
          roleId: roles['ADMIN'],
        },
      },
      update: {},
      create: {
        userId: org2Admin.id,
        roleId: roles['ADMIN'],
      },
    });
  }

  // 6. Organization Matching Control (Minimum 3 total criteria, Minimum 2 strong criteria)
  await prisma.matchingControlConfig.upsert({
    where: { organizationId: org1.id },
    update: {
      minTotalCriteria: 3,
      minStrongCriteria: 2,
      allowFuzzyNarration: false,
      requireExactCurrency: true,
    },
    create: {
      organizationId: org1.id,
      minTotalCriteria: 3,
      minStrongCriteria: 2,
      allowFuzzyNarration: false,
      requireExactCurrency: true,
    },
  });

  // 7. Seed Primary Users in Org1
  const usersData = [
    {
      email: 'sarah.admin@acmetreasury.com',
      fullName: 'Sarah Jenkins (Administrator)',
      roleCode: 'ADMIN',
    },
    {
      email: 'michael.accountant@acmetreasury.com',
      fullName: 'Michael Chen (Senior Accountant)',
      roleCode: 'ACCOUNTANT',
    },
    {
      email: 'elena.reviewer@acmetreasury.com',
      fullName: 'Elena Rostova (Reconciliation Reviewer)',
      roleCode: 'REVIEWER',
    },
    {
      email: 'marcus.auditor@acmetreasury.com',
      fullName: 'Marcus Vance (Compliance Auditor)',
      roleCode: 'AUDITOR',
    },
  ];

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, organizationId: org1.id },
      create: {
        email: u.email,
        fullName: u.fullName,
        organizationId: org1.id,
        status: 'ACTIVE',
      },
    });

    const roleId = roles[u.roleCode];
    if (roleId) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId,
        },
      });
    }
  }

  // 8. Seed Banks and Bank Accounts for Org1
  const chaseBank = await prisma.bank.upsert({
    where: {
      organizationId_name: {
        organizationId: org1.id,
        name: 'JPMorgan Chase Bank, N.A.',
      },
    },
    update: {
      swiftCode: 'CHASUS33',
      routingNumber: '021000021',
      country: 'US',
    },
    create: {
      organizationId: org1.id,
      name: 'JPMorgan Chase Bank, N.A.',
      swiftCode: 'CHASUS33',
      routingNumber: '021000021',
      country: 'US',
      status: 'ACTIVE',
    },
  });

  const citiBank = await prisma.bank.upsert({
    where: {
      organizationId_name: {
        organizationId: org1.id,
        name: 'Citibank N.A. Commercial',
      },
    },
    update: {
      swiftCode: 'CITIUS33',
      routingNumber: '021000089',
      country: 'US',
    },
    create: {
      organizationId: org1.id,
      name: 'Citibank N.A. Commercial',
      swiftCode: 'CITIUS33',
      routingNumber: '021000089',
      country: 'US',
      status: 'ACTIVE',
    },
  });

  const primaryChecking = await prisma.bankAccount.upsert({
    where: {
      organizationId_bankId_accountNumber: {
        organizationId: org1.id,
        bankId: chaseBank.id,
        accountNumber: 'CHASE-OP-8921',
      },
    },
    update: {
      accountName: 'Operating Primary Checking',
      currency: 'USD',
      accountType: 'OPERATING',
      openingBalance: 1250000.0,
      currentBalance: 1250000.0,
    },
    create: {
      organizationId: org1.id,
      bankId: chaseBank.id,
      accountName: 'Operating Primary Checking',
      accountNumber: 'CHASE-OP-8921',
      currency: 'USD',
      accountType: 'OPERATING',
      status: 'ACTIVE',
      openingBalance: 1250000.0,
      currentBalance: 1250000.0,
    },
  });

  await prisma.bankAccount.upsert({
    where: {
      organizationId_bankId_accountNumber: {
        organizationId: org1.id,
        bankId: chaseBank.id,
        accountNumber: 'CHASE-PR-4402',
      },
    },
    update: {
      accountName: 'Payroll Disbursements Account',
      currency: 'USD',
      accountType: 'PAYROLL',
      openingBalance: 350000.0,
      currentBalance: 350000.0,
    },
    create: {
      organizationId: org1.id,
      bankId: chaseBank.id,
      accountName: 'Payroll Disbursements Account',
      accountNumber: 'CHASE-PR-4402',
      currency: 'USD',
      accountType: 'PAYROLL',
      status: 'ACTIVE',
      openingBalance: 350000.0,
      currentBalance: 350000.0,
    },
  });

  await prisma.bankAccount.upsert({
    where: {
      organizationId_bankId_accountNumber: {
        organizationId: org1.id,
        bankId: citiBank.id,
        accountNumber: 'CITI-LIQ-9910',
      },
    },
    update: {
      accountName: 'Treasury Liquidity Reserve',
      currency: 'USD',
      accountType: 'MONEY_MARKET',
      openingBalance: 4800000.0,
      currentBalance: 4800000.0,
    },
    create: {
      organizationId: org1.id,
      bankId: citiBank.id,
      accountName: 'Treasury Liquidity Reserve',
      accountNumber: 'CITI-LIQ-9910',
      currency: 'USD',
      accountType: 'MONEY_MARKET',
      status: 'ACTIVE',
      openingBalance: 4800000.0,
      currentBalance: 4800000.0,
    },
  });

  // 8b. Seed Bank and Bank Account for Org2 (Multi-Tenant Isolation Foundation)
  const bnpBank = await prisma.bank.upsert({
    where: {
      organizationId_name: {
        organizationId: org2.id,
        name: 'BNP Paribas Commercial',
      },
    },
    update: {
      swiftCode: 'BNPAFR22',
      routingNumber: '3000400001',
      country: 'FR',
    },
    create: {
      organizationId: org2.id,
      name: 'BNP Paribas Commercial',
      swiftCode: 'BNPAFR22',
      routingNumber: '3000400001',
      country: 'FR',
      status: 'ACTIVE',
    },
  });

  await prisma.bankAccount.upsert({
    where: {
      organizationId_bankId_accountNumber: {
        organizationId: org2.id,
        bankId: bnpBank.id,
        accountNumber: 'BNP-EUR-7731',
      },
    },
    update: {
      accountName: 'Apex European Operations Account',
      currency: 'EUR',
      accountType: 'OPERATING',
      openingBalance: 2100000.0,
      currentBalance: 2100000.0,
    },
    create: {
      organizationId: org2.id,
      bankId: bnpBank.id,
      accountName: 'Apex European Operations Account',
      accountNumber: 'BNP-EUR-7731',
      currency: 'EUR',
      accountType: 'OPERATING',
      status: 'ACTIVE',
      openingBalance: 2100000.0,
      currentBalance: 2100000.0,
    },
  });

  // 9. Seed Default Matching Rules and Tolerances for Org1
  await prisma.matchingRule.upsert({
    where: {
      organizationId_name: {
        organizationId: org1.id,
        name: 'Standard High-Confidence Rule (Amount + Ref + Date)',
      },
    },
    update: {
      description: 'Default automated matching rule requiring exact amount, reference number, and date within tolerance',
      priority: 10,
      isActive: true,
      minTotalCriteria: 3,
      minStrongCriteria: 2,
      requiredCriteria: JSON.stringify(['AMOUNT', 'REFERENCE_NUMBER']),
      optionalCriteria: JSON.stringify(['TRANSACTION_DATE', 'TRANSACTION_TYPE', 'CURRENCY']),
    },
    create: {
      organizationId: org1.id,
      name: 'Standard High-Confidence Rule (Amount + Ref + Date)',
      description: 'Default automated matching rule requiring exact amount, reference number, and date within tolerance',
      priority: 10,
      isActive: true,
      minTotalCriteria: 3,
      minStrongCriteria: 2,
      requiredCriteria: JSON.stringify(['AMOUNT', 'REFERENCE_NUMBER']),
      optionalCriteria: JSON.stringify(['TRANSACTION_DATE', 'TRANSACTION_TYPE', 'CURRENCY']),
    },
  });

  await prisma.matchingRule.upsert({
    where: {
      organizationId_name: {
        organizationId: org1.id,
        name: 'Cheque Clearance Rule (Amount + Cheque Number + Date)',
      },
    },
    update: {
      description: 'Matched draft and cheque items by cheque number and exact amount',
      priority: 20,
      isActive: true,
      minTotalCriteria: 3,
      minStrongCriteria: 2,
      requiredCriteria: JSON.stringify(['AMOUNT', 'CHEQUE_NUMBER']),
      optionalCriteria: JSON.stringify(['TRANSACTION_DATE', 'CURRENCY']),
    },
    create: {
      organizationId: org1.id,
      name: 'Cheque Clearance Rule (Amount + Cheque Number + Date)',
      description: 'Matched draft and cheque items by cheque number and exact amount',
      priority: 20,
      isActive: true,
      minTotalCriteria: 3,
      minStrongCriteria: 2,
      requiredCriteria: JSON.stringify(['AMOUNT', 'CHEQUE_NUMBER']),
      optionalCriteria: JSON.stringify(['TRANSACTION_DATE', 'CURRENCY']),
    },
  });

  // 10. Seed Tolerances (Org level & Account level)
  const existingOrgTolerance = await prisma.toleranceConfig.findFirst({
    where: { organizationId: org1.id, level: 'ORGANIZATION', bankAccountId: null },
  });

  if (!existingOrgTolerance) {
    await prisma.toleranceConfig.create({
      data: {
        organizationId: org1.id,
        level: 'ORGANIZATION',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 0.05, // 5 cents rounding tolerance
        amountToleranceMax: 10.0,
        dateToleranceDays: 3, // 3 days posting difference
        isDateToleranceAllowed: true,
        currencyRateTolerancePercent: 0.1,
      },
    });
  }

  const existingAccountTolerance = await prisma.toleranceConfig.findFirst({
    where: { organizationId: org1.id, level: 'BANK_ACCOUNT', bankAccountId: primaryChecking.id },
  });

  if (!existingAccountTolerance) {
    await prisma.toleranceConfig.create({
      data: {
        organizationId: org1.id,
        bankAccountId: primaryChecking.id,
        level: 'BANK_ACCOUNT',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 0.0, // Strict zero amount tolerance on operating checking
        dateToleranceDays: 2,
        isDateToleranceAllowed: true,
      },
    });
  }

  // Record seed audit event
  await prisma.auditEvent.create({
    data: {
      organizationId: org1.id,
      action: 'SYSTEM_INITIALIZED',
      entityType: 'System',
      entityId: org1.id,
      reason: 'Initial financial foundation seed executed',
      metadata: JSON.stringify({
        seededAt: new Date().toISOString(),
        version: 'Phase 1 - Foundation & Architecture',
      }),
    },
  });

  console.log('Database foundation seed completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase()
    .catch((err) => {
      console.error('Seed failure:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
