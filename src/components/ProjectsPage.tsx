import { useState } from 'react';
import { Search, Plus, Filter, Home, AlertTriangle } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';
import ProjectCard from './ProjectCard';

interface ProjectsPageProps {
  onCreateNew: () => void;
  onProjectClick: (project: any) => void;
}

export default function ProjectsPage({ onCreateNew, onProjectClick }: ProjectsPageProps) {
  const { projects, loading, deleteProject } = useProject();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredProjects = projects.filter(project => {
    const matchesSearch =
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDeleteClick = (projectId: string) => {
    setDeleteConfirm(projectId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm || deleting) return;

    const projectIdToDelete = deleteConfirm;
    setDeleting(true);
    setDeletingId(projectIdToDelete);
    setDeleteConfirm(null);

    await new Promise(resolve => setTimeout(resolve, 600));

    const { error } = await deleteProject(projectIdToDelete);

    if (error) {
      console.error('删除项目错误:', error);
      alert('删除项目失败，请重试');
      setDeletingId(null);
    } else {
      await new Promise(resolve => setTimeout(resolve, 100));
      setDeletingId(null);
    }

    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  const projectToDelete = projects.find(p => p.id === deleteConfirm);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {deleteConfirm && projectToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">确认删除</h3>
                <p className="text-sm text-gray-600 mt-0.5">此操作无法撤销</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
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
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">我的项目</h1>
                <p className="text-sm text-gray-600 mt-1">
                  共 {filteredProjects.length} 个项目
                </p>
              </div>

              <button
                onClick={onCreateNew}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                <Plus className="w-5 h-5" />
                新建项目
              </button>
            </div>

            <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索项目..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">全部状态</option>
                <option value="draft">草稿</option>
                <option value="building">构建中</option>
                <option value="completed">已完成</option>
                <option value="failed">失败</option>
              </select>
            </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto px-8 py-8 ${projects.length > 0 ? 'max-w-7xl' : 'h-full flex items-center justify-center'}`}>
          {filteredProjects.length === 0 ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
                {searchTerm || statusFilter !== 'all' ? (
                  <Search className="w-10 h-10 text-gray-400" />
                ) : (
                  <Home className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {searchTerm || statusFilter !== 'all' ? '未找到项目' : '还没有项目'}
              </h3>
              <p className="text-gray-600 text-lg mb-8 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'all'
                  ? '尝试调整搜索条件或筛选器'
                  : '前往主页开始创建你的第一个 AI 项目'}
              </p>
              {projects.length === 0 && !searchTerm && statusFilter === 'all' && (
                <button
                  onClick={onCreateNew}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/30"
                >
                  <Home className="w-5 h-5" />
                  前往主页
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className={`transition-all duration-500 ${
                    deletingId === project.id
                      ? 'animate-bubble-out'
                      : 'animate-bubble-in'
                  }`}
                  style={{
                    animation: deletingId === project.id
                      ? 'bubbleOut 0.6s ease-out forwards'
                      : undefined
                  }}
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
