/**
 * Turn a failed request into a sentence that tells the person what to do.
 *
 * The pattern it replaces — `err.response?.data?.error || 'خطا در X'` — was
 * right when the server explained itself and useless otherwise: a dropped
 * connection, a timeout, a file over the size limit and a genuine server
 * fault all collapsed into the same four words, so nobody could tell whether
 * to retry, change something, or call for help.
 *
 * `action` names what was being attempted, in Persian, as a noun phrase:
 * 'ثبت تسک', 'افزودن عضو'.
 */
export function describeRequestError(err: any, action: string): string {
  // Anything the API said about this specific request beats a generic guess.
  const fromServer = err?.response?.data?.error;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;

  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) {
    return `${action} طول کشید و پاسخی نرسید. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.`;
  }

  // No response at all: the request never reached the server, or the answer
  // never came back. Nothing was saved.
  if (!err?.response) {
    return `ارتباط با سرور برقرار نشد، پس ${action} انجام نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید.`;
  }

  const status = err.response.status;
  if (status === 401) return 'نشست شما منقضی شده است. دوباره وارد شوید.';
  if (status === 403) return `اجازه ${action} را ندارید.`;
  if (status === 404) return `مورد مربوط به ${action} پیدا نشد. صفحه را تازه کنید و دوباره تلاش کنید.`;
  if (status === 413) return 'حجم فایل بیشتر از حد مجاز است.';
  if (status === 429) return 'تعداد درخواست‌ها زیاد بود. چند لحظه صبر کنید و دوباره تلاش کنید.';
  if (status >= 500) return `${action} در سرور ناموفق بود. اگر تکرار شد به پشتیبانی اطلاع دهید.`;

  return `${action} انجام نشد (کد ${status}).`;
}
