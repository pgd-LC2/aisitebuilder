import { Download, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ProjectFile } from '../../types/project';
import { fileService } from '../../services/fileService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FilePreviewProps {
  file: ProjectFile;
  onClose: () => void;
  onDelete?: (fileId: string) => void;
}

export default function FilePreview({ file, onClose, onDelete }: FilePreviewProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isImage = file.mime_type.startsWith('image/');
  const isPdf = file.mime_type.includes('pdf');

  const loadPreview = async () => {
    setLoading(true);
    const { data, error } = await fileService.downloadFile(file.id);
    if (!error && data) {
      setPreviewUrl(data);
    }
    setLoading(false);
  };

  useState(() => {
    if (isImage || isPdf) {
      loadPreview();
    }
  });

  const handleDownload = async () => {
    setLoading(true);
    const { data, error } = await fileService.downloadFile(file.id);
    if (!error && data) {
      window.open(data, '_blank');
    } else {
      alert('下载失败，请重试');
    }
    setLoading(false);
  };

  const handleShare = async () => {
    setLoading(true);
    const { data, error } = await fileService.generateShareLink(file.id, 604800);
    if (!error && data) {
      setShareUrl(data.url);
      await navigator.clipboard.writeText(data.url);
      alert('分享链接已复制到剪贴板');
    } else {
      alert('生成分享链接失败');
    }
    setLoading(false);
  };

  const handleDelete = () => {
    if (confirm(`确定要删除文件 "${file.file_name}" 吗？`)) {
      onDelete?.(file.id);
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base truncate">
                {file.file_name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fileService.formatFileSize(file.file_size)} · {file.mime_type}
              </p>
            </div>

            <div className="flex items-center gap-1 ml-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                disabled={loading}
                title="下载"
              >
                <Download className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
                disabled={loading}
                title="分享"
              >
                <Share2 className="w-4 h-4" />
              </Button>

              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4 bg-muted/50">
          {loading && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                <p className="text-sm text-muted-foreground">加载中...</p>
              </div>
            </div>
          )}

          {!loading && isImage && previewUrl && (
            <div className="flex items-center justify-center h-full">
              <img
                src={previewUrl}
                alt={file.file_name}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
          )}

          {!loading && isPdf && previewUrl && (
            <iframe
              src={previewUrl}
              className="w-full h-full rounded-lg border"
              title={file.file_name}
            />
          )}

          {!loading && !isImage && !isPdf && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="text-5xl">
                  {fileService.getFileIcon(file.mime_type)}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {file.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    此文件类型暂不支持预览
                  </p>
                </div>
                <Button onClick={handleDownload}>
                  下载文件
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>

        {shareUrl && (
          <div className="p-4 border-t bg-primary/5">
            <p className="text-xs text-muted-foreground mb-2">
              分享链接已生成（7天有效）：
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="flex-1 text-xs"
              />
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  alert('已复制到剪贴板');
                }}
              >
                复制
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
