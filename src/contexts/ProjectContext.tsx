import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project } from '../types/project';
import { projectService } from '../services/projectService';
import { useAuth } from './AuthContext';

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  createProject: (title: string, description: string) => Promise<{ data: Project | null; error: any }>;
  setCurrentProject: (project: Project | null) => void;
  updateProjectStatus: (projectId: string, status: Project['status']) => Promise<void>;
  refreshProjects: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<{ error: any }>;
  getRecentProjects: (limit: number) => Project[];
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refreshProjects = async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await projectService.getProjectsByUserId(user.id);
    if (!error && data) {
      setProjects(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshProjects();
  }, [user]);

  const createProject = async (title: string, description: string) => {
    if (!user) {
      return { data: null, error: new Error('User not authenticated') };
    }

    const { data, error } = await projectService.createProject(user.id, title, description);

    if (!error && data) {
      setProjects(prev => [data, ...prev]);
      setCurrentProject(data);
    }

    return { data, error };
  };

  const updateProjectStatus = async (projectId: string, status: Project['status']) => {
    const { data, error } = await projectService.updateProjectStatus(projectId, status);

    if (!error && data) {
      setProjects(prev =>
        prev.map(p => p.id === projectId ? data : p)
      );

      if (currentProject?.id === projectId) {
        setCurrentProject(data);
      }
    }
  };

  const deleteProject = async (projectId: string) => {
    const { error } = await projectService.deleteProject(projectId);

    if (!error) {
      setProjects(prev => prev.filter(p => p.id !== projectId));

      if (currentProject?.id === projectId) {
        setCurrentProject(null);
      }
    }

    return { error };
  };

  const getRecentProjects = (limit: number) => {
    return projects.slice(0, limit);
  };

  const value: ProjectContextType = {
    projects,
    currentProject,
    loading,
    createProject,
    setCurrentProject,
    updateProjectStatus,
    refreshProjects,
    deleteProject,
    getRecentProjects
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
