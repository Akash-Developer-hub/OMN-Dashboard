import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, Outlet } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Login from "@/pages/Auth/login";
import Dashboard from "@/pages/Dashboard";
import ServiceHealth from "@/pages/health/ServiceHealth";
import DataPipeline from "@/pages/pipeline/DataPipeline";
import ITCValidation from "@/pages/pipeline/ITC_Validation";
import ContributionInbox from "@/pages/contributions/ContributionInbox";
import ContributionAnalytics from "@/pages/contributions/ContributionAnalytics";
import ContributionConfig from "@/pages/contributions/ContributionConfig";
import ContributionSupport from "@/pages/contributions/ContributionSupport";
import ContributionInsights from "@/pages/contributions/insights/ContributionInsights";
import ContributionGeneration from "@/pages/contributions/ContributionGeneration";
import UserManagement from "@/pages/users/UserManagement";
import RolesAccess from "@/pages/roles/RolesAccess";
import AppConfig from "@/pages/config/AppConfig";
import CategoryConfig from "@/pages/config/CategoryConfig";
import HomeScreenConfig from "@/pages/config/HomeScreenConfig";
import FeaturedSections from "@/pages/config/FeaturedSections";
import AttractionConfig from "@/pages/config/AttractionConfig";
import CategoryImages from "@/pages/config/CategoryImages";
import ExploreGuideConfig from "@/pages/config/ExploreGuideConfig";
import AppUpdateConfig from "@/pages/config/AppUpdateConfig";
import PlaceholderPage from "@/pages/PlaceholderPage";
import ServersDashboard from "@/pages/servers/ServersDashboard";
import NotFound from "./pages/NotFound.tsx";
import DataPipelineLog from "./pages/pipeline/DataPipelineLog.tsx";
import PipelineConfig from "./pages/pipeline/PipelineConfig.tsx";

const queryClient = new QueryClient();

const PrivateRoute = () => {
  return localStorage.getItem("isAuthenticated") === "true" ? <Outlet /> : <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/admapsdashboard">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route element={<PrivateRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/contributions/poi" element={<ContributionInbox />} />
              <Route path="/contributions" element={<ContributionInbox />} />
              <Route path="/contributions/analytics" element={<ContributionAnalytics />} />
              <Route path="/contributions/config" element={<ContributionConfig />} />
              <Route path="/contributions/support" element={<ContributionSupport />} />
              <Route path="/contributions/insights" element={<ContributionInsights />} />
              <Route path="/contributions/generation" element={<ContributionGeneration />} />
              <Route path="/pipeline" element={<DataPipeline />} />
              <Route path="/pipeline/validation" element={<ITCValidation />} />
              <Route path='/pipeline/log' element={<DataPipelineLog />} />
              <Route path="/pipeline/config" element={<PipelineConfig />} />
              <Route path="/pipeline/logs" element={<PlaceholderPage title="Generation Logs" description="View previous generation logs and download outputs." />} />
              <Route path="/pipeline/pipeline" element={<PlaceholderPage title="Pipeline" description="Manage and monitor data pipelines." />} />
              <Route path="/roles" element={<RolesAccess />} />
              <Route path="/config" element={<AppConfig />} />
              <Route path="/config/app-update" element={<AppUpdateConfig />} />
              <Route path="/config/category-config" element={<CategoryConfig />} />
              <Route path="/config/home-screen" element={<HomeScreenConfig />} />
              <Route path="/config/featured-sections" element={<FeaturedSections />} />
              <Route path="/config/attraction-config" element={<AttractionConfig />} />
              <Route path="/config/category-images" element={<CategoryImages />} />
              <Route path="/config/explore-guide" element={<ExploreGuideConfig />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/health" element={<ServiceHealth />} />
              <Route path="/servers" element={<ServersDashboard />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
