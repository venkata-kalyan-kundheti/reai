const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errorJson = await response.json();
      const err = new Error(errorJson?.error?.message || 'Request failed');
      err.code = errorJson?.error?.code || 'UNKNOWN_ERROR';
      err.status = response.status;
      err.details = errorJson?.error?.details;
      throw err;
    }
    const text = await response.text();
    const err = new Error(text || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

