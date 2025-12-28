import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { logVersionInfo } from './utils/versionInfo';
import './styles/geist.css';
import './index.css';

logVersionInfo();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ProjectProvider>
        <SettingsProvider>
          <WorkflowProvider>
            <App />
          </WorkflowProvider>
        </SettingsProvider>
      </ProjectProvider>
    </AuthProvider>
  </StrictMode>
);
