import { Bell, LogOut, Moon, Search, Sun, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { api, clearAuthStorage } from "@/utils/api";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const [userName, setUserName] = useState(localStorage.getItem("userName") || "Admin");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "Super Admin");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await api.get("/admin-dashboard/auth/me");
        if (data.data.user) {
          const user = data.data.user;
          localStorage.setItem("userName", user.name);
          localStorage.setItem("userRole", user.role);
          setUserName(user.name);
          setUserRole(user.role);
        }
      } catch (err) {
        console.error("Failed to fetch profile", err);
      }
    };

    if (!localStorage.getItem("userName") || localStorage.getItem("userName") === "Admin") {
      fetchProfile();
    }
  }, []);

  const handleLogout = async () => {
    try {
      await api.post("/admin-dashboard/auth/logout", {
        refreshToken: localStorage.getItem("refreshToken"),
      });
    } catch (err) {
      console.error("Failed to logout on server", err);
    }

    clearAuthStorage();
    navigate("/login");
  };
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 w-96 border border-border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search POIs, tickets, users..."
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
        />
        <kbd className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border font-mono shrink-0">⌘K</kbd>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Theme toggle pill */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light" : "Switch to Dark"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-muted hover:border-primary/50 hover:bg-primary/10 transition-all text-muted-foreground hover:text-primary text-xs font-medium"
        >
          {theme === "dark" ? (
            <><Sun className="w-3.5 h-3.5" /><span>Light</span></>
          ) : (
            <><Moon className="w-3.5 h-3.5" /><span>Dark</span></>
          )}
        </button>

        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-card" />
        </button>

        <div className="w-px h-8 bg-border mx-1" />

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 pl-1 rounded-lg hover:bg-muted px-2 py-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="text-sm text-left">
              <div className="font-semibold text-foreground leading-tight">{userName}</div>
              <div className="text-[11px] text-muted-foreground leading-tight capitalize">{userRole}</div>
            </div>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-40 z-50 rounded-xl border border-border bg-card shadow-lg py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
