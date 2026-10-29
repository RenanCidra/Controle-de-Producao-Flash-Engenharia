export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || '',
  expiresIn: '8h',
  refreshExpiresIn: '7d',
  issuer: 'nexus-erp-api',
  audience: 'nexus-erp-clients',
};
