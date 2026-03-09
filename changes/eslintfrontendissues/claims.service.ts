import type { AppData } from '../models/claims/api.model';
import type { AiAnalysis } from '../models/claims/story.model';

const BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ?? '/api';

/**
 * Generic API fetch wrapper
 * @param path - API endpoint path
 * @param options - Fetch options
 * @returns Promise resolving to typed response
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; hint?: string };
    throw new Error(body.error ?? body.hint ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** @returns Promise resolving to full app data */
export const fetchAll = (): Promise<AppData> => apiFetch<AppData>('/all');

/** @returns Promise resolving to data source info */
export const fetchSource = (): Promise<unknown> => apiFetch('/source');

/** @returns Promise resolving to reload result */
export const reloadData = (): Promise<unknown> => apiFetch('/reload', { method: 'POST' });

/** @returns Promise resolving to excel reload result */
export const reloadExcel = (): Promise<unknown> => apiFetch('/reload/excel', { method: 'POST' });

/** @returns Promise resolving to databricks reload result */
export const reloadDatabricks = (): Promise<unknown> => apiFetch('/reload/databricks', { method: 'POST' });

/** @returns Promise resolving to databricks connection status */
export const testDatabricks = (): Promise<unknown> => apiFetch('/databricks/status');

/** @returns Promise resolving to mongo connection status */
export const testMongo = (): Promise<unknown> => apiFetch('/mongo/status');

/** @returns Promise resolving to mongo load history */
export const mongoHistory = (): Promise<unknown> => apiFetch('/mongo/history');

/**
 * Fetch AI analysis for a client story
 * @param clientId - The client identifier
 * @param storyId - The story identifier
 * @param forceRefresh - Whether to bypass cache
 * @returns Promise resolving to AI analysis result
 */
export const fetchAiAnalysis = (
  clientId: string,
  storyId: string,
  forceRefresh = false,
): Promise<AiAnalysis> =>
  apiFetch<{ analysis: AiAnalysis }>('/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, storyId, forceRefresh }),
  }).then(r => r.analysis);
