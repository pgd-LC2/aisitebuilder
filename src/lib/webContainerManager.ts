import type { WebContainer as WebContainerInstance, WebContainerProcess } from '@webcontainer/api';

type WebContainerConstructor = typeof import('@webcontainer/api').WebContainer;

type ManagerState = 'idle' | 'booting' | 'ready' | 'tearing_down';

interface WebContainerManager {
  getState: () => ManagerState;
  getInstance: () => WebContainerInstance | null;
  getDevServerProcess: () => WebContainerProcess | null;
  setDevServerProcess: (process: WebContainerProcess | null) => void;
  boot: () => Promise<WebContainerInstance | null>;
  teardown: () => Promise<void>;
  isSupported: () => boolean;
  getUnsupportedReason: () => string | null;
  loadWebContainerClass: () => Promise<boolean>;
}

let webContainerClass: WebContainerConstructor | null = null;
let instance: WebContainerInstance | null = null;
let devServerProcess: WebContainerProcess | null = null;
let state: ManagerState = 'idle';
let bootPromise: Promise<WebContainerInstance | null> | null = null;
let teardownPromise: Promise<void> | null = null;
let unsupportedReason: string | null = null;

const checkBrowserSupport = (): { supported: boolean; reason: string | null } => {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'WebContainer 需要浏览器环境' };
  }

  const secureContext = window.isSecureContext || window.location.hostname === 'localhost';
  if (!secureContext) {
    return { supported: false, reason: 'WebContainer 需要通过 HTTPS 或在 localhost 环境下运行' };
  }

  if (!window.crossOriginIsolated) {
    return { supported: false, reason: '浏览器未启用跨源隔离 (COOP/COEP)，无法加载 WebContainer 预览' };
  }

  return { supported: true, reason: null };
};

const loadWebContainerClass = async (): Promise<boolean> => {
  if (webContainerClass) {
    return true;
  }

  const support = checkBrowserSupport();
  if (!support.supported) {
    unsupportedReason = support.reason;
    return false;
  }

  try {
    const mod = await import('@webcontainer/api');
    webContainerClass = mod.WebContainer;
    return true;
  } catch (err) {
    console.error('加载 WebContainer 失败:', err);
    unsupportedReason = '当前浏览器不支持 WebContainer 预览';
    return false;
  }
};

const stopDevServer = async (): Promise<void> => {
  if (devServerProcess) {
    try {
      devServerProcess.kill();
    } catch (err) {
      console.warn('停止开发服务器失败:', err);
    }
    devServerProcess = null;
  }
};

const teardown = async (): Promise<void> => {
  if (state === 'tearing_down' && teardownPromise) {
    return teardownPromise;
  }

  if (state === 'idle' && !instance && !bootPromise) {
    return;
  }

  state = 'tearing_down';

  teardownPromise = (async () => {
    try {
      if (bootPromise) {
        try {
          await bootPromise;
        } catch {
          // Ignore boot errors during teardown
        }
        bootPromise = null;
      }

      await stopDevServer();

      if (instance) {
        try {
          await instance.teardown();
        } catch (err) {
          console.error('销毁 WebContainer 失败:', err);
        }
        instance = null;
      }
    } finally {
      state = 'idle';
      teardownPromise = null;
    }
  })();

  return teardownPromise;
};

const boot = async (): Promise<WebContainerInstance | null> => {
  if (state === 'tearing_down' && teardownPromise) {
    await teardownPromise;
  }

  if (state === 'ready' && instance) {
    return instance;
  }

  if (state === 'booting' && bootPromise) {
    return bootPromise;
  }

  if (!webContainerClass) {
    const loaded = await loadWebContainerClass();
    if (!loaded) {
      return null;
    }
  }

  state = 'booting';

  bootPromise = (async () => {
    try {
      if (instance) {
        await teardown();
      }

      const newInstance = await webContainerClass!.boot();
      instance = newInstance;
      state = 'ready';
      return newInstance;
    } catch (err) {
      console.error('启动 WebContainer 失败:', err);
      state = 'idle';
      bootPromise = null;
      throw err;
    }
  })();

  return bootPromise;
};

export const webContainerManager: WebContainerManager = {
  getState: () => state,
  getInstance: () => instance,
  getDevServerProcess: () => devServerProcess,
  setDevServerProcess: (process: WebContainerProcess | null) => {
    devServerProcess = process;
  },
  boot,
  teardown,
  isSupported: () => {
    const support = checkBrowserSupport();
    return support.supported;
  },
  getUnsupportedReason: () => unsupportedReason,
  loadWebContainerClass
};
