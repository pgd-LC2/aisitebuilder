import { X, User, FlaskConical } from 'lucide-react';

interface UserProfilePanelProps {
  open: boolean;
  onClose: () => void;
  email: string;
  preloadNodeModules: boolean;
  onTogglePreload: (value: boolean) => void;
  enableWatchdog: boolean;
  onToggleWatchdog: (value: boolean) => void;
}

export default function UserProfilePanel({
  open,
  onClose,
  email,
  preloadNodeModules,
  onTogglePreload,
  enableWatchdog,
  onToggleWatchdog
}: UserProfilePanelProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">个人信息</p>
              <p className="text-xs text-gray-500 truncate">{email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              实验性功能
            </p>
            <div className="mt-3 space-y-3">
              <div className="p-4 border border-dashed border-purple-200 rounded-xl bg-purple-50/60 flex gap-3">
                <div className="text-purple-500">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">预加载 node_modules</p>
                      <p className="text-xs text-gray-600">
                        复用 WebContainer 内的 node_modules 缓存，加速预览启动。
                      </p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={preloadNodeModules}
                        onChange={event => onTogglePreload(event.target.checked)}
                      />
                      <span
                        className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${
                          preloadNodeModules ? 'bg-purple-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${
                            preloadNodeModules ? 'translate-x-5' : ''
                          }`}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="p-4 border border-dashed border-purple-200 rounded-xl bg-purple-50/60 flex gap-3">
                <div className="text-purple-500">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">启用 Watchdog 定时器</p>
                      <p className="text-xs text-gray-600">
                        当 AI 回复延迟时自动刷新消息，关闭后需手动刷新。
                      </p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={enableWatchdog}
                        onChange={event => onToggleWatchdog(event.target.checked)}
                      />
                      <span
                        className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${
                          enableWatchdog ? 'bg-purple-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${
                            enableWatchdog ? 'translate-x-5' : ''
                          }`}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 leading-5">
            <p>实验性功能可能带来不可预期的行为，请在遇到问题时尝试关闭相应开关。</p>
            <p className="mt-2">更多功能即将上线，敬请期待。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
