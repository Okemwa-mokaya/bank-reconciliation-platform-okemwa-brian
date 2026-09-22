import { ColumnMappingConfig, IngestionSourceType } from './types';

interface HeaderPattern {
  targetField: keyof ColumnMappingConfig;
  regexes: RegExp[];
  priority: number;
}

const HEADER_PATTERNS: HeaderPattern[] = [
  {
    targetField: 'transactionDate',
    regexes: [
      /^(txn|trans|transaction|booking|post|posting)?[\s_-]*date$/i,
      /^date$/i,
      /^trans[\s_-]*dt$/i,
    ],
    priority: 10,
  },
  {
    targetField: 'valueDate',
    regexes: [/^(val|value|effective|settlement)[\s_-]*date$/i],
    priority: 9,
  },
  {
    targetField: 'description',
    regexes: [
      /^(narration|description|particulars|details|memo|transaction[\s_-]*description|transaction[\s_-]*details|remarks)$/i,
      /^text$/i,
    ],
    priority: 10,
  },
  {
    targetField: 'referenceNumber',
    regexes: [
      /^(ref|reference|transaction[\s_-]*id|txn[\s_-]*id|document[\s_-]*no|doc[\s_-]*number|ref[\s_-]*no|ref[\s_-]*#)$/i,
      /^reference[\s_-]*number$/i,
    ],
    priority: 8,
  },
  {
    targetField: 'chequeNumber',
    regexes: [/^(cheque|check|chq)[\s_-]*(no|number|#)?$/i],
    priority: 8,
  },
  {
    targetField: 'accountNumber',
    regexes: [/^(acc|acct|account)[\s_-]*(no|number|#)?$/i, /^gl[\s_-]*account$/i],
    priority: 7,
  },
  {
    targetField: 'debit',
    regexes: [
      /^(debit|withdrawal|withdrawals|debit[\s_-]*amount|paid[\s_-]*out|money[\s_-]*out|dr)$/i,
      /^debit[\s_-]*amt$/i,
    ],
    priority: 10,
  },
  {
    targetField: 'credit',
    regexes: [
      /^(credit|deposit|deposits|credit[\s_-]*amount|paid[\s_-]*in|money[\s_-]*in|cr)$/i,
      /^credit[\s_-]*amt$/i,
    ],
    priority: 10,
  },
  {
    targetField: 'amount',
    regexes: [/^(net[\s_-]*amount|amount|txn[\s_-]*amount|total|sum)$/i, /^amt$/i],
    priority: 7, // lower priority than distinct debit/credit
  },
  {
    targetField: 'balance',
    regexes: [
      /^(balance|running[\s_-]*balance|closing[\s_-]*balance|ledger[\s_-]*balance|curr[\s_-]*bal)$/i,
    ],
    priority: 8,
  },
  {
    targetField: 'transactionType',
    regexes: [/^(type|txn[\s_-]*type|trans[\s_-]*type|cr\/dr|dr\/cr|d\/c)$/i],
    priority: 7,
  },
  {
    targetField: 'customerSupplier',
    regexes: [/^(customer|supplier|vendor|payee|payer|counterparty|party|entity)$/i],
    priority: 7,
  },
  {
    targetField: 'journalNumber',
    regexes: [/^(journal|journal[\s_-]*no|journal[\s_-]*#|voucher[\s_-]*no|entry[\s_-]*no)$/i],
    priority: 8,
  },
];

/**
 * Automatically detects column mappings from raw headers using pattern matching and priorities.
 */
export function detectColumnMapping(
  headers: string[],
  sourceType: IngestionSourceType,
  userOverrides?: ColumnMappingConfig
): {
  mapping: ColumnMappingConfig;
  confidence: number;
  unmappedHeaders: string[];
  warnings: string[];
} {
  const mapping: ColumnMappingConfig = {};
  const warnings: string[] = [];
  const assignedFields = new Set<string>();
  const assignedHeaders = new Set<string>();

  // 1. Apply user overrides first if provided
  if (userOverrides) {
    for (const [targetField, sourceHeader] of Object.entries(userOverrides)) {
      if (sourceHeader && headers.includes(sourceHeader)) {
        mapping[targetField as keyof ColumnMappingConfig] = sourceHeader;
        assignedFields.add(String(targetField));
        assignedHeaders.add(sourceHeader);
      }
    }
  }

  // 2. Intelligent pattern matching on remaining headers
  let matchesCount = 0;
  const sortedPatterns = [...HEADER_PATTERNS].sort((a, b) => b.priority - a.priority);

  for (const header of headers) {
    if (assignedHeaders.has(header)) continue;
    const cleanHeader = header.trim();

    for (const pattern of sortedPatterns) {
      const fieldKey = String(pattern.targetField);
      if (assignedFields.has(fieldKey)) continue;

      const isMatch = pattern.regexes.some((regex) => regex.test(cleanHeader));
      if (isMatch) {
        mapping[pattern.targetField] = header;
        assignedFields.add(fieldKey);
        assignedHeaders.add(header);
        matchesCount++;
        break;
      }
    }
  }

  // 3. Fallback logic: If neither debit nor credit were matched, but 'amount' was, that's fine.
  // If 'amount' was matched as well as debit/credit, we prefer debit/credit.
  if (mapping.debit && mapping.credit && mapping.amount) {
    delete mapping.amount;
  }

  // 4. Validation of mandatory target fields
  const unmappedHeaders = headers.filter((h) => !assignedHeaders.has(h));

  if (!mapping.transactionDate) {
    warnings.push('Date column could not be automatically identified. Please select the transaction date column.');
  }

  if (!mapping.description && !mapping.narration) {
    warnings.push('Description/Narration column could not be automatically identified.');
  }

  const hasDebitCredit = mapping.debit || mapping.credit;
  const hasAmount = mapping.amount;
  if (!hasDebitCredit && !hasAmount) {
    warnings.push('Monetary amount columns (Debit/Credit or Net Amount) could not be identified.');
  }

  // 5. Calculate mapping confidence score
  let score = 0;
  if (mapping.transactionDate) score += 0.35;
  if (mapping.description || mapping.narration) score += 0.25;
  if (hasDebitCredit || hasAmount) score += 0.30;
  if (mapping.referenceNumber || mapping.chequeNumber) score += 0.10;

  const confidence = Math.min(1.0, Math.round(score * 100) / 100);

  return {
    mapping,
    confidence,
    unmappedHeaders,
    warnings,
  };
}
