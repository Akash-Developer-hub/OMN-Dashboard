import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, X, MapPin, Map, Building2, Loader2, Sparkles,
  ArrowUpRight, UtensilsCrossed, Coffee, Hotel, ShoppingBag,
  Fuel, ParkingCircle, Landmark, Waves, Plane, Hospital, Banknote,
} from "lucide-react";
import AdminSearchRequest, { SearchItem, SearchResponse } from "./AdminSearchRequest";

const SECTION_ORDER = [
  "fast_match", "coords", "full_search", "state", "city",
  "street", "area", "postcode", "district",
];

const SECTION_LABELS: Record<string, string> = {
  fast_match: "Suggestions", coords: "Coordinates", full_search: "Places",
  state: "Emirate", city: "Cities", street: "Streets",
  area: "Areas", postcode: "Postcodes", district: "Districts",
};

function getCategoryIcon(cat = "") {
  const c = cat.toLowerCase();
  if (c.includes("restaurant") || c.includes("food")) return UtensilsCrossed;
  if (c.includes("cafe") || c.includes("coffee")) return Coffee;
  if (c.includes("hotel")) return Hotel;
  if (c.includes("shop") || c.includes("mall")) return ShoppingBag;
  if (c.includes("gas") || c.includes("fuel")) return Fuel;
  if (c.includes("parking")) return ParkingCircle;
  if (c.includes("beach")) return Waves;
  if (c.includes("airport")) return Plane;
  if (c.includes("hospital") || c.includes("pharmacy")) return Hospital;
  if (c.includes("bank")) return Banknote;
  if (c.includes("street")) return Map;
  if (c.includes("district") || c.includes("area") || c.includes("city") || c.includes("state")) return Building2;
  return Landmark;
}

function getItemLabel(item: SearchItem): string {
  return (
    item?.primaryText ||
    item?.place_name?.[0] ||
    item?.name?.[0] ||
    item?.street_name?.[0] ||
    ""
  );
}

function getItemAddress(item: SearchItem): string {
  if (Array.isArray(item?.address)) return (item.address as string[]).filter(Boolean).join(", ");
  return (item?.info || item?.address || "") as string;
}

function highlightMatch(text: string, term: string) {
  if (!text || !term) return text;
  const escaped = term.replace(/[[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  let regex: RegExp;
  try { regex = new RegExp(`(${escaped})`, "gi"); } catch { return text; }
  const parts = String(text).split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <span key={i} className="font-bold text-foreground">{part}</span> : part
  );
}

function LoadingResults() {
  return (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching places…
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-2.5 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SuggestionRow({ item, searchTerm, onClick }: { item: SearchItem; searchTerm: string; onClick: () => void }) {
  const label = getItemLabel(item);
  return (
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors group">
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate leading-tight">{highlightMatch(label, searchTerm)}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Suggested search</p>
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function ResultRow({ item, sectionType, searchTerm, onClick }: { item: SearchItem; sectionType: string; searchTerm: string; onClick: () => void }) {
  const label = getItemLabel(item);
  const address = getItemAddress(item);
  const Icon = getCategoryIcon(item?.category?.[0] || sectionType);
  return (
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors">
      <div className="mt-0.5 w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate leading-tight capitalize">{highlightMatch(label, searchTerm)}</p>
        {address && <p className="text-[11px] text-muted-foreground truncate mt-0.5 capitalize">{address}</p>}
      </div>
      <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 px-3 py-1.5 bg-muted/70 border-b border-border backdrop-blur-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

interface POISearchBarProps {
  onSearchChange: (value: string) => void;
  onPlaceSelect?: (item: SearchItem) => void;
  placeholder?: string;
  /**
   * When true, clicking a fast_match suggestion immediately fires a full search
   * and calls onPlaceSelect with the first result that has coordinates (pos).
   */
  autoSelectFirst?: boolean;
}

export default function POISearchBar({
  onSearchChange,
  onPlaceSelect,
  placeholder = "Search locations…",
  autoSelectFirst = false,
}: POISearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [stateVecForMatches, setStateVecForMatches] = useState<Record<string, string[]> | null>(null);
  const [stateVecAdded, setStateVecAdded] = useState(false);
  const [tagLabel, setTagLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reqRef = useRef<AdminSearchRequest | null>(null);
  const stateVecRef = useRef<Record<string, string[]> | null>(null);
  const autoSelectFirstRef = useRef(autoSelectFirst);
  autoSelectFirstRef.current = autoSelectFirst;
  const onPlaceSelectRef = useRef(onPlaceSelect);
  onPlaceSelectRef.current = onPlaceSelect;

  useEffect(() => { stateVecRef.current = stateVecForMatches; }, [stateVecForMatches]);

  useEffect(() => {
    reqRef.current = new AdminSearchRequest([54.3773, 24.4539], "en", 10, setLoading);
    return () => reqRef.current?.destroy();
  }, []);

  const doSearch = useCallback(async (
    makeFullSearch = false,
    removeInputAfterSearch = false,
    fromSuggestion = false,
  ) => {
    const autoComplete =
      (!stateVecRef.current || Object.keys(stateVecRef.current).length === 0) && query.length > 2;
    const response = await reqRef.current!.request(query, stateVecRef.current, makeFullSearch, autoComplete);
    setStateVecAdded(false);
    if (!response?.response) return;
    setSearchResponse(response);
    setOpen(true);
    if (removeInputAfterSearch) setQuery("");

    // Auto-fly: after suggestion click triggers full search, pick first result with pos and fly
    if (fromSuggestion && autoSelectFirstRef.current && onPlaceSelectRef.current) {
      const allItems = Object.values(response.response).flat() as SearchItem[];
      const first = allItems.find((item) => Array.isArray(item.pos) && item.pos.length >= 2);
      if (first) {
        onPlaceSelectRef.current(first);
        setOpen(false);
      }
    }
  }, [query]);

  useEffect(() => {
    if (!query.trim() && !stateVecRef.current) {
      setSearchResponse(null);
      setOpen(false);
      return;
    }
    if (query.length < 1 && !stateVecRef.current) return;
    doSearch(false, stateVecAdded && query.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, stateVecForMatches, stateVecAdded]);

  const handleSuggestionClick = useCallback((item: SearchItem) => {
    const itemStateVec = item.stateVectorForMatches;
    if (!itemStateVec) return;
    const label = getItemLabel(item);
    setTagLabel(label);
    setStateVecAdded(true);
    setStateVecForMatches((prev) => {
      const next = { ...(prev || {}) };
      Object.entries(itemStateVec).forEach(([key, value]) => {
        if (next[key]) {
          if (!next[key].includes(value)) next[key] = [...next[key], value];
        } else {
          next[key] = [value];
        }
      });
      return next;
    });
    // When autoSelectFirst: immediately fire a full search to get coordinates and fly
    if (autoSelectFirstRef.current) {
      setTimeout(() => doSearch(true, false, true), 50);
    }
  }, [doSearch]);

  const handleResultClick = useCallback((item: SearchItem) => {
    const label = getItemLabel(item);
    setOpen(false);
    setQuery(label);
    onSearchChange(label);
    onPlaceSelect?.(item);
  }, [onSearchChange, onPlaceSelect]);

  const handleRemoveTag = useCallback(() => {
    setStateVecForMatches(null);
    setTagLabel("");
    setStateVecAdded(false);
    if (!query.trim()) { setSearchResponse(null); setOpen(false); }
  }, [query]);

  const handleClear = () => {
    setQuery("");
    setSearchResponse(null);
    setStateVecForMatches(null);
    setTagLabel("");
    setStateVecAdded(false);
    setOpen(false);
    onSearchChange("");
    inputRef.current?.focus();
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const response = useMemo(() => searchResponse?.response || {}, [searchResponse]);
  const isTypingMode = !stateVecForMatches && query.length <= 4;

  const suggestionSections = useMemo(() =>
    SECTION_ORDER.filter((k) => k in response && (k === "fast_match" || k === "suggestion")),
    [response]
  );

  const resultSections = useMemo(() =>
    SECTION_ORDER.filter((k) => k in response && k !== "fast_match" && k !== "suggestion"),
    [response]
  );

  const hasSuggestions = useMemo(() =>
    suggestionSections.some((s) => Array.isArray(response[s]) && response[s].length > 0),
    [suggestionSections, response]
  );

  const hasResults = useMemo(() =>
    resultSections.some((s) => Array.isArray(response[s]) && response[s].length > 0),
    [resultSections, response]
  );

  const totalCount = useMemo(() =>
    resultSections.reduce((sum, s) => sum + (response[s]?.length || 0), 0),
    [resultSections, response]
  );

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <div className={`flex items-center gap-2 px-3 min-h-[40px] rounded-lg border bg-card transition-all ${
        focused ? "border-ring ring-2 ring-ring/25" : "border-border hover:border-ring/50"
      }`}>
        {loading
          ? <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />
          : <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onSearchChange(e.target.value); if (e.target.value) setOpen(true); }}
          onFocus={() => { setFocused(true); if (searchResponse && isTypingMode) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
            if (e.key === "Enter" && query.trim()) doSearch(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground py-2"
        />
        {(query || tagLabel) && (
          <button onClick={handleClear} tabIndex={-1} aria-label="Clear"
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Typing mode: suggestion dropdown */}
      {isTypingMode && open && focused && (
        <div className="absolute z-[9999] mt-1.5 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          {loading ? (
            <LoadingResults />
          ) : query.trim().length < 2 ? (
            <div className="px-4 py-5 text-center">
              <Search className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Keep typing to see suggestions…</p>
            </div>
          ) : !hasSuggestions && !hasResults ? (
            <div className="px-4 py-6 text-center">
              <MapPin className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No results for <span className="font-medium text-foreground">"{query}"</span></p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {suggestionSections.map((sectionKey) => {
                const items = response[sectionKey];
                if (!Array.isArray(items) || items.length === 0) return null;
                return (
                  <div key={sectionKey}>
                    <SectionHeader label={SECTION_LABELS[sectionKey] || sectionKey} />
                    {items.map((item, i) => (
                      <SuggestionRow key={i} item={item} searchTerm={query} onClick={() => handleSuggestionClick(item)} />
                    ))}
                  </div>
                );
              })}
              {!hasSuggestions && resultSections.map((sectionKey) => {
                const items = response[sectionKey];
                if (!Array.isArray(items) || items.length === 0) return null;
                return (
                  <div key={sectionKey}>
                    <SectionHeader label={SECTION_LABELS[sectionKey] || sectionKey} />
                    {items.map((item, i) => (
                      <ResultRow key={i} item={item} sectionType={sectionKey} searchTerm={query} onClick={() => handleResultClick(item)} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tag mode: inline results panel */}
      {!isTypingMode && open && (
        <div className="absolute z-[9999] mt-1.5 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          {stateVecForMatches && (
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/40">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-primary flex-1 truncate">{tagLabel}</span>
              <button onClick={handleRemoveTag} aria-label="Remove tag"
                className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {loading ? (
            <LoadingResults />
          ) : !hasResults ? (
            <div className="px-4 py-6 text-center">
              <MapPin className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No results found</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {resultSections.map((sectionKey) => {
                const items = response[sectionKey];
                if (!Array.isArray(items) || items.length === 0) return null;
                return (
                  <div key={sectionKey}>
                    <SectionHeader label={SECTION_LABELS[sectionKey] || sectionKey} />
                    {items.map((item, i) => (
                      <ResultRow key={i} item={item} sectionType={sectionKey} searchTerm={query} onClick={() => handleResultClick(item)} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {hasResults && (
            <div className="px-3 py-1.5 border-t border-border bg-muted/30">
              <span className="text-[10px] text-muted-foreground">{totalCount} result{totalCount !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
