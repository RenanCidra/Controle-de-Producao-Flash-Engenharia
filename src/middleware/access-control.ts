import type { Response, NextFunction } from 'express';
import type { UserRole } from '../types/index.ts';
import type { AuthenticatedRequest } from './auth.middleware.ts';

export const PERMISSIONS = [
  'audit:read', 'integrations:read', 'integrations:write', 'integrations:delete',
  'organization:read', 'organization:manage', 'accounts:manage',
  'production-lines:read', 'production-lines:write', 'production-lines:delete',
  'inventory:read', 'inventory:create', 'inventory:update', 'inventory:delete',
  'production-orders:read', 'production-orders:create', 'production-orders:update', 'production-orders:delete',
  'quality:read', 'quality:create', 'quality:delete',
] as const;

export type Permission = typeof PERMISSIONS[number];

// Central compatibility matrix. Roles remain the admin-facing profiles; routes depend on capabilities.
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  SUPERVISOR: new Set(PERMISSIONS.filter((permission) => !['accounts:manage', 'organization:manage', 'integrations:delete'].includes(permission))),
  OPERATOR: new Set([
    'integrations:read', 'organization:read', 'production-lines:read',
    'inventory:read', 'inventory:update', 'production-orders:read', 'production-orders:update', 'quality:read',
  ]),
  AUDITOR: new Set([
    'audit:read', 'integrations:read', 'organization:read', 'production-lines:read',
    'inventory:read', 'production-orders:read', 'quality:read',
  ]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado.' });
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: 'Acesso negado: permissão insuficiente.' });
    }
    return next();
  };
}
