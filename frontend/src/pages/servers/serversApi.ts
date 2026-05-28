import { api } from "@/utils/api";

export type ServerEnvironment = "development" | "staging" | "production";

export interface Server {
  id: string;
  _id: string;
  name: string;
  environment: ServerEnvironment;
  username: string;
  port: string;
  ipAddress: string;
  location: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateServerPayload {
  name: string;
  environment: ServerEnvironment;
  ipAddress: string;
  username: string;
  port: string;
  location?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateServerPayload {
  name?: string;
  environment?: ServerEnvironment;
  username: string;
  port: string;
  ipAddress?: string;
  location?: string;
  description?: string;
  isActive?: boolean;
}

const BASE = "/admin-dashboard/servers";

export const serversApi = {
  getAll: (params?: {
    environment?: ServerEnvironment;
    isActive?: boolean;
    search?: string;
  }) => api.get<{ data: Server[] }>(BASE, { params }),

  getById: (id: string) => api.get<{ data: Server }>(`${BASE}/${id}`),

  create: (payload: CreateServerPayload) =>
    api.post<{ data: Server }>(BASE, payload),

  update: (id: string, payload: UpdateServerPayload) =>
    api.put<{ data: Server }>(`${BASE}/${id}`, payload),

  setStatus: (id: string, isActive: boolean) =>
    api.patch<{ data: Server }>(`${BASE}/${id}/status`, { isActive }),

  delete: (id: string) => api.delete(`${BASE}/${id}`),
};
