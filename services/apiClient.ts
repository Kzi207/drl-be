/**
 * API Client for Backend Server
 * Allows server-side API calls to the backend
 * Can use both local database (faster) and HTTP API (for consistency)
 */

const API_BASE = process.env.API_BASE || '';
const API_KEY = process.env.API_KEY || '';

export interface ApiClientOptions {
  useLocal?: boolean; // Use local database functions instead of HTTP
}

/**
 * Make API call from backend server
 * @param path - API endpoint path (e.g., '/students', '/drl_scores')
 * @param options - Fetch options (method, body, headers, etc.)
 * @returns Response data
 */
export async function apiCall(
  path: string,
  options: RequestInit & { useLocal?: boolean } = {}
) {
  const { useLocal = false, ...fetchOptions } = options;

  try {
    const headers = new Headers(fetchOptions.headers || {});

    // Add API Key
    if (API_KEY && !headers.has('X-API-Key')) {
      headers.set('X-API-Key', API_KEY);
    }

    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const url = `${API_BASE}${path}`;

    console.log(`[API Call] ${fetchOptions.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API Error ${response.status}: ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[API Error] ${path}:`, error);
    throw error;
  }
}

/**
 * GET request wrapper
 */
export async function apiGet(path: string) {
  return apiCall(path, { method: 'GET' });
}

/**
 * POST request wrapper
 */
export async function apiPost(path: string, body: any) {
  return apiCall(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * PUT request wrapper
 */
export async function apiPut(path: string, body: any) {
  return apiCall(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request wrapper
 */
export async function apiDelete(path: string) {
  return apiCall(path, { method: 'DELETE' });
}

// Example usage:
// import { apiGet, apiPost } from './services/apiClient';
//
// // Get all students
// const students = await apiGet('/students');
//
// // Get DRL scores
// const scores = await apiGet('/drl_scores');
//
// // Create new student
// const newStudent = await apiPost('/students', {
//   name: 'Nguyen Van A',
//   studentId: 'SV001'
// });
