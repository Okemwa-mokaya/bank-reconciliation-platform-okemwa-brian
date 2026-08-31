import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { prisma, checkDatabaseConnection } from './server/db';
import { seedDatabase } from './server/seed';
import { authMiddleware } from './server/middleware/auth';
import { enforceOrganizationScope } from './server/middleware/organizationIsolation';

import { systemRouter } from './server/routes/systemRoutes';
import { authRouter } from './server/routes/authRoutes';
import { bankRouter } from './server/routes/bankRoutes';
import { statementRouter } from './server/routes/statementRoutes';
import { transactionRouter } from './server/routes/transactionRoutes';
import { reconciliationRouter } from './server/routes/reconciliationRoutes';
import { matchingRouter } from './server/routes/matchingRoutes';
import { exceptionRouter } from './server/routes/exceptionRoutes';
import { agingRouter } from './server/routes/agingRoutes';
import { auditRouter } from './server/routes/auditRoutes';
import { dashboardRouter } from './server/routes/dashboardRoutes';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// System & Health Endpoints (Public)
app.use('/api/system', systemRouter);

// Protected API Routes with Auth & Tenancy Isolation
app.use('/api/auth', authMiddleware, authRouter);
app.use('/api/bank-structure', authMiddleware, enforceOrganizationScope, bankRouter);
app.use('/api/statements', authMiddleware, enforceOrganizationScope, statementRouter);
app.use('/api/transactions', authMiddleware, enforceOrganizationScope, transactionRouter);
app.use('/api/reconciliations', authMiddleware, enforceOrganizationScope, reconciliationRouter);
app.use('/api/matching', authMiddleware, enforceOrganizationScope, matchingRouter);
app.use('/api/exceptions', authMiddleware, enforceOrganizationScope, exceptionRouter);
app.use('/api/aging', authMiddleware, enforceOrganizationScope, agingRouter);
app.use('/api/audit-trail', authMiddleware, enforceOrganizationScope, auditRouter);
app.use('/api/dashboard', authMiddleware, enforceOrganizationScope, dashboardRouter);

// Global Error Handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server Internal Error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

async function startServer() {
  // Ensure DB connection and seed foundation data if necessary
  try {
    const conn = await checkDatabaseConnection();
    if (conn.ok) {
      const orgCount = await prisma.organization.count();
      if (orgCount === 0) {
        console.log('No organizations detected. Auto-seeding financial foundation...');
        await seedDatabase();
      }
    } else {
      console.warn('Database health check warning:', conn.message);
    }
  } catch (err) {
    console.error('Initial DB check error:', err);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Financial Verification & Reconciliation Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
