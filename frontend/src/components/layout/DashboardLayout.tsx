import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { HealthCheckProvider } from "@/contexts/HealthCheckContext";

export function DashboardLayout() {
  return (
    <HealthCheckProvider>
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </HealthCheckProvider>
  );
}
