import { api } from './api';

type UploadTicket = {
  uploadUrl: string;
  key?: string;
  publicUrl?: string;
};

async function fileUriToBlob(uri: string): Promise<Blob> {
  const fileRes = await fetch(uri);
  return fileRes.blob();
}

async function tryDirectUpload(uploadUrl: string, blob: Blob, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Upload gagal (HTTP ${res.status}).`);
  }
}

async function tryProxyUpload(uploadUrl: string, blob: Blob, contentType: string) {
  await api.post('/storage/proxy-upload', blob, {
    headers: {
      'Content-Type': contentType,
      'x-upload-url': uploadUrl,
    },
    transformRequest: [(data) => data],
    timeout: 60_000,
  });
}

export async function uploadWithSignedUrl<T extends UploadTicket>(
  createUpload: () => Promise<T>,
  uri: string,
  contentType: string,
): Promise<T> {
  const ticket = await createUpload();
  const blob = await fileUriToBlob(uri);
  try {
    await tryDirectUpload(ticket.uploadUrl, blob, contentType);
  } catch (error) {
    await tryProxyUpload(ticket.uploadUrl, blob, contentType);
  }
  return ticket;
}
