import axios from "axios";

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const AUTHENTICATED_KEY = "isAuthenticated";

export const clearAuthStorage = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTHENTICATED_KEY);
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userPermissions");
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

const subscribeTokenRefresh = (callback: (token: string | null) => void) => {
  refreshSubscribers.push(callback);
};

const notifyTokenRefreshed = (token: string | null) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

  const response = await axios.post(
    `${api.defaults.baseURL}/admin-dashboard/auth/refresh`,
    refreshToken ? { refreshToken } : {},
    { withCredentials: true }
  );

  const nextAccessToken = response.data?.data?.accessToken;
  const nextRefreshToken = response.data?.data?.refreshToken;

  if (!nextAccessToken) {
    throw new Error("Missing access token in refresh response");
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken);
  localStorage.setItem(AUTHENTICATED_KEY, "true");

  if (nextRefreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
  }

  return nextAccessToken;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (
      status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.url?.includes("/admin-dashboard/auth/login") ||
      originalRequest.url?.includes("/admin-dashboard/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          if (!token) {
            reject(error);
            return;
          }

          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      const token = await refreshAccessToken();
      notifyTokenRefreshed(token);
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    } catch (refreshError) {
      notifyTokenRefreshed(null);
      clearAuthStorage();
      window.location.assign("/admapsdashboard/login");
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// Shared base URL for road closures and map events (liveTraffic + events endpoints).
// Set VITE_LIVE_TRAFFIC_BASE_URL in .env to override.
const itcBase = import.meta.env.VITE_LIVE_TRAFFIC_BASE_URL || "https://admaps.maps42.ae/neapi/events";

export const roadClosureApi = axios.create({
  baseURL: `${itcBase}/liveTraffic`,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
  },
});

// Client for the ITC events list/query API (e.g. /events/getAll)
export const itcEventsApi = axios.create({
  baseURL: itcBase,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
  },
});

// Client for the locate API (snap lat/lon to nearest road and get OSM way_id)
export const locateApi = axios.create({
  baseURL: import.meta.env.VITE_FIND_WAY_BASE_URL || "https://admaps.maps42.ae/neapi/itc",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    accept: "application/json",
  },
});
