'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import Badge from '@/components/ui/Badge';
import api from '@/lib/api';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '@/lib/uploadLimits';
import { describeRequestError } from '@/lib/requestError';

interface Attachment {
  id: number;
  filename: string;
  fileUrl: string;
  mimeType: string | null;
  thumbnailUrl: string | null;
  sizeBytes: string | null;
  provider: string;
  /** False when the row survives but the file itself is gone from disk. */
  available?: boolean;
  createdAt: string;
  user?: { id: number; firstName: string; lastName: string };
}

const prettySize = (b: string | null) => {
  if (!b) return '';
  const n = Number(b);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

const kindOf = (mime: string | null) => {
  if (!mime) return 'file';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

/**
 * Links are either an absolute http(s) URL (Drive) or a path we serve
 * ourselves. Anything else — a `javascript:` URL above all — is never
 * turned into an anchor.
 */
const safeHref = (u: string) => {
  if (u.startsWith('/uploads/')) return true;
  try { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; } catch { return false; }
};

export default function TaskAttachments({ taskId, canEdit = true }: { taskId: number; canEdit?: boolean }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  // Until a drive is connected, uploads keep going to the app server exactly as
  // before. Shipping the Drive path alone would have left everyone unable to
  // attach anything at all until an admin finished the Google setup.
  const [driveReady, setDriveReady] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/storage/attachments/${taskId}`);
      setItems(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/storage/status')
      .then(({ data }) => setDriveReady(!!data.connected))
      .catch(() => setDriveReady(false));
  }, []);

  /**
   * The bytes go straight from here to Google's resumable session URL. The
   * backend only issues that URL, so a large video never occupies the app
   * server's disk or bandwidth.
   */
  const uploadToDrive = async (file: File) => {
    const { data } = await api.post('/storage/upload-session', {
      taskId, filename: file.name, mimeType: file.type, sizeBytes: file.size,
    });

    const fileId: string = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText).id); }
          catch { reject(new Error('پاسخ گوگل قابل خواندن نبود')); }
        } else reject(new Error(`آپلود ناموفق (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('ارتباط با گوگل قطع شد'));
      xhr.send(file);
    });

    const created = await api.post('/storage/complete', { taskId, fileId });
    return created.data as Attachment;
  };

  /** Pre-Drive behaviour: multipart straight to the app server. */
  const uploadToServer = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    await api.post(`/tasks/${taskId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) setProgress({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) });
      },
    });
    return null;
  };

  /**
   * The bytes go straight from here to Google's resumable session URL when a
   * drive is connected, so a large video never occupies the app server's disk
   * or bandwidth.
   */
  const upload = async (file: File) => {
    // Only the server path is capped: a Drive upload goes straight to Google's
    // resumable session and never passes through nginx or this server's disk.
    if (!driveReady && file.size > MAX_ATTACHMENT_BYTES) {
      showToast(`حجم «${file.name}» بیشتر از ${MAX_ATTACHMENT_LABEL} است.`, 'error');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setProgress({ name: file.name, pct: 0 });
    try {
      const created = driveReady ? await uploadToDrive(file) : await uploadToServer(file);
      if (created) setItems((prev) => [created, ...prev]);
      else await load();
      showToast('فایل آپلود شد');
    } catch (err: any) {
      showToast(describeRequestError(err, 'آپلود فایل'), 'error');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (a: Attachment) => {
    const where = a.provider === 'GOOGLE_DRIVE' ? ' از گوگل درایو هم پاک می‌شود.' : '';
    if (!confirm(`فایل «${a.filename}» حذف شود؟${where}`)) return;
    try {
      if (a.provider === 'GOOGLE_DRIVE') await api.delete(`/storage/attachments/${a.id}`);
      else await api.delete(`/tasks/${taskId}/attachments/${a.id}`);
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      showToast('فایل حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-fg">
            فایل‌ها {items.length > 0 && <span className="tnum text-fg-muted">({items.length})</span>}
          </h3>
          {driveReady === false && <Badge tone="neutral">ذخیره روی سرور</Badge>}
          {driveReady === true && <Badge tone="info">گوگل درایو</Badge>}
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={!!progress}
              className="rounded-full bg-pill px-3.5 py-1.5 text-[11px] font-medium text-pill-fg transition hover:opacity-90 disabled:opacity-50"
            >
              {progress ? 'در حال آپلود…' : 'افزودن فایل'}
            </button>
          </>
        )}
      </div>

      {progress && (
        <div className="mb-3 rounded-xl bg-sunken px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-fg-secondary">{progress.name}</span>
            <span className="tnum shrink-0 text-[11px] font-medium text-fg">{progress.pct}٪</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-card">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-16 animate-pulse rounded-xl bg-sunken" />
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-sunken px-3 py-4 text-center text-[11px] text-fg-muted">
          هنوز فایلی اضافه نشده
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const kind = kindOf(a.mimeType);
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-xl bg-sunken px-3 py-2">
                {a.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-fg-muted">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {kind === 'video' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      )}
                    </svg>
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-fg">{a.filename}</p>
                  <p className="tnum mt-0.5 text-[10px] text-fg-muted">
                    {prettySize(a.sizeBytes)}
                    {a.user && ` · ${a.user.firstName} ${a.user.lastName}`}
                  </p>
                </div>

                {a.provider === 'GOOGLE_DRIVE' && <Badge tone="info">درایو</Badge>}
                {a.available === false && <Badge tone="bad">فایل موجود نیست</Badge>}

                {a.available !== false && safeHref(a.fileUrl) && (
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[10px] font-medium text-fg-secondary transition hover:text-fg"
                  >
                    باز کردن ↗
                  </a>
                )}
                {canEdit && (
                  <button
                    onClick={() => remove(a)}
                    aria-label={`حذف ${a.filename}`}
                    className="shrink-0 rounded-full px-2 py-1 text-[10px] font-medium text-fg-muted transition hover:bg-bad-soft hover:text-bad"
                  >
                    حذف
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
