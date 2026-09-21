import prisma from './prisma';
import { encrypt, decrypt } from './crypto';

/**
 * A thin Google Drive v3 client built on fetch.
 *
 * Deliberately not the `googleapis` package: we use five endpoints, and that
 * package pulls in the whole Google API surface for them.
 *
 * Scope is `drive.file` — the app can only see and touch files it created
 * itself. It cannot read anything else in the connected account, which both
 * limits the blast radius of a leaked token and keeps Google's OAuth
 * verification requirements light.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const driveConfigured = (): boolean =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export function redirectUri(): string {
  const base = process.env.APP_BASE_URL || 'http://localhost:4000';
  return `${base.replace(/\/$/, '')}/api/storage/google/callback`;
}

/** Consent URL. `access_type=offline` + `prompt=consent` is what yields a refresh token. */
export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).error_description || (json as any).error || `HTTP ${res.status}`);
  return json as any;
}

export async function exchangeCode(code: string) {
  return postForm(OAUTH_TOKEN, {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  }) as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

/* Access tokens live an hour; cache in memory so a burst of uploads costs one refresh. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const account = await prisma.storageAccount.findUnique({ where: { provider: 'GOOGLE_DRIVE' } });
  if (!account) throw new Error('هیچ حساب گوگل درایوی متصل نیست');

  const data = await postForm(OAUTH_TOKEN, {
    refresh_token: decrypt(account.refreshTokenEnc),
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  });
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

/** Drop the cached token — call after disconnecting so a stale token can't be reused. */
export const clearTokenCache = () => { cachedToken = null; };

async function api(path: string, init: RequestInit = {}, base = DRIVE_API) {
  const token = await accessToken();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error?.message || `Drive HTTP ${res.status}`);
  return json as any;
}

export async function userEmail(token: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const info = (await res.json()) as { email?: string };
  return info.email ?? null;
}

export async function storageQuota() {
  const d = await api('/about?fields=storageQuota,user');
  const q = d.storageQuota || {};
  return {
    limit: q.limit ? Number(q.limit) : null,
    usage: q.usage ? Number(q.usage) : null,
    email: d.user?.emailAddress ?? null,
  };
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const body: any = { name, mimeType: FOLDER_MIME };
  if (parentId) body.parents = [parentId];
  const f = await api('/files?fields=id', { method: 'POST', body: JSON.stringify(body) });
  return f.id;
}

/**
 * Resolve (creating if needed) the Drive folder for a task, nested under its
 * project. Folder ids are cached in StorageFolder so a busy project does not
 * re-query Drive on every upload.
 */
export async function folderForTask(projectId: number, taskId: number) {
  const account = await prisma.storageAccount.findUnique({ where: { provider: 'GOOGLE_DRIVE' } });
  if (!account) throw new Error('هیچ حساب گوگل درایوی متصل نیست');

  let rootId = account.rootFolderId;
  if (!rootId) {
    rootId = await createFolder('تسکان');
    await prisma.storageAccount.update({ where: { id: account.id }, data: { rootFolderId: rootId } });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, driveFolderId: true,
              project: { select: { id: true, name: true, driveFolderId: true } } },
  });
  if (!task) throw new Error('تسک پیدا نشد');
  if (task.driveFolderId) return task.driveFolderId;

  let projectFolder = task.project?.driveFolderId ?? null;
  if (!projectFolder) {
    projectFolder = await createFolder(task.project?.name || `پروژه ${projectId}`, rootId);
    await prisma.project.update({ where: { id: projectId }, data: { driveFolderId: projectFolder } });
  }

  const taskFolder = await createFolder(task.title || `تسک ${taskId}`, projectFolder);
  await prisma.task.update({ where: { id: taskId }, data: { driveFolderId: taskFolder } });
  return taskFolder;
}

/**
 * Open a resumable upload session and hand the browser the session URL.
 *
 * The browser PUTs the bytes straight to Google. Nothing large touches this
 * server — which matters because a few reels would fill its remaining disk —
 * and the session URL is single-purpose, so no access token is exposed to the
 * client.
 */
export async function createUploadSession(opts: {
  filename: string; mimeType: string; folderId: string; sizeBytes?: number;
}): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': opts.mimeType,
      ...(opts.sizeBytes ? { 'X-Upload-Content-Length': String(opts.sizeBytes) } : {}),
    },
    body: JSON.stringify({ name: opts.filename, parents: [opts.folderId] }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ساخت جلسه آپلود شکست خورد: ${res.status} ${t.slice(0, 200)}`);
  }
  const location = res.headers.get('location');
  if (!location) throw new Error('گوگل آدرس آپلود برنگرداند');
  return location;
}

/** Make a file readable by link, and return the links we show in the app. */
export async function shareFile(fileId: string) {
  await api(`/files/${fileId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return api(`/files/${fileId}?fields=id,name,mimeType,size,webViewLink,thumbnailLink,webContentLink`);
}

export async function deleteFile(fileId: string): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 means it is already gone; that is the desired end state either way.
  if (!res.ok && res.status !== 404) throw new Error(`حذف از درایو شکست خورد: ${res.status}`);
}

export { encrypt, decrypt };
