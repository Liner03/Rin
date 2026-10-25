// ============================================================================
// Shared API Types - Used by both client and server
// ============================================================================

// Common types
export interface ApiResponse<T> {
  data?: T;
  error?: {
    status: number;
    value: string;
  };
}

export interface RequestOptions {
  headers?: Record<string, string>;
  /** Deadline for both receiving headers and reading the response body. */
  timeoutMs?: number;
}

// ============================================================================
// Feed Types
// ============================================================================

export type ContentStatus = "publish" | "draft" | "hidden" | "private";
export type ContentType = "post" | "page" | "attachment";

export interface Feed {
  id: number;
  type: ContentType;
  title: string | null;
  content: string;
  summary?: string;
  slug: string | null;
  status: ContentStatus;
  /** 文章封面图（手动设置，为空时服务端自动提取正文首图） */
  cover?: string | null;
  /** 兼容字段：draft 状态 */
  draft: number;
  /** 兼容字段：hidden 时 list 为 0 */
  listed: number;
  /** 密码保护中（未解锁） */
  locked?: boolean;
  /** 是否设置了密码（编辑页用于清除密码） */
  hasPassword?: boolean;
  uid: number;
  createdAt: string;
  updatedAt: string;
  ai_summary: string;
  ai_summary_status: "idle" | "pending" | "processing" | "completed" | "failed";
  ai_summary_error: string;
  hashtags: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; slug: string | null }>;
  user: {
    avatar: string | null;
    id: number;
    username: string;
  };
  pv: number;
  uv: number;
  top?: number;
}

export interface FeedListResponse {
  size: number;
  data: Array<{
    id: number;
    type: ContentType;
    title: string | null;
    summary: string;
    slug: string | null;
    status: ContentStatus;
    hashtags: Array<{ id: number; name: string }>;
    categories: Array<{ id: number; name: string; slug: string | null }>;
    user: {
      avatar: string | null;
      id: number;
      username: string;
    };
    avatar: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  hasNext: boolean;
}

export interface TimelineItem {
  id: number;
  title: string | null;
  createdAt: string;
}

export interface CreateFeedRequest {
  title: string;
  content: string;
  summary?: string;
  slug?: string;
  /** @deprecated 使用 slug */
  alias?: string;
  status?: ContentStatus;
  draft: boolean;
  listed: boolean;
  password?: string;
  cover?: string;
  createdAt?: string;
  tags: string[];
  categories?: number[];
  top?: number;
}

export interface UpdateFeedRequest {
  title?: string;
  content?: string;
  summary?: string;
  slug?: string;
  /** @deprecated 使用 slug */
  alias?: string;
  listed?: boolean;
  draft?: boolean;
  status?: ContentStatus;
  password?: string;
  cover?: string;
  createdAt?: string;
  tags?: string[];
  categories?: number[];
  top?: number;
}

export interface UnlockRequest {
  password: string;
}

export interface AdjacentFeed {
  id: number;
  title: string | null;
  summary: string;
  hashtags: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; slug: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdjacentFeedResponse {
  previousFeed: AdjacentFeed | null;
  nextFeed: AdjacentFeed | null;
}

// ============================================================================
// Page Types
// ============================================================================

/** 自定义字段值（Typecho fields 风格） */
export type FieldValue = string | number | boolean | object | null;

export interface ContentField {
  name: string;
  type: "str" | "int" | "float" | "json";
  value: FieldValue;
}

export interface Page {
  id: number;
  title: string;
  content: string;
  slug: string | null;
  status: ContentStatus;
  /** 密码保护中（未解锁） */
  locked?: boolean;
  /** 是否设置了密码（编辑页用于清除密码） */
  hasPassword?: boolean;
  parent: number;
  order: number;
  template: string;
  /** 自定义字段 */
  fields?: ContentField[];
  uid: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    avatar: string | null;
    id: number;
    username: string;
  };
}

export interface CreatePageRequest {
  title: string;
  content: string;
  slug?: string;
  status?: ContentStatus;
  password?: string;
  parent?: number;
  order?: number;
  template?: string;
  fields?: ContentField[];
}

export interface UpdatePageRequest {
  title?: string;
  content?: string;
  slug?: string;
  status?: ContentStatus;
  password?: string;
  parent?: number;
  order?: number;
  template?: string;
  fields?: ContentField[];
}

// ============================================================================
// Category Types
// ============================================================================

export interface Category {
  id: number;
  name: string;
  slug: string | null;
  description: string;
  count: number;
  order: number;
  parent: number;
  /** 是否出现在首页文章流（0 = 该分类下文章不进首页） */
  listed: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDetail extends Category {
  feeds: Array<{
    id: number;
    avatar?: string | null;
    title: string | null;
    summary: string;
    slug: string | null;
    hashtags: Array<{ id: number; name: string }>;
    categories: Array<{ id: number; name: string; slug: string | null }>;
    createdAt: string;
    updatedAt: string;
    user: {
      avatar: string | null;
      id: number;
      username: string;
    };
  }>;
}

export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  parent?: number;
  order?: number;
  listed?: boolean;
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string;
  parent?: number;
  order?: number;
  listed?: boolean;
}

// ============================================================================
// User Types
// ============================================================================

export interface UserProfile {
  id: number;
  username: string;
  avatar: string | null;
  permission: boolean;
}

export interface UpdateProfileRequest {
  username?: string;
  avatar?: string | null;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthStatus {
  github: boolean;
  password: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user: UserProfile;
}

// ============================================================================
// Tag Types
// ============================================================================

export interface Tag {
  id: number;
  name: string;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagDetail extends Tag {
  feeds: Array<Feed & { avatar?: string | null }>;
}

// ============================================================================
// Comment Types
// ============================================================================

export interface Comment {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** 登录用户的评论 */
  user?: {
    id: number;
    username: string;
    avatar: string | null;
    permission: number | null;
  } | null;
  /** 游客评论的昵称 */
  guestName?: string;
  /** 游客评论的邮箱 */
  guestEmail?: string;
  /** 游客评论的网站 */
  guestWebsite?: string;
  /** 审核状态 */
  approved: boolean;
}

export interface CreateCommentRequest {
  content: string;
  /** 游客昵称（未登录时必填） */
  guestName?: string;
  /** 游客邮箱（可选） */
  guestEmail?: string;
  /** 游客网站（可选） */
  guestWebsite?: string;
}

// ============================================================================
// Friend Types
// ============================================================================

export interface Friend {
  id: number;
  name: string;
  desc: string | null;
  avatar: string;
  url: string;
  accepted: number;
  sort_order: number | null;
  createdAt: string;
  uid: number;
  updatedAt: string;
  health: string;
}

export interface FriendListResponse {
  friend_list: Friend[];
  apply_list: Friend | null;
}

export interface CreateFriendRequest {
  name: string;
  desc: string;
  avatar: string;
  url: string;
}

export interface UpdateFriendRequest {
  name: string;
  desc: string;
  avatar?: string;
  url: string;
  accepted?: number;
  sort_order?: number;
}

// ============================================================================
// Moment Types
// ============================================================================

export interface Moment {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    username: string;
    avatar: string;
  };
}

export interface CreateMomentRequest {
  content: string;
}

export interface MomentListResponse {
  data: Moment[];
  hasNext: boolean;
}

// ============================================================================
// Config Types
// ============================================================================

export type ConfigType = 'client' | 'server';

export interface ConfigResponse {
  [key: string]: any;
}

// ============================================================================
// AI Config Types
// ============================================================================

export interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  api_key: string;
  api_url: string;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface UploadResponse {
  url: string;
}

// ============================================================================
// Search Types
// ============================================================================

// Uses FeedListResponse

// ============================================================================
// WordPress Import Types
// ============================================================================

export interface WordPressImportResponse {
  success: number;
  skipped: number;
  skippedList: Array<{ title: string; reason: string }>;
}

// ============================================================================
// API Endpoint Paths
// ============================================================================

export const API_PATHS = {
  // Feed
  FEED_LIST: '/api/feed',
  FEED_TIMELINE: '/api/feed/timeline',
  FEED_GET: (id: number | string) => `/api/feed/${id}`,
  FEED_CREATE: '/api/feed',
  FEED_UPDATE: (id: number) => `/api/feed/${id}`,
  FEED_DELETE: (id: number) => `/api/feed/${id}`,
  FEED_ADJACENT: (id: number | string) => `/api/feed/adjacent/${id}`,
  FEED_SET_TOP: (id: number) => `/api/feed/top/${id}`,

  // Auth
  AUTH_STATUS: '/api/auth/status',
  AUTH_LOGIN: '/api/auth/login',

  // User
  USER_PROFILE: '/api/user/profile',
  USER_UPDATE_PROFILE: '/api/user/profile',
  USER_LOGOUT: '/api/user/logout',
  USER_GITHUB: '/api/user/github',

  // Tag
  TAG_LIST: '/api/tag',
  TAG_GET: (name: string) => `/api/tag/${encodeURIComponent(name)}`,

  // Category
  CATEGORY_LIST: '/api/category',
  CATEGORY_GET: (slug: string) => `/api/category/${encodeURIComponent(slug)}`,
  CATEGORY_CREATE: '/api/category',
  CATEGORY_UPDATE: (id: number) => `/api/category/${id}`,
  CATEGORY_DELETE: (id: number) => `/api/category/${id}`,

  // Page
  PAGE_LIST: '/api/page',
  PAGE_GET: (slug: string) => `/api/page/${encodeURIComponent(slug)}`,
  PAGE_CREATE: '/api/page',
  PAGE_UPDATE: (id: number) => `/api/page/${id}`,
  PAGE_DELETE: (id: number) => `/api/page/${id}`,
  PAGE_UNLOCK: (id: number) => `/api/page/${id}/unlock`,
  FEED_UNLOCK: (id: number | string) => `/api/feed/${id}/unlock`,

  // Comment
  COMMENT_LIST: (feedId: number) => `/api/comment/${feedId}`,
  COMMENT_CREATE: (feedId: number) => `/api/comment/${feedId}`,
  COMMENT_DELETE: (id: number) => `/api/comment/${id}`,

  // Friend
  FRIEND_LIST: '/api/friend',
  FRIEND_CREATE: '/api/friend',
  FRIEND_UPDATE: (id: number) => `/api/friend/${id}`,
  FRIEND_DELETE: (id: number) => `/api/friend/${id}`,

  // Moments
  MOMENTS_LIST: '/api/moments',
  MOMENTS_CREATE: '/api/moments',
  MOMENTS_UPDATE: (id: number) => `/api/moments/${id}`,
  MOMENTS_DELETE: (id: number) => `/api/moments/${id}`,

  // Config
  CONFIG_GET: (type: ConfigType) => `/config/${type}`,
  CONFIG_UPDATE: (type: ConfigType) => `/config/${type}`,
  CONFIG_CLEAR_CACHE: '/config/cache',

  // AI Config (deprecated - use CONFIG_GET/CONFIG_UPDATE with 'server' type instead)
  /** @deprecated Use CONFIG_GET('server') instead. AI config is now part of server config. */
  AI_CONFIG_GET: '/ai-config',
  /** @deprecated Use CONFIG_UPDATE('server', {...}) instead. AI config is now part of server config. */
  AI_CONFIG_UPDATE: '/ai-config',

  // Storage
  STORAGE_UPLOAD: '/storage',

  // Favicon
  FAVICON_GET: '/favicon',
  FAVICON_GET_ORIGINAL: '/favicon/original',
  FAVICON_UPLOAD: '/favicon',

  // Search
  SEARCH: (keyword: string) => `/search/${encodeURIComponent(keyword)}`,

  // WordPress
  WP_IMPORT: '/wp',

  // RSS
  RSS_GET: (name: string) => `/${encodeURIComponent(name)}`,
} as const;

export type APIEndpoint = typeof API_PATHS;
