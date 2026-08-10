'use client';

import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import Link from 'next/link';

interface TaskGantt {
  id: number;
  title: string;
  status: string;
  startDate: string | null;
  deadline: string | null;
  weight: number | null;
  estimatedMinutes: number | null;
  project: { id: number; name: string };
  assignees: { user: { id: number; firstName: string; lastName: string } }[];
  hasClash?: boolean;
}

interface ClashInfo {
  userId: number;
  userName: string;
  date: string;
  totalWeight: number;
  taskIds: number[];
  message: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  TODO: { label: 'انجام نشده', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.7)' },
  IN_PROGRESS: { label: 'در حال انجام', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.7)' },
  PENDING_APPROVAL: { label: 'منتظر تایید', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.7)' },
  DONE: { label: 'تکمیل شده', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.7)' },
};

function getTimelineDays() {
  const days = [];
  const start = new Date();
  start.setDate(start.getDate() - 3);
  start.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 21; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    days.push(d);
  }
  return days;
}

export default function GanttPage() {
  const [tasks, setTasks] = useState<TaskGantt[]>([]);
  const [clashes, setClashes] = useState<ClashInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const timelineDays = useMemo(() => getTimelineDays(), []);

  const fetchGanttData = async () => {
    setLoading(true);
    try {
      let query = '?';
      if (selectedProjectId) query += `projectId=${selectedProjectId}&`;
      if (selectedUserId) query += `userId=${selectedUserId}&`;
      
      const { data } = await api.get(`/analytics/gantt${query}`);
      setTasks(data.tasks || []);
      setClashes(data.clashes || []);
    } catch (err) {
      setError('خطا در دریافت اطلاعات گانت');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/projects').then(({ data }) => setProjects(data)).catch(() => {});
    api.get('/users').then(({ data }) => setUsers(data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchGanttData();
  }, [selectedProjectId, selectedUserId]);

  const formatShamsiDayLabel = (date: Date) => {
    const options: any = { day: 'numeric', month: 'short' };
    return date.toLocaleDateString('fa-IR', options);
  };

  const getDayOfWeekName = (date: Date) => {
    const options: any = { weekday: 'narrow' };
    return date.toLocaleDateString('fa-IR', options);
  };

  const getTaskGridPosition = (task: TaskGantt) => {
    const taskStart = task.startDate ? new Date(task.startDate) : new Date();
    taskStart.setHours(0, 0, 0, 0);

    let taskEnd = task.deadline ? new Date(task.deadline) : new Date(taskStart.getTime() + 24 * 60 * 60 * 1000);
    taskEnd.setHours(23, 59, 59, 999);

    if (taskEnd.getTime() < taskStart.getTime()) {
      taskEnd = new Date(taskStart.getTime() + 24 * 60 * 60 * 1000);
      taskEnd.setHours(23, 59, 59, 999);
    }

    const timelineStart = timelineDays[0].getTime();
    const timelineEnd = timelineDays[timelineDays.length - 1].getTime() + 24 * 60 * 60 * 1000;

    if (taskEnd.getTime() < timelineStart || taskStart.getTime() > timelineEnd) {
      return null;
    }

    const totalTimelineDuration = timelineEnd - timelineStart;
    
    const startDiff = Math.max(0, taskStart.getTime() - timelineStart);
    const endDiff = Math.min(totalTimelineDuration, taskEnd.getTime() - timelineStart);

    const startPct = (startDiff / totalTimelineDuration) * 100;
    const widthPct = ((endDiff - startDiff) / totalTimelineDuration) * 100;

    return {
      left: `${startPct}%`,
      width: `${Math.max(4, widthPct)}%`,
    };
  };

  if (loading) return <AnalyticsSkeleton />;

  return (
    <div className="animate-fade-in h-full flex flex-col overflow-hidden space-y-5">
      {/* Title & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">تایم‌لاین گانت پروژه‌ها</h1>
          <p className="mt-1 text-sm text-text-muted">تحلیل زمان‌بندی، سررسید و تداخل‌های بار کاری روزانه کاربران</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white outline-none text-xs cursor-pointer min-w-[150px]"
          >
            <option value="">همه پروژه‌ها</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-2 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white outline-none text-xs cursor-pointer min-w-[150px]"
          >
            <option value="">همه کاربران</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Clashes Warn Alert */}
      {clashes.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[20px] p-4.5 shrink-0 flex flex-col gap-2 animate-pulse">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>هشدارهای تداخل زمانی و بار کاری بیش از ظرفیت (توسط Rust 🦀)</span>
          </div>
          <div className="text-xs text-red-300 space-y-1.5 pr-7 max-h-[100px] overflow-y-auto">
            {clashes.map((c, idx) => (
              <p key={idx}>• {c.message}</p>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div className="flex h-80 flex-col items-center justify-center gap-3 text-text-muted shrink-0">
          <p className="text-sm">{error}</p>
          <button onClick={fetchGanttData} className="cursor-pointer rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-all hover:bg-primary/20">تلاش مجدد</button>
        </div>
      ) : (
        <div className="flex-1 bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] flex flex-col min-h-0 overflow-hidden">
          {/* Legend */}
          <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between shrink-0 text-xs">
            <span className="text-text-secondary font-medium">راهنمای وضعیت تسک‌ها:</span>
            <div className="flex gap-4">
              {Object.entries(statusConfig).map(([status, cfg]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: cfg.color }} />
                  <span className="text-text-muted font-medium">{cfg.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border border-red-500 bg-red-500/20" />
                <span className="text-red-400 font-bold">تداخل زمانی</span>
              </div>
            </div>
          </div>

          {/* Gantt Body */}
          <div className="flex-1 min-h-0 flex flex-col overflow-auto">
            <div className="flex min-w-[900px] border-b border-[rgba(255,255,255,0.06)] sticky top-0 bg-[rgba(16,21,30,0.9)] backdrop-blur z-20">
              <div className="w-[300px] border-l border-[rgba(255,255,255,0.06)] px-4 py-3 shrink-0 flex items-center">
                <span className="text-xs font-bold text-text-secondary">عنوان تسک / انجام‌دهندگان</span>
              </div>
              <div className="flex-1 grid grid-cols-21 relative min-h-[50px]">
                {timelineDays.map((day, idx) => {
                  const isToday = new Date().toDateString() === day.toDateString();
                  return (
                    <div key={idx} className={`flex flex-col items-center justify-center border-l border-[rgba(255,255,255,0.04)] py-1.5 shrink-0 ${isToday ? 'bg-primary/10' : ''}`}>
                      <span className="text-[10px] text-text-muted font-mono">{getDayOfWeekName(day)}</span>
                      <span className={`text-[11px] font-bold mt-0.5 ${isToday ? 'text-primary' : 'text-white'}`}>{formatShamsiDayLabel(day)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-w-[900px] divide-y divide-[rgba(255,255,255,0.04)] flex-1 overflow-y-auto">
              {tasks.length > 0 ? (
                tasks.map((task) => {
                  const position = getTaskGridPosition(task);
                  
                  return (
                    <div key={task.id} className="flex hover:bg-white/[0.01] transition-all min-h-[55px]">
                      {/* Left Side */}
                      <div className="w-[300px] border-l border-[rgba(255,255,255,0.06)] px-4 py-2.5 shrink-0 flex flex-col justify-center min-w-0">
                        <div className="flex items-center justify-start gap-1">
                          {task.hasClash && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-red-500/20 text-red-400 text-[10px] font-bold animate-pulse" title="تداخل بار کاری روزانه!">!</span>
                          )}
                          <Link href={`/dashboard/tasks/${task.id}`} className="text-sm font-medium text-white hover:text-primary transition-all truncate block text-right">
                            {task.title}
                          </Link>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted mt-1 truncate">
                          <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded shrink-0">{task.project.name}</span>
                          <span className="truncate">{task.assignees.map((a) => a.user.firstName).join(', ') || '-'}</span>
                        </div>
                      </div>

                      {/* Right Side */}
                      <div className="flex-1 grid grid-cols-21 relative min-h-full items-center">
                        {timelineDays.map((day, idx) => {
                          const isToday = new Date().toDateString() === day.toDateString();
                          return (
                            <div key={idx} className={`h-full border-l border-[rgba(255,255,255,0.03)] shrink-0 ${isToday ? 'bg-primary/5' : ''}`} />
                          );
                        })}

                        {position && (
                          <div
                            className={`absolute h-7 rounded-lg flex items-center justify-between px-3 text-[10px] font-medium text-white shadow-lg overflow-hidden border group transition-transform duration-300 hover:scale-[1.01] cursor-pointer`}
                            style={{
                              left: position.left,
                              width: position.width,
                              backgroundColor: statusConfig[task.status].bg,
                              boxShadow: task.hasClash 
                                ? '0 0 10px rgba(239, 68, 68, 0.4)' 
                                : `0 4px 14px -4px ${statusConfig[task.status].color}aa`,
                              borderColor: task.hasClash ? '#EF4444' : 'rgba(255,255,255,0.05)',
                            }}
                          >
                            <span className="truncate drop-shadow-md select-none">{task.title}</span>
                            
                            <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[rgba(22,27,38,0.98)] border border-[rgba(255,255,255,0.08)] p-3 rounded-xl shadow-2xl z-30 min-w-[220px] text-right pointer-events-none animate-fade-in">
                              <span className="text-white font-semibold text-xs block mb-1.5">{task.title}</span>
                              <div className="space-y-1 text-[10px] text-text-secondary font-mono">
                                <div>پروژه: <span className="text-white">{task.project.name}</span></div>
                                <div>وضعیت: <span style={{ color: statusConfig[task.status].color }}>{statusConfig[task.status].label}</span></div>
                                <div>شروع: <span className="text-white">{task.startDate ? new Date(task.startDate).toLocaleDateString('fa-IR') : 'مشخص نشده'}</span></div>
                                <div>سررسید: <span className="text-white">{task.deadline ? new Date(task.deadline).toLocaleDateString('fa-IR') : 'مشخص نشده'}</span></div>
                                <div>وزن: <span className="text-white">{task.weight || task.estimatedMinutes || 0} دقیقه</span></div>
                                <div>انجام‌دهندگان: <span className="text-white">{task.assignees.map(a => `${a.user.firstName} ${a.user.lastName}`).join('، ') || '-'}</span></div>
                                {task.hasClash && (
                                  <div className="text-red-400 font-bold border-t border-red-500/20 pt-1 mt-1 text-[9px] animate-pulse">
                                    ⚠️ هشدار: تداخل زمانی و بار کاری بیش از حد مجاز!
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm">تسکی برای نمایش در این بازه پیدا نشد.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
