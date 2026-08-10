'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProjectFormModal from '@/components/ProjectFormModal';
import api from '@/lib/api';
import Link from 'next/link';

interface Project {
  id: number;
  name: string;
  description: string | null;
  client: string | null;
  departmentId: number;
  department: { id: number; name: string };
  createdBy: { id: number; firstName: string; lastName: string };
  _count: { tasks: number; members: number };
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [role, setRole] = useState('');
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  const filteredProjects = selectedDeptId
    ? projects.filter((p) => p.departmentId === selectedDeptId)
    : projects;

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      setRole(u.role);
    }
  }, []);

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
  }, []);

  const canCreate = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(role);

  const statusColors: Record<string, string> = {
    TODO: 'bg-yellow-500/20 text-yellow-400',
    IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
    DONE: 'bg-green-500/20 text-green-400',
  };
  const statusLabel: Record<string, string> = {
    TODO: 'انجام نشده',
    IN_PROGRESS: 'در حال انجام',
    DONE: 'تکمیل شده',
  };

  return (
    <ProtectedRoute allowedRoles={['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">پروژه‌ها</h1>
            <p className="text-text-muted text-sm mt-1">
              {role === 'EMPLOYEE' ? 'تسک‌های من در پروژه‌ها' : 'مدیریت پروژه‌ها و تسک‌ها'}
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => { setEditingProject(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              پروژه جدید
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedDeptId(null)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
              selectedDeptId === null
                ? 'bg-primary text-white'
                : 'bg-card-hover text-text-secondary hover:text-white'
            }`}
          >
            همه
          </button>
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDeptId(d.id)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                selectedDeptId === d.id
                  ? 'bg-primary text-white'
                  : 'bg-card-hover text-text-secondary hover:text-white'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">در حال بارگذاری...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-12 text-center">
            <p className="text-text-muted">هیچ پروژه‌ای یافت نشد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 hover:border-primary/30 transition-all group relative"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-bold group-hover:text-primary transition-colors">{project.name}</h3>
                  </div>
                  {canCreate && (
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingProject(project); setModalOpen(true); }}
                      className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 opacity-0 group-hover:opacity-100 transition-all cursor-pointer" title="ویرایش">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>
                {project.description && (
                  <p className="text-text-secondary text-sm mb-3 line-clamp-2">{project.description}</p>
                )}
                {project.client && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
                    <span>کارفرما:</span>
                    <span className="text-text-secondary">{project.client}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-card-hover text-text-secondary">{project.department.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted pt-3 border-t border-[rgba(255,255,255,0.06)]">
                  <span>{project._count.tasks} تسک</span>
                  <span>{project._count.members} عضو</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <ProjectFormModal
          open={modalOpen}
          project={editingProject}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); setEditingProject(null); fetchProjects(); }}
        />
      </div>
    </ProtectedRoute>
  );
}
