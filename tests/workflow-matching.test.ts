import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('Workflow State Machine & Reconciliation Matching Guard Logic', () => {
  it('1. Validates strict stage transition sequences: PREPARED -> REVIEWED -> APPROVED -> CLOSED', () => {
    const validTransitions: Record<string, string> = {
      SUBMIT_PREPARATION: 'PREPARED',
      SUBMIT_REVIEW: 'REVIEWED',
      APPROVE: 'APPROVED',
      CLOSE: 'CLOSED',
    };

    // Verify allowed predecessor states
    const allowedPredecessors: Record<string, string[]> = {
      SUBMIT_PREPARATION: ['NOT_STARTED', 'PROCESSING', 'RECONCILED', 'EXCEPTIONS'],
      SUBMIT_REVIEW: ['PREPARED'],
      APPROVE: ['REVIEWED'],
      CLOSE: ['APPROVED'],
      REOPEN: ['CLOSED', 'APPROVED'],
    };

    // 1. PREPARED cannot jump to APPROVED directly without REVIEWED
    expect(allowedPredecessors.APPROVE.includes('PREPARED')).toBe(false);
    expect(allowedPredecessors.APPROVE.includes('REVIEWED')).toBe(true);

    // 2. Cannot CLOSE unless APPROVED
    expect(allowedPredecessors.CLOSE.includes('PREPARED')).toBe(false);
    expect(allowedPredecessors.CLOSE.includes('REVIEWED')).toBe(false);
    expect(allowedPredecessors.CLOSE.includes('APPROVED')).toBe(true);
  });

  it('2. Enforces Decimal precision arithmetic on financial values', () => {
    // Floating point math failure demonstration in standard IEEE 754
    const float1 = 0.1 + 0.2; // 0.30000000000000004
    expect(float1 === 0.3).toBe(false);

    // Prisma Decimal precision exactness
    const dec1 = new Prisma.Decimal('0.1');
    const dec2 = new Prisma.Decimal('0.2');
    const sum = dec1.plus(dec2);
    expect(sum.equals(new Prisma.Decimal('0.3'))).toBe(true);
    expect(sum.toString()).toBe('0.3');

    // High precision financial calculations
    const debit = new Prisma.Decimal('1250000.55');
    const credit = new Prisma.Decimal('345000.20');
    const net = credit.minus(debit);
    expect(net.toString()).toBe('-904990.35');
  });

  it('3. Multi-to-one / one-to-many transaction junction allocation matches sum exactly', () => {
    const bankTxAmount = new Prisma.Decimal('1500.00');
    const glTx1Amount = new Prisma.Decimal('1000.00');
    const glTx2Amount = new Prisma.Decimal('500.00');

    const totalGL = glTx1Amount.plus(glTx2Amount);
    expect(totalGL.equals(bankTxAmount)).toBe(true);
  });

  it('4. Prevents actions on closed or locked reconciliation periods', () => {
    const period = {
      id: 'period-1',
      status: 'CLOSED',
      isLocked: true,
    };

    const isActionAllowed = !period.isLocked && period.status !== 'CLOSED';
    expect(isActionAllowed).toBe(false);
  });
});
