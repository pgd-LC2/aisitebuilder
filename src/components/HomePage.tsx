import { Plus, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import ProjectCard from './ProjectCard';

interface HomePageProps {
  onStartBuilding: (prompt: string) => void;
  onViewAllProjects: () => void;
  onProjectClick: (project: any) => void;
}

const placeholders = [
  '大地图游戏',
  '企业宣传网站',
  '在线课程平台',
  '电商购物网站',
  '个人作品集',
  '社交媒体应用',
  '任务管理工具'
];

export default function HomePage({ onStartBuilding, onViewAllProjects, onProjectClick }: HomePageProps) {
  const [input, setInput] = useState('');
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { getRecentProjects } = useProject();

  const recentProjects = getRecentProjects(6);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
      }, 150);
      setTimeout(() => {
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async () => {
    if (input.trim() && !isCreating) {
      setIsCreating(true);
      await onStartBuilding(input);
      setIsCreating(false);
      setInput('');
    }
  };

  const handleProjectClick = (project: any) => {
    onProjectClick(project);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className={`flex-shrink-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white relative ${
        recentProjects.length > 0 ? 'min-h-[65vh]' : 'h-full'
      }`}>
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 0,450 Q 360,200 720,450 T 1440,450 L 1440,900 L 0,900 Z"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="3"
            opacity="0.3"
          />
        </svg>

        <div className="relative z-10 max-w-3xl w-full px-8 space-y-8">
          <div className="text-center space-y-5">
            <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.12)' }}>
              What will you <span className="text-blue-600 italic">build</span> today?
            </h1>
            <p className="text-gray-600 text-xl">
              通过与 AI 对话创建精美的应用和网站
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-1.5">
            <div className="flex items-center gap-1">
              <button
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="添加"
              >
                <Plus className="w-5 h-5 text-gray-600" />
              </button>

              <div className="flex-1 relative py-2 pl-1 pr-3 overflow-hidden">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder=""
                  disabled={isCreating}
                  className="w-full outline-none text-gray-800 bg-transparent relative z-10 disabled:opacity-50"
                />
                {!input && (
                  <div className="absolute left-0 top-2 pointer-events-none overflow-hidden h-6">
                    <div
                      className={`transition-transform duration-300 ease-in-out ${
                        isAnimating ? '-translate-y-full' : 'translate-y-0'
                      }`}
                    >
                      <div className="text-gray-400 h-6 flex items-center">
                        让我们构建一个{placeholders[currentPlaceholder]}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isCreating}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isCreating ? '创建中...' : '立即构建'}
                {!isCreating && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {recentProjects.length > 0 && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 py-6">
          <div className="max-w-6xl mx-auto px-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-gray-900">最近的项目</h2>
              <button
                onClick={onViewAllProjects}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                查看全部
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => handleProjectClick(project)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
