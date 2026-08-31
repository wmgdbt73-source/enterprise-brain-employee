export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type OrganizationStatus = 'ACTIVE' | 'DISABLED';
export type DepartmentRole = 'MANAGER' | 'MEMBER';
export type DepartmentStatus = 'ACTIVE' | 'DISABLED';
export interface OrganizationContract { id: string; name: string; status: OrganizationStatus; role: OrganizationRole; }
export interface DepartmentContract { id: string; organizationId: string; name: string; status: DepartmentStatus; createdAt: string; updatedAt: string; }
export interface DepartmentMemberContract { userId: string; name: string; role: DepartmentRole; status: 'ACTIVE' | 'DISABLED'; }
