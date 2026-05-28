import { navSections } from "../../components/layout/navSections.ts";

export type Permission = {
  key: string;
  label: string;
  description: string;
  category: string;
  parent?: string;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  color: string;
  userCount: number;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type RoleAssignment = {
  userId: string;
  userName: string;
  email: string;
  avatar: string;
  role: string;
  assignedBy: string;
  assignedAt: string;
  lastActive: string;
  region: string;
};

export const permissionCategories = [
  "Core Features",
  "Operational Data",
  "System Administration",
] as const;

const basePermissions: Permission[] = [
  // Core Features
  { key: "dashboard", label: "Dashboard", description: "Access to main dashboard overview", category: "Core Features" },
  { key: "contributions", label: "Contributions", description: "Manage POI contributions and reviews", category: "Core Features" },
  { key: "road-closures", label: "Road Closures", description: "Manage road closure records and reports", category: "Core Features" },
  { key: "road-closures-view", label: "View Road Closures", description: "View the list and details of road closures", category: "Core Features", parent: "road-closures" },
  { key: "road-closures-create", label: "Create Road Closure", description: "Create new road closures", category: "Core Features", parent: "road-closures" },
  { key: "road-closures-edit", label: "Edit Road Closure", description: "Edit existing road closures", category: "Core Features", parent: "road-closures" },
  { key: "road-closures-deactivate", label: "Deactivate Road Closures", description: "Deactivate road closures", category: "Core Features", parent: "road-closures" },
  { key: "road-closures-clear", label: "Clear Road Closures", description: "Clear road closures from the system", category: "Core Features", parent: "road-closures" },
  { key: "map-events", label: "Map Events", description: "Manage real-time map events", category: "Core Features" },
  { key: "poi-data", label: "POI Data", description: "General access to POI management, insights, and approvals", category: "Core Features" },
  { key: "poi-view", label: "View POI Data", description: "View the list and details of POIs", category: "Core Features", parent: "poi-data" },
  { key: "poi-create", label: "Create POI", description: "Add new POIs to the system", category: "Core Features", parent: "poi-data" },
  { key: "poi-edit", label: "Edit POI", description: "Update existing POI details", category: "Core Features", parent: "poi-data" },
  { key: "poi-delete", label: "Delete POI", description: "Remove POIs from the system", category: "Core Features", parent: "poi-data" },
  { key: "poi-insights", label: "POI Insights", description: "Activity analytics and manager performance feed", category: "Core Features" },
  
  // Operational Data
  { key: "data-pipeline", label: "Data Pipeline", description: "Monitor and run data generation jobs", category: "Operational Data" },
  { key: "navigation-logs", label: "Navigation Logs", description: "View system navigation and routing logs", category: "Operational Data" },
  { key: "service-health", label: "Service Health", description: "Monitor system service status", category: "Operational Data" },
  { key: "gtfs-manage", label: "GTFS Management", description: "Manage General Transit Feed Specification updates", category: "Operational Data" },
  
  // System Administration
  { key: "role-access", label: "Roles & Access", description: "Manage roles, permissions, and security", category: "System Administration" },
  { key: "app-config", label: "App Config", description: "Manage application-wide configurations", category: "System Administration" },
  { key: "user-management", label: "User Management", description: "Manage admin dashboard users", category: "System Administration" },
  { key: "servers", label: "Servers", description: "Monitor backend server infrastructure", category: "System Administration" },
];

const extractedPermissions: Permission[] = navSections
  .filter(section => section.permission && !basePermissions.find(p => p.key === section.permission))
  .map(section => ({
    key: section.permission!,
    label: section.label,
    description: `Access to ${section.label} module`,
    category: "Core Features", // Grouping extracted sidebar modules here
  }));

export const permissions: Permission[] = [...basePermissions, ...extractedPermissions];

export const roles: Role[] = [
  {
    id: "role-001",
    name: "Super Admin",
    description: "Full system access with all permissions. Cannot be modified or deleted.",
    color: "hsl(0 72% 55%)",
    userCount: 2,
    isSystem: true,
    permissions: permissions.map((p) => p.key),
    createdAt: "2023-06-01T00:00:00Z",
    updatedAt: "2024-01-15T10:30:00Z",
  },
  {
    id: "role-002",
    name: "Admin",
    description: "Administrative access to most features. Cannot manage roles or system config.",
    color: "hsl(38 92% 50%)",
    userCount: 5,
    isSystem: true,
    permissions: permissions.filter((p) => !["system.roles", "system.config", "system.audit"].includes(p.key)).map((p) => p.key),
    createdAt: "2023-06-01T00:00:00Z",
    updatedAt: "2024-03-20T14:00:00Z",
  },
  {
    id: "role-003",
    name: "Moderator",
    description: "Can review contributions, manage incidents, and moderate content.",
    color: "hsl(174 72% 46%)",
    userCount: 12,
    isSystem: false,
    permissions: [
      "poi.view", "poi.edit",
      "contrib.view", "contrib.review", "contrib.flag", "contrib.bulk",
      "road-closures-view", "road-closures-edit",
      "incident.view", "incident.manage",
      "announce.view",
      "users.view",
      "system.health",
    ],
    createdAt: "2023-09-15T00:00:00Z",
    updatedAt: "2024-06-10T09:00:00Z",
  },
  {
    id: "role-004",
    name: "Data Operator",
    description: "Manages data pipeline operations, POI imports, and generation jobs.",
    color: "hsl(262 60% 55%)",
    userCount: 4,
    isSystem: false,
    permissions: [
      "poi.view", "poi.create", "poi.edit", "poi.media", "poi.categories",
      "pipeline.view", "pipeline.run", "pipeline.config", "pipeline.logs",
      "system.health",
    ],
    createdAt: "2024-01-10T00:00:00Z",
    updatedAt: "2024-08-05T16:30:00Z",
  },
  {
    id: "role-005",
    name: "Field Reporter",
    description: "Can report incidents, road closures, and submit contributions from the field.",
    color: "hsl(210 70% 55%)",
    userCount: 28,
    isSystem: false,
    permissions: [
      "poi.view",
      "contrib.view",
      "road-closures-view", "road-closures-create",
      "incident.view", "incident.create",
      "announce.view",
    ],
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-09-12T11:00:00Z",
  },
  {
    id: "role-006",
    name: "Viewer",
    description: "Read-only access to dashboards and reports. Cannot modify any data.",
    color: "hsl(215 12% 50%)",
    userCount: 45,
    isSystem: false,
    permissions: [
      "poi.view",
      "contrib.view",
      "road-closures-view",
      "incident.view",
      "announce.view",
      "pipeline.view", "pipeline.logs",
      "users.view",
      "system.health",
    ],
    createdAt: "2024-04-20T00:00:00Z",
    updatedAt: "2024-10-01T08:00:00Z",
  },
];

export const roleAssignments: RoleAssignment[] = [
  { userId: "USR-001", userName: "Sarah Kim", email: "sarah@omn.ae", avatar: "SK", role: "Super Admin", assignedBy: "System", assignedAt: "2023-06-01", lastActive: "2026-03-25T09:15:00Z", region: "Abu Dhabi" },
  { userId: "USR-002", userName: "Ahmed Al Maktoum", email: "ahmed@omn.ae", avatar: "AM", role: "Super Admin", assignedBy: "System", assignedAt: "2023-06-01", lastActive: "2026-03-25T08:45:00Z", region: "Dubai" },
  { userId: "USR-003", userName: "Mike Rodriguez", email: "mike@omn.ae", avatar: "MR", role: "Admin", assignedBy: "Sarah Kim", assignedAt: "2024-01-15", lastActive: "2026-03-24T17:30:00Z", region: "Dubai" },
  { userId: "USR-004", userName: "Fatima Hassan", email: "fatima@omn.ae", avatar: "FH", role: "Admin", assignedBy: "Sarah Kim", assignedAt: "2024-02-20", lastActive: "2026-03-25T07:00:00Z", region: "Sharjah" },
  { userId: "USR-005", userName: "Yuki Tanaka", email: "yuki@omn.ae", avatar: "YT", role: "Moderator", assignedBy: "Ahmed Al Maktoum", assignedAt: "2024-03-10", lastActive: "2026-03-25T10:00:00Z", region: "Abu Dhabi" },
  { userId: "USR-006", userName: "Omar Khalil", email: "omar@omn.ae", avatar: "OK", role: "Moderator", assignedBy: "Mike Rodriguez", assignedAt: "2024-04-05", lastActive: "2026-03-24T14:20:00Z", region: "RAK" },
  { userId: "USR-007", userName: "Priya Sharma", email: "priya@omn.ae", avatar: "PS", role: "Data Operator", assignedBy: "Sarah Kim", assignedAt: "2024-05-12", lastActive: "2026-03-25T06:30:00Z", region: "Dubai" },
  { userId: "USR-008", userName: "Khalid Bin Zayed", email: "khalid@omn.ae", avatar: "KZ", role: "Field Reporter", assignedBy: "Fatima Hassan", assignedAt: "2024-06-01", lastActive: "2026-03-25T11:15:00Z", region: "Al Ain" },
  { userId: "USR-009", userName: "Lina Obeid", email: "lina@omn.ae", avatar: "LO", role: "Field Reporter", assignedBy: "Fatima Hassan", assignedAt: "2024-06-15", lastActive: "2026-03-24T16:45:00Z", region: "Fujairah" },
  { userId: "USR-010", userName: "Raj Patel", email: "raj@omn.ae", avatar: "RP", role: "Viewer", assignedBy: "Mike Rodriguez", assignedAt: "2024-08-01", lastActive: "2026-03-23T12:00:00Z", region: "Dubai" },
  { userId: "USR-011", userName: "Noura Al Suwaidi", email: "noura@omn.ae", avatar: "NS", role: "Moderator", assignedBy: "Ahmed Al Maktoum", assignedAt: "2024-09-10", lastActive: "2026-03-25T09:50:00Z", region: "Abu Dhabi" },
  { userId: "USR-012", userName: "Chen Wei", email: "chen@omn.ae", avatar: "CW", role: "Data Operator", assignedBy: "Sarah Kim", assignedAt: "2024-10-20", lastActive: "2026-03-25T08:10:00Z", region: "Dubai" },
];

export const auditLog = [
  { id: "AUD-001", action: "Role Created", target: "Field Reporter", user: "Sarah Kim", timestamp: "2024-03-01T10:00:00Z", details: "Created new role with 7 permissions" },
  { id: "AUD-002", action: "Permission Added", target: "Moderator", user: "Ahmed Al Maktoum", timestamp: "2024-06-10T09:00:00Z", details: "Added 'contrib.bulk' permission" },
  { id: "AUD-003", action: "User Assigned", target: "Omar Khalil → Moderator", user: "Mike Rodriguez", timestamp: "2024-04-05T14:30:00Z", details: "Assigned Moderator role" },
  { id: "AUD-004", action: "Role Updated", target: "Data Operator", user: "Sarah Kim", timestamp: "2024-08-05T16:30:00Z", details: "Added pipeline.config permission" },
  { id: "AUD-005", action: "User Removed", target: "John Doe → Admin", user: "Fatima Hassan", timestamp: "2025-01-15T11:00:00Z", details: "Removed Admin role assignment" },
  { id: "AUD-006", action: "Role Created", target: "Viewer", user: "Sarah Kim", timestamp: "2024-04-20T08:00:00Z", details: "Created read-only role with 9 permissions" },
  { id: "AUD-007", action: "Permission Revoked", target: "Field Reporter", user: "Ahmed Al Maktoum", timestamp: "2025-06-01T10:00:00Z", details: "Removed 'closure.edit' permission" },
  { id: "AUD-008", action: "User Assigned", target: "Chen Wei → Data Operator", user: "Sarah Kim", timestamp: "2024-10-20T09:15:00Z", details: "Assigned Data Operator role" },
];
