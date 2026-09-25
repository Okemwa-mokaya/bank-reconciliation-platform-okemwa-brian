import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'node:http';
import { authenticatedFetch, getAuthToken, setAuthSession, api } from '../src/services/api';
import { authMiddleware } from '../server/middleware/auth';
import { enforceOrganizationScope } from '../server/middleware/organizationIsolation';
import { statementRouter } from '../server/routes/statementRoutes';
import { transactionRouter } from '../server/routes/transactionRoutes';
import { createSession } from '../server/services/authService';
import { prisma } from '../server/db';

// Ensure localStorage is polyfilled for Node.js test environment
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
}

describe('Data Ingestion Authentication & Bearer Header Verification', () => {
  let server: Server;
  let baseUrl: string;
  let validToken: string;

  beforeAll(async () => {
    // 1. Setup real express app reproducing the production server routes
    const app = express();
    app.use(express.json());

    // Mount statements and transactions routes with production auth & tenancy middleware
    app.use('/api/statements', authMiddleware, enforceOrganizationScope, statementRouter);
    app.use('/api/transactions', authMiddleware, enforceOrganizationScope, transactionRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Create valid server-signed session token for test user
    validToken = await createSession('ingestion-tester-1');

    // 3. Mock prisma user to provide required permissions and organization context
    (vi.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
      const id = args.where.id;
      if (id === 'ingestion-tester-1') {
        return {
          id: 'ingestion-tester-1',
          email: 'ingestion@acmetreasury.com',
          fullName: 'Ingestion Operator',
          status: 'ACTIVE',
          organizationId: 'org-test-ingestion',
          organization: {
            id: 'org-test-ingestion',
            name: 'Test Org',
            slug: 'test-org',
            baseCurrency: 'USD',
            status: 'ACTIVE',
          },
          userRoles: [
            {
              role: {
                code: 'ACCOUNTANT',
                permissions: [
                  { permission: { code: 'upload_statement' } },
                  { permission: { code: 'upload_statements' } },
                  { permission: { code: 'upload_gl' } },
                  { permission: { code: 'view_transactions' } },
                ],
              },
            },
          ],
        } as any;
      }
      return null;
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    // Clear localStorage between unit assertions
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // 1. Client Helper Unit Tests: authenticatedFetch
  // -------------------------------------------------------------------------
  describe('authenticatedFetch helper', () => {
    it('1. Attaches Authorization: Bearer <token> from localStorage without altering Content-Type', async () => {
      const testToken = 'test-token-value-xyz-987';
      localStorage.setItem('verifin_auth_token', testToken);
      expect(getAuthToken()).toBe(testToken);

      let capturedHeaders: Headers | null = null;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        capturedHeaders = init?.headers as Headers;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const formData = new FormData();
      formData.append('file', new Blob(['date,amount\n2026-09-01,100'], { type: 'text/csv' }), 'statement.csv');

      await authenticatedFetch('/api/statements/preview', {
        method: 'POST',
        body: formData,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.get('Authorization')).toBe(`Bearer ${testToken}`);

      // Must NOT manually force Content-Type so browser generates boundary
      expect(capturedHeaders!.has('Content-Type')).toBe(false);

      fetchSpy.mockRestore();
    });

    it('2. Preserves caller custom headers while adding Bearer token', async () => {
      localStorage.setItem('verifin_auth_token', 'my-auth-token');

      let capturedHeaders: Headers | null = null;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        capturedHeaders = init?.headers as Headers;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      await authenticatedFetch('/api/transactions/gl/preview', {
        method: 'POST',
        headers: {
          'X-Custom-Client-Trace': 'trace-12345',
        },
      });

      expect(capturedHeaders!.get('Authorization')).toBe('Bearer my-auth-token');
      expect(capturedHeaders!.get('X-Custom-Client-Trace')).toBe('trace-12345');

      fetchSpy.mockRestore();
    });

    it('3. api wrapper methods execute authenticatedFetch with Bearer token for all 4 endpoints', async () => {
      localStorage.setItem('verifin_auth_token', 'api-wrapper-token');

      const capturedCalls: Array<{ url: string; authHeader: string | null; hasContentType: boolean }> = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const headers = init?.headers as Headers;
        capturedCalls.push({
          url: String(url),
          authHeader: headers?.get('Authorization'),
          hasContentType: headers?.has('Content-Type') ?? false,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const dummyFormData = new FormData();
      await api.previewStatement(dummyFormData);
      await api.uploadStatement(dummyFormData);
      await api.previewGL(dummyFormData);
      await api.uploadGL(dummyFormData);

      expect(capturedCalls).toHaveLength(4);
      expect(capturedCalls[0].url).toBe('/api/statements/preview');
      expect(capturedCalls[0].authHeader).toBe('Bearer api-wrapper-token');
      expect(capturedCalls[0].hasContentType).toBe(false);

      expect(capturedCalls[1].url).toBe('/api/statements/upload');
      expect(capturedCalls[1].authHeader).toBe('Bearer api-wrapper-token');
      expect(capturedCalls[1].hasContentType).toBe(false);

      expect(capturedCalls[2].url).toBe('/api/transactions/gl/preview');
      expect(capturedCalls[2].authHeader).toBe('Bearer api-wrapper-token');
      expect(capturedCalls[2].hasContentType).toBe(false);

      expect(capturedCalls[3].url).toBe('/api/transactions/gl/upload');
      expect(capturedCalls[3].authHeader).toBe('Bearer api-wrapper-token');
      expect(capturedCalls[3].hasContentType).toBe(false);

      fetchSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Server-Side Protection: Unauthenticated Requests Must Return 401
  // -------------------------------------------------------------------------
  describe('Server Ingestion Endpoints Bearer Token Enforcement', () => {
    it('4. POST /api/statements/preview strictly requires Authorization Bearer token (401 without token)', async () => {
      const res = await fetch(`${baseUrl}/api/statements/preview`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized: Authentication required. Provide Authorization Bearer token.');
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('5. POST /api/statements/upload strictly requires Authorization Bearer token (401 without token)', async () => {
      const res = await fetch(`${baseUrl}/api/statements/upload`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized: Authentication required. Provide Authorization Bearer token.');
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('6. POST /api/transactions/gl/preview strictly requires Authorization Bearer token (401 without token)', async () => {
      const res = await fetch(`${baseUrl}/api/transactions/gl/preview`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized: Authentication required. Provide Authorization Bearer token.');
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('7. POST /api/transactions/gl/upload strictly requires Authorization Bearer token (401 without token)', async () => {
      const res = await fetch(`${baseUrl}/api/transactions/gl/upload`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized: Authentication required. Provide Authorization Bearer token.');
      expect(data.code).toBe('AUTH_REQUIRED');
    });

    it('8. Server successfully authenticates requests sending the Bearer token (no 401)', async () => {
      // With valid token, the request passes authMiddleware (fails at missing file payload 400, NOT 401)
      const res = await fetch(`${baseUrl}/api/statements/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).not.toBe(401);
      // Because no file was provided in this test probe, the router returns 400 No file uploaded
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('No file uploaded');
    });

    it('9. Server successfully authenticates GL preview with valid Bearer token', async () => {
      const res = await fetch(`${baseUrl}/api/transactions/gl/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).not.toBe(401);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('No file uploaded');
    });
  });
});
