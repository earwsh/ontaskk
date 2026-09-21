'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import { gregorianToShamsi, jalaliDateTime } from '@/lib/date';
import api from '@/lib/api';

interface TicketUser {
  id: number;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role?: string;
  position?: string | null;
}

interface Ticket {
  id: number;
  title: string;
  description: string;
  department: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  response?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  userId: number;
  user: TicketUser;
}

const statusConfig: Record<string, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'در انتظار بررسی', tone: 'warn' },
  IN_PROGRESS: { label: 'در حال بررسی', tone: 'info' },
  RESOLVED: { label: 'حل‌شده', tone: 'ok' },
  CLOSED: { label: 'بسته شده', tone: 'neutral' },
};

const priorityConfig: Record<string, { label: string; tone: BadgeTone }> = {
  LOW: { label: 'پایین', tone: 'neutral' },
  NORMAL: { label: 'عادی', tone: 'info' },
  HIGH: { label: 'فوری', tone: 'coral' },
  CRITICAL: { label: 'بحرانی', tone: 'bad' },
};

const deptNames: Record<string, string> = {
  technical: 'فنی و زیرساخت',
  design: 'طراحی و رابط کاربری',
  content: 'محتوا و مارکتینگ',
  finance: 'مالی و اداری',
  general: 'عمومی',
};

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'همین الان';
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} روز پیش`;
  return gregorianToShamsi(iso);
}

export default function TechTicketsPage() {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Response form inside selected ticket
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/tickets');
      setTickets(res.data || []);
      if (selectedTicketId) {
        const found = (res.data || []).find((t: Ticket) => t.id === selectedTicketId);
        if (found) {
          setReplyText(found.response || '');
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در دریافت تیکت‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedTicketId, showToast]);

  useEffect(() => {
    fetchTickets();
  }, []);

  const selectTicket = (ticket: Ticket) => {
    if (selectedTicketId === ticket.id) {
      setSelectedTicketId(null);
      setReplyText('');
    } else {
      setSelectedTicketId(ticket.id);
      setReplyText(ticket.response || '');
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'OPEN').length;
    const inProgress = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const resolved = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    return { total, open, inProgress, resolved };
  }, [tickets]);

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      ALL: tickets.length,
      OPEN: tickets.filter((t) => t.status === 'OPEN').length,
      IN_PROGRESS: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
      RESOLVED: tickets.filter((t) => t.status === 'RESOLVED').length,
      CLOSED: tickets.filter((t) => t.status === 'CLOSED').length,
    };
  }, [tickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && ticket.priority !== priorityFilter) return false;
      if (departmentFilter !== 'ALL' && ticket.department !== departmentFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const author = `${ticket.user?.firstName || ''} ${ticket.user?.lastName || ''}`.toLowerCase();
        const title = (ticket.title || '').toLowerCase();
        const desc = (ticket.description || '').toLowerCase();
        return author.includes(q) || title.includes(q) || desc.includes(q);
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, departmentFilter, searchQuery]);

  const filterCount = [
    statusFilter !== 'ALL' ? statusFilter : null,
    priorityFilter !== 'ALL' ? priorityFilter : null,
    departmentFilter !== 'ALL' ? departmentFilter : null,
  ].filter(Boolean).length + (searchQuery ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setDepartmentFilter('ALL');
    setSearchQuery('');
  };

  // Handle status update
  const handleUpdateStatus = async (ticketId: number, newStatus: Ticket['status']) => {
    try {
      setUpdatingStatusId(ticketId);
      const res = await api.patch(`/tickets/${ticketId}`, { status: newStatus });
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data : t)));
      showToast(`وضعیت تیکت به «${statusConfig[newStatus]?.label || newStatus}» تغییر یافت.`);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در تغییر وضعیت تیکت', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Handle response submission
  const handleSendReply = async (ticketId: number) => {
    if (!replyText.trim()) {
      showToast('لطفاً متن پاسخ را وارد نمایید.', 'error');
      return;
    }

    try {
      setIsSubmittingReply(true);
      const res = await api.patch(`/tickets/${ticketId}`, {
        response: replyText.trim(),
        status: 'IN_PROGRESS',
      });
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data : t)));
      showToast('پاسخ با موفقیت ثبت شد و به کاربر اطلاع داده شد.');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ارسال پاسخ', 'error');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Resolve with reply
  const handleResolveWithReply = async (ticketId: number) => {
    try {
      setIsSubmittingReply(true);
      const res = await api.patch(`/tickets/${ticketId}`, {
        response: replyText.trim() || undefined,
        status: 'RESOLVED',
      });
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data : t)));
      showToast('تیکت حل شد و به کاربر اطلاع داده شد.');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حل تیکت', 'error');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const selectedTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  const selectClass = 'cursor-pointer rounded-full bg-card px-3.5 py-1.5 text-xs text-fg-secondary shadow-flat outline-none border border-line';

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'CEO', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER']}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <label className="relative">
            <span className="sr-only">جستجو در تیکت‌ها</span>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در تیکت‌ها…"
              className="w-48 rounded-full bg-card py-2 pr-9 pl-3 text-xs text-fg shadow-flat outline-none transition-all placeholder:text-fg-muted focus:w-64 border border-line"
            />
          </label>

          <button
            onClick={() => fetchTickets()}
            disabled={loading}
            aria-label="بروزرسانی"
            title="بروزرسانی لیست"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-card text-fg-secondary shadow-flat transition-colors hover:text-fg border border-line disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI Row matching other dashboards */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'کل تیکت‌ها', value: stats.total, hint: 'مجموع درخواست‌ها' },
          { label: 'در انتظار بررسی', value: stats.open, hint: 'نیاز به اقدام اولیه', tone: stats.open ? 'warn' : 'ok' },
          { label: 'در حال پیگیری', value: stats.inProgress, hint: 'درحال بررسی فنی', tone: 'info' },
          { label: 'حل‌شده', value: stats.resolved, hint: `${stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0}٪ از کل`, tone: 'ok' },
        ].map((k) => (
          <Card key={k.label} padding="sm">
            <div className="flex items-start justify-between">
              {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  k.tone === 'bad'
                    ? 'bg-bad-soft text-bad'
                    : k.tone === 'warn'
                    ? 'bg-warn-soft text-warn'
                    : k.tone === 'ok'
                    ? 'bg-ok-soft text-ok'
                    : k.tone === 'info'
                    ? 'bg-info-soft text-info'
                    : 'bg-sunken text-fg-secondary'
                }`}
              >
                {k.label}
              </span>
            </div>
            {k.hint && <p className="mt-3 text-[11px] text-fg-muted">{k.hint}</p>}
          </Card>
        ))}
      </div>

      {/* Unified Filter Bar */}
      <Card padding="sm" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={selectClass}
            aria-label="دپارتمان"
          >
            <option value="ALL">همه دپارتمان‌ها</option>
            <option value="technical">فنی و زیرساخت</option>
            <option value="design">طراحی</option>
            <option value="content">محتوا</option>
            <option value="finance">مالی</option>
            <option value="general">عمومی</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className={selectClass}
            aria-label="اولویت"
          >
            <option value="ALL">همه اولویت‌ها</option>
            <option value="CRITICAL">بحرانی</option>
            <option value="HIGH">فوری</option>
            <option value="NORMAL">عادی</option>
            <option value="LOW">پایین</option>
          </select>

          <span className="mx-1 h-5 w-px bg-line" />

          {[
            { key: 'ALL', label: 'همه تیکت‌ها', count: statusCounts.ALL },
            { key: 'OPEN', label: 'در انتظار بررسی', count: statusCounts.OPEN },
            { key: 'IN_PROGRESS', label: 'در حال بررسی', count: statusCounts.IN_PROGRESS },
            { key: 'RESOLVED', label: 'حل‌شده', count: statusCounts.RESOLVED },
            { key: 'CLOSED', label: 'بسته‌شده', count: statusCounts.CLOSED },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border border-line ${
                statusFilter === s.key
                  ? 'bg-pill text-pill-fg'
                  : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
              }`}
            >
              {s.label}
              <span className="tnum mr-1.5 opacity-70">({s.count})</span>
            </button>
          ))}

          {filterCount > 0 && (
            <button
              onClick={clearFilters}
              className="cursor-pointer rounded-full bg-bad-soft px-3 py-1 text-xs font-medium text-bad transition-opacity hover:opacity-80"
            >
              پاک کردن {filterCount} فیلتر
            </button>
          )}

          <div className="mr-auto flex items-center gap-2">
            <span className="tnum text-[11px] text-fg-muted">{filteredTickets.length} نتیجه</span>
          </div>
        </div>
      </Card>

      {/* Content Layout: Master-Detail List */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Ticket Cards List (7 cols on large) */}
        <div className="space-y-3 lg:col-span-7">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-card" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <Card padding="md" className="py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-fg-muted mx-auto">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-fg">تیکتی یافت نشد</h3>
              <p className="mt-1 text-xs text-fg-muted">
                {searchQuery || statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                  ? 'با فیلترهای انتخابی موردی وجود ندارد.'
                  : 'هیچ تیکتی تا کنون ثبت نشده است.'}
              </p>
            </Card>
          ) : (
            filteredTickets.map((ticket) => {
              const isSelected = selectedTicketId === ticket.id;
              const st = statusConfig[ticket.status] || { label: ticket.status, tone: 'neutral' };
              const pr = priorityConfig[ticket.priority] || { label: ticket.priority, tone: 'neutral' };
              const authorName = `${ticket.user?.firstName || ''} ${ticket.user?.lastName || ''}`.trim() || 'کاربر';

              return (
                <div
                  key={ticket.id}
                  onClick={() => selectTicket(ticket)}
                  className="cursor-pointer"
                >
                  <Card
                    interactive
                    padding="sm"
                    className={`transition-all ${isSelected ? 'ring-2 ring-brand border-brand' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={authorName}
                          src={ticket.user?.avatarUrl}
                          size={36}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-fg">{authorName}</span>
                            {ticket.user?.position && (
                              <span className="text-[10px] text-fg-muted">({ticket.user.position})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-fg-muted mt-0.5">
                            <span>{deptNames[ticket.department] || ticket.department}</span>
                            <span>•</span>
                            <span title={jalaliDateTime(ticket.createdAt)}>{ago(ticket.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge tone={pr.tone}>{pr.label}</Badge>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                    </div>

                    {/* Ticket Title & Excerpt */}
                    <div className="mt-3">
                      <h4 className="text-sm font-bold text-fg">
                        {ticket.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-secondary">
                        {ticket.description}
                      </p>
                    </div>

                    {/* Quick Meta Footer */}
                    <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-fg-muted">
                      <span className="tnum font-mono">شناسه: #{ticket.id}</span>
                      {ticket.response ? (
                        <span className="flex items-center gap-1 text-ok font-medium">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          پاسخ داده شده
                        </span>
                      ) : (
                        <span className="text-warn font-medium">در انتظار پاسخ</span>
                      )}
                    </div>
                  </Card>
                </div>
              );
            })
          )}
        </div>

        {/* Ticket Detail & Action Panel (5 cols on large) */}
        <div className="lg:col-span-5">
          <div className="sticky top-20">
            {selectedTicket ? (
              <Card padding="md" className="space-y-4">
                {/* Top Bar of Detail */}
                <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="tnum font-mono text-xs font-semibold text-brand">#{selectedTicket.id}</span>
                      <Badge tone={priorityConfig[selectedTicket.priority]?.tone || 'neutral'}>
                        {priorityConfig[selectedTicket.priority]?.label || selectedTicket.priority}
                      </Badge>
                      <Badge tone={statusConfig[selectedTicket.status]?.tone || 'neutral'}>
                        {statusConfig[selectedTicket.status]?.label || selectedTicket.status}
                      </Badge>
                    </div>
                    <h2 className="mt-2 text-base font-bold text-fg">
                      {selectedTicket.title}
                    </h2>
                  </div>

                  <button
                    onClick={() => setSelectedTicketId(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken text-fg-muted hover:text-fg transition"
                    title="بستن پنل جزئیات"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Sender Info & Direct Chat */}
                <div className="flex items-center justify-between rounded-tile bg-sunken p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={`${selectedTicket.user?.firstName || ''} ${selectedTicket.user?.lastName || ''}`}
                      src={selectedTicket.user?.avatarUrl}
                      size={36}
                    />
                    <div>
                      <div className="text-xs font-semibold text-fg">
                        {selectedTicket.user?.firstName} {selectedTicket.user?.lastName}
                      </div>
                      <div className="text-[11px] text-fg-muted">
                        {selectedTicket.user?.position || selectedTicket.user?.role || 'عضو سازمان'}
                      </div>
                    </div>
                  </div>

                  {/* Direct Chat Shortcut */}
                  <Link
                    href={`/dashboard/chat`}
                    className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-fg shadow-flat border border-line hover:text-brand transition"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    پیام‌رسان
                  </Link>
                </div>

                {/* Ticket Details Body */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-fg-muted">شرح تیکت:</label>
                  <div className="rounded-tile bg-sunken/60 p-3.5 text-xs leading-relaxed text-fg whitespace-pre-wrap border border-line">
                    {selectedTicket.description}
                  </div>
                  <div className="flex justify-between text-[11px] text-fg-muted px-1 pt-0.5">
                    <span>ثبت: {jalaliDateTime(selectedTicket.createdAt)}</span>
                    {selectedTicket.resolvedAt && (
                      <span>حل: {jalaliDateTime(selectedTicket.resolvedAt)}</span>
                    )}
                  </div>
                </div>

                {/* Quick Status Changers */}
                <div className="space-y-1.5 border-t border-line pt-3">
                  <label className="text-[11px] font-semibold text-fg-muted">تغییر وضعیت:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((st) => (
                      <button
                        key={st}
                        disabled={updatingStatusId === selectedTicket.id || selectedTicket.status === st}
                        onClick={() => handleUpdateStatus(selectedTicket.id, st)}
                        className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition border border-line ${
                          selectedTicket.status === st
                            ? 'bg-pill text-pill-fg'
                            : 'bg-card text-fg-secondary hover:text-fg shadow-flat'
                        } disabled:opacity-40`}
                      >
                        {statusConfig[st]?.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reply / Official Response Section */}
                <div className="space-y-2 border-t border-line pt-3">
                  <label className="text-[11px] font-semibold text-fg-muted">
                    پاسخ مدیر فنی:
                  </label>
                  <textarea
                    rows={4}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="متن پاسخ، راهکار یا وضعیت رفع مشکل را اینجا بنویسید…"
                    className="w-full resize-none rounded-tile bg-sunken p-3 text-xs leading-relaxed text-fg border border-line placeholder:text-fg-muted focus:bg-card focus:border-brand outline-none"
                  />

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSubmittingReply || !replyText.trim()}
                      onClick={() => handleSendReply(selectedTicket.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg shadow-flat transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {isSubmittingReply ? (
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                      ثبت پاسخ
                    </button>

                    <button
                      type="button"
                      disabled={isSubmittingReply}
                      onClick={() => handleResolveWithReply(selectedTicket.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-ok-soft px-4 py-2 text-xs font-medium text-ok border border-ok/30 transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      حل و خاتمه
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card padding="md" className="py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-fg-muted">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-fg">انتخاب تیکت</h3>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  برای مشاهده جزئیات، پاسخ‌دهی یا تغییر وضعیت، یکی از تیکت‌ها را انتخاب نمایید.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
