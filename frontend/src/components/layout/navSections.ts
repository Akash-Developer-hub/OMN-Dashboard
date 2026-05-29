import {
  GitPullRequest,
  Database,
  Shield,
  Settings,
  Users,
  Activity,
  ServerIcon,
} from "lucide-react";

export type NavChild = {
  label: string;
  path: string;
  permission?: string;
};

export type NavSection = {
  label: string;
  icon: typeof GitPullRequest;
  path: string;
  permission?: string;
  children?: NavChild[];
};

export const navSections: NavSection[] = [
  {
    label: "Contributions",
    icon: GitPullRequest,
    path: "/contributions",
    permission: "contributions",
    children: [
      { label: "Insights", path: "/contributions/insights" },
      { label: "POI Contributions", path: "/contributions/poi" },
      { label: "Contribution Generation", path: "/contributions/generation" },
      { label: "Contribution Config", path: "/contributions/config" },
      { label: "Contribution Support", path: "/contributions/support" },
    ],
  },
  {
    label: "Data Pipeline",
    icon: Database,
    path: "/pipeline",
    permission: "data-pipeline",
    children: [
      { label: "Download", path: "/pipeline/download" },
      { label: "Generation", path: "/pipeline" },
      { label: "Preview Generation", path: "/pipeline/preview" },
      { label: "Generation Logs", path: "/pipeline/log" },
      { label: "Configuration", path: "/pipeline/config" },
    ],
  },
  {
    label: "Roles & Access",
    icon: Shield,
    path: "/roles",
    permission: "role-access",
  },
  {
    label: "App Config",
    icon: Settings,
    path: "/config",
    permission: "app-config",
    children: [{ label: "App Update", path: "/config/app-update" }],
  },
  {
    label: "User Management",
    icon: Users,
    path: "/users",
    permission: "user-management",
  },
  {
    label: "Service Health",
    icon: Activity,
    path: "/health",
    permission: "service-health",
  },
  {
    label: "Servers",
    icon: ServerIcon,
    path: "/servers",
    permission: "servers",
  },
];
