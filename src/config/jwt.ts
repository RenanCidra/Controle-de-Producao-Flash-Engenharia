import crypto from 'node:crypto';

function resolveJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  // Derive a stable, cryptographically secure 256-bit secret from platform environment credentials
  const seed = [
    process.env.APPLET_ID || 'nexus-applet-identity',
    process.env.SQL_DB_NAME || 'nexus-database',
    process.env.SQL_USER || 'nexus-user',
    process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || 'nexus-production-salt',
  ].join(':');

  return crypto.createHmac('sha256', 'nexus-jwt-platform-secret-seed').update(seed).digest('hex');
}

export const JWT_CONFIG = {
  secret: resolveJwtSecret(),
  expiresIn: '8h',
  refreshExpiresIn: '7d',
  issuer: 'nexus-erp-api',
  audience: 'nexus-erp-clients',
};
