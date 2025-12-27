import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Plus, Filter, Home, AlertTriangle, ChevronDown } from 'lucide-react';
import { useProject } from '../../hooks/useProject';
import { ProjectCard } from '../project';
import { FloatingBackground, floatingBackgroundPresets, FireBurnOverlay } from '../visual';
import {
  capturePositions,
  applyFlipAnimation,
  DEFAULT_ANIMATION_CONFIG,
} from '../../utils/huarongdaoAnimation';
import { Project } from '../../types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const { defaultProjectsPageBlobs } = floatingBackgroundPresets;

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

interface BurningProject {
  project: Project;
  rect: DOMRect;
}

export default function ProjectsPage({ onCreateNew, onProjectClick }: ProjectsPageProps) {
  const { projects, loading, deleteProject } = useProject();
  const [pendingSearchTerm, setPendingSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [burningProjects, setBurningProjects] = useState<BurningProject[]>([]);
  const [exitingProjectIds, setExitingProjectIds] = useState<Set<string>>(new Set());
  const [heatShakeIds, setHeatShakeIds] = useState<Set<string>>(new Set());

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const positionsBeforeDeleteRef = useRef<Map<string, DOMRect>>(new Map());
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const projectRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const baseFilteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesSearch =
        project.title.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(appliedSearchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, appliedSearchTerm, statusFilter]);

  const displayedProjects = useMemo(() => {
    return baseFilteredProjects.filter(p => !exitingProjectIds.has(p.id));
  }, [baseFilteredProjects, exitingProjectIds]);

  const filteredProjects = displayedProjects;

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

  const captureProjectRects = useCallback(() => {
    if (!gridContainerRef.current) return;
    const items = gridContainerRef.current.querySelectorAll('[data-project-id]');
    const rects = new Map<string, DOMRect>();
    items.forEach((item) => {
      const id = item.getAttribute('data-project-id');
      if (id) {
        rects.set(id, item.getBoundingClientRect());
      }
    });
    projectRectsRef.current = rects;
  }, []);

  const handleSearch = useCallback(async () => {
    if (isSearching || isAnimating) return;

    const newSearchTerm = pendingSearchTerm.trim();
    if (newSearchTerm === appliedSearchTerm) return;

    setIsSearching(true);

    captureProjectRects();
    captureCurrentPositions();

    const currentProjects = projects.filter(project => {
      const matchesSearch =
        project.title.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(appliedSearchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const nextProjects = projects.filter(project => {
      const matchesSearch =
        project.title.toLowerCase().includes(newSearchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(newSearchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const nextProjectIds = new Set(nextProjects.map(p => p.id));
    const projectsToRemove = currentProjects.filter(p => !nextProjectIds.has(p.id));

    if (projectsToRemove.length > 0) {
      const allCurrentIds = new Set(currentProjects.map(p => p.id));
      setHeatShakeIds(allCurrentIds);

      await new Promise(resolve => setTimeout(resolve, 300));
      setHeatShakeIds(new Set());

      const burningList: BurningProject[] = [];
      projectsToRemove.forEach(project => {
        const rect = projectRectsRef.current.get(project.id);
        if (rect) {
          burningList.push({ project, rect });
        }
      });

      if (burningList.length > 0) {
        setBurningProjects(burningList);
        setExitingProjectIds(new Set(projectsToRemove.map(p => p.id)));

        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    setAppliedSearchTerm(newSearchTerm);
    setBurningProjects([]);
    setExitingProjectIds(new Set());

    await new Promise(resolve => setTimeout(resolve, 50));

    if (projectsToRemove.length > 0) {
      executeHuarongdaoReorderAnimation();
    }

    setIsSearching(false);
  }, [
    isSearching,
    isAnimating,
    pendingSearchTerm,
    appliedSearchTerm,
    projects,
    statusFilter,
    captureProjectRects,
    captureCurrentPositions,
    executeHuarongdaoReorderAnimation,
  ]);

  const handleBurnComplete = useCallback((projectId: string) => {
    setBurningProjects(prev => prev.filter(bp => bp.project.id !== projectId));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

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

      <AlertDialog open={!!deleteConfirm && !!projectToDelete} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-7 h-7 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">确认删除</AlertDialogTitle>
                <AlertDialogDescription className="mt-0.5">此操作无法撤销</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-sm">
                你确定要删除项目{' '}
                <span className="font-semibold">"{projectToDelete?.title}"</span>{' '}
                吗？
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                项目的所有数据和构建日志都将被永久删除。
              </p>
            </CardContent>
          </Card>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {projects.length > 0 && (
        <div className="sticky top-0 z-20 px-6 md:px-8 py-6 backdrop-blur-xl bg-white/60 border-b border-white/40">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">我的项目</h1>
                <Badge variant="secondary">
                  {filteredProjects.length} 个项目
                </Badge>
              </div>

              <Button onClick={onCreateNew}>
                <Plus className="w-5 h-5" />
                <span>新建项目</span>
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={pendingSearchTerm}
                  onChange={(e) => setPendingSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="搜索项目..."
                  className="pl-10"
                />
              </div>

              <Button
                onClick={handleSearch}
                disabled={isSearching || isAnimating}
                variant="secondary"
                className={`search-button-sweep ${isSearching ? 'is-searching' : ''}`}
              >
                <Search className="w-4 h-4" />
                搜索
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Filter className="w-4 h-4" />
                    <span>{currentStatusLabel}</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {statusOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => handleStatusSelect(option.value)}
                      className={statusFilter === option.value ? 'bg-accent' : ''}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className={`mx-auto px-6 md:px-8 py-8 ${projects.length > 0 ? 'max-w-7xl' : 'h-full flex items-center justify-center'}`}>
          {filteredProjects.length === 0 ? (
            <Card className="w-full max-w-lg mx-auto text-center">
              <CardContent className="p-10">
                <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 border">
                  {appliedSearchTerm || statusFilter !== 'all' ? (
                    <Search className="w-10 h-10 text-primary/70" />
                  ) : (
                    <Home className="w-10 h-10 text-primary/70" />
                  )}
                </div>
                <h3 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                  {appliedSearchTerm || statusFilter !== 'all' ? '未找到项目' : '还没有项目'}
                </h3>
                <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
                  {appliedSearchTerm || statusFilter !== 'all'
                    ? '尝试调整搜索条件或筛选器'
                    : '前往主页开始创建你的第一个 AI 项目'}
                </p>
                {projects.length === 0 && !appliedSearchTerm && statusFilter === 'all' && (
                  <Button onClick={onCreateNew}>
                    <Home className="w-5 h-5" />
                    <span>前往主页</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ): (
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
                      : exitingProjectIds.has(project.id)
                      ? 'animate-fire-burn-disappear'
                      : heatShakeIds.has(project.id)
                      ? 'animate-heat-shake'
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

      {burningProjects.map((bp) => (
        <FireBurnOverlay
          key={bp.project.id}
          targetRect={bp.rect}
          onComplete={() => handleBurnComplete(bp.project.id)}
        />
      ))}
    </div>
  );
}
