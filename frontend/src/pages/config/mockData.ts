export type AppVersion = {
  version: string;
  versionCode: number;
  releasedAt: string;
  platform: "all" | "android" | "ios";
  releaseNotes: string;
  activeUsers: number;
  adoptionPercent: number;
  status: "current" | "supported" | "deprecated" | "unsupported";
};

export type ForceUpdateRule = {
  id: string;
  platform: "android" | "ios";
  minVersionCode: number;
  minVersionName: string;
  title: string;
  message: string;
  updateUrl: string;
  isBlocking: boolean;
  enabled: boolean;
  updatedAt: string;
};

export type HomeContentBlock = {
  id: string;
  type: "hero_banner" | "promo_card" | "quick_links" | "featured_pois" | "announcement_bar" | "carousel";
  title: string;
  enabled: boolean;
  order: number;
  content: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
};

export const appVersions: AppVersion[] = [
  { version: "3.4.2", versionCode: 342, releasedAt: "2026-03-20T10:00:00Z", platform: "all", releaseNotes: "Bug fixes, improved map rendering, new POI categories", activeUsers: 18420, adoptionPercent: 62.4, status: "current" },
  { version: "3.4.1", versionCode: 341, releasedAt: "2026-03-05T10:00:00Z", platform: "all", releaseNotes: "Performance improvements, fixed crash on route calculation", activeUsers: 5830, adoptionPercent: 19.7, status: "supported" },
  { version: "3.4.0", versionCode: 340, releasedAt: "2026-02-15T10:00:00Z", platform: "all", releaseNotes: "New incident reporting UI, Arabic language improvements", activeUsers: 2910, adoptionPercent: 9.9, status: "supported" },
  { version: "3.3.5", versionCode: 335, releasedAt: "2026-01-20T10:00:00Z", platform: "all", releaseNotes: "Road closure alerts, minor UI updates", activeUsers: 1240, adoptionPercent: 4.2, status: "deprecated" },
  { version: "3.3.0", versionCode: 330, releasedAt: "2025-12-01T10:00:00Z", platform: "all", releaseNotes: "Major map engine update, offline mode improvements", activeUsers: 680, adoptionPercent: 2.3, status: "deprecated" },
  { version: "3.2.1", versionCode: 321, releasedAt: "2025-10-10T10:00:00Z", platform: "all", releaseNotes: "Security patches, API compatibility fixes", activeUsers: 310, adoptionPercent: 1.1, status: "unsupported" },
  { version: "3.1.0", versionCode: 310, releasedAt: "2025-07-15T10:00:00Z", platform: "all", releaseNotes: "Initial public release with core navigation features", activeUsers: 120, adoptionPercent: 0.4, status: "unsupported" },
];

export const forceUpdateRules: ForceUpdateRule[] = [
  {
    id: "fu-001",
    platform: "android",
    minVersionCode: 340,
    minVersionName: "3.4.0",
    title: "Update Required",
    message: "Please update Offline Map Navigation to the latest version for security improvements and new features.",
    updateUrl: "https://play.google.com/store/apps/details?id=ae.omn.app",
    isBlocking: true,
    enabled: true,
    updatedAt: "2026-03-15T08:00:00Z",
  },
  {
    id: "fu-002",
    platform: "ios",
    minVersionCode: 340,
    minVersionName: "3.4.0",
    title: "Update Required",
    message: "A new version of Offline Map Navigation is available. Please update to continue using the app.",
    updateUrl: "https://apps.apple.com/ae/app/omn/id123456789",
    isBlocking: true,
    enabled: true,
    updatedAt: "2026-03-15T08:00:00Z",
  },
];

export const homeContentBlocks: HomeContentBlock[] = [
  {
    id: "hc-001",
    type: "hero_banner",
    title: "Hero Banner",
    enabled: true,
    order: 1,
    content: {
      heading_en: "Explore the UAE Like Never Before",
      heading_ar: "استكشف الإمارات كما لم تفعل من قبل",
      subtitle_en: "Real-time navigation, incidents, and road closures",
      subtitle_ar: "الملاحة في الوقت الفعلي والحوادث وإغلاق الطرق",
      image_url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200",
      cta_text_en: "Start Navigating",
      cta_text_ar: "ابدأ الملاحة",
      cta_link: "/navigate",
      bg_color: "#0A1628",
    },
    updatedAt: "2026-03-18T14:00:00Z",
    updatedBy: "Sarah Kim",
  },
  {
    id: "hc-002",
    type: "announcement_bar",
    title: "Top Announcement Bar",
    enabled: true,
    order: 2,
    content: {
      text_en: "🚧 Major road works on Sheikh Zayed Road - Check alternative routes",
      text_ar: "🚧 أعمال طرق رئيسية على شارع الشيخ زايد - تحقق من الطرق البديلة",
      link: "/road-closures",
      bg_color: "#F59E0B",
      text_color: "#000000",
    },
    updatedAt: "2026-03-24T09:00:00Z",
    updatedBy: "Ahmed Al Maktoum",
  },
  {
    id: "hc-003",
    type: "promo_card",
    title: "Ramadan Promo Card",
    enabled: true,
    order: 3,
    content: {
      title_en: "Ramadan Navigation Guide",
      title_ar: "دليل الملاحة في رمضان",
      description_en: "Find Iftar spots, mosque parking, and night prayer routes across all 7 emirates.",
      description_ar: "اعثر على أماكن الإفطار ومواقف المساجد وطرق صلاة الليل في جميع الإمارات السبع.",
      image_url: "https://images.unsplash.com/photo-1564769625905-50e93615e769?w=600",
      cta_text_en: "Explore",
      cta_text_ar: "استكشف",
      cta_link: "/poi?category=ramadan",
    },
    updatedAt: "2026-03-10T11:00:00Z",
    updatedBy: "Fatima Hassan",
  },
  {
    id: "hc-004",
    type: "quick_links",
    title: "Quick Action Links",
    enabled: true,
    order: 4,
    content: {
      link1_label_en: "Report Incident",
      link1_label_ar: "الإبلاغ عن حادث",
      link1_icon: "alert-triangle",
      link1_url: "/incidents/report",
      link2_label_en: "Nearby Fuel",
      link2_label_ar: "وقود قريب",
      link2_icon: "fuel",
      link2_url: "/poi?category=fuel",
      link3_label_en: "Road Closures",
      link3_label_ar: "إغلاق الطرق",
      link3_icon: "construction",
      link3_url: "/road-closures",
      link4_label_en: "EV Charging",
      link4_label_ar: "شحن كهربائي",
      link4_icon: "zap",
      link4_url: "/poi?category=ev-charging",
    },
    updatedAt: "2026-02-28T16:00:00Z",
    updatedBy: "Mike Rodriguez",
  },
  {
    id: "hc-005",
    type: "featured_pois",
    title: "Featured Places",
    enabled: true,
    order: 5,
    content: {
      heading_en: "Popular This Week",
      heading_ar: "الأكثر شعبية هذا الأسبوع",
      poi_ids: "node/1001,node/1002,node/1003,node/1004",
      display_mode: "horizontal_scroll",
      max_items: "8",
    },
    updatedAt: "2026-03-22T10:00:00Z",
    updatedBy: "Yuki Tanaka",
  },
  {
    id: "hc-006",
    type: "carousel",
    title: "Discover Carousel",
    enabled: false,
    order: 6,
    content: {
      slide1_image: "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=800",
      slide1_title_en: "Dubai Creek Harbour",
      slide1_title_ar: "ميناء خور دبي",
      slide2_image: "https://images.unsplash.com/photo-1547483238-2cbf881a559f?w=800",
      slide2_title_en: "Louvre Abu Dhabi",
      slide2_title_ar: "لوفر أبوظبي",
      slide3_image: "https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800",
      slide3_title_en: "Hatta Mountains",
      slide3_title_ar: "جبال حتا",
      auto_rotate: "true",
      interval_ms: "5000",
    },
    updatedAt: "2026-03-01T12:00:00Z",
    updatedBy: "Priya Sharma",
  },
];
