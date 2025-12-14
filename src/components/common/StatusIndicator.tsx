import { useEffect, useState } from 'react';

type StatusType = 'ready' | 'thinking' | 'building' | 'error' | 'idle';

interface StatusConfig {
  label: string;
  color: string;
  animate: boolean;
}

const statusConfigs: Record<StatusType, StatusConfig> = {
  ready: {
    label: '就绪',
    color: 'bg-green-500',
    animate: true,
  },
  thinking: {
    label: '思考中',
    color: 'bg-blue-500',
    animate: true,
  },
  building: {
    label: '构建中',
    color: 'bg-yellow-500',
    animate: true,
  },
  error: {
    label: '错误',
    color: 'bg-red-500',
    animate: false,
  },
  idle: {
    label: '空闲',
    color: 'bg-gray-500',
    animate: false,
  },
};

export default function StatusIndicator() {
  const [status, setStatus] = useState<StatusType>('ready');

  useEffect(() => {
    const statusSequence: StatusType[] = ['ready', 'thinking', 'building', 'ready', 'idle'];
    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % statusSequence.length;
      setStatus(statusSequence[currentIndex]);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const config = statusConfigs[status];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${config.color} ${
          config.animate ? 'animate-pulse' : ''
        }`}
      />
      <span className="text-xs text-gray-400">{config.label}</span>
    </div>
  );
}
