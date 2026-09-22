import crypto from 'crypto';
import { prisma } from '../../db';
import { IngestionSourceType } from './types';

export interface DuplicateFileCheckResult {
  isDuplicate: boolean;
  existingId?: string;
  existingFilename?: string;
  uploadedAt?: Date;
  status?: string;
}

/**
 * Checks if the exact file (by SHA-256 fingerprint) has already been uploaded within this organization.
 */
export async function checkDuplicateFile(
  organizationId: string,
  fileHash: string,
  sourceType: IngestionSourceType
): Promise<DuplicateFileCheckResult> {
  if (sourceType === 'BANK_STATEMENT') {
    const existing = await prisma.bankStatement.findFirst({
      where: {
        organizationId,
        fileHash,
      },
      select: {
        id: true,
        originalFilename: true,
        uploadedAt: true,
        processingStatus: true,
      },
    });

    if (existing) {
      return {
        isDuplicate: true,
        existingId: existing.id,
        existingFilename: existing.originalFilename,
        uploadedAt: existing.uploadedAt,
        status: existing.processingStatus,
      };
    }
  } else {
    const existing = await prisma.glImport.findFirst({
      where: {
        organizationId,
        fileHash,
      },
      select: {
        id: true,
        originalFilename: true,
        uploadedAt: true,
        processingStatus: true,
      },
    });

    if (existing) {
      return {
        isDuplicate: true,
        existingId: existing.id,
        existingFilename: existing.originalFilename,
        uploadedAt: existing.uploadedAt,
        status: existing.processingStatus,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Generates cryptographic fingerprint for a transaction to identify duplicates across different uploads.
 */
export function generateTransactionFingerprint(params: {
  organizationId: string;
  bankAccountId?: string | null;
  dateStr: string;
  refNumber?: string | null;
  chequeNumber?: string | null;
  amountStr: string;
  descriptionOrNarration: string;
}): string {
  const normDate = params.dateStr.trim();
  const normRef = (params.refNumber || '').trim().toUpperCase();
  const normCheque = (params.chequeNumber || '').trim().toUpperCase();
  const normAmount = params.amountStr.trim();
  const normDesc = params.descriptionOrNarration.trim().toUpperCase().replace(/\s+/g, ' ');

  const rawFingerprint = [
    params.organizationId,
    params.bankAccountId || 'global',
    normDate,
    normRef,
    normCheque,
    normAmount,
    normDesc,
  ].join('::');

  return crypto.createHash('sha256').update(rawFingerprint).digest('hex');
}

/**
 * Inspects a list of fingerprints against existing records in the organization.
 */
export async function findExistingTransactionDuplicates(
  organizationId: string,
  fingerprints: string[],
  sourceType: IngestionSourceType
): Promise<Map<string, { id: string; transactionDate: Date; description: string }>> {
  const duplicateMap = new Map<string, { id: string; transactionDate: Date; description: string }>();

  if (fingerprints.length === 0) return duplicateMap;

  // Batch query up to 500 fingerprints at a time
  const batchSize = 500;
  for (let i = 0; i < fingerprints.length; i += batchSize) {
    const batch = fingerprints.slice(i, i + batchSize);

    if (sourceType === 'BANK_STATEMENT') {
      const matches = await prisma.bankTransaction.findMany({
        where: {
          organizationId,
          transactionFingerprint: { in: batch },
        },
        select: {
          id: true,
          transactionFingerprint: true,
          transactionDate: true,
          description: true,
        },
      });

      for (const m of matches) {
        duplicateMap.set(m.transactionFingerprint, {
          id: m.id,
          transactionDate: m.transactionDate,
          description: m.description,
        });
      }
    } else {
      const matches = await prisma.glTransaction.findMany({
        where: {
          organizationId,
          transactionFingerprint: { in: batch },
        },
        select: {
          id: true,
          transactionFingerprint: true,
          transactionDate: true,
          narration: true,
        },
      });

      for (const m of matches) {
        duplicateMap.set(m.transactionFingerprint, {
          id: m.id,
          transactionDate: m.transactionDate,
          description: m.narration,
        });
      }
    }
  }

  return duplicateMap;
}
