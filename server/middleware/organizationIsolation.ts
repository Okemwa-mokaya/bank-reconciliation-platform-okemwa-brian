import { Request, Response, NextFunction } from 'express';

export function enforceOrganizationScope(req: Request, res: Response, next: NextFunction) {
  if (!req.organization || !req.organization.id) {
    return res.status(400).json({ error: 'Organization context missing from request' });
  }

  // If a request body contains an organizationId, enforce that it strictly matches the authenticated org
  if (req.body && req.body.organizationId && req.body.organizationId !== req.organization.id) {
    return res.status(403).json({
      error: 'Tenant isolation violation: Cannot access or mutate data across organization boundaries',
    });
  }

  next();
}
