import { Monitor, Smartphone, Tablet, Eye, FolderOpen, RefreshCcw, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProject } from '../../hooks/useProject';
import { fileService } from '../../services/fileService';
import FileManagerPanel from './FileManagerPanel';
import type { ProjectFile } from '../../types/project';
import {
  clearNodeModulesCache,
  loadNodeModulesSnapshot,
  saveNodeModulesSnapshot
} from '../../lib/nodeModulesCache';
import { useSettings } from '../../hooks/useSettings';
import { webContainerManager } from '../../lib/webContainerManager';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type PanelMode = 'preview' | 'files';
type PreviewStatus = 'idle' | 'loading' | 'installing' | 'starting' | 'running' | 'error' | 'unsupported';

interface PreviewPanelProps {
  currentVersionId?: string;
}

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/javascript', 'application/typescript', 'application/xml'];
const TEXT_MIME_SUFFIXES = ['+json', '+xml'];
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

type InstallMode = 'fresh' | 'cached' | 'unknown';

interface StatusMessageConfig {
  title: string;
  subtitle: string;
  tip?: string;
  estimatedTime?: string;
}

const getStatusMessage = (status: PreviewStatus, installMode: InstallMode): StatusMessageConfig => {
  switch (status) {
    case 'idle':
      return {
        title: '等待开始',
        subtitle: '选择一个项目以开始预览',
      };
    case 'loading':
      return {
        title: '加载中',
        subtitle: '正在加载项目文件...',
        tip: '正在从云端获取您的项目文件',
      };
    case 'installing':
      if (installMode === 'cached') {
        return {
          title: '快速恢复中',
          subtitle: '正在从缓存恢复依赖...',
          tip: '检测到本地缓存，正在快速恢复',
          estimatedTime: '预计 5-15 秒',
        };
      }
      return {
        title: '首次安装依赖',
        subtitle: '正在下载并安装项目依赖...',
        tip: '首次安装需要从网络下载依赖包，请耐心等待。下次打开相同项目会快很多！',
        estimatedTime: '预计 2-5 分钟',
      };
    case 'starting':
      return {
        title: '即将就绪',
        subtitle: '正在启动开发服务器...',
        tip: '依赖安装完成，正在启动预览服务',
        estimatedTime: '预计 10-30 秒',
      };
    case 'running':
      return {
        title: '预览就绪',
        subtitle: '您的项目已成功运行',
      };
    case 'error':
      return {
        title: '出现问题',
        subtitle: '渲染失败，请重试',
        tip: '您可以点击"重启预览"按钮重新尝试',
      };
    case 'unsupported':
      return {
        title: '环境不支持',
        subtitle: '当前浏览器环境不支持 WebContainer 预览',
        tip: '请使用 Chrome、Edge 或其他支持 SharedArrayBuffer 的浏览器',
      };
    default:
      return {
        title: '处理中',
        subtitle: '请稍候...',
      };
  }
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
  const [installMode, setInstallMode] = useState<InstallMode>('unknown');
  const [installStartTime, setInstallStartTime] = useState<number | null>(null);
  const devServerStopRequestedRef = useRef(false);
  const initializingRef = useRef(false);
  const dependencyHashRef = useRef<string | null>(null);
  const previewStatusRef = useRef<PreviewStatus>('idle');
  const previewUrlRef = useRef<string | null>(null);
  const reusedPrebuiltRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializePreviewRef = useRef<(force?: boolean) => void>(() => undefined);
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

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, [currentProject, currentVersionId]);

  const stopDevServer = useCallback(async () => {
    const process = webContainerManager.getDevServerProcess();
    if (process) {
      devServerStopRequestedRef.current = true;
      process.kill();
      webContainerManager.setDevServerProcess(null);
    }
    setPreviewUrl(null);
  }, []);

  const clearWorkspace = useCallback(async () => {
    const instance = webContainerManager.getInstance();
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
    const instance = webContainerManager.getInstance();
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
    await webContainerManager.teardown();
    dependencyHashRef.current = null;
    reusedPrebuiltRef.current = false;
  }, [stopDevServer]);

  const ensureWebcontainer = useCallback(async () => {
    return webContainerManager.boot();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined') {
      return;
    }

    if (!webContainerManager.isSupported()) {
      setPreviewStatus('unsupported');
      setPreviewError(webContainerManager.getUnsupportedReason() || '当前环境不支持 WebContainer 预览');
      return;
    }

    const loadWebcontainer = async () => {
      const loaded = await webContainerManager.loadWebContainerClass();
      if (cancelled) {
        return;
      }
      if (loaded) {
        setWebcontainerReady(true);
      } else {
        setPreviewStatus('unsupported');
        setPreviewError(webContainerManager.getUnsupportedReason() || '当前浏览器不支持 WebContainer 预览');
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
      return Promise.all(
        fileEntries.map(entry => downloadFileContent(entry.file))
      );
    },
    [downloadFileContent]
  );

  const writeFilesToWebcontainer = useCallback(
    async (files: ProjectFile[]) => {
      const instance = webContainerManager.getInstance();
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
      const instance = webContainerManager.getInstance();
      if (!instance) return { exitCode: 1 };
      let process;
      try {
        process = await instance.spawn(command, args);
      } catch (error) {
        console.error(`${command} ${args.join(' ')} 进程中断:`, error);
        appendLog(`${command} ${args.join(' ')} 进程中断，请重试`);
        return { exitCode: 1 };
      }

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

      try {
        const exitCode = await process.exit;
        return { exitCode, process };
      } catch (error) {
        console.error(`${command} ${args.join(' ')} 进程中断:`, error);
        appendLog(`${command} ${args.join(' ')} 进程中断，请重试`);
        return { exitCode: 1 };
      }
    },
    [appendLog]
  );

  const scheduleAutoRetry = useCallback(
    (reason?: string) => {
      if (!currentProject || !webcontainerReady) {
        return;
      }
      if (retryCountRef.current >= 3) {
        appendLog('自动重试已达上限');
        return;
      }
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;
      const delay = 1200 * attempt;
      const detail = reason ? `：${reason}` : '';
      const seconds = Math.round(delay / 100) / 10;
      appendLog(`预览自动重试(${attempt}/3)${detail}，${seconds}s 后开始`);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      retryTimeoutRef.current = setTimeout(() => {
        initializePreviewRef.current(true);
      }, delay);
    },
    [appendLog, currentProject, webcontainerReady]
  );

  const startDevServer = useCallback(async () => {
    const instance = webContainerManager.getInstance();
    if (!instance) return;

    let process;
    try {
      process = await instance.spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '4173']);
    } catch (error) {
      console.error('启动开发服务器失败:', error);
      appendLog('开发服务器启动失败，请重试');
      setPreviewStatus('error');
      setPreviewError('开发服务器启动失败，请点击重启预览');
      scheduleAutoRetry('开发服务器启动失败');
      return;
    }
    webContainerManager.setDevServerProcess(process);
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
      retryCountRef.current = 0;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setPreviewUrl(url);
      setPreviewStatus('running');
      appendLog(`开发服务器已启动: ${url}`);
    });

    process.exit
      .then(async code => {
      if (devServerStopRequestedRef.current) {
        devServerStopRequestedRef.current = false;
        return;
      }
      if (code !== 0) {
        scheduleAutoRetry('开发服务器异常退出');
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
    })
      .catch(error => {
        if (devServerStopRequestedRef.current) {
          devServerStopRequestedRef.current = false;
          return;
        }
        console.error('开发服务器进程中断:', error);
        appendLog('开发服务器进程中断，请重试');
        setPreviewStatus('error');
        setPreviewError('预览进程被中断，请点击重启预览');
        scheduleAutoRetry('开发服务器进程中断');
      });
  }, [appendLog, scheduleAutoRetry]);

  const initializePreview = useCallback(
    async (force = false) => {
      if (!currentProject || !webcontainerReady) {
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
      setInstallMode('unknown');
      setInstallStartTime(null);

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
            setInstallMode('cached');
            setInstallStartTime(Date.now());
            setPreviewStatus('installing');
            appendLog('检测到预制 node_modules，正在快速恢复...');
            await instance.fs.mkdir('node_modules', { recursive: true });
            await instance.mount(cachedSnapshot, { mountPoint: 'node_modules' });
            await ensureNodeModulesExecutables();
            reusedPrebuiltModules = true;
            reusedPrebuiltRef.current = true;
            appendLog('缓存恢复完成');
          }
        } else if (!preloadNodeModules) {
          appendLog('已关闭预制 node_modules，使用全新依赖安装流程');
        }

        if (!reusedPrebuiltModules) {
          setInstallMode('fresh');
          setInstallStartTime(Date.now());
          await instance.fs.rm('node_modules', { recursive: true, force: true }).catch(() => null);
          setPreviewStatus('installing');
          appendLog('开始首次安装依赖，这可能需要几分钟时间...');
          const { exitCode } = await runProcess('npm', ['install', '--prefer-offline', '--no-audit']);

          if (exitCode !== 0) {
            throw new Error('依赖安装失败，请检查 package.json');
          }

          appendLog('依赖安装完成');

          if (preloadNodeModules && dependencyHash) {
            appendLog('正在保存依赖缓存，下次启动会更快...');
            await ensureNodeModulesExecutables();
            const snapshot = await instance.export('node_modules', { format: 'binary' });
            await saveNodeModulesSnapshot(dependencyHash, snapshot);
            appendLog('已缓存 node_modules，下次打开相同项目将快速恢复');
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
        scheduleAutoRetry(message);
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
    initializePreviewRef.current = initializePreview;
  }, [initializePreview]);

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
    <div className="flex flex-col h-full bg-muted">
      <div className="px-4 py-2 bg-background border-b border-border">
        <div className="flex items-center justify-between">
          <ToggleGroup type="single" value={panelMode} onValueChange={(value) => value && setPanelMode(value as PanelMode)}>
            <ToggleGroupItem value="preview" aria-label="预览" className="text-xs gap-2">
              <Eye className="w-3.5 h-3.5" />
              预览
            </ToggleGroupItem>
            <ToggleGroupItem value="files" aria-label="文件" className="text-xs gap-2">
              <FolderOpen className="w-3.5 h-3.5" />
              文件
            </ToggleGroupItem>
          </ToggleGroup>

          {panelMode === 'preview' && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReloadPreview}
                disabled={previewStatus === 'unsupported'}
                title="重新加载预览画面"
              >
                <RefreshCcw className="w-3.5 h-3.5 mr-1" />
                刷新预览
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestartDevServer}
                disabled={isRestartDisabled}
                title="重启 WebContainer 服务并重新渲染"
              >
                <RefreshCcw className="w-3.5 h-3.5 rotate-180 mr-1" />
                重启预览
              </Button>
              <ToggleGroup 
                type="single" 
                value={viewportMode} 
                onValueChange={(value) => value && setViewportMode(value as ViewportMode)}
                disabled={isRestartDisabled}
              >
                <ToggleGroupItem value="desktop" aria-label="桌面视图" title="桌面视图">
                  <Monitor className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="tablet" aria-label="平板视图" title="平板视图">
                  <Tablet className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="mobile" aria-label="手机视图" title="手机视图">
                  <Smartphone className="w-4 h-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-muted">
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
                    className="w-full h-full bg-background rounded-lg shadow-sm border border-border"
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
                    installMode={installMode}
                    installStartTime={installStartTime}
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
  installMode: InstallMode;
  installStartTime: number | null;
}

function PreviewLoadingScreen({ status, error, logs, projectName, installMode, installStartTime }: PreviewLoadingScreenProps) {
  const statusConfig = getStatusMessage(status, installMode);
  const isError = status === 'error';
  const isUnsupported = status === 'unsupported';
  const shouldShowMiniGame = PREVIEW_LOADING_STATES.includes(status);
  const showLogs = logs.length > 0;
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);

  // 计算已用时间
  useEffect(() => {
    if (!installStartTime || status === 'running' || status === 'error') {
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - installStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [installStartTime, status]);

  const formatElapsedTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} 秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} 分 ${remainingSeconds} 秒`;
  };

  // 获取进度步骤
  const getProgressSteps = () => {
    const steps = [
      { key: 'loading', label: '加载文件', done: status !== 'loading' && status !== 'idle' },
      { key: 'installing', label: installMode === 'cached' ? '恢复缓存' : '安装依赖', done: status === 'starting' || status === 'running' },
      { key: 'starting', label: '启动服务', done: status === 'running' },
    ];
    return steps;
  };

  const progressSteps = getProgressSteps();
  const currentStepIndex = progressSteps.findIndex(step => !step.done);

  return (
    <div className="h-full bg-muted rounded-lg border border-dashed border-border flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        {/* 主状态显示区 - 小白友好 */}
        <div className="text-center space-y-4">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 mx-auto rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium max-w-full">
            <Loader2 className={`w-4 h-4 flex-shrink-0 ${shouldShowMiniGame ? 'animate-spin' : ''}`} />
            <span className="whitespace-normal break-words text-center max-w-[16rem] sm:max-w-[20rem]">
              {projectName ? `正在为「${projectName}」准备预览` : '正在准备预览环境'}
            </span>
          </div>
          
          {/* 状态标题和副标题 */}
          <div className="space-y-1">
            <h3 className="text-lg font-medium text-foreground">{statusConfig.title}</h3>
            <p className="text-muted-foreground text-sm">{statusConfig.subtitle}</p>
          </div>

          {/* 友好提示 - 小白能看懂 */}
          {statusConfig.tip && (
            <div className="inline-block px-4 py-2 bg-warning/10 border border-warning/30 rounded-lg">
              <p className="text-foreground text-xs">{statusConfig.tip}</p>
            </div>
          )}

          {/* 预估时间和已用时间 */}
          {(statusConfig.estimatedTime || elapsedTime > 0) && shouldShowMiniGame && (
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              {statusConfig.estimatedTime && (
                <span className="px-2 py-1 bg-muted rounded">{statusConfig.estimatedTime}</span>
              )}
              {elapsedTime > 0 && (
                <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                  已用时: {formatElapsedTime(elapsedTime)}
                </span>
              )}
            </div>
          )}

          {/* 进度步骤指示器 */}
          {shouldShowMiniGame && (
            <div className="flex items-center justify-center gap-2 pt-2">
              {progressSteps.map((step, index) => (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    step.done 
                      ? 'bg-success/10 text-success' 
                      : index === currentStepIndex 
                        ? 'bg-primary/10 text-primary animate-pulse' 
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {step.done ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : index === currentStepIndex ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-current" />
                    )}
                    <span>{step.label}</span>
                  </div>
                  {index < progressSteps.length - 1 && (
                    <div className={`w-8 h-0.5 mx-1 ${step.done ? 'bg-success/50' : 'bg-border'}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 错误显示 */}
          {(isError || isUnsupported) && error && (
            <p className="text-sm text-destructive flex items-center justify-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>

        {/* 小游戏区域 */}
        {shouldShowMiniGame ? (
          <div className="mx-auto w-full max-w-[560px] md:max-w-[680px] lg:max-w-[720px] max-h-[520px] overflow-auto">
            <LoadingMiniGame />
          </div>
        ) : (
          <div className="bg-background rounded-2xl shadow-inner p-6 text-center">
            {status === 'idle' && (
              <p className="text-sm text-muted-foreground">请选择一个项目并启动预览，即可开始编辑体验。</p>
            )}
            {isError && !error && (
              <p className="text-sm text-muted-foreground">预览发生未知错误，请尝试刷新或重启预览。</p>
            )}
            {isUnsupported && !error && (
              <p className="text-sm text-muted-foreground">请在启用 HTTPS 或 localhost 的跨源隔离环境下打开。</p>
            )}
          </div>
        )}

        {/* 技术日志区域 - 专业用户可展开查看 */}
        {showLogs && (
          <div className="space-y-2">
            <button
              onClick={() => setShowDetailedLogs(!showDetailedLogs)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <span>{showDetailedLogs ? '收起' : '展开'}技术日志</span>
              <svg 
                className={`w-4 h-4 transition-transform ${showDetailedLogs ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <AnimatePresence>
              {showDetailedLogs && (
                <motion.div
                  className="bg-card text-card-foreground rounded-lg p-4 text-left max-h-[40vh] overflow-auto text-xs font-mono space-y-1 border"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: LOG_EASE }}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                    <span className="text-muted-foreground">WebContainer 日志</span>
                    <span className="text-muted-foreground">{logs.length} 条记录</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {logs.slice(-20).map((log, index) => (
                      <motion.div
                        key={`${log}-${index}`}
                        className="whitespace-pre-wrap py-0.5 hover:bg-accent px-1 rounded"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25, ease: LOG_EASE }}
                      >
                        <span className="text-muted-foreground mr-2">{String(index + 1).padStart(2, '0')}</span>
                        {log}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 简化的最新日志预览 - 始终显示 */}
            {!showDetailedLogs && logs.length > 0 && (
              <motion.div
                className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground font-mono truncate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="text-muted-foreground mr-2">最新:</span>
                {logs[logs.length - 1]}
              </motion.div>
            )}
          </div>
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
    <div className="bg-background rounded-2xl shadow-lg p-4 sm:p-6 max-h-[480px] overflow-auto border">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <h2 className="text-base sm:text-lg font-medium text-foreground">翻牌小游戏</h2>
        </div>
        <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <div>
            步数:{' '}
            <span className="font-medium text-foreground">{moves}</span>
          </div>
          <div>
            配对:{' '}
            <span className="font-medium text-foreground">
              {matchedPairs}/{totalPairs}
            </span>
          </div>
        </div>
      </div>

      {matchedPairs === totalPairs && (
        <div className="mb-4 p-3 sm:p-4 bg-success/10 border border-success/30 rounded-xl text-center text-xs sm:text-sm text-success">
          🎉 恭喜完成！共计 {moves} 步
          <div>
            <button
              onClick={resetGame}
              className="mt-2 sm:mt-3 px-3 sm:px-4 py-1.5 bg-success text-success-foreground text-xs rounded-lg hover:bg-success/90 transition-colors"
            >
              再玩一次
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => handleCardClick(card.id)}
            disabled={card.matched || card.flipped}
            className={`aspect-square rounded-xl text-2xl sm:text-3xl font-bold transition-all duration-300 transform flex items-center justify-center shadow-md hover:shadow-lg ${
              card.flipped || card.matched
                ? 'bg-primary text-primary-foreground scale-105'
                : 'bg-muted hover:bg-accent hover:scale-105'
            } ${card.matched ? 'opacity-60' : ''} disabled:cursor-not-allowed`}
          >
            {card.flipped || card.matched ? card.icon : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}
