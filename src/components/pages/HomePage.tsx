import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProject } from '../../hooks/useProject';
import { ProjectCard } from '../project';
import ChatInput, { InputMode } from '../chat/ChatInput';
import { Button } from '@/components/ui/button';

interface HomePageProps {
  onStartBuilding: (prompt: string) => void;
  onViewAllProjects: () => void;
  onProjectClick: (project: any) => void;
  onIntroClick?: () => void;
}

export default function HomePage({ onStartBuilding, onViewAllProjects, onProjectClick, onIntroClick }: HomePageProps) {
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
      <div className={`flex-shrink-0 flex flex-col items-center justify-center bg-background relative ${
        recentProjects.length > 0 ? 'min-h-[70vh]' : 'h-full'
      }`}>
        <div className="relative z-10 max-w-2xl w-full px-6 space-y-8">
          <div className="flex justify-center mb-6">
            <Button
              variant="outline"
              onClick={onIntroClick}
              className="rounded-full gap-2"
            >
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium">Introducing aisitebuilder V1</span>
            </Button>
          </div>

          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold text-foreground tracking-tight">
              What will you <span className="text-primary italic font-extrabold">build</span> today?
            </h1>
            <p className="text-muted-foreground text-lg">
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
            <span className="text-sm text-muted-foreground">or import from</span>
            <Button variant="outline" className="rounded-full gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z" fill="#F24E1E"/>
              </svg>
              <span className="text-sm font-medium">Figma</span>
            </Button>
            <Button variant="outline" className="rounded-full gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#24292f"/>
              </svg>
              <span className="text-sm font-medium">GitHub</span>
            </Button>
          </div>
        </div>
      </div>

      {recentProjects.length > 0 && (
        <div className="flex-shrink-0 bg-background border-t border-border py-6">
          <div className="max-w-6xl mx-auto px-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-foreground">最近的项目</h2>
              <Button
                variant="link"
                onClick={onViewAllProjects}
                className="gap-2"
              >
                查看全部
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {recentProjects.map((project, index) => (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      x: 0, 
                      y: 0,
                    }}
                    exit={{ 
                      opacity: 0, 
                      scale: 0.8,
                      x: (Math.random() - 0.5) * 200,
                      y: (Math.random() - 0.5) * 200,
                      transition: { duration: 0.3 }
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                      mass: 1,
                      delay: index * 0.05,
                    }}
                  >
                    <ProjectCard
                      project={project}
                      onClick={() => handleProjectClick(project)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
