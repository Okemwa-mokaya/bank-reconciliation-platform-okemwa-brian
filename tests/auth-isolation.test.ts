import { describe, it, expect } from 'vitest';
import {
  createSession,
  verifySessionToken,
  revokeSession,
  DEV_ACCOUNTS,
} from '../server/services/authService';

describe('Server Authentication & Session Token Verification', () => {
  it('1. Generates and cryptographically verifies server-signed session tokens', async () => {
    const userId = 'usr-test-123';

    const token = await createSession(userId);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(32);

    const payload = verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(userId);
  });

  it('2. Rejects forged or unknown session tokens', () => {
    expect(verifySessionToken('non-existent-token-12345')).toBeNull();
    expect(verifySessionToken('invalid.token.structure')).toBeNull();
    expect(verifySessionToken('')).toBeNull();
  });

  it('3. Successfully revokes session tokens on logout', async () => {
    const token = await createSession('usr-logout-test');

    expect(verifySessionToken(token)).not.toBeNull();
    revokeSession(token);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('4. Provides server-configured dev demo accounts for testing', () => {
    expect(DEV_ACCOUNTS.length).toBeGreaterThanOrEqual(4);
    const roles = DEV_ACCOUNTS.map((a) => a.role);
    expect(roles).toContain('ADMIN');
    expect(roles).toContain('ACCOUNTANT');
    expect(roles).toContain('REVIEWER');
    expect(roles).toContain('AUDITOR');
  });
});
