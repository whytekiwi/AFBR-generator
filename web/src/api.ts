import type { Report, ReportSummary, ReportUpsert } from './types';

type ReportListResponse = {
  items: ReportSummary[];
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown, fallback: string): string => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const messageValue = 'message' in payload ? payload.message : undefined;
    const errorValue = 'error' in payload ? payload.error : undefined;

    if (typeof messageValue === 'string' && messageValue.trim()) {
      return messageValue;
    }

    if (typeof errorValue === 'string' && errorValue.trim()) {
      return errorValue;
    }
  }

  return fallback;
};

const request = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, `Request failed with status ${response.status}.`),
    );
  }

  return payload as T;
};

export const fetchReports = async (
  query: string,
  signal?: AbortSignal,
): Promise<ReportSummary[]> => {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set('q', query.trim());
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<ReportListResponse>(`/api/reports${suffix}`, {
    signal,
  });

  return payload.items ?? [];
};

export const fetchReport = async (
  id: string,
  signal?: AbortSignal,
): Promise<Report> =>
  request<Report>(`/api/reports/${encodeURIComponent(id)}`, {
    signal,
  });

export const createReport = async (report: ReportUpsert): Promise<Report | null> =>
  request<Report | null>('/api/reports', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(report),
  });

export const updateReport = async (
  id: string,
  report: ReportUpsert,
): Promise<Report | null> =>
  request<Report | null>(`/api/reports/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(report),
  });

export const deleteReport = async (id: string): Promise<void> => {
  await request<null>(`/api/reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};
