import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Plus, Filter, Home, AlertTriangle, ChevronDown } from 'lucide-react';
import { useProject } from '../hooks/useProject';
import ProjectCard from './ProjectCard';
import FloatingBackground from './FloatingBackground';
import { defaultProjectsPageBlobs } from './floatingBackgroundPresets';
import {
  capturePositions,
  applyFlipAnimation,
  DEFAULT_ANIMATION_CONFIG,
} from '../utils/huarongdaoAnimation';

interface ProjectsPageProps {
  onCreateNew: () => void;
  onProjectClick: (project: any) => void;
}

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'building', label: '构建中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
];

export default function ProjectsPage({ onCreateNew, onProjectClick }: ProjectsPageProps) {
  const { projects, loading, deleteProject } = useProject();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const positionsBeforeDeleteRef = useRef<Map<string, DOMRect>>(new Map());
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const filteredProjects = projects.filter(project => {
    const matchesSearch =
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const captureCurrentPositions = useCallback(() => {
    if (gridContainerRef.current) {
      positionsBeforeDeleteRef.current = capturePositions(gridContainerRef.current);
    }
  }, []);

  const executeHuarongdaoReorderAnimation = useCallback(async () => {
    if (!gridContainerRef.current || isAnimating) return;

    setIsAnimating(true);

    await new Promise(resolve => requestAnimationFrame(resolve));

    const newPositions = capturePositions(gridContainerRef.current);
    const oldPositions = positionsBeforeDeleteRef.current;
    const animationPromises: Promise<void>[] = [];

    const itemsToAnimate = Array.from(newPositions.keys());
    const totalItems = itemsToAnimate.length;

    itemsToAnimate.forEach((id, index) => {
      const oldPos = oldPositions.get(id);
      const newPos = newPositions.get(id);

      if (oldPos && newPos) {
        const deltaX = oldPos.left - newPos.left;
        const deltaY = oldPos.top - newPos.top;

        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          const element = gridContainerRef.current?.querySelector(
            `[data-project-id="${id}"]`
          ) as HTMLElement;

          if (element) {
            const delay = DEFAULT_ANIMATION_CONFIG.enableRandomPath
              ? Math.random() * DEFAULT_ANIMATION_CONFIG.maxDelay
              : (index / totalItems) * DEFAULT_ANIMATION_CONFIG.maxDelay;

            animationPromises.push(
              applyFlipAnimation(element, deltaX, deltaY, DEFAULT_ANIMATION_CONFIG, delay)
            );
          }
        }
      }
    });

    await Promise.all(animationPromises);

    setIsAnimating(false);
    positionsBeforeDeleteRef.current = new Map();
  }, [isAnimating]);

  useEffect(() => {
    if (deletingId === null && positionsBeforeDeleteRef.current.size > 0 && !isAnimating) {
      executeHuarongdaoReorderAnimation();
    }
  }, [deletingId, executeHuarongdaoReorderAnimation, isAnimating]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };

    if (showStatusDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStatusDropdown]);

  const handleDeleteClick = (projectId: string) => {
    setDeleteConfirm(projectId);
  };

  const handleStatusSelect = (value: string) => {
    setStatusFilter(value);
    setShowStatusDropdown(false);
  };

  const currentStatusLabel = statusOptions.find(opt => opt.value === statusFilter)?.label || '全部状态';

  const handleConfirmDelete = async () => {
    if (!deleteConfirm || deleting) return;

    const projectIdToDelete = deleteConfirm;
    setDeleting(true);
    setDeletingId(projectIdToDelete);
    setDeleteConfirm(null);

    captureCurrentPositions();

    await new Promise(resolve => setTimeout(resolve, 500));

    const { error } = await deleteProject(projectIdToDelete);

    if (error) {
      console.error('删除项目错误:', error);
      alert('删除项目失败，请重试');
      setDeletingId(null);
      positionsBeforeDeleteRef.current = new Map();
    } else {
      await new Promise(resolve => setTimeout(resolve, 50));
      setDeletingId(null);
    }

    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  const projectToDelete = projects.find(p => p.id === deleteConfirm);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative">
      <FloatingBackground blobs={defaultProjectsPageBlobs} />

      {deleteConfirm && projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl backdrop-blur-xl bg-white/80 border border-white/60 shadow-[0_24px_60px_rgba(0,0,0,0.20)] p-7 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">确认删除</h3>
                <p className="text-sm text-gray-500 mt-0.5">此操作无法撤销</p>
              </div>
            </div>

            <div className="backdrop-blur-sm bg-white/50 border border-white/60 rounded-2xl p-4">
              <p className="text-sm text-gray-700">
                你确定要删除项目{' '}
                <span className="font-semibold text-gray-900">"{projectToDelete.title}"</span>{' '}
                吗？
              </p>
              <p className="text-xs text-gray-500 mt-2">
                项目的所有数据和构建日志都将被永久删除。
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-white/50 border border-white/60 text-gray-700 font-medium hover:bg-white/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-red-500/90 hover:bg-red-600/90 text-white font-medium shadow-[0_4px_16px_rgba(239,68,68,0.25)] border border-red-400/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="sticky top-0 z-20 px-6 md:px-8 py-6 backdrop-blur-xl bg-white/60 border-b border-white/40">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">我的项目</h1>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/50 border border-white/60 text-gray-600 shadow-sm">
                  {filteredProjects.length} 个项目
                </span>
              </div>

              <button
                onClick={onCreateNew}
                className="relative inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-500/90 hover:bg-blue-600/90 text-white font-medium shadow-[0_4px_16px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] border border-blue-400/30 transition-all overflow-hidden group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                <Plus className="w-5 h-5 relative z-10" />
                <span className="relative z-10">新建项目</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索项目..."
                  className="w-full pl-12 pr-4 py-3 backdrop-blur-sm bg-white/50 border border-white/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all text-gray-700 placeholder-gray-400"
                />
              </div>

              <div ref={statusDropdownRef} className="relative">
                <button
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="flex items-center gap-2 px-4 py-3 backdrop-blur-sm bg-white/50 border border-white/60 rounded-2xl hover:bg-white/70 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
                >
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">{currentStatusLabel}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showStatusDropdown && (
                  <div className="absolute right-0 mt-2 w-40 rounded-2xl backdrop-blur-xl bg-white/90 border border-white/60 shadow-[0_12px_32px_rgba(0,0,0,0.12)] overflow-hidden z-30">
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleStatusSelect(option.value)}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          statusFilter === option.value
                            ? 'bg-blue-50/80 text-blue-600 font-medium'
                            : 'text-gray-700 hover:bg-white/60'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className={`mx-auto px-6 md:px-8 py-8 ${projects.length > 0 ? 'max-w-7xl' : 'h-full flex items-center justify-center'}`}>
          {filteredProjects.length === 0 ? (
            <div className="w-full max-w-lg mx-auto rounded-3xl backdrop-blur-xl bg-white/60 border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-10 text-center">
              <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500/15 to-purple-500/10 border border-white/60">
                {searchTerm || statusFilter !== 'all' ? (
                  <Search className="w-10 h-10 text-blue-500/70" />
                ) : (
                  <Home className="w-10 h-10 text-blue-500/70" />
                )}
              </div>
              <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 mb-3">
                {searchTerm || statusFilter !== 'all' ? '未找到项目' : '还没有项目'}
              </h3>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-8">
                {searchTerm || statusFilter !== 'all'
                  ? '尝试调整搜索条件或筛选器'
                  : '前往主页开始创建你的第一个 AI 项目'}
              </p>
              {projects.length === 0 && !searchTerm && statusFilter === 'all' && (
                <button
                  onClick={onCreateNew}
                  className="relative inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-500/90 hover:bg-blue-600/90 text-white font-medium shadow-[0_4px_16px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] border border-blue-400/30 transition-all overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                  <Home className="w-5 h-5 relative z-10" />
                  <span className="relative z-10">前往主页</span>
                </button>
              )}
            </div>
          ) : (
            <div
              ref={gridContainerRef}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            >
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  data-project-id={project.id}
                  className={`huarongdao-item ${
                    deletingId === project.id
                      ? 'animate-huarongdao-disappear'
                      : ''
                  }`}
                >
                  <ProjectCard
                    project={project}
                    onClick={() => onProjectClick(project)}
                    onDelete={() => handleDeleteClick(project.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
