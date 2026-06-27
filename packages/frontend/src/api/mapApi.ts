import { api } from './base';
import type {
  CreateMapReqBody,
  UpdateMapReqBody,
  MapListRespBody,
  MapDetailSuccessRespBody,
  MapCreateSuccessRespBody,
  MapDeleteSuccessRespBody,
} from '@generale/types';

export async function listMapsApi(query: Record<string, string> = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  const res = await api<MapListRespBody>(
    `/api/maps/list${qs ? `?${qs}` : ''}`
  );
  return res;
}

export async function myMapsApi(query: Record<string, string> = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  const res = await api<MapListRespBody>(
    `/api/maps/my${qs ? `?${qs}` : ''}`
  );
  return res;
}

export async function mapDetailApi(id: string, draft = true) {
  const qs = draft ? '' : '?draft=0';
  const res = await api<MapDetailSuccessRespBody>(
    `/api/maps/detail/${id}${qs}`
  );
  return res;
}

export async function createMapApi(body: CreateMapReqBody) {
  const res = await api<MapCreateSuccessRespBody>(
    '/api/maps/create',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return res;
}

export async function updateMapApi(id: string, body: UpdateMapReqBody) {
  const res = await api<MapCreateSuccessRespBody>(
    `/api/maps/update/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  return res;
}

export async function deleteMapApi(id: string) {
  const res = await api<MapDeleteSuccessRespBody>(
    `/api/maps/delete/${id}`,
    { method: 'DELETE' }
  );
  return res;
}

export async function forkMapApi(id: string) {
  const res = await api<MapCreateSuccessRespBody>(
    `/api/maps/fork/${id}`,
    { method: 'POST' }
  );
  return res;
}

export async function discardDraftApi(id: string) {
  const res = await api<MapDeleteSuccessRespBody>(
    `/api/maps/discard-draft/${id}`,
    { method: 'POST' }
  );
  return res;
}

export function mapThumbnailUrl(id: string): string {
  return `/api/maps/thumbnail/${id}`;
}

export async function uploadMapThumbnailApi(id: string, file: File): Promise<MapDeleteSuccessRespBody> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/maps/thumbnail/${id}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed (${res.status})`);
  }
  return res.json();
}
