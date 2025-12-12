import { Home, LogOut, FolderOpen, GitBranch } from 'lucide-react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useProject } from './contexts/ProjectContext';
import { useSettings } from './contexts/SettingsContext';
import ChatPanel from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';
import HomePage from './components/HomePage';
import ProjectsPage from './components/ProjectsPage';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import VersionManager from './components/VersionManager';
import InitializingPage from './components/InitializingPage';
import UserProfilePanel from './components/UserProfilePanel';
import ParticleField from './components/ParticleField';
import IntroPage from './components/IntroPage';
import { generateTitle } from './utils/titleGenerator';
import { buildLogService } from './services/buildLogService';
import { templateService } from './services/templateService';
import { versionService } from './services/versionService';
import { ProjectVersion } from './types/project';

type ViewType = 'home' | 'projects' | 'building' | 'initializing' | 'intro';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [initializingProjectTitle, setInitializingProjectTitle] = useState('');
  const [currentVersion, setCurrentVersion] = useState<ProjectVersion | null>(null);
  const { user, loading, signOut, userProfile, refreshUserProfile } = useAuth();
  const { createProject, currentProject, setCurrentProject, updateProjectStatus } = useProject();
  const { preloadNodeModules, setPreloadNodeModules } = useSettings();
  const buttonSpring = useMemo<Transition>(
    () => ({ type: 'spring', stiffness: 450, damping: 30 }),
    []
  );
  const projectFilesContext = useMemo(() => {
    if (!currentProject) return undefined;

    const versionSegment = currentVersion ? `v${currentVersion.id}` : 'shared';
    return {
      bucket: 'project-files',
      path: `${currentProject.id}/${versionSegment}`,
      versionId: currentVersion?.id,
      versionNumber: currentVersion?.version_number
    };
  }, [currentProject, currentVersion]);

  const refreshCurrentVersion = async () => {
    if (!currentProject) {
      setCurrentVersion(null);
      return;
    }

    const { data } = await versionService.getLatestVersion(currentProject.id);
    if (data) {
      setCurrentVersion(data);
    } else {
      setCurrentVersion(null);
    }
  };

  useEffect(() => {
    if (!currentProject) {
      setCurrentVersion(null);
      return;
    }

    refreshCurrentVersion();
  }, [currentProject]);

  const handleStartBuilding = async (prompt: string) => {
    try {
      const title = generateTitle(prompt);
      const { data, error } = await createProject(title, prompt);

      if (!error && data) {
        setInitializingProjectTitle(title);
        setCurrentView('initializing');
        await buildLogService.addBuildLog(data.id, 'info', `项目创建成功: ${title}`);
        await updateProjectStatus(data.id, 'building');

        const { success, error: templateError } = await templateService.initializeProjectWithTemplate(
          data.id,
          title,
          prompt
        );

        if (success) {
          await buildLogService.addBuildLog(data.id, 'success', '项目准备就绪，可以开始对话');
          await updateProjectStatus(data.id, 'completed');
          setCurrentView('building');
        } else {
          await buildLogService.addBuildLog(data.id, 'error', '初始化项目失败');
          await updateProjectStatus(data.id, 'failed');
          console.error('初始化项目模板失败:', templateError);
          alert('初始化项目失败，请重试');
          setCurrentView('home');
        }
      } else {
        console.error('创建项目失败:', error);
        alert('创建项目失败，请重试');
      }
    } catch (err) {
      console.error('创建项目出错:', err);
      alert('创建项目出错，请重试');
    }
  };

  const handleProjectClick = (project: any) => {
    setCurrentProject(project);
    setCurrentView('building');
  };

  const handleBackToHome = () => {
    setCurrentProject(null);
    setCurrentView('home');
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authView === 'login') {
      return <LoginPage onSwitchToSignUp={() => setAuthView('signup')} />;
    }
    return <SignUpPage onSwitchToLogin={() => setAuthView('login')} />;
  }

  if (currentView === 'initializing') {
    return <InitializingPage projectTitle={initializingProjectTitle} />;
  }

  if (currentView === 'intro') {
    return <IntroPage onBack={() => setCurrentView('home')} />;
  }

  const homeView = (
    <motion.div
      key="home-view"
      className="h-screen flex flex-col overflow-hidden bg-white"
      initial={{ opacity: 0, scale: 0.94, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -40 }}
      transition={{ type: 'spring', stiffness: 160, damping: 26 }}
    >
      <header className="bg-white border-b border-gray-200 px-6 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <img src="/favicon.svg" alt="AI BUILD" className="h-8 w-8" />
          <nav className="flex items-center gap-1">
            <motion.button
              onClick={() => setCurrentView('home')}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={buttonSpring}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                currentView === 'home'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              主页
            </motion.button>
            <motion.button
              onClick={() => setCurrentView('projects')}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={buttonSpring}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                currentView === 'projects'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              我的项目
            </motion.button>
          </nav>
        </div>

        <div className="flex items-center gap-6">
          <motion.button
            onClick={() => setShowProfilePanel(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={buttonSpring}
            className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors"
            title="个人信息"
          >
            {user.email}
          </motion.button>
          <motion.button
            onClick={signOut}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={buttonSpring}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </motion.button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {currentView === 'home' ? (
          <HomePage
            onStartBuilding={handleStartBuilding}
            onViewAllProjects={() => setCurrentView('projects')}
            onProjectClick={handleProjectClick}
            onIntroClick={() => setCurrentView('intro')}
          />
        ) : (
          <ProjectsPage
            onCreateNew={() => setCurrentView('home')}
            onProjectClick={handleProjectClick}
          />
        )}
      </div>
    </motion.div>
  );

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'building':
        return '构建中';
      case 'completed':
        return '已完成';
      case 'draft':
        return '草稿';
      case 'failed':
        return '失败';
      default:
        return '草稿';
    }
  };

  const buildingView = (
    <motion.div
      key="building-view"
      className="h-screen flex flex-col bg-white overflow-hidden"
      initial={{ opacity: 0, scale: 0.85, y: 60 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -60 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
    >
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <motion.button
            onClick={handleBackToHome}
            whileTap={{ scale: 0.9 }}
            transition={buttonSpring}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title="返回主页"
          >
            <Home className="w-5 h-5 text-gray-600" />
          </motion.button>
          {currentProject && (
            <>
              <motion.button
                onClick={() => setShowVersionManager(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                transition={buttonSpring}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="版本管理"
              >
                <GitBranch className="w-4 h-4" />
                版本管理
              </motion.button>
              <div className="w-px h-6 bg-gray-300 flex-shrink-0"></div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-medium text-gray-900 truncate">
                  {currentProject.title}
                </h1>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <motion.button
            onClick={() => setShowProfilePanel(true)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            transition={buttonSpring}
            className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors"
            title="个人信息"
          >
            {user.email}
          </motion.button>
          <motion.button
            onClick={signOut}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={buttonSpring}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出
          </motion.button>
          {currentProject && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <div
                className={`w-2 h-2 rounded-full ${
                  currentProject.status === 'building'
                    ? 'bg-blue-500 animate-pulse'
                    : currentProject.status === 'completed'
                    ? 'bg-green-500'
                    : currentProject.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
                }`}
              />
              <span className="text-xs font-medium text-gray-700">
                {getStatusText(currentProject.status)}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[28%] min-w-[320px] max-w-[480px] border-r border-gray-200 flex-shrink-0 bg-gray-50">
          <ChatPanel projectFilesContext={projectFilesContext} />
        </div>

        <div className="flex-1 bg-gray-100">
          <PreviewPanel currentVersionId={currentVersion?.id} />
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      <AnimatePresence mode="wait">
        {currentView !== 'building' ? homeView : buildingView}
      </AnimatePresence>
      <UserProfilePanel
        open={showProfilePanel}
        onClose={() => setShowProfilePanel(false)}
        email={user.email ?? ''}
        userId={user.id}
        userProfile={userProfile}
        preloadNodeModules={preloadNodeModules}
        onTogglePreload={setPreloadNodeModules}
        onProfileUpdate={refreshUserProfile}
      />
      <AnimatePresence>
        {showVersionManager && currentProject && (
          <VersionManagerPortal
            projectId={currentProject.id}
            currentVersionId={currentVersion?.id}
            onClose={() => setShowVersionManager(false)}
            onVersionRestore={(version) => {
              setShowVersionManager(false);
              alert(`已回退到版本 v${version.version_number}`);
            }}
            onVersionChange={refreshCurrentVersion}
          />
        )}
      </AnimatePresence>
    </>
  );
}

interface VersionManagerPortalProps {
  projectId: string;
  currentVersionId?: string;
  onClose: () => void;
  onVersionRestore?: (version: ProjectVersion) => void;
  onVersionChange?: () => void;
}

function VersionManagerPortal(props: VersionManagerPortalProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <ParticleField />
      <motion.div
        className="relative z-10"
        initial={{ scale: 0.75, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: -20 }}
        transition={{ type: 'spring', stiffness: 230, damping: 27 }}
      >
        <VersionManager {...props} />
      </motion.div>
    </motion.div>
  );
}
export default App;
