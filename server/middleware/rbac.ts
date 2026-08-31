import { Request, Response, NextFunction } from 'express';

export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    if (!req.user.permissions.includes(permissionCode)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient permissions',
        requiredPermission: permissionCode,
        userRole: req.user.roles,
      });
    }

    next();
  };
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({
        error: 'Forbidden: Role not authorized for this operation',
        requiredRoles: allowedRoles,
        userRoles: req.user.roles,
      });
    }

    next();
  };
}
