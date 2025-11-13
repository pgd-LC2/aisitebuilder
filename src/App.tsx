import { Home, LogOut, FolderOpen, GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useProject } from './contexts/ProjectContext';
import ChatPanel from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';
import HomePage from './components/HomePage';
import ProjectsPage from './components/ProjectsPage';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import VersionManager from './components/VersionManager';
import InitializingPage from './components/InitializingPage';
import { generateTitle } from './utils/titleGenerator';
import { buildLogService } from './services/buildLogService';
import { templateService } from './services/templateService';
import { versionService } from './services/versionService';
import { ProjectVersion } from './types/project';

type ViewType = 'home' | 'projects' | 'building' | 'initializing';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [initializingProjectTitle, setInitializingProjectTitle] = useState('');
  const [currentVersion, setCurrentVersion] = useState<ProjectVersion | null>(null);
  const { user, loading, signOut } = useAuth();
  const { createProject, currentProject, setCurrentProject, updateProjectStatus } = useProject();

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

  if (currentView !== 'building') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-xl font-bold text-gray-900">AI BUILD</div>
            <nav className="flex items-center gap-1">
              <button
                onClick={() => setCurrentView('home')}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  currentView === 'home'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                主页
              </button>
              <button
                onClick={() => setCurrentView('projects')}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  currentView === 'projects'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                我的项目
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {currentView === 'home' ? (
            <HomePage
              onStartBuilding={handleStartBuilding}
              onViewAllProjects={() => setCurrentView('projects')}
              onProjectClick={handleProjectClick}
            />
          ) : (
            <ProjectsPage
              onCreateNew={() => setCurrentView('home')}
              onProjectClick={handleProjectClick}
            />
          )}
        </div>
      </div>
    );
  }

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'building': return '构建中';
      case 'completed': return '已完成';
      case 'draft': return '草稿';
      case 'failed': return '失败';
      default: return '草稿';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={handleBackToHome}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title="返回主页"
          >
            <Home className="w-5 h-5 text-gray-600" />
          </button>
          {currentProject && (
            <>
              <button
                onClick={() => setShowVersionManager(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="版本管理"
              >
                <GitBranch className="w-4 h-4" />
                版本管理
              </button>
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
          <span className="text-sm text-gray-600">{user.email}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
          {currentProject && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <div
                className={`w-2 h-2 rounded-full ${
                  currentProject.status === 'building' ? 'bg-blue-500 animate-pulse' :
                  currentProject.status === 'completed' ? 'bg-green-500' :
                  currentProject.status === 'failed' ? 'bg-red-500' :
                  'bg-gray-400'
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
        <div className="w-[400px] border-r border-gray-200 flex-shrink-0 bg-gray-50">
          <ChatPanel />
        </div>

        <div className="flex-1 bg-gray-100">
          <PreviewPanel currentVersionId={currentVersion?.id} />
        </div>
      </div>

      {showVersionManager && currentProject && (
        <VersionManager
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
    </div>
  );
}

export default App;
