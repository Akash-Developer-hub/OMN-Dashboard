import { api } from "@/utils/api";

export type ServiceHealthStatus = "healthy" | "degraded" | "down";
// export type ServiceHealthStatus = "healthy" | "degraded" | "down" | "hung";

export interface ServiceHealthItem {
  name: string;
  pm2Name?: string;
  type: "pm2" | "api";
  rawStatus: string;
  status: ServiceHealthStatus;
  statusCode?: number;
  responseTimeMs: string;
  lastChecked: string;
  uptime: string;
  pid: number;
  cpu: number;
  memoryMB: string;
  restarts: number;
}

export interface ServiceHealthSnapshot {
  total: number;
  online: number;
  stopped: number;
  checkedAt: string;
  responseTime: string;
  services: ServiceHealthItem[];
}

export type ResponseTimeTrendRange = "24h" | "48h";

export interface ResponseTimeTrendPoint {
  timestamp: string;
  avg: number;
}

export interface ResponseTimeTrendResponse {
  range: string;
  dataPoints: ResponseTimeTrendPoint[];
  peakAvg: number;
  currentAvg: number;
}

export interface Pm2Configuration {
  pm2Name: string;
  server: string;
  serviceDefinition: string;
  createdAt?: string;
  updatedAt?: string;
}

const BASE = "/admin-dashboard/service-health";

export const serviceHealthApi = {
  getCurrent: () => api.get<{ data: ServiceHealthSnapshot }>(BASE),
  
  restart: (serviceName: string) =>
    api.post<{ data: ServiceHealthSnapshot }>(`${BASE}/restart`, {
      serviceName,
    }),
  
  saveConfiguration: (config: {
    server: string;
    serviceDefinition: string;
    type: string;
    pm2Name?: string;
    healthUrl?: string;
    apiUrl?: string;
    apiMethod?: string;
    apiTimeout?: string;
    apiHeaders?: string;
    apiQueryParams?: string;
    apiBody?: string;
    mailTo?: string[];
  }) => api.post(`${BASE}/configure`, config),
  
  checkSingle: (serviceName: string) => api.post<{ data: ServiceHealthSnapshot }>(`${BASE}/check`, { serviceName }),

  checkAll: () => api.post<{ data: ServiceHealthSnapshot }>(`${BASE}/check-all`),

  stop: (serviceName: string) => api.post<{ data: ServiceHealthSnapshot }>(`${BASE}/stop`, { serviceName}),

  editServiceName: (payload: { pm2Name: string; serviceDefinition: string }) =>
    api.post<{ data: ServiceHealthSnapshot }>(`${BASE}/editServiceName`, payload),

  deleteService: (pm2Name: string) =>
    api.post<{ data: ServiceHealthSnapshot }>(`${BASE}/deleteService`, { pm2Name }),
  
  getConfigurationList: () => api.get<{ data: Pm2Configuration[] }>(`${BASE}/configurations`),

  getPm2Names: (server: string) =>
    api.get<{ data: { pm2names: string[] } }>(`${BASE}/pm2-names`, {
      params: { server },
    }),

  getResponseTimeTrends: (serviceName: string, range: ResponseTimeTrendRange) =>
    api.get<{ data: ResponseTimeTrendResponse }>(`${BASE}/response-time-trends`, {
      params: { serviceName, range },
    }),
};
