import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { JwtUserPayload, UserRole } from '../types/index.ts';

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acesso não autorizado: token JWT ausente no cabeçalho Authorization',
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();

  // 1. Try Native ERP JWT first
  try {
    const userPayload = TokenService.verifyToken(token);
    req.user = userPayload;
    return next();
  } catch (nativeJwtErr) {
    // 2. If native JWT fails, attempt Firebase ID Token verification
    try {
      const decodedFirebaseToken = await adminAuth.verifyIdToken(token);
      req.user = {
        userId: 0, // Placeholder for Firebase federated identity
        uid: decodedFirebaseToken.uid,
        email: decodedFirebaseToken.email || 'firebase-user@nexuserp.local',
        name: decodedFirebaseToken.name || decodedFirebaseToken.email || 'Usuário Google',
        role: 'ADMIN', // Default role for authenticated cloud studio user
        status: 'ACTIVE',
      };
      return next();
    } catch {
      return res.status(401).json({
        error: 'Token inválido ou expirado. Faça login novamente.',
      });
    }
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado: Perfil '${req.user.role}' não tem permissão para esta operação.`,
      });
    }

    next();
  };
};
