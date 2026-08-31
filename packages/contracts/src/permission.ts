export type PermissionResource = 'ORGANIZATION' | 'DEPARTMENT' | 'PERMISSION' | 'RESULT';
export type PermissionAction = 'VIEW' | 'MANAGE' | 'ASSIGN' | 'REVIEW';
export type PermissionScopeType = 'ORGANIZATION' | 'DEPARTMENT';
export type PermissionEffect = 'ALLOW' | 'DENY';
export type PermissionDecisionSource = 'ROLE' | 'OVERRIDE_ALLOW' | 'OVERRIDE_DENY' | 'DEFAULT_DENY';
export interface EffectivePermissionContract { resource: PermissionResource; action: PermissionAction; allowed: boolean; source: PermissionDecisionSource; }
export interface PermissionOverrideContract { id: string; organizationId: string; userId: string; scopeType: PermissionScopeType; scopeId: string; resource: PermissionResource; action: PermissionAction; effect: PermissionEffect; createdAt: string; updatedAt: string; }
