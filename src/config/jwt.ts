export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'nexus_erp_enterprise_jwt_secure_secret_key_2026',
  expiresIn: '8h',
  refreshExpiresIn: '7d',
  issuer: 'nexus-erp-api',
  audience: 'nexus-erp-clients',
};
