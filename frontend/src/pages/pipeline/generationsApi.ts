// import { api } from "@/utils/api";
// import type { Server } from "@/pages/servers/serversApi";

// export type GenerationService = "search" | "routing" | "tile";
// export type FileType = "sqlite" | "osm";
// export type GenerationStatus =
//   | "generating"
//   | "generation_completed"
//   | "staging"
//   | "production"
//   | "failed";

// export interface CopyFromConfig {
//   sourceServerId: string;
//   sourceFilePath: string;
// }

// export interface ContributionConfig {
//   apiEndpoint: string;
//   gtfsIncluded: boolean;
//   gtfsServerId?: string;
//   gtfsFilePath?: string;
// }

// export interface RoutingGtfsConfig {
//   gtfsFilePath: string;
// }

// export interface ServiceConfig {
//   service: GenerationService;
//   targetServerId: string;
//   version?: string;
//   copyFrom?: CopyFromConfig | null;
//   contributionConfig?: ContributionConfig | null;
//   routingGtfsConfig?: RoutingGtfsConfig | null;
// }

// export interface TimelineEntry {
//   status: GenerationStatus;
//   timestamp: number;
//   note?: string;
//   actorId?: string;
//   serverId?: string;
// }

// export interface GenerationRequest {
//   id: string;
//   _id: string;
//   runId: string;
//   name: string;
//   services: ServiceConfig[];
//   status: GenerationStatus;
//   timeline: TimelineEntry[];
//   stagingServerId?: string | null;
//   createdAt: number;
//   updatedAt: number;
// }

// export interface CreateGenerationPayload {
//   services: ServiceConfig[];
// }

// export interface TransitionPayload {
//   status: GenerationStatus;
//   serverId?: string;
//   note?: string;
// }

// export interface ContributionGenerationPayload {
//   targetServerId: string;
//   pythonScriptPath: string;
//   ITCSearchDatabasePath: string;
//   mode: string;
//   api: string;
//   contributionIds: string[];
// }

// const BASE = "/admin-dashboard/generations";

// export const generationsApi = {
//   getAvailableServers: (opts?: { excludeProduction?: boolean; onlyProduction?: boolean }) =>
//     api.get<{ data: Server[] }>(`${BASE}/servers`, {
//       params: {
//         ...(opts?.excludeProduction ? { excludeProduction: "true" } : {}),
//         ...(opts?.onlyProduction ? { onlyProduction: "true" } : {}),
//       },
//     }),

//   create: (payload: CreateGenerationPayload) =>
//     api.post<{ data: GenerationRequest }>(BASE, payload),

//   getAll: (params?: { status?: GenerationStatus; page?: number; limit?: number }) =>
//     api.get<{ data: GenerationRequest[]; meta: { total: number } }>(BASE, { params }),

//   getById: (id: string) =>
//     api.get<{ data: GenerationRequest }>(`${BASE}/${id}`),

//   transition: (id: string, payload: TransitionPayload) =>
//     api.patch<{ data: GenerationRequest }>(`${BASE}/${id}/transition`, payload),

//   startContributionGeneration: (payload: ContributionGenerationPayload) =>
//     api.post<{ data: GenerationRequest }>(`${BASE}/contribution`, payload),
// };
