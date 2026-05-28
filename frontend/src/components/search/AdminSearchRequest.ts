const ACCESS_TOKEN =
  import.meta.env.VITE_SEARCH_ACCESS_TOKEN ||
  "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJfaWQiOiJ1c3ItNzV1bXJpa2k0YjY0c3AiLCJ0aWQiOiJ0a24tNzV1bXJpa2k0Y2RlY3ciLCJpYXQiOjE2MDY3MjgwMDl9.ck77ElEO7VR-yEJ0RrSHMp9OdDPvYUAuQqc-eASNk-sah2TX-Rhjvj71B2aFFlC-";

const BASE_URL = import.meta.env.VITE_SEARCH_BASE_URL;

export interface SearchItem {
  primaryText?: string;
  place_name?: string[];
  name?: string[];
  street_name?: string[];
  address?: string | string[];
  info?: string;
  category?: string[];
  houseNumber?: string;
  score?: number;
  sectionType?: string;
  stateVectorForMatches?: Record<string, string>;
  pos?: [number, number];
  osm_id?: string | number;
  place_id?: string;
  [key: string]: unknown;
}

export interface SearchResponse {
  response: Record<string, SearchItem[]>;
  [key: string]: unknown;
}

class AdminSearchRequest {
  private userPos: [number, number];
  private langCode: string;
  private resultLimit: number;
  private setLoading: ((v: boolean) => void) | null;
  private abortController: AbortController;
  private timeout: ReturnType<typeof setTimeout> | null;

  constructor(
    userPos: [number, number] = [54.3773, 24.4539],
    langCode = "en",
    resultLimit = 10,
    setLoading: ((v: boolean) => void) | null = null
  ) {
    this.userPos = userPos;
    this.langCode = langCode;
    this.resultLimit = resultLimit;
    this.setLoading = setLoading;
    this.abortController = new AbortController();
    this.timeout = null;
  }

  setUserPos(userPos: [number, number]) {
    if (userPos && userPos.length === 2) this.userPos = userPos;
  }

  async request(
    searchString: string,
    stateVectorForMatches: Record<string, string[]> | null = null,
    makeFullSearch = false,
    autoComplete = false
  ): Promise<SearchResponse | null> {
    if (this.timeout) clearTimeout(this.timeout);

    return new Promise((resolve) => {
      this.timeout = setTimeout(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();
        this.setLoading?.(true);

        const data: Record<string, unknown> = {
          addDebugInfo: true,
          input: searchString,
          language: this.langCode,
          limitResults: this.resultLimit,
          mapunit: "ITC",
          sections: [],
          userPos: [...this.userPos],
          version: "1.2.0.0",
          makeFullSearch,
          autoComplete,
        };

        if (stateVectorForMatches) {
          data.stateVecForMatches = stateVectorForMatches;
        }

        try {
          const response = await fetch(
            `${BASE_URL}/searchweb?data=${JSON.stringify(data)}&access_token=${ACCESS_TOKEN}`,
            { signal: this.abortController.signal }
          );
          const result = await response.json();
          if (!result?.response) { resolve(result); return; }
          resolve(this.preprocess(result));
        } catch (error) {
          if ((error as Error).name === "AbortError") return;
          console.error("Admin search failed:", error);
          resolve(null);
        } finally {
          this.setLoading?.(false);
        }
      }, 400);
    });
  }

  private preprocess(result: SearchResponse): SearchResponse {
    if (Array.isArray(result.response)) {
      const grouped: Record<string, SearchItem[]> = {};
      (result.response as unknown as SearchItem[]).forEach((item) => {
        const key = item.sectionType || "full_search";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });
      result.response = grouped;
    }

    const { full_search } = result.response;
    if (full_search) {
      const onWaniAddress: SearchItem[] = [];
      full_search.forEach((item) => {
        if (item.houseNumber && item.category?.[0] === "street") onWaniAddress.push(item);
      });
      result.response.full_search = full_search.filter((item) => !onWaniAddress.includes(item));
      result.response.onWaniAddress = onWaniAddress;
    }

    if (!result.response.district) result.response.district = [];
    if (result.response.area) result.response.district.push(...result.response.area);
    if (result.response.city) result.response.district.push(...result.response.city);
    delete result.response.area;
    delete result.response.city;

    result.response.district = result.response.district
      .filter((item, index, self) =>
        index === self.findIndex((t) => t.name?.[0] === item.name?.[0])
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return result;
  }

  destroy() {
    if (this.timeout) clearTimeout(this.timeout);
    this.abortController.abort();
  }
}

export default AdminSearchRequest;
