import { Request, Response, NextFunction } from 'express';

export function enforceOrganizationScope(req: Request, res: Response, next: NextFunction) {
  if (!req.organization || !req.organization.id) {
    return res.status(400).json({ error: 'Organization context missing from request' });
  }

  const authenticatedOrgId = req.organization.id;

  // Check body organizationId
  if (req.body && req.body.organizationId && req.body.organizationId !== authenticatedOrgId) {
    return res.status(403).json({
      error: 'Tenant isolation violation: Cannot mutate data belonging to another organization',
    });
  }

  // Check query organizationId
  if (req.query && req.query.organizationId && req.query.organizationId !== authenticatedOrgId) {
    return res.status(403).json({
      error: 'Tenant isolation violation: Cannot query data belonging to another organization',
    });
  }

  // Check params organizationId
  if (req.params && req.params.organizationId && req.params.organizationId !== authenticatedOrgId) {
    return res.status(403).json({
      error: 'Tenant isolation violation: Cannot access resource belonging to another organization',
    });
  }

  next();
}
