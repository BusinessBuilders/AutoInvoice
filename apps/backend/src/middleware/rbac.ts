import { TRPCError } from '@trpc/server';
import { UserRole } from '@prisma/client';

/**
 * Permissions system for role-based access control
 */
export enum Permission {
  // Lead permissions
  VIEW_LEADS = 'view_leads',
  CREATE_LEAD = 'create_lead',
  EDIT_LEAD = 'edit_lead',
  DELETE_LEAD = 'delete_lead',

  // Customer permissions
  VIEW_CUSTOMERS = 'view_customers',
  CREATE_CUSTOMER = 'create_customer',
  EDIT_CUSTOMER = 'edit_customer',
  DELETE_CUSTOMER = 'delete_customer',

  // Invoice permissions
  VIEW_INVOICES = 'view_invoices',
  CREATE_INVOICE = 'create_invoice',
  EDIT_INVOICE = 'edit_invoice',
  DELETE_INVOICE = 'delete_invoice',
  SEND_INVOICE = 'send_invoice',

  // Quote permissions
  VIEW_QUOTES = 'view_quotes',
  CREATE_QUOTE = 'create_quote',
  EDIT_QUOTE = 'edit_quote',
  DELETE_QUOTE = 'delete_quote',

  // Task permissions
  VIEW_TASKS = 'view_tasks',
  CREATE_TASK = 'create_task',
  EDIT_TASK = 'edit_task',
  DELETE_TASK = 'delete_task',
  ASSIGN_TASK = 'assign_task',

  // Team permissions
  VIEW_TEAM = 'view_team',
  MANAGE_TEAM = 'manage_team',
  INVITE_MEMBER = 'invite_member',
  REMOVE_MEMBER = 'remove_member',
  EDIT_ROLES = 'edit_roles',

  // Settings permissions
  VIEW_SETTINGS = 'view_settings',
  EDIT_SETTINGS = 'edit_settings',

  // Admin permissions
  MANAGE_BILLING = 'manage_billing',
  VIEW_ANALYTICS = 'view_analytics',
  EXPORT_DATA = 'export_data',
}

/**
 * Role to permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: Object.values(Permission), // All permissions

  ADMIN: [
    // All operational permissions except billing and role editing
    Permission.VIEW_LEADS,
    Permission.CREATE_LEAD,
    Permission.EDIT_LEAD,
    Permission.DELETE_LEAD,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMER,
    Permission.EDIT_CUSTOMER,
    Permission.DELETE_CUSTOMER,
    Permission.VIEW_INVOICES,
    Permission.CREATE_INVOICE,
    Permission.EDIT_INVOICE,
    Permission.DELETE_INVOICE,
    Permission.SEND_INVOICE,
    Permission.VIEW_QUOTES,
    Permission.CREATE_QUOTE,
    Permission.EDIT_QUOTE,
    Permission.DELETE_QUOTE,
    Permission.VIEW_TASKS,
    Permission.CREATE_TASK,
    Permission.EDIT_TASK,
    Permission.DELETE_TASK,
    Permission.ASSIGN_TASK,
    Permission.VIEW_TEAM,
    Permission.INVITE_MEMBER,
    Permission.VIEW_SETTINGS,
    Permission.EDIT_SETTINGS,
    Permission.VIEW_ANALYTICS,
    Permission.EXPORT_DATA,
  ],

  EMPLOYEE: [
    // Can view and work with leads/customers/invoices but not delete
    Permission.VIEW_LEADS,
    Permission.CREATE_LEAD,
    Permission.EDIT_LEAD,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_CUSTOMER,
    Permission.EDIT_CUSTOMER,
    Permission.VIEW_INVOICES,
    Permission.CREATE_INVOICE,
    Permission.EDIT_INVOICE,
    Permission.SEND_INVOICE,
    Permission.VIEW_QUOTES,
    Permission.CREATE_QUOTE,
    Permission.EDIT_QUOTE,
    Permission.VIEW_TASKS,
    Permission.CREATE_TASK,
    Permission.EDIT_TASK,
    Permission.VIEW_TEAM,
    Permission.VIEW_SETTINGS,
  ],

  VIEWER: [
    // Read-only access
    Permission.VIEW_LEADS,
    Permission.VIEW_CUSTOMERS,
    Permission.VIEW_INVOICES,
    Permission.VIEW_QUOTES,
    Permission.VIEW_TASKS,
    Permission.VIEW_TEAM,
    Permission.VIEW_SETTINGS,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role];
  return rolePermissions.includes(permission);
}

/**
 * Check if user has permission, throw error if not
 */
export function requirePermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You don't have permission to ${permission.replace(/_/g, ' ')}`,
    });
  }
}

/**
 * Check if user has any of the permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Check if user has all of the permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}
