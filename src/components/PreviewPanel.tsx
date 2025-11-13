import { Monitor, Smartphone, Tablet, Eye, FolderOpen, RefreshCcw, AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { fileService } from '../services/fileService';
import FileManagerPanel from './FileManagerPanel';
import type { ProjectFile } from '../types/project';
import type { WebContainer as WebContainerInstance, WebContainerProcess } from '@webcontainer/api';
type WebContainerConstructor = typeof import('@webcontainer/api').WebContainer;
let webcontainerBootPromise: Promise<WebContainerInstance> | null = null;

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type PanelMode = 'preview' | 'files';
type PreviewStatus = 'idle' | 'loading' | 'installing' | 'starting' | 'running' | 'error' | 'unsupported';

interface PreviewPanelProps {
  currentVersionId?: string;
}

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/javascript', 'application/typescript', 'application/xml'];
const TEXT_MIME_SUFFIXES = ['+json', '+xml'];

const getRelativePath = (filePath: string) => {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 2) {
    return parts.join('/');
  }
  return parts.slice(2).join('/');
};

const isTextMimeType = (mime?: string) => {
  if (!mime) return true;
  return (
    TEXT_MIME_PREFIXES.some(prefix => mime.startsWith(prefix)) ||
    TEXT_MIME_SUFFIXES.some(suffix => mime.endsWith(suffix))
  );
};

export default function PreviewPanel({ currentVersionId }: PreviewPanelProps) {
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [panelMode, setPanelMode] = useState<PanelMode>('preview');
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLogs, setPreviewLogs] = useState<string[]>([]);
  const [lastPreviewKey, setLastPreviewKey] = useState<string | null>(null);
  const [webcontainerReady, setWebcontainerReady] = useState(false);
  const webcontainerClassRef = useRef<WebContainerConstructor | null>(null);
  const webcontainerRef = useRef<WebContainerInstance | null>(null);
  const devServerProcessRef = useRef<WebContainerProcess | null>(null);
  const initializingRef = useRef(false);
  const { currentProject } = useProject();

  const viewportSizes = {
    desktop: 'w-full',
    tablet: 'w-[768px]',
    mobile: 'w-[375px]',
  };

  const appendLog = useCallback((message: string) => {
    setPreviewLogs(prev => {
      const lines = message
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      const next = [...prev, ...lines];
      return next.slice(-80);
    });
  }, []);

  const stopDevServer = useCallback(async () => {
    if (devServerProcessRef.current) {
      devServerProcessRef.current.kill();
      devServerProcessRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const ensureWebcontainer = useCallback(async () => {
    if (!webcontainerClassRef.current) {
      return null;
    }

    if (!webcontainerBootPromise) {
      webcontainerBootPromise = webcontainerClassRef.current.boot();
    }

    const instance = await webcontainerBootPromise;
    webcontainerRef.current = instance;
    return instance;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined') {
      return;
    }

    const secureContext = window.isSecureContext || window.location.hostname === 'localhost';

    if (!secureContext) {
      setPreviewStatus('unsupported');
      setPreviewError('WebContainer 需要通过 HTTPS 或在 localhost 环境下运行');
      return;
    }

    if (!window.crossOriginIsolated) {
      setPreviewStatus('unsupported');
      setPreviewError('浏览器未启用跨源隔离 (COOP/COEP)，无法加载 WebContainer 预览');
      return;
    }

    const loadWebcontainer = async () => {
      try {
        const mod = await import('@webcontainer/api');
        if (cancelled) {
          return;
        }
        webcontainerClassRef.current = mod.WebContainer;
        setWebcontainerReady(true);
      } catch (err) {
        console.error('加载 WebContainer 失败:', err);
        if (!cancelled) {
          setPreviewStatus('unsupported');
          setPreviewError('当前浏览器不支持 WebContainer 预览');
        }
      }
    };

    loadWebcontainer();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      (async () => {
        await stopDevServer();
        if (webcontainerRef.current) {
          await webcontainerRef.current.teardown();
          webcontainerRef.current = null;
          webcontainerBootPromise = null;
        }
      })();
    };
  }, [stopDevServer]);

  useEffect(() => {
    if (!currentProject) {
      stopDevServer();
      setPreviewStatus('idle');
      setPreviewError(null);
      setPreviewLogs([]);
      setLastPreviewKey(null);
    }
  }, [currentProject, stopDevServer]);

  const downloadFileContent = useCallback(async (file: ProjectFile) => {
    const { data: signedUrl, error } = await fileService.downloadFile(file.id);
    if (error || !signedUrl) {
      throw new Error(`下载文件失败: ${file.file_name}`);
    }

    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(`读取文件内容失败: ${file.file_name}`);
    }

    const buffer = await response.arrayBuffer();
    if (isTextMimeType(file.mime_type)) {
      return new TextDecoder().decode(buffer);
    }

    return new Uint8Array(buffer);
  }, []);

  const writeFilesToWebcontainer = useCallback(
    async (files: ProjectFile[]) => {
      if (!webcontainerRef.current) return;

      for (const file of files) {
        const relativePath = getRelativePath(file.file_path);
        if (!relativePath) {
          continue;
        }

        const contents = await downloadFileContent(file);
        const dirPath = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : '';

        if (dirPath) {
          await webcontainerRef.current.fs.mkdir(dirPath, { recursive: true });
        }

        await webcontainerRef.current.fs.writeFile(relativePath, contents);
      }
    },
    [downloadFileContent]
  );

  const runProcess = useCallback(
    async (command: string, args: string[] = []) => {
      if (!webcontainerRef.current) return { exitCode: 1 };
      const process = await webcontainerRef.current.spawn(command, args);

      process.output
        .pipeTo(
          new WritableStream<string>({
            write(data) {
              appendLog(data);
            }
          })
        )
        .catch(() => {
          appendLog(`${command} ${args.join(' ')} 输出管道已结束`);
        });

      const exitCode = await process.exit;
      return { exitCode, process };
    },
    [appendLog]
  );

  const startDevServer = useCallback(async () => {
    if (!webcontainerRef.current) return;

    const process = await webcontainerRef.current.spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '4173']);
    devServerProcessRef.current = process;

    process.output
      .pipeTo(
        new WritableStream<string>({
          write(data) {
            appendLog(data);
          }
        })
      )
      .catch(() => {
        appendLog('开发服务器输出管道已结束');
      });

    webcontainerRef.current.on('server-ready', (_port, url) => {
      setPreviewUrl(url);
      setPreviewStatus('running');
      appendLog(`开发服务器已启动: ${url}`);
    });
  }, [appendLog]);

  const initializePreview = useCallback(
    async (force = false) => {
      if (!currentProject || !webcontainerReady || !webcontainerClassRef.current) {
        return;
      }

      if (initializingRef.current) {
        if (!force) {
          return;
        }
      }

      const currentKey = `${currentProject.id}:${currentVersionId || 'latest'}`;
      if (!force && lastPreviewKey === currentKey && previewStatus === 'running' && previewUrl) {
        return;
      }

      initializingRef.current = true;
      setPreviewStatus('loading');
      setPreviewError(null);
      setPreviewLogs([]);
      setPreviewUrl(null);

      try {
        const { data: files, error } = await fileService.getFilesByProject(currentProject.id, currentVersionId);

        if (error) {
          throw new Error('加载项目文件失败');
        }

        if (!files || files.length === 0) {
          throw new Error('当前项目没有可预览的文件');
        }

        await stopDevServer();

        const instance = await ensureWebcontainer();
        if (!instance) {
          throw new Error('WebContainer 尚未准备就绪');
        }

        await instance.mount({});

        await writeFilesToWebcontainer(files);

        setPreviewStatus('installing');
        const { exitCode } = await runProcess('npm', ['install']);

        if (exitCode !== 0) {
          throw new Error('依赖安装失败，请检查 package.json');
        }

        setPreviewStatus('starting');
        await startDevServer();
        setLastPreviewKey(currentKey);
      } catch (err: any) {
        console.error('初始化预览失败:', err);
        setPreviewStatus('error');
        setPreviewError(err?.message || '初始化预览失败');
      } finally {
        initializingRef.current = false;
      }
    },
    [
      currentProject,
      currentVersionId,
      lastPreviewKey,
      ensureWebcontainer,
      previewStatus,
      previewUrl,
      runProcess,
      startDevServer,
      stopDevServer,
      webcontainerReady,
      writeFilesToWebcontainer
    ]
  );

  useEffect(() => {
    if (panelMode === 'preview' && currentProject && webcontainerReady) {
      initializePreview();
    }
  }, [panelMode, currentProject, currentVersionId, webcontainerReady, initializePreview]);

  useEffect(() => {
    if (panelMode !== 'preview' && previewStatus !== 'idle') {
      appendLog('暂停预览（切换到了文件面板）');
    }
  }, [panelMode, previewStatus, appendLog]);

  const handleRefreshPreview = () => {
    initializePreview(true);
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshPreview}
                disabled={
                  previewStatus === 'loading' ||
                  previewStatus === 'installing' ||
                  previewStatus === 'starting' ||
                  previewStatus === 'unsupported'
                }
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  previewStatus === 'loading' || previewStatus === 'installing' || previewStatus === 'starting'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
                }`}
                title="重新渲染预览"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                刷新预览
              </button>
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
            </div>
          )}
        </div>
      </div>

      {panelMode === 'preview' ? (
        <div className="flex-1 overflow-auto bg-gray-100 p-8 flex justify-center">
          <div className={`${viewportSizes[viewportMode]} h-full transition-all duration-300`}>
            {previewStatus === 'running' && previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full bg-white rounded-lg shadow-sm border border-gray-200"
                title="网站预览"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="h-full bg-white rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-center p-8">
                <div className="space-y-3 max-w-md">
                  {previewStatus === 'unsupported' ? (
                    <>
                      <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
                      <p className="text-sm text-gray-600">{previewError}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-center">
                        <div className="w-10 h-10 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      </div>
                      <p className="text-sm font-medium text-gray-700">
                        {previewStatus === 'loading' && '正在加载项目文件...'}
                        {previewStatus === 'installing' && '正在安装依赖...'}
                        {previewStatus === 'starting' && '正在启动开发服务器...'}
                        {previewStatus === 'error' && (previewError || '渲染失败，请重试')}
                        {previewStatus === 'idle' && '选择一个项目以开始预览'}
                      </p>
                    </>
                  )}
                  {previewStatus === 'error' && previewError && (
                    <p className="text-xs text-red-500">{previewError}</p>
                  )}
                  {previewLogs.length > 0 && (
                    <div className="mt-6 bg-gray-900 text-gray-100 rounded-lg p-4 text-left max-h-48 overflow-auto text-xs font-mono">
                      {previewLogs.slice(-8).map((log, index) => (
                        <div key={`${log}-${index}`} className="whitespace-pre-wrap">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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
