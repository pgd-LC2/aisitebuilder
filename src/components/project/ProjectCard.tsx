import { Clock, MoreVertical, Trash2 } from 'lucide-react';
import { Project } from '../../types/project';
import { useState, useRef, useEffect } from 'react';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete?: () => void;
}

const statusStyles = {
  draft: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-600',
    border: 'border-gray-500/20',
    ring: 'ring-gray-500/10'
  },
  building: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600',
    border: 'border-blue-500/20',
    ring: 'ring-blue-500/10'
  },
  completed: {
    bg: 'bg-green-500/10',
    text: 'text-green-600',
    border: 'border-green-500/20',
    ring: 'ring-green-500/10'
  },
  failed: {
    bg: 'bg-red-500/10',
    text: 'text-red-600',
    border: 'border-red-500/20',
    ring: 'ring-red-500/10'
  }
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

  const style = statusStyles[project.status];

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-3xl border border-white/60 bg-white/60 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.10)] p-5"
    >
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {onDelete && (
        <div ref={menuRef} className="absolute top-4 right-4 z-10">
          <button
            onClick={handleMenuClick}
            className="p-2 rounded-xl bg-white/40 border border-white/60 shadow-sm opacity-0 group-hover:opacity-100 hover:bg-white/60 transition-all"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 rounded-2xl backdrop-blur-xl bg-white/90 border border-white/60 shadow-[0_12px_32px_rgba(0,0,0,0.12)] overflow-hidden min-w-[140px]">
              <button
                onClick={handleDelete}
                className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50/80 flex items-center gap-2.5 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除项目
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 relative z-[1]">
        <div className="flex items-start justify-between gap-3 pr-10">
          <h3 className="font-semibold text-gray-900 text-base line-clamp-2 leading-snug">
            {project.title}
          </h3>
        </div>

        <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
          {truncateDescription(project.description)}
        </p>

        <div className="flex items-center justify-between pt-3 border-t border-white/60">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ring-1 ${style.bg} ${style.text} ${style.ring} border ${style.border}`}>
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
