import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import ProjectCard from './ProjectCard';
import ChatInput, { InputMode } from './ChatInput';

interface HomePageProps {
  onStartBuilding: (prompt: string) => void;
  onViewAllProjects: () => void;
  onProjectClick: (project: any) => void;
}

export default function HomePage({ onStartBuilding, onViewAllProjects, onProjectClick }: HomePageProps) {
  const [input, setInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { getRecentProjects } = useProject();

  const recentProjects = getRecentProjects(6);

  const handleSubmit = async (mode: InputMode) => {
    if (input.trim() && !isCreating) {
      setIsCreating(true);
      console.log('提交模式:', mode, '内容:', input);
      await onStartBuilding(input);
      setIsCreating(false);
      setInput('');
    }
  };

  const handleProjectClick = (project: any) => {
    onProjectClick(project);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className={`flex-shrink-0 flex flex-col items-center justify-center bg-gradient-to-b from-blue-50/50 to-white relative ${
        recentProjects.length > 0 ? 'min-h-[70vh]' : 'h-full'
      }`}>
        <svg
          className="absolute bottom-0 left-0 right-0 w-full pointer-events-none"
          viewBox="0 0 1440 400"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ height: '60%' }}
        >
          <path
            d="M -100,400 Q 720,-100 1540,400"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            opacity="0.4"
          />
        </svg>

        <div className="relative z-10 max-w-2xl w-full px-6 space-y-8">
          <div className="flex justify-center mb-6">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md transition-shadow">
              <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Introducing Bolt V2</span>
            </button>
          </div>

          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold text-gray-900 tracking-tight">
              What will you <span className="text-blue-500 italic font-extrabold">build</span> today?
            </h1>
            <p className="text-gray-500 text-lg">
              Create stunning apps & websites by chatting with AI.
            </p>
          </div>

          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isCreating}
            isSubmitting={isCreating}
            showAgentSelector={true}
          />

          <div className="flex items-center justify-center gap-4 pt-2">
            <span className="text-sm text-gray-400">or import from</span>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z" fill="#F24E1E"/>
              </svg>
              <span className="text-sm font-medium text-gray-700">Figma</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#24292f"/>
              </svg>
              <span className="text-sm font-medium text-gray-700">GitHub</span>
            </button>
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
