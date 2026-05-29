import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import omnLogo from "@/Logo.png";

const sidebarRouteOrder: Array<{ permission: string; path: string }> = [
  { permission: "data-pipeline", path: "/pipeline" },
  { permission: "contributions", path: "/contributions" },
  { permission: "role-access", path: "/roles" },
  { permission: "app-config", path: "/config" },
  { permission: "user-management", path: "/users" },
  { permission: "service-health", path: "/health" },
  { permission: "servers", path: "/servers" },
];

const getFirstSidebarPath = (userRole: string, permissions: string[]): string => {
  const normalizedRole = userRole.toLowerCase().replace(/\s+/g, "");
  const isSuperAdmin = normalizedRole === "superadmin" || normalizedRole === "admin";

  if (isSuperAdmin) {
    return sidebarRouteOrder[0].path;
  }

  const firstAllowedRoute = sidebarRouteOrder.find((item) => permissions.includes(item.permission));
  return firstAllowedRoute?.path ?? sidebarRouteOrder[0].path;
};

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin-dashboard/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Invalid email or password.");
        return;
      }
      localStorage.setItem("accessToken", data.data.accessToken);
      localStorage.setItem("refreshToken", data.data.refreshToken);
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userRole", data.data.user.role);
      localStorage.setItem("userName", data.data.user.name);
      localStorage.setItem("userEmail", data.data.user.email);
      
      const permissions = data.data.user.permissions || [];
      if (data.data.user.permissions) {
        localStorage.setItem("userPermissions", JSON.stringify(permissions));
      }

      toast({
        title: "Welcome back!",
        description: `Successfully logged in as ${data.data.user.name}`,
      });
    

      navigate(getFirstSidebarPath(data.data.user.role || "", permissions));
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <img src={omnLogo} alt="OMN" className="h-20 mx-auto mb-2" />
          <CardTitle className="text-xl">Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
