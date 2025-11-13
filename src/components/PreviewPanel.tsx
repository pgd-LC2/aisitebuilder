import { Monitor, Smartphone, Tablet, Eye, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import FileManagerPanel from './FileManagerPanel';

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type PanelMode = 'preview' | 'files';

interface PreviewPanelProps {
  currentVersionId?: string;
}

export default function PreviewPanel({ currentVersionId }: PreviewPanelProps) {
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [panelMode, setPanelMode] = useState<PanelMode>('preview');
  const [previewContent] = useState('<h1>网站预览区</h1><p>AI 生成的网站将显示在这里</p>');
  const { currentProject } = useProject();

  const viewportSizes = {
    desktop: 'w-full',
    tablet: 'w-[768px]',
    mobile: 'w-[375px]',
  };

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setPanelMode('preview')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                panelMode === 'preview'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              预览
            </button>
            <button
              onClick={() => setPanelMode('files')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                panelMode === 'files'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              文件
            </button>
          </div>

          {panelMode === 'preview' && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewportMode('desktop')}
                className={`p-1.5 rounded transition-colors ${
                  viewportMode === 'desktop'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="桌面视图"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewportMode('tablet')}
                className={`p-1.5 rounded transition-colors ${
                  viewportMode === 'tablet'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="平板视图"
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewportMode('mobile')}
                className={`p-1.5 rounded transition-colors ${
                  viewportMode === 'mobile'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="手机视图"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {panelMode === 'preview' ? (
        <div className="flex-1 overflow-auto bg-gray-100 p-8 flex justify-center">
          <div className={`${viewportSizes[viewportMode]} h-full transition-all duration-300`}>
            <iframe
              srcDoc={previewContent}
              className="w-full h-full bg-white rounded-lg shadow-sm border border-gray-200"
              title="网站预览"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {currentProject && (
            <FileManagerPanel projectId={currentProject.id} versionId={currentVersionId} />
          )}
        </div>
      )}
    </div>
  );
}
