import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service.ts';
import { AuthRepository } from '../modules/auth/auth.repository.ts';
import { JwtUserPayload, normalizeUserRole, UserRole } from '../types/index.ts';

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (process.env.DEV_PREVIEW_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    req.user = {
      userId: 0,
      uid: 'dev-preview-admin',
      loginName: 'preview-admin',
      name: 'Prévia local',
      role: 'ADMIN',
      status: 'ACTIVE',
      department: 'Ambiente de desenvolvimento',
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acesso não autorizado: token JWT ausente no cabeçalho Authorization',
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();

  let tokenPayload: JwtUserPayload;
  try {
    tokenPayload = TokenService.verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }

  try {
    const user = await AuthRepository.findByUid(tokenPayload.uid);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Conta inativa ou sessão inválida. Faça login novamente.' });
    }

    req.user = {
      userId: user.id,
      uid: user.uid,
      loginName: user.loginName,
      email: user.email,
      name: user.name,
      role: normalizeUserRole(user.role),
      status: user.status as 'ACTIVE' | 'INACTIVE',
      department: user.department,
    };
    return next();
  } catch (error) {
    console.error('Failed to validate authenticated account:', error);
    return res.status(503).json({ error: 'Não foi possível validar a conta no momento.' });
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
