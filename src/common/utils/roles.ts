export const PROJECT_ROLES = {
  ADMIN: 'ADMIN',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  CONTRIBUTOR: 'CONTRIBUTOR',
} as const;

export type ProjectRole = keyof typeof PROJECT_ROLES;

/**
 * Maps legacy or unknown roles to the standardized 3 roles.
 * OWNER -> ADMIN
 * VIEWER -> CONTRIBUTOR
 * Fallback -> CONTRIBUTOR
 */
export function mapLegacyRole(role: string | null | undefined): ProjectRole {
  if (!role) return PROJECT_ROLES.CONTRIBUTOR;
  
  const normalized = role.toUpperCase();
  
  if (normalized === 'OWNER' || normalized === 'ADMIN') {
    return PROJECT_ROLES.ADMIN;
  }
  
  if (normalized === 'PROJECT_MANAGER' || normalized === 'PM') {
    return PROJECT_ROLES.PROJECT_MANAGER;
  }
  
  if (normalized === 'VIEWER' || normalized === 'CONTRIBUTOR' || normalized === 'MEMBER' || normalized === 'TEAM_MEMBER') {
    return PROJECT_ROLES.CONTRIBUTOR;
  }
  
  return PROJECT_ROLES.CONTRIBUTOR;
}
