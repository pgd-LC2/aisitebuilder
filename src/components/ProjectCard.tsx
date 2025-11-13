import { Clock, MoreVertical, Trash2 } from 'lucide-react';
import { Project } from '../types/project';
import { useState, useRef, useEffect } from 'react';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete?: () => void;
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  building: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700'
};

const statusLabels = {
  draft: '草稿',
  building: '构建中',
  completed: '已完成',
  failed: '失败'
};

export default function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} 分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours} 小时前`;
    } else if (diffDays < 7) {
      return `${diffDays} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  const truncateDescription = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete?.();
  };

  return (
    <div
      onClick={onClick}
      className="group bg-white border border-gray-200 rounded-xl p-4 cursor-pointer transition-all hover:shadow-md hover:border-gray-300 relative"
    >
      {onDelete && (
        <div ref={menuRef} className="absolute top-3 right-3 z-10">
          <button
            onClick={handleMenuClick}
            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded-lg transition-opacity"
          >
            <MoreVertical className="w-4 h-4 text-gray-600" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
              <button
                onClick={handleDelete}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除项目
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 pr-8">
          <h3 className="font-semibold text-gray-900 text-base line-clamp-2">
            {project.title}
          </h3>
        </div>

        <p className="text-sm text-gray-600 line-clamp-2">
          {truncateDescription(project.description)}
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[project.status]}`}>
            {statusLabels[project.status]}
          </span>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDate(project.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
