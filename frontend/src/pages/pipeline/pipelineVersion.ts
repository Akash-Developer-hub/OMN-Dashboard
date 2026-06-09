const PIPELINE_VERSION_STORAGE_KEY = "pipeline_version";

export const getStoredPipelineVersion = () => localStorage.getItem(PIPELINE_VERSION_STORAGE_KEY) || "";

export const storeSelectedPipelineVersion = (version: string) => {
  const cleanVersion = String(version || "").trim();
  if (!cleanVersion) return "";
  localStorage.setItem(PIPELINE_VERSION_STORAGE_KEY, cleanVersion);
  return cleanVersion;
};

export const resolveSelectedPipelineVersion = (searchParams: URLSearchParams, fallback = "") => {
  return (
    searchParams.get("version")?.trim() ||
    getStoredPipelineVersion() ||
    String(fallback || "").trim()
  );
};
