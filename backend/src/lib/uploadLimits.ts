/**
 * Upload ceiling for task attachments, in bytes.
 *
 * Three layers have to agree or the limit lies to somebody: nginx rejects a
 * body over `client_max_body_size` before Node sees it, multer rejects what
 * gets through, and the browser checks before spending minutes sending a file
 * that will be refused on arrival. This is the number the other two are set
 * from; nginx's copy lives in its own config and is written as 100M there.
 */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export const MAX_ATTACHMENT_LABEL = '۱۰۰ مگابایت';
