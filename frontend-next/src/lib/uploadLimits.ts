/**
 * Mirror of the server's attachment ceiling.
 *
 * Checked in the browser as well so an oversized file is refused before it is
 * sent: on a slow connection the alternative is watching a 300 MB upload run
 * for minutes and then fail. The server still enforces it — this is a
 * courtesy, not the gate.
 */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_ATTACHMENT_LABEL = '۱۰۰ مگابایت';

/** Names the files that are too big, in a sentence ready to show. */
export function oversizedFilesMessage(files: File[]): string | null {
  const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
  if (!tooBig.length) return null;
  const names = tooBig.map((f) => `${f.name} (${(f.size / 1024 ** 2).toFixed(1)} مگابایت)`).join('، ');
  return `حجم این فایل‌ها بیشتر از ${MAX_ATTACHMENT_LABEL} است و اضافه نشدند: ${names}`;
}
