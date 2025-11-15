import { Monitor, Smartphone, Tablet, Eye, FolderOpen, RefreshCcw, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { fileService } from '../services/fileService';
import FileManagerPanel from './FileManagerPanel';
import type { ProjectFile } from '../types/project';
import type { WebContainer as WebContainerInstance, WebContainerProcess } from '@webcontainer/api';
import {
  clearNodeModulesCache,
  loadNodeModulesSnapshot,
  saveNodeModulesSnapshot
} from '../lib/nodeModulesCache';
import { useSettings } from '../contexts/SettingsContext';
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
const MAX_PARALLEL_DOWNLOADS = 24;
const LOADING_GAME_ICONS = ['🎨', '🚀', '💡', '⚡', '🎯', '🌟', '🔥', '💎'];
const WORKSPACE_PRESERVE_DIRS = new Set(['node_modules', '.npm', '.pnpm-store', '.yarn']);
const PANEL_SPRING: Transition = { type: 'spring', stiffness: 210, damping: 32 };
const LOG_EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

interface MemoryCard {
  id: number;
  icon: string;
  flipped: boolean;
  matched: boolean;
}

const PREVIEW_STATUS_MESSAGES: Record<PreviewStatus, string> = {
  idle: '选择一个项目以开始预览',
  loading: '正在加载项目文件...',
  installing: '正在安装依赖...',
  starting: '正在启动开发服务器...',
  running: '预览已就绪',
  error: '渲染失败，请重试',
  unsupported: '当前环境不支持 WebContainer 预览',
};

const PREVIEW_LOADING_STATES: PreviewStatus[] = ['loading', 'installing', 'starting'];

const createShuffledCards = () => {
  return [...LOADING_GAME_ICONS, ...LOADING_GAME_ICONS]
    .sort(() => Math.random() - 0.5)
    .map((icon, index) => ({
      id: index,
      icon,
      flipped: false,
      matched: false,
    }));
};

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ANSI_ESCAPE}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const sanitizeLogMessage = (value: string) => {
  return value.replace(ANSI_ESCAPE_SEQUENCE, '').replace(/\r/g, '');
};

const getStringContents = (value: string | Uint8Array) => {
  if (typeof value === 'string') {
    return value;
  }
  return textDecoder.decode(value);
};

const serializeDependencyMap = (deps?: Record<string, string>) => {
  if (!deps) return '';
  return Object.keys(deps)
    .sort()
    .map(key => `${key}:${deps[key]}`)
    .join('|');
};

const hashString = async (value: string) => {
  const source = value || '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = textEncoder.encode(source);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
};

const computeDependencyHash = async (
  packageJsonContent: string | null,
  lockFileContent: string | null
) => {
  if (!packageJsonContent) {
    return null;
  }

  try {
    const pkg = JSON.parse(packageJsonContent);
    const lockHash = lockFileContent ? await hashString(lockFileContent) : '';
    const fingerprint = [
      pkg.name || 'unknown',
      pkg.version || '0.0.0',
      serializeDependencyMap(pkg.dependencies),
      serializeDependencyMap(pkg.devDependencies),
      lockHash
    ].join('::');

    return hashString(fingerprint);
  } catch (error) {
    console.warn('解析 package.json 失败:', error);
    return null;
  }
};

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
  const devServerStopRequestedRef = useRef(false);
  const initializingRef = useRef(false);
  const dependencyHashRef = useRef<string | null>(null);
  const previewStatusRef = useRef<PreviewStatus>('idle');
  const previewUrlRef = useRef<string | null>(null);
  const reusedPrebuiltRef = useRef(false);
  const { currentProject } = useProject();
  const { preloadNodeModules } = useSettings();

  const viewportSizes = {
    desktop: 'w-full',
    tablet: 'w-[768px]',
    mobile: 'w-[375px]',
  };

  const appendLog = useCallback((message: string) => {
    const sanitized = sanitizeLogMessage(message);
    if (!sanitized) {
      return;
    }
    const lines = sanitized
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length > 0) {
      lines.forEach(line => {
        console.info('[WebContainer]', line);
      });
    }

    setPreviewLogs(prev => {
      const next = [...prev, ...lines];
      return next.slice(-80);
    });
  }, []);

  useEffect(() => {
    previewStatusRef.current = previewStatus;
  }, [previewStatus]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  const stopDevServer = useCallback(async () => {
    if (devServerProcessRef.current) {
      devServerStopRequestedRef.current = true;
      devServerProcessRef.current.kill();
      devServerProcessRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const clearWorkspace = useCallback(async () => {
    const instance = webcontainerRef.current;
    if (!instance) return;

    try {
      const entries = await instance.fs.readdir('.', { withFileTypes: true });
      await Promise.all(
        entries.map(async entry => {
          if (WORKSPACE_PRESERVE_DIRS.has(entry.name)) {
            return;
          }

          try {
            await instance.fs.rm(entry.name, { recursive: entry.isDirectory(), force: true });
          } catch (error) {
            console.warn(`移除 ${entry.name} 失败:`, error);
          }
        })
      );
    } catch (error) {
      console.warn('清理工作空间失败:', error);
    }
  }, []);

  const ensureNodeModulesExecutables = useCallback(async () => {
    const instance = webcontainerRef.current;
    if (!instance) return;

    try {
      await instance.fs.readdir('node_modules/.bin');
    } catch {
      return;
    }

    try {
      const chmodProcess = await instance.spawn('chmod', ['-R', 'u+x', 'node_modules/.bin']);
      await chmodProcess.exit;
    } catch (error) {
      console.warn('修复 node_modules/.bin 权限失败:', error);
    }
  }, []);

  const resetWebcontainer = useCallback(async () => {
    await stopDevServer();
    if (webcontainerRef.current) {
      try {
        await webcontainerRef.current.teardown();
      } catch (error) {
        console.error('销毁 WebContainer 失败:', error);
      } finally {
        webcontainerRef.current = null;
      }
    }
    webcontainerBootPromise = null;
    dependencyHashRef.current = null;
    reusedPrebuiltRef.current = false;
  }, [stopDevServer]);

  const ensureWebcontainer = useCallback(async () => {
    if (!webcontainerClassRef.current) {
      return null;
    }

    if (webcontainerRef.current) {
      return webcontainerRef.current;
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
      resetWebcontainer();
    };
  }, [resetWebcontainer]);

  useEffect(() => {
    if (!currentProject) {
      resetWebcontainer();
      setPreviewStatus('idle');
      setPreviewError(null);
      setPreviewLogs([]);
      setLastPreviewKey(null);
    }
  }, [currentProject, resetWebcontainer]);

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

  const downloadFilesConcurrently = useCallback(
    async (fileEntries: Array<{ file: ProjectFile; relativePath: string }>) => {
      const results: Array<string | Uint8Array> = new Array(fileEntries.length);
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          if (currentIndex >= fileEntries.length) {
            return;
          }
          results[currentIndex] = await downloadFileContent(fileEntries[currentIndex].file);
        }
      };

      const workerCount = Math.min(MAX_PARALLEL_DOWNLOADS, fileEntries.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      return results;
    },
    [downloadFileContent]
  );

  const writeFilesToWebcontainer = useCallback(
    async (files: ProjectFile[]) => {
      const instance = webcontainerRef.current;
      if (!instance) {
        throw new Error('WebContainer 尚未初始化');
      }

      const preparedFiles = files
        .map(file => {
          const relativePath = getRelativePath(file.file_path);
          if (!relativePath) {
            return null;
          }
          return { file, relativePath };
        })
        .filter((entry): entry is { file: ProjectFile; relativePath: string } => Boolean(entry));

      if (preparedFiles.length === 0) {
        return { dependencyHash: null };
      }

      const contentsList = await downloadFilesConcurrently(preparedFiles);
      let packageJsonContent: string | null = null;
      let packageLockContent: string | null = null;

      for (let i = 0; i < preparedFiles.length; i += 1) {
        const { relativePath } = preparedFiles[i];
        const contents = contentsList[i];
        const dirPath = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : '';

        if (relativePath === 'package.json') {
          packageJsonContent = getStringContents(contents);
        }
        if (relativePath === 'package-lock.json') {
          packageLockContent = getStringContents(contents);
        }

        if (dirPath) {
          await instance.fs.mkdir(dirPath, { recursive: true });
        }

        await instance.fs.writeFile(relativePath, contents);
      }

      const dependencyHash = await computeDependencyHash(packageJsonContent, packageLockContent);
      return { dependencyHash };
    },
    [downloadFilesConcurrently]
  );

  const runProcess = useCallback(
    async (command: string, args: string[] = []) => {
      const instance = webcontainerRef.current;
      if (!instance) return { exitCode: 1 };
      const process = await instance.spawn(command, args);

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
    const instance = webcontainerRef.current;
    if (!instance) return;

    const process = await instance.spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '4173']);
    devServerProcessRef.current = process;
    devServerStopRequestedRef.current = false;

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

    instance.on('server-ready', (_port, url) => {
      setPreviewUrl(url);
      setPreviewStatus('running');
      appendLog(`开发服务器已启动: ${url}`);
    });

    process.exit.then(async code => {
      if (devServerStopRequestedRef.current) {
        devServerStopRequestedRef.current = false;
        return;
      }
      if (code !== 0) {
        appendLog(`开发服务器异常退出 (code ${code})`);
        if (reusedPrebuiltRef.current && dependencyHashRef.current) {
          appendLog('检测到预制依赖可能损坏，已清除缓存，请重新启动预览以重新安装依赖');
          try {
            await clearNodeModulesCache(dependencyHashRef.current);
          } catch (error) {
            console.warn('清除缓存失败:', error);
          }
          dependencyHashRef.current = null;
          reusedPrebuiltRef.current = false;
        }
        setPreviewStatus('error');
        setPreviewError('开发服务器启动失败，请点击重启预览');
      }
    });
  }, [appendLog]);

  const initializePreview = useCallback(
    async (force = false) => {
      if (!currentProject || !webcontainerReady || !webcontainerClassRef.current) {
        return;
      }

      if (initializingRef.current) {
        if (force) {
          appendLog('预览初始化仍在进行，请稍后重试');
        }
        return;
      }

      const currentKey = `${currentProject.id}:${currentVersionId || 'latest'}`;
      const currentStatus = previewStatusRef.current;
      const currentUrl = previewUrlRef.current;
      if (!force && lastPreviewKey === currentKey && currentStatus === 'running' && currentUrl) {
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

        await clearWorkspace();

        const { dependencyHash } = await writeFilesToWebcontainer(files);
        dependencyHashRef.current = preloadNodeModules ? dependencyHash || null : null;

        let reusedPrebuiltModules = false;
        reusedPrebuiltRef.current = false;

        if (preloadNodeModules && dependencyHash) {
          const cachedSnapshot = await loadNodeModulesSnapshot(dependencyHash);
          if (cachedSnapshot) {
            appendLog('检测到预制 node_modules，正在快速恢复...');
            await instance.fs.mkdir('node_modules', { recursive: true });
            await instance.mount(cachedSnapshot, { mountPoint: 'node_modules' });
            await ensureNodeModulesExecutables();
            reusedPrebuiltModules = true;
            reusedPrebuiltRef.current = true;
          }
        } else if (!preloadNodeModules) {
          appendLog('已关闭预制 node_modules，使用全新依赖安装流程');
        }

        if (!reusedPrebuiltModules) {
          await instance.fs.rm('node_modules', { recursive: true, force: true }).catch(() => null);
          setPreviewStatus('installing');
          const { exitCode } = await runProcess('npm', ['install', '--prefer-offline', '--no-audit']);

          if (exitCode !== 0) {
            throw new Error('依赖安装失败，请检查 package.json');
          }

          if (preloadNodeModules && dependencyHash) {
            await ensureNodeModulesExecutables();
            const snapshot = await instance.export('node_modules', { format: 'binary' });
            await saveNodeModulesSnapshot(dependencyHash, snapshot);
            appendLog('已缓存 node_modules，用于下次快速加载');
          } else if (!preloadNodeModules) {
            appendLog('未缓存 node_modules（实验性预加载已关闭）');
          }
        } else {
          appendLog('已复用预制 node_modules，跳过安装步骤');
        }

        setPreviewStatus('starting');
        reusedPrebuiltRef.current = reusedPrebuiltModules;
        await startDevServer();
        setLastPreviewKey(currentKey);
      } catch (err) {
        console.error('初始化预览失败:', err);
        await resetWebcontainer();
        setPreviewStatus('error');
        const message = err instanceof Error ? err.message : '初始化预览失败';
        setPreviewError(message);
      } finally {
        initializingRef.current = false;
      }
    },
    [
      appendLog,
      clearWorkspace,
      currentProject,
      currentVersionId,
      lastPreviewKey,
      ensureWebcontainer,
      ensureNodeModulesExecutables,
      preloadNodeModules,
      resetWebcontainer,
      runProcess,
      startDevServer,
      stopDevServer,
      webcontainerReady,
      writeFilesToWebcontainer
    ]
  );

  useEffect(() => {
    if (currentProject && webcontainerReady) {
      initializePreview();
    }
  }, [currentProject, currentVersionId, webcontainerReady, initializePreview]);

  const handleReloadPreview = useCallback(() => {
    setPanelMode('preview');
    if (!previewUrl) {
      initializePreview(true);
      return;
    }

    appendLog('刷新预览 iframe');
    setPreviewUrl(prev => {
      if (!prev) {
        return prev;
      }
      try {
        const nextUrl = new URL(prev);
        nextUrl.searchParams.set('_ts', Date.now().toString());
        return nextUrl.toString();
      } catch {
        const separator = prev.includes('?') ? '&' : '?';
        return `${prev}${separator}_ts=${Date.now()}`;
      }
    });
  }, [appendLog, initializePreview, previewUrl]);

  const handleRestartDevServer = useCallback(() => {
    setPanelMode('preview');
    initializePreview(true);
  }, [initializePreview]);

  const isRestartDisabled =
    previewStatus === 'loading' ||
    previewStatus === 'installing' ||
    previewStatus === 'starting' ||
    previewStatus === 'unsupported';

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
              <motion.button
                onClick={handleReloadPreview}
                disabled={previewStatus === 'unsupported'}
                whileHover={{ scale: previewStatus === 'unsupported' ? 1 : 1.02 }}
                whileTap={{ scale: previewStatus === 'unsupported' ? 1 : 0.96 }}
                transition={PANEL_SPRING}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  previewStatus === 'unsupported'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
                }`}
                title="重新加载预览画面"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                刷新预览
              </motion.button>
              <motion.button
                onClick={handleRestartDevServer}
                disabled={isRestartDisabled}
                whileHover={{ scale: isRestartDisabled ? 1 : 1.02 }}
                whileTap={{ scale: isRestartDisabled ? 1 : 0.96 }}
                transition={PANEL_SPRING}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isRestartDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
                }`}
                title="重启 WebContainer 服务并重新渲染"
              >
                <RefreshCcw className="w-3.5 h-3.5 rotate-180" />
                重启预览
              </motion.button>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <motion.button
                  onClick={() => setViewportMode('desktop')}
                  whileTap={{ scale: 0.9 }}
                  transition={PANEL_SPRING}
                  className={`p-1.5 rounded transition-colors ${
                    viewportMode === 'desktop'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="桌面视图"
                >
                  <Monitor className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={() => setViewportMode('tablet')}
                  whileTap={{ scale: 0.9 }}
                  transition={PANEL_SPRING}
                  className={`p-1.5 rounded transition-colors ${
                    viewportMode === 'tablet'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="平板视图"
                >
                  <Tablet className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={() => setViewportMode('mobile')}
                  whileTap={{ scale: 0.9 }}
                  transition={PANEL_SPRING}
                  className={`p-1.5 rounded transition-colors ${
                    viewportMode === 'mobile'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="手机视图"
                >
                  <Smartphone className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-gray-100">
        <AnimatePresence mode="wait">
          {panelMode === 'preview' ? (
            <motion.div
              key="preview-panel"
              className="h-full overflow-auto p-8 flex justify-center"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={PANEL_SPRING}
            >
              <div className={`${viewportSizes[viewportMode]} h-full`}>
                {previewStatus === 'running' && previewUrl ? (
                  <motion.iframe
                    key={previewUrl}
                    layout
                    src={previewUrl}
                    className="w-full h-full bg-white rounded-lg shadow-sm border border-gray-200"
                    title="网站预览"
                    sandbox="allow-scripts allow-same-origin"
                    initial={{ opacity: 0.7, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, ease: LOG_EASE }}
                  />
                ) : (
                  <PreviewLoadingScreen
                    status={previewStatus}
                    error={previewError}
                    logs={previewLogs}
                    projectName={currentProject?.title}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="files-panel"
              className="h-full"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={PANEL_SPRING}
            >
              {currentProject && (
                <FileManagerPanel projectId={currentProject.id} versionId={currentVersionId} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface PreviewLoadingScreenProps {
  status: PreviewStatus;
  error: string | null;
  logs: string[];
  projectName?: string;
}

function PreviewLoadingScreen({ status, error, logs, projectName }: PreviewLoadingScreenProps) {
  const statusText = PREVIEW_STATUS_MESSAGES[status];
  const isError = status === 'error';
  const isUnsupported = status === 'unsupported';
  const shouldShowMiniGame = PREVIEW_LOADING_STATES.includes(status);
  const showLogs = logs.length > 0;

  return (
    <div className="h-full bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-lg border border-dashed border-gray-200 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
            <Loader2 className={`w-4 h-4 ${shouldShowMiniGame ? 'animate-spin' : ''}`} />
            <span>{projectName ? `正在为 ${projectName} 准备预览` : '正在准备预览环境'}</span>
          </div>
          <p className="text-gray-600 text-sm">{statusText}</p>
          {(isError || isUnsupported) && error && (
            <p className="text-sm text-red-500 flex items-center justify-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>

        {shouldShowMiniGame ? (
          <LoadingMiniGame />
        ) : (
          <div className="bg-white rounded-2xl shadow-inner p-6 text-center">
            {status === 'idle' && (
              <p className="text-sm text-gray-600">请选择一个项目并启动预览，即可开始编辑体验。</p>
            )}
            {isError && !error && (
              <p className="text-sm text-gray-600">预览发生未知错误，请尝试刷新或重启预览。</p>
            )}
            {isUnsupported && !error && (
              <p className="text-sm text-gray-600">请在启用 HTTPS 或 localhost 的跨源隔离环境下打开。</p>
            )}
          </div>
        )}

        {showLogs && (
          <motion.div
            className="bg-gray-900 text-gray-100 rounded-lg p-4 text-left max-h-48 overflow-auto text-xs font-mono space-y-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: LOG_EASE }}
          >
            <AnimatePresence initial={false}>
              {logs.slice(-8).map((log, index) => (
                <motion.div
                  key={`${log}-${index}`}
                  className="whitespace-pre-wrap"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25, ease: LOG_EASE }}
                >
                  {log}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function LoadingMiniGame() {
  const totalPairs = LOADING_GAME_ICONS.length;
  const [cards, setCards] = useState<MemoryCard[]>(() => createShuffledCards());
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [moves, setMoves] = useState(0);

  const resetGame = useCallback(() => {
    setCards(createShuffledCards());
    setFlippedCards([]);
    setMatchedPairs(0);
    setMoves(0);
  }, []);

  const handleCardClick = (cardId: number) => {
    if (flippedCards.length === 2) return;
    if (flippedCards.includes(cardId)) return;
    const targetCard = cards[cardId];
    if (!targetCard || targetCard.matched) return;

    const nextFlipped = [...flippedCards, cardId];
    setFlippedCards(nextFlipped);
    setCards(prev =>
      prev.map(card => (card.id === cardId ? { ...card, flipped: true } : card))
    );

    if (nextFlipped.length === 2) {
      setMoves(prev => prev + 1);
      const [first, second] = nextFlipped;
      const firstCard = cards[first];
      const secondCard = cards[second];

      if (firstCard && secondCard && firstCard.icon === secondCard.icon) {
        setTimeout(() => {
          setCards(prev =>
            prev.map(card =>
              card.id === first || card.id === second ? { ...card, matched: true } : card
            )
          );
          setMatchedPairs(prev => prev + 1);
          setFlippedCards([]);
        }, 500);
      } else {
        setTimeout(() => {
          setCards(prev =>
            prev.map(card =>
              card.id === first || card.id === second ? { ...card, flipped: false } : card
            )
          );
          setFlippedCards([]);
        }, 800);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-medium text-gray-900">翻牌小游戏</h2>
        </div>
        <div className="flex gap-4 text-sm text-gray-600">
          <div>
            步数:{' '}
            <span className="font-medium text-gray-900">{moves}</span>
          </div>
          <div>
            配对:{' '}
            <span className="font-medium text-gray-900">
              {matchedPairs}/{totalPairs}
            </span>
          </div>
        </div>
      </div>

      {matchedPairs === totalPairs && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-center text-sm text-green-800">
          🎉 恭喜完成！共计 {moves} 步
          <div>
            <button
              onClick={resetGame}
              className="mt-3 px-4 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors"
            >
              再玩一次
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => handleCardClick(card.id)}
            disabled={card.matched || card.flipped}
            className={`aspect-square rounded-xl text-3xl font-bold transition-all duration-300 transform flex items-center justify-center shadow-md hover:shadow-lg ${
              card.flipped || card.matched
                ? 'bg-gradient-to-br from-blue-400 to-purple-500 text-white scale-105'
                : 'bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 hover:scale-105'
            } ${card.matched ? 'opacity-60' : ''} disabled:cursor-not-allowed`}
          >
            {card.flipped || card.matched ? card.icon : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}
