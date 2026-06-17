import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronSub,
} from "lucide-react";
import omnLogo from "@/Logo.png";
import { navSections, type NavSection } from "./navSections.ts";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(["POI"]);
  const location = useLocation();
  const navigate = useNavigate();

  const userPermissions = JSON.parse(localStorage.getItem("userPermissions") || "[]");
  const userRole = localStorage.getItem("userRole") || "";
  const normalizedRole = userRole.toLowerCase().replace(/\s+/g, '');
  const isSuperAdmin = normalizedRole === "superadmin" || normalizedRole === "admin";

  const filteredNavSections = navSections.filter(section =>
    isSuperAdmin || !section.permission || userPermissions.includes(section.permission)
  );

  const filteredChildren = (section: NavSection) =>
    section.children?.filter((child) =>
      isSuperAdmin || !child.permission || userPermissions.includes(child.permission)
    ) ?? [];

  const toggleSection = (label: string) => {
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const getPathname = (path: string) => path.split("?")[0];
  const isActive = (path: string) => location.pathname === getPathname(path);
  const isSectionActive = (section: NavSection) => {
    if (isActive(section.path)) return true;
    return section.children?.some((c) => isActive(c.path)) ?? false;
  };

  return (
    <aside
      className={`h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${collapsed ? "w-16" : "w-64"
        }`}
    >
      {/* Logo + Collapse toggle */}
      <div
        className={`relative h-16 flex items-center border-b border-sidebar-border `}
      >
        {!collapsed ? (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <div className="w-20 h-14 items-center justify-center shadow-sm">
              <img src={omnLogo} alt="OMN" className="w-full h-full object-contain rounded-lg" />
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg p-1 flex items-center justify-center shadow-sm">
            <img src={omnLogo} alt="OMN" className="w-full h-full object-contain rounded-lg" />
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`${collapsed ? "ml-auto" : "absolute right-4 top-1/2 -translate-y-1/2"} h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {filteredNavSections.map((section) => {
          const Icon = section.icon;
          const active = isSectionActive(section);
          const open = openSections.includes(section.label);
          const visibleChildren = filteredChildren(section);
          const hasChildren = visibleChildren.length > 0;

          return (
            <div key={section.label}>
              <button
                onClick={() => {
                  if (hasChildren) {
                    toggleSection(section.label);
                    if (!open) navigate(visibleChildren[0].path);
                  } else {
                    navigate(section.path);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? section.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{section.label}</span>
                    {hasChildren && (
                      <span className="text-muted-foreground">
                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronSub className="w-3.5 h-3.5" />}
                      </span>
                    )}
                  </>
                )}
              </button>

              {/* Children */}
              {hasChildren && open && !collapsed && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                  {visibleChildren.map((child) => (
                    <button
                      key={child.path}
                      onClick={() => navigate(child.path)}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${isActive(child.path)
                        ? "text-primary bg-sidebar-accent"
                        : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        }`}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
