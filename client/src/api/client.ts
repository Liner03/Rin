// API Client for Rin - Type-safe HTTP client to replace Eden
// This client provides a clean, type-safe interface for all backend API endpoints

import { getAuthToken } from "../utils/auth";
import { endpoint } from "../config";
import { isRecord, PublicContentCache } from "./public-content-cache";
import { shouldResetFollowingMoments } from "./moment-pagination";

// Import shared types
import type {
  ApiResponse,
  RequestOptions,
  Feed,
  FeedListResponse,
  TimelineItem,
  CreateFeedRequest,
  UpdateFeedRequest,
  AdjacentFeedResponse,
  UserProfile,
  UpdateProfileRequest,
  Tag,
  TagDetail,
  Category,
  CategoryDetail,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  Page,
  PageNavigationItem,
  CreatePageRequest,
  UpdatePageRequest,
  Comment,
  CreateCommentRequest,
  Friend,
  FriendListResponse,
  CreateFriendRequest,
  UpdateFriendRequest,
  Moment,
  MomentListResponse,
  CreateMomentRequest,
  ConfigType,
  ConfigResponse,
  AIConfig,
  UploadResponse,
  AuthStatus,
  LoginRequest,
  LoginResponse,
} from "@rin/api";

export interface SettingsConfigResponse {
  clientConfig: ConfigResponse;
  serverConfig: ConfigResponse;
}

export interface ConfigHealthItem {
  id: string;
  title: {
    key: string;
    values?: Record<string, string | number | boolean>;
  };
  status: "success" | "warning" | "danger";
  configured: boolean;
  impact: {
    key: string;
    values?: Record<string, string | number | boolean>;
  };
  summary: {
    key: string;
    values?: Record<string, string | number | boolean>;
  };
  suggestion?: {
    key: string;
    values?: Record<string, string | number | boolean>;
  };
  details?: Array<{
    key: string;
    values?: Record<string, string | number | boolean>;
  }>;
}

export interface ConfigHealthResponse {
  generatedAt: string;
  summary: Record<"success" | "warning" | "danger", number>;
  items: ConfigHealthItem[];
}

export interface QueueStatusItem {
  id: number;
  title: string | null;
  aiSummaryStatus: "idle" | "pending" | "processing" | "completed" | "failed";
  aiSummaryError: string;
  updatedAt: string;
  createdAt: string;
}

export interface QueueStatusResponse {
  queueConfigured: boolean;
  generatedAt: string;
  summary: Record<"idle" | "pending" | "processing" | "completed" | "failed", number>;
  items: QueueStatusItem[];
}

export interface QueueTaskActionResponse {
  success: boolean;
}

export interface CompatTasksResponse {
  generatedAt: string;
  aiSummary: {
    enabled: boolean;
    queueConfigured: boolean;
    eligible: number;
    forceEligible: number;
  };
  blurhash: {
    eligible: number;
  };
}

export interface CompatAISummaryActionResponse {
  queued: number;
  skipped: number;
  forced: boolean;
}

export interface CompatBlurhashCandidate {
  id: number;
  title: string | null;
  content: string;
}

export interface CompatBlurhashCandidatesResponse {
  generatedAt: string;
  items: CompatBlurhashCandidate[];
}

export interface CompatBlurhashApplyResponse {
  updated: boolean;
}

// Re-export for external use
export type {
  ApiResponse,
  RequestOptions,
  Feed,
  FeedListResponse,
  TimelineItem,
  CreateFeedRequest,
  UpdateFeedRequest,
  AdjacentFeedResponse,
  UserProfile,
  UpdateProfileRequest,
  Tag,
  TagDetail,
  Category,
  CategoryDetail,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  Page,
  CreatePageRequest,
  UpdatePageRequest,
  Comment,
  CreateCommentRequest,
  Friend,
  FriendListResponse,
  CreateFriendRequest,
  UpdateFriendRequest,
  Moment,
  CreateMomentRequest,
  ConfigType,
  ConfigResponse,
  AIConfig,
  UploadResponse,
  AuthStatus,
  LoginRequest,
  LoginResponse,
} from "@rin/api";


/**
 * HTTP client for making API requests
 */
interface HttpRequestOptions extends RequestOptions {
  onResponse?: (response: Response) => void;
}

class HttpClient {
  constructor(private baseUrl: string, private onMutation: () => void) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options?.headers,
    };

    // Add auth token if available
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const timeoutMs = options?.timeoutMs;
    const controller = timeoutMs !== undefined ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        credentials: "include",
        signal: controller?.signal,
      });
      options?.onResponse?.(response);
      if (method !== "GET" && response.ok) this.onMutation();

      // Handle 204 No Content
      if (response.status === 204) {
        return { data: undefined as T };
      }

      if (!response.ok) {
        let errorValue: unknown;
        const responseClone = response.clone();
        try {
          errorValue = await response.json();
        } catch {
          errorValue = await responseClone.text();
        }
        // Extract error message from various formats
        let errorMessage: string;
        if (typeof errorValue === 'string') {
          errorMessage = errorValue;
        } else if (errorValue && typeof errorValue === 'object') {
          // Handle { error: { message: string } } format
          const err = errorValue as any;
          errorMessage = err.error?.message || err.message || err.error || JSON.stringify(errorValue);
        } else {
          errorMessage = String(errorValue ?? response.statusText);
        }
        return {
          error: {
            status: response.status,
            value: errorMessage,
          },
        };
      }

      // Check if response has content
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0") {
        return { data: undefined as T };
      }

      // Try to parse JSON, fallback to text
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        return { data };
      }

      const text = await response.text();
      return { data: text as T };
    } catch (error) {
      return {
        error: {
          status: controller?.signal.aborted ? 408 : 0,
          value: controller?.signal.aborted
            ? "Request timed out"
            : error instanceof Error ? error.message : "Network error",
        },
      };
    } finally {
      // Keep the deadline active through response.json()/text(), not just fetch().
      clearTimeout(timeout);
    }
  }

  async get<T>(path: string, options?: HttpRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }
}

/**
 * Feed API methods
 */
type FeedListParams = { page?: number; limit?: number; type?: 'draft' | 'unlisted' | 'normal' };

function hasContentShape(data: unknown): data is Record<string, unknown> {
  return isRecord(data) && typeof data.id === "number"
    && (data.title === null || typeof data.title === "string")
    && typeof data.createdAt === "string" && typeof data.updatedAt === "string"
    && Array.isArray(data.hashtags) && data.hashtags.every((tag) => isRecord(tag) && typeof tag.name === "string")
    && Array.isArray(data.categories) && data.categories.every((category) => isRecord(category) && typeof category.name === "string");
}

function isPublicFeed(data: unknown): data is Feed {
  return hasContentShape(data) && typeof data.content === "string" && typeof data.ai_summary === "string"
    && isRecord(data.user) && typeof data.user.username === "string"
    && data.status === "publish" && !data.locked && !data.hasPassword
    && new Date(data.createdAt as string).getTime() <= Date.now();
}

function isFeedList(data: unknown): data is FeedListResponse {
  return isRecord(data) && typeof data.size === "number" && typeof data.hasNext === "boolean"
    && Array.isArray(data.data) && data.data.every((item) => hasContentShape(item)
      && (item.status === undefined || item.status === "publish") && typeof item.summary === "string");
}

function isPublicPage(data: unknown): data is Page {
  return isRecord(data) && typeof data.id === "number" && typeof data.title === "string"
    && typeof data.content === "string" && (data.slug === null || typeof data.slug === "string")
    && typeof data.parent === "number" && typeof data.order === "number" && typeof data.template === "string"
    && typeof data.uid === "number"
    && (data.fields === undefined || (Array.isArray(data.fields) && data.fields.every((field) => isRecord(field)
      && typeof field.name === "string" && ["str", "int", "float", "json"].includes(String(field.type)))))
    && typeof data.createdAt === "string" && typeof data.updatedAt === "string"
    && data.status === "publish" && !data.locked && !data.hasPassword
    && new Date(data.createdAt).getTime() <= Date.now();
}

function isTimeline(data: unknown): data is TimelineItem[] {
  return Array.isArray(data) && data.every((item) => isRecord(item) && typeof item.id === "number"
    && (item.title === null || typeof item.title === "string") && typeof item.createdAt === "string"
    && new Date(item.createdAt).getTime() <= Date.now());
}

function isNavigation(data: unknown): data is PageNavigationItem[] {
  return Array.isArray(data) && data.every((page) => isRecord(page)
    && typeof page.title === "string" && typeof page.slug === "string");
}

function isPublicSummary(data: unknown): boolean {
  return isRecord(data) && typeof data.id === "number"
    && (data.title === null || typeof data.title === "string") && typeof data.summary === "string"
    && typeof data.createdAt === "string" && typeof data.updatedAt === "string"
    && new Date(data.createdAt).getTime() <= Date.now()
    && (data.status === undefined || data.status === "publish") && !data.locked && !data.hasPassword
    && Array.isArray(data.hashtags);
}

function isCategoryDetail(data: unknown): data is CategoryDetail {
  return isRecord(data) && typeof data.id === "number" && typeof data.name === "string"
    && Array.isArray(data.feeds) && data.feeds.every(isPublicSummary);
}

function isTags(data: unknown): data is Tag[] {
  return Array.isArray(data) && data.every((tag) => isRecord(tag) && typeof tag.id === "number"
    && typeof tag.name === "string" && typeof tag.count === "number"
    && typeof tag.createdAt === "string" && typeof tag.updatedAt === "string");
}

function isTagDetail(data: unknown): data is TagDetail {
  return isRecord(data) && typeof data.id === "number" && typeof data.name === "string"
    && Array.isArray(data.feeds) && data.feeds.every(isPublicSummary);
}

function isPublicFriends(data: unknown): data is FriendListResponse {
  return isRecord(data) && data.apply_list === null && Array.isArray(data.friend_list)
    && data.friend_list.every((friend) => isRecord(friend) && friend.accepted === 1
      && typeof friend.id === "number" && typeof friend.name === "string"
      && typeof friend.url === "string" && typeof friend.health === "string");
}

function isMoments(data: unknown): data is MomentListResponse {
  return isRecord(data) && typeof data.hasNext === "boolean" && Array.isArray(data.data)
    && data.data.every((moment) => isRecord(moment) && typeof moment.id === "number"
      && typeof moment.content === "string" && typeof moment.createdAt === "string"
      && typeof moment.updatedAt === "string" && isRecord(moment.user) && typeof moment.user.username === "string");
}

function isComments(data: unknown): data is Comment[] {
  return Array.isArray(data) && data.every((comment) => isRecord(comment) && typeof comment.id === "number"
    && typeof comment.content === "string" && typeof comment.createdAt === "string"
    && (comment.approved === 1 || comment.approved === true) && !("guestEmail" in comment));
}

function isAdjacent(data: unknown): data is AdjacentFeedResponse {
  return isRecord(data) && (data.previousFeed === null || isPublicSummary(data.previousFeed))
    && (data.nextFeed === null || isPublicSummary(data.nextFeed));
}

class PublicContentClient {
  constructor(private http: HttpClient, private cache: PublicContentCache) {}

  get<T>(key: string, validate: (data: unknown) => data is T): T | undefined {
    return this.cache.get(key, validate);
  }

  async load<T>(key: string, path: string, validate: (data: unknown) => data is T, options?: RequestOptions,
    resetScopeWhen?: (data: T) => boolean): Promise<ApiResponse<T>> {
    const ticket = this.cache.begin(key);
    let publicContent = false;
    const result = await this.http.get<T>(path, {
      timeoutMs: 20_000,
      ...options,
      onResponse: (response) => { publicContent = response.headers.get("X-Rin-Content-Cache") === "public"; },
    });
    const cacheable = publicContent && !result.error && validate(result.data);
    this.cache.finish(ticket, result.data, cacheable, result.error?.status,
      cacheable && result.data !== undefined && Boolean(resetScopeWhen?.(result.data)));
    return result;
  }
}

class FeedAPI {
  constructor(private http: HttpClient, private content: PublicContentClient) {}

  private listKey(params?: FeedListParams) {
    return `list:${params?.type || "normal"}:${params?.page || 1}:${params?.limit || 20}`;
  }

  getCachedList(params?: FeedListParams): FeedListResponse | undefined {
    if (params?.type && params.type !== "normal") return;
    return this.content.get(this.listKey(params), isFeedList);
  }

  getCached(id: number | string): Feed | undefined {
    return this.content.get(`article:${id}`, isPublicFeed);
  }

  getCachedTimeline(): TimelineItem[] | undefined {
    return this.content.get("timeline", isTimeline);
  }

  getCachedAdjacent(id: number | string): AdjacentFeedResponse | undefined {
    return this.content.get(`adjacent:${id}`, isAdjacent);
  }

  // GET /api/feed
  async list(params?: FeedListParams, options?: RequestOptions): Promise<ApiResponse<FeedListResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.type) searchParams.set("type", params.type);
    
    const query = searchParams.toString();
    return this.content.load(this.listKey(params), `/api/feed${query ? `?${query}` : ""}`, isFeedList, options);
  }

  // GET /api/feed/timeline
  async timeline(options?: RequestOptions): Promise<ApiResponse<TimelineItem[]>> {
    return this.content.load("timeline", "/api/feed/timeline", isTimeline, options);
  }

  // GET /api/feed/:id
  async get(id: number | string, options?: RequestOptions): Promise<ApiResponse<Feed>> {
    return this.content.load(`article:${id}`, `/api/feed/${encodeURIComponent(id)}`, isPublicFeed, options);
  }

  // POST /api/feed
  async create(body: CreateFeedRequest): Promise<ApiResponse<{ insertedId: number }>> {
    return this.http.post<{ insertedId: number }>("/api/feed", body);
  }

  // POST /api/feed/:id
  async update(id: number, body: UpdateFeedRequest): Promise<ApiResponse<void>> {
    return this.http.post<void>(`/api/feed/${id}`, body);
  }

  // DELETE /api/feed/:id
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.http.delete<void>(`/api/feed/${id}`);
  }

  // GET /api/feed/adjacent/:id
  async adjacent(id: number | string): Promise<ApiResponse<AdjacentFeedResponse>> {
    return this.content.load(`adjacent:${id}`, `/api/feed/adjacent/${encodeURIComponent(id)}`, isAdjacent);
  }

  // POST /api/feed/top/:id
  async setTop(id: number, top: number): Promise<ApiResponse<void>> {
    return this.http.post<void>(`/api/feed/top/${id}`, { top });
  }

  // POST /api/feed/:id/unlock
  async unlock(id: number | string, password: string): Promise<ApiResponse<void>> {
    return this.http.post<void>(`/api/feed/${id}/unlock`, { password });
  }
}

/**
 * Page API methods
 */
class PageAPI {
  constructor(private http: HttpClient, private content: PublicContentClient) {}

  getCached(slug: string): Page | undefined {
    return this.content.get(`page:${slug}`, isPublicPage);
  }

  getCachedNavigation(): PageNavigationItem[] | undefined {
    return this.content.get("navigation:pages", isNavigation);
  }

  async navigation(): Promise<ApiResponse<PageNavigationItem[]>> {
    return this.content.load("navigation:pages", "/api/page/navigation/list", isNavigation);
  }

  // GET /api/page
  async list(): Promise<ApiResponse<Page[]>> {
    return this.http.get<Page[]>("/api/page");
  }

  // GET /api/page/:slug
  async get(slug: string, options?: RequestOptions): Promise<ApiResponse<Page>> {
    return this.content.load(`page:${slug}`, `/api/page/${encodeURIComponent(slug)}`, isPublicPage, options);
  }

  // POST /api/page
  async create(body: CreatePageRequest): Promise<ApiResponse<{ insertedId: number }>> {
    return this.http.post<{ insertedId: number }>("/api/page", body);
  }

  // POST /api/page/:id
  async update(id: number, body: UpdatePageRequest): Promise<ApiResponse<void>> {
    return this.http.post<void>(`/api/page/${id}`, body);
  }

  // POST /api/page/:id/unlock
  async unlock(id: number, password: string): Promise<ApiResponse<void>> {
    return this.http.post<void>(`/api/page/${id}/unlock`, { password });
  }

  // DELETE /api/page/:id
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.http.delete<void>(`/api/page/${id}`);
  }
}

/**
 * Category API methods
 */
class CategoryAPI {
  constructor(private http: HttpClient, private content: PublicContentClient) {}

  getCached(slug: string): CategoryDetail | undefined {
    return this.content.get(`category:${slug}`, isCategoryDetail);
  }

  // GET /api/category
  async list(): Promise<ApiResponse<Category[]>> {
    return this.http.get<Category[]>("/api/category");
  }

  // GET /api/category/:slug
  async get(slug: string): Promise<ApiResponse<CategoryDetail>> {
    return this.content.load(`category:${slug}`, `/api/category/${encodeURIComponent(slug)}`, isCategoryDetail);
  }

  // POST /api/category
  async create(body: CreateCategoryRequest): Promise<ApiResponse<{ insertedId: number }>> {
    return this.http.post<{ insertedId: number }>("/api/category", body);
  }

  // PUT /api/category/:id
  async update(id: number, body: UpdateCategoryRequest): Promise<ApiResponse<void>> {
    return this.http.put<void>(`/api/category/${id}`, body);
  }

  // DELETE /api/category/:id
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.http.delete<void>(`/api/category/${id}`);
  }
}

/**
 * Tag API methods
 */
class TagAPI {
  constructor(private content: PublicContentClient) {}

  getCachedList(): Tag[] | undefined {
    return this.content.get("tags", isTags);
  }

  getCached(name: string): TagDetail | undefined {
    return this.content.get(`tag:${name}`, isTagDetail);
  }

  // GET /api/tag
  async list(): Promise<ApiResponse<Tag[]>> {
    return this.content.load("tags", "/api/tag", isTags);
  }

  // GET /api/tag/:name
  async get(name: string): Promise<ApiResponse<TagDetail>> {
    return this.content.load(`tag:${name}`, `/api/tag/${encodeURIComponent(name)}`, isTagDetail);
  }
}

/**
 * Comment API methods
 */
class CommentAPI {
  constructor(private http: HttpClient, private content: PublicContentClient) {}

  getCached(feedId: number): Comment[] | undefined {
    return this.content.get(`comments:${feedId}`, isComments);
  }

  // GET /api/comment/:feed
  async list(feedId: number): Promise<ApiResponse<Comment[]>> {
    return this.content.load(`comments:${feedId}`, `/api/comment/${feedId}`, isComments);
  }

  // POST /api/comment/:feed
  async create(feedId: number, body: CreateCommentRequest): Promise<ApiResponse<Comment>> {
    return this.http.post<Comment>(`/api/comment/${feedId}`, body);
  }

  // DELETE /api/comment/:id
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.http.delete<void>(`/api/comment/${id}`);
  }
}

/**
 * User API methods
 */
class UserAPI {
  constructor(private http: HttpClient) {}

  // GET /api/user/profile
  async profile(): Promise<ApiResponse<UserProfile>> {
    return this.http.get<UserProfile>("/api/user/profile");
  }

  // PUT /api/user/profile
  async updateProfile(body: UpdateProfileRequest): Promise<ApiResponse<{ success: boolean }>> {
    return this.http.put<{ success: boolean }>("/api/user/profile", body);
  }

  // POST /api/user/logout
  async logout(): Promise<ApiResponse<void>> {
    return this.http.post<void>("/api/user/logout");
  }

  // GET /api/user/github
  githubAuth(): string {
    return `${endpoint}/api/user/github`;
  }
}

/**
 * Friend API methods
 */
class FriendAPI {
  constructor(private http: HttpClient, private content: PublicContentClient) {}

  getCachedPublic(): FriendListResponse | undefined {
    return this.content.get("friends:public", isPublicFriends);
  }

  async listPublic(): Promise<ApiResponse<FriendListResponse>> {
    return this.content.load("friends:public", "/api/friend/public", isPublicFriends);
  }

  // GET /api/friend
  async list(): Promise<ApiResponse<FriendListResponse>> {
    return this.http.get<FriendListResponse>("/api/friend", { timeoutMs: 20_000 });
  }

  // POST /api/friend
  async create(body: CreateFriendRequest): Promise<ApiResponse<Friend>> {
    return this.http.post<Friend>("/api/friend", body);
  }

  // PUT /api/friend/:id
  async update(id: number, body: UpdateFriendRequest): Promise<ApiResponse<Friend>> {
    return this.http.put<Friend>(`/api/friend/${id}`, body);
  }

  // DELETE /api/friend/:id
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.http.delete<void>(`/api/friend/${id}`);
  }
}

/**
 * Moments API methods
 */
class MomentsAPI {
  constructor(private http: HttpClient, private content: PublicContentClient) {}

  getCachedList(params?: { page?: number; limit?: number }): MomentListResponse | undefined {
    return this.content.get(`moments:${params?.page || 1}:${params?.limit || 20}`, isMoments);
  }

  // GET /api/moments
  async list(params?: { page?: number; limit?: number }): Promise<ApiResponse<{ data: Moment[]; hasNext: boolean }>> {
    const previous = this.getCachedList(params);
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    
    const query = searchParams.toString();
    return this.content.load(`moments:${params?.page || 1}:${params?.limit || 20}`, `/api/moments${query ? `?${query}` : ""}`, isMoments,
      undefined, data => (params?.page || 1) === 1 && shouldResetFollowingMoments(previous, data));
  }

  // POST /api/moments
  async create(body: CreateMomentRequest): Promise<ApiResponse<Moment>> {
    return this.http.post<Moment>("/api/moments", body);
  }

  // POST /api/moments/:id
  async update(id: number, body: CreateMomentRequest): Promise<ApiResponse<Moment>> {
    return this.http.post<Moment>(`/api/moments/${id}`, body);
  }

  // DELETE /api/moments/:id
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.http.delete<void>(`/api/moments/${id}`);
  }
}

/**
 * Config API methods
 */
class ConfigAPI {
  constructor(private http: HttpClient) {}

  // GET /api/config
  async getAll(): Promise<ApiResponse<SettingsConfigResponse>> {
    return this.http.get<SettingsConfigResponse>("/api/config");
  }

  // GET /api/config/:type
  async get(type: ConfigType): Promise<ApiResponse<ConfigResponse>> {
    return this.http.get<ConfigResponse>(`/api/config/${type}`);
  }

  // POST /api/config
  async updateAll(body: SettingsConfigResponse): Promise<ApiResponse<SettingsConfigResponse>> {
    return this.http.post<SettingsConfigResponse>("/api/config", body);
  }

  // POST /api/config/:type
  async update(type: ConfigType, body: Record<string, unknown>): Promise<ApiResponse<void>> {
    return this.http.post<void>(`/api/config/${type}`, body);
  }

  // DELETE /api/config/cache
  async clearCache(): Promise<ApiResponse<void>> {
    return this.http.delete<void>("/api/config/cache");
  }

  // GET /api/config/health
  async getHealth(): Promise<ApiResponse<ConfigHealthResponse>> {
    return this.http.get<ConfigHealthResponse>("/api/config/health");
  }

  // GET /api/config/queue-status
  async getQueueStatus(): Promise<ApiResponse<QueueStatusResponse>> {
    return this.http.get<QueueStatusResponse>("/api/config/queue-status");
  }

  async getCompatTasks(): Promise<ApiResponse<CompatTasksResponse>> {
    return this.http.get<CompatTasksResponse>("/api/config/compat-tasks");
  }

  async runCompatAISummary(force = false): Promise<ApiResponse<CompatAISummaryActionResponse>> {
    return this.http.post<CompatAISummaryActionResponse>("/api/config/compat-tasks/ai-summary", { force });
  }

  async getCompatBlurhashCandidates(): Promise<ApiResponse<CompatBlurhashCandidatesResponse>> {
    return this.http.get<CompatBlurhashCandidatesResponse>("/api/config/compat-tasks/blurhash");
  }

  async applyCompatBlurhash(feedId: number, content: string): Promise<ApiResponse<CompatBlurhashApplyResponse>> {
    return this.http.post<CompatBlurhashApplyResponse>(`/api/config/compat-tasks/blurhash/${feedId}`, { content });
  }

  async retryQueueTask(feedId: number): Promise<ApiResponse<QueueTaskActionResponse>> {
    return this.http.post<QueueTaskActionResponse>(`/api/config/queue-status/${feedId}/retry`);
  }

  async deleteQueueTask(feedId: number): Promise<ApiResponse<QueueTaskActionResponse>> {
    return this.http.delete<QueueTaskActionResponse>(`/api/config/queue-status/${feedId}`);
  }

  // POST /api/config/test-ai - Test AI model configuration
  async testAI(body: {
    provider?: string;
    model?: string;
    api_url?: string;
    api_key?: string;
    testPrompt?: string;
  }): Promise<ApiResponse<{ success: boolean; response?: string; error?: string; details?: string; provider?: string; model?: string }>> {
    return this.http.post<any>("/api/config/test-ai", body);
  }

  async testWebhook(body: {
    webhook_url?: string;
    "webhook.method"?: string;
    "webhook.content_type"?: string;
    "webhook.headers"?: string;
    "webhook.body_template"?: string;
    test_message?: string;
  }): Promise<ApiResponse<{ success: boolean; error?: string; details?: string }>> {
    return this.http.post("/api/config/test-webhook", body);
  }
}

/**
 * AI Config API methods (deprecated, use ConfigAPI instead)
 * @deprecated AI config is now part of server config. Use client.config.get('server') and client.config.update('server', {...}) instead.
 */
class AIConfigAPI {
  constructor(private http: HttpClient) {}

  // GET /api/ai-config
  /** @deprecated Use client.config.get('server') instead */
  async get(): Promise<ApiResponse<AIConfig>> {
    return this.http.get<AIConfig>("/api/ai-config");
  }

  // POST /api/ai-config
  /** @deprecated Use client.config.update('server', {...}) instead */
  async update(body: Partial<AIConfig>): Promise<ApiResponse<void>> {
    return this.http.post<void>("/api/ai-config", body);
  }
}

/**
 * Storage API methods
 */
class StorageAPI {
  constructor(private http: HttpClient) {}

  // POST /api/storage
  async upload(file: File, key?: string): Promise<ApiResponse<UploadResponse>> {
    const formData = new FormData();
    formData.append("file", file);
    if (key) formData.append("key", key);
    
    return this.http.post<UploadResponse>("/api/storage", formData);
  }
}

/**
 * Search API methods
 */
class SearchAPI {
  constructor(private content: PublicContentClient) {}

  getCached(keyword: string, params?: { page?: number; limit?: number }): FeedListResponse | undefined {
    return this.content.get(`search:${keyword}:${params?.page || 1}:${params?.limit || 20}`, isFeedList);
  }

  // GET /api/search/:keyword
  async search(keyword: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<FeedListResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    return this.content.load(`search:${keyword}:${params?.page || 1}:${params?.limit || 20}`, `/api/search/${encodeURIComponent(keyword)}${query ? `?${query}` : ""}`, isFeedList);
  }
}

/**
 * Auth API methods
 */
class AuthAPI {
  constructor(private http: HttpClient) {}

  // GET /api/auth/status
  async status(): Promise<ApiResponse<AuthStatus>> {
    return this.http.get<AuthStatus>("/api/auth/status");
  }

  // POST /api/auth/login
  async login(body: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return this.http.post<LoginResponse>("/api/auth/login", body);
  }
}

/**
 * WordPress Import API methods
 */
class WordPressAPI {
  constructor(private http: HttpClient) {}

  // POST /api/wp
  async import(xml: string): Promise<ApiResponse<{ imported: number }>> {
    return this.http.post<{ imported: number }>("/api/wp", { xml });
  }
}

/**
 * RSS API methods - direct fetch for RSS feeds
 */
class RSSAPI {
  constructor(private baseUrl: string) {}

  // GET /rss.xml
  async getRSS(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/rss.xml`);
    return response.text();
  }

  // GET /atom.xml
  async getAtom(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/atom.xml`);
    return response.text();
  }

  // GET /rss.json
  async getJSON(): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/rss.json`);
    return response.json();
  }
}

// ============================================================================
// Main API Client Class
// ============================================================================

export class ApiClient {
  subscribeContentChanges: (listener: () => void) => () => void;
  private http: HttpClient;
  feed: FeedAPI;
  page: PageAPI;
  category: CategoryAPI;
  tag: TagAPI;
  comment: CommentAPI;
  user: UserAPI;
  friend: FriendAPI;
  moments: MomentsAPI;
  config: ConfigAPI;
  aiConfig: AIConfigAPI;
  storage: StorageAPI;
  search: SearchAPI;
  auth: AuthAPI;
  wp: WordPressAPI;
  rss: RSSAPI;

  constructor(baseUrl: string) {
    const contentCache = new PublicContentCache(baseUrl);
    this.http = new HttpClient(baseUrl, () => contentCache.clear(true));
    this.subscribeContentChanges = (listener) => contentCache.subscribe(listener);
    const content = new PublicContentClient(this.http, contentCache);
    this.feed = new FeedAPI(this.http, content);
    this.page = new PageAPI(this.http, content);
    this.category = new CategoryAPI(this.http, content);
    this.tag = new TagAPI(content);
    this.comment = new CommentAPI(this.http, content);
    this.user = new UserAPI(this.http);
    this.friend = new FriendAPI(this.http, content);
    this.moments = new MomentsAPI(this.http, content);
    this.config = new ConfigAPI(this.http);
    this.aiConfig = new AIConfigAPI(this.http);
    this.storage = new StorageAPI(this.http);
    this.search = new SearchAPI(content);
    this.auth = new AuthAPI(this.http);
    this.wp = new WordPressAPI(this.http);
    this.rss = new RSSAPI(baseUrl);
  }
}

// ============================================================================
// Factory Function (Eden-compatible interface)
// ============================================================================

export function createClient(baseUrl: string): ApiClient {
  return new ApiClient(baseUrl);
}

// Default export
export default ApiClient;
