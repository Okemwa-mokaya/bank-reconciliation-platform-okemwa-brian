import { Request, Response, NextFunction } from 'express';

/**
 * Manual eligibility overrides are materially different from ordinary manual
 * matches. The client must explicitly supply an override reason, and only a
 * user granted the dedicated permission may perform that action.
 */
export function requireOverridePermission(req: Request, res: Response, next: NextFunction) {
  const body: any = req.body || {};
  const requestedOverride = body.overrideReason != null || body.override === true || body.isManualOverride === true;
  const requestedProposal = body.matchStatus === 'PROPOSED' || body.status === 'PROPOSED' || body.isProposed === true || body.proposed === true;

  // Legacy direct match creation must not be used to manufacture a proposal,
  // because the old handler also committed transaction status changes. The
  // dedicated automatic engine owns proposal creation and review lifecycle.
  if (requestedProposal && req.method === 'POST' && req.path.includes('/matches')) {
    return res.status(400).json({
      error: 'Direct PROPOSED match creation is disabled. Use the automatic reconciliation proposal endpoint.',
    });
  }

  if (!requestedOverride) return next();
  if (!req.user) return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  if (!req.user.permissions.includes('override_match_eligibility')) {
    return res.status(403).json({
      error: 'Forbidden: explicit match eligibility override permission required',
      requiredPermission: 'override_match_eligibility',
    });
  }
  if (typeof body.overrideReason !== 'string' || body.overrideReason.trim().length < 5) {
    return res.status(400).json({ error: 'A meaningful overrideReason is required for manual eligibility overrides' });
  }
  next();
}
