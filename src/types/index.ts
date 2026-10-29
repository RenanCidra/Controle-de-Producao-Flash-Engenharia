export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'QUALITY_INSPECTOR';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface JwtUserPayload {
  userId: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  department?: string | null;
}

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'START_PRODUCTION'
  | 'COMPLETE_PRODUCTION'
  | 'INSPECT_QUALITY'
  | 'TEST_INTEGRATION';

export type AuditEntity =
  | 'PRODUCTION_ORDER'
  | 'INVENTORY'
  | 'PRODUCTION_LINE'
  | 'QUALITY'
  | 'USER'
  | 'ORGANIZATION'
  | 'INTEGRATION'
  | 'AUTH';

export interface AuditLogEntry {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: 'SUCCESS' | 'FAILURE';
}

export type ItemType = 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'PACKAGING' | 'COMPONENT';
export type ProductionOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type ProductionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type QualityStatus = 'PASSED' | 'FAILED' | 'PENDING';
export type ProductionLineStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'IDLE';

export type IntegrationProvider = 'IOT_SENSOR' | 'WEBHOOK' | 'CUSTOM_REST' | 'MES_SYNC';
export type AuthType = 'BEARER' | 'HEADER' | 'BASIC' | 'NONE';
export type IntegrationStatus = 'CONFIGURED' | 'ACTIVE' | 'ERROR' | 'DISABLED';
