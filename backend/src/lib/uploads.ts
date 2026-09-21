import fs from 'fs';
import path from 'path';

/**
 * Where uploaded files live on disk.
 *
 * This must sit OUTSIDE the deployed code directory. The blue-green deploy
 * replaces `backend/` wholesale on every release — it moves the live directory
 * to `backend-previous`, unpacks a fresh copy from the tarball, and deletes
 * `backend-previous` on the following release. An uploads folder nested inside
 * `backend/` therefore survives exactly one deploy and is then erased, which is
 * how fifteen task attachments became dead links.
 *
 * In production UPLOADS_DIR points at a persistent path; local development
 * keeps the old default so nothing extra needs configuring.
 */
export const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')
);

export function ensureUploadsDir(): void {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

/**
 * Whether a stored file is actually still on disk.
 *
 * A row in the database is not proof the bytes exist. Showing a link that
 * silently does nothing is worse than saying the file is missing.
 */
export function storedFileExists(fileUrl: string | null | undefined): boolean {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return false;
  const name = path.basename(fileUrl);
  // basename strips any traversal, so the lookup cannot escape the folder.
  return fs.existsSync(path.join(uploadsDir, name));
}

/**
 * Remove a stored file from disk.
 *
 * Deleting only the database row leaves the bytes behind forever. That was
 * harmless while every deploy wiped the folder anyway; now that uploads
 * persist, orphans would accumulate with nothing left pointing at them.
 */
export function removeStoredFile(fileUrl: string | null | undefined): void {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
  // basename strips any traversal, so this cannot delete outside the folder.
  const target = path.join(uploadsDir, path.basename(fileUrl));
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (err) {
    // A file we cannot remove is a leak, not a failed deletion: the row is
    // still going away, so report and carry on.
    console.error('[uploads] could not remove', target, err);
  }
}
