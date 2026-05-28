import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  serviceHealthApi,
  type ServiceHealthSnapshot,
  type ServiceHealthItem,
} from "@/pages/health/serviceHealthApi";

const POLL_INTERVAL = Number(import.meta.env.VITE_SERVICE_HEALTH_REFRESH_INTERVAL_MS) || 15000;

function playDownAlert() {
  //Notification sound for service down alert
  try {
    const audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.15);
    osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.3);
    osc.type = "square";

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.6);
  } catch {}
}

interface HealthCheckContextValue {
  health: ServiceHealthSnapshot | null;
  isInitialLoading: boolean;
  refreshHealth: () => Promise<void>;
}

const HealthCheckContext = createContext<HealthCheckContextValue | null>(null);

export function HealthCheckProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<ServiceHealthSnapshot | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const prevServicesRef = useRef<ServiceHealthItem[]>([]);
  const isFirstFetch = useRef(true);
  const isFetchingRef = useRef(false);

  const refreshHealth = useCallback(async () => {
    if (isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      const response = await serviceHealthApi.checkAll();
      const snapshot = response.data.data;
      const currentServices = snapshot.services;

      if (!isFirstFetch.current) {
        const prevServices = prevServicesRef.current;

        for (const current of currentServices) {
          if (current.status === "down") {
            const prev = prevServices.find((s) => s.name === current.name);
            if (!prev || prev.status !== "down") {
              playDownAlert();
              toast.error(`${current.name} is DOWN`, {
                description: `Service "${current.name}" is currently down and requires attention.`,
                duration: 6000,
              });
            }
          }
        }

        for (const prev of prevServices) {
          if (prev.status === "down") {
            const current = currentServices.find((s) => s.name === prev.name);
            if (current && current.status !== "down") {
              toast.success(`${prev.name} recovered`, {
                description: `Service "${prev.name}" is now ${current.status}.`,
                duration: 5000,
              });
            }
          }
        }
      } else {
        isFirstFetch.current = false;
      }

      prevServicesRef.current = currentServices;
      setHealth(snapshot);
    } catch (err) {
      console.error("Health check polling failed:", err);
    } finally {
      isFetchingRef.current = false;
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const intervalId = window.setInterval(refreshHealth, POLL_INTERVAL);
    return () => window.clearInterval(intervalId);
  }, [refreshHealth]);

  return (
    <HealthCheckContext.Provider
      value={{ health, isInitialLoading, refreshHealth }}
    >
      {children}
    </HealthCheckContext.Provider>
  );
}

export function useHealthCheck() {
  const ctx = useContext(HealthCheckContext);
  if (!ctx)
    throw new Error("useHealthCheck must be used within HealthCheckProvider");
  return ctx;
}
