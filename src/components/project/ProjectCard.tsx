import { Clock, MoreVertical, Trash2 } from 'lucide-react';
import { Project } from '../../types/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete?: () => void;
}

const statusLabels= {
  draft: '草稿',
  building: '构建中',
  completed: '已完成',
  failed: '失败'
};

export default function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft: 'secondary',
    building: 'default',
    completed: 'default',
    failed: 'destructive',
  };

  return (
    <Card
      onClick={onClick}
      className="group relative cursor-pointer transition-shadow transition-colors hover:shadow-md hover:border-primary/20"
    >
      {onDelete && (
        <div className="absolute top-4 right-4 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                删除项目
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 pr-10">
          <h3 className="font-semibold text-base line-clamp-2 leading-snug">
            {project.title}
          </h3>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {truncateDescription(project.description)}
        </p>

        <div className="flex items-center justify-between pt-3 border-t">
          <Badge
            variant={statusVariant[project.status] || 'secondary'}
            className="text-xs"
          >
            {statusLabels[project.status]}
          </Badge>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDate(project.created_at)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
