import { X, Download, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ProjectFile } from '../../types/project';
import { fileService } from '../../services/fileService';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-gray-900 truncate">
              {file.file_name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {fileService.formatFileSize(file.file_size)} · {file.mime_type}
            </p>
          </div>

          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={handleDownload}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="下载"
            >
              <Download className="w-4 h-4 text-gray-600" />
            </button>

            <button
              onClick={handleShare}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="分享"
            >
              <Share2 className="w-4 h-4 text-gray-600" />
            </button>

            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-1"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {loading && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                <p className="text-sm text-gray-600">加载中...</p>
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
              className="w-full h-full rounded-lg border border-gray-200"
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
                  <p className="text-sm font-medium text-gray-900">
                    {file.file_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    此文件类型暂不支持预览
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                >
                  下载文件
                </button>
              </div>
            </div>
          )}
        </div>

        {shareUrl && (
          <div className="p-4 border-t border-gray-200 bg-blue-50">
            <p className="text-xs text-gray-700 mb-2">
              分享链接已生成（7天有效）：
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  alert('已复制到剪贴板');
                }}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors"
              >
                复制
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
