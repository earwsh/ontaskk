/**
 * multer decodes the multipart `filename` header as latin-1, so a Persian
 * name arrives as mojibake ("ریلز" → "Ø±ÛÙØ²"). Re-interpret those bytes
 * as UTF-8 to get the name the user actually typed.
 */
export function decodeUploadName(name: string): string {
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    // Only accept the re-decode when it round-trips; plain ASCII names must
    // pass through untouched.
    return Buffer.from(fixed, 'utf8').toString('latin1') === name ? fixed : name;
  } catch {
    return name;
  }
}
