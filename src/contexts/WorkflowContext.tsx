import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { WorkflowMode, PlanSummary, WorkflowState } from '../types/project';

interface WorkflowContextType {
  workflowState: WorkflowState;
  mode: WorkflowMode;
  planSummary: PlanSummary | null;
  isImplementReady: boolean;
  isPlanningMode: boolean;
  isBuildMode: boolean;
  isDefaultMode: boolean;
  enterPlanningMode: () => void;
  enterBuildMode: (planSummary?: PlanSummary) => void;
  exitToDefaultMode: () => void;
  setImplementReady: (ready: boolean) => void;
  resetWorkflow: () => void;
}

const initialWorkflowState: WorkflowState = {
  mode: 'default',
  planSummary: null,
  isImplementReady: false,
};

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [workflowState, setWorkflowState] = useState<WorkflowState>(initialWorkflowState);

  const enterPlanningMode = useCallback(() => {
    setWorkflowState(prev => ({
      ...prev,
      mode: 'planning',
      isImplementReady: false,
    }));
    console.log('[WorkflowContext] 进入规划模式');
  }, []);

  const enterBuildMode = useCallback((planSummary?: PlanSummary) => {
    setWorkflowState(prev => ({
      ...prev,
      mode: 'build',
      planSummary: planSummary ?? null,
      isImplementReady: false,
    }));
    if (planSummary) {
      console.log('[WorkflowContext] 进入构建模式，规划摘要已锁定');
    } else {
      console.log('[WorkflowContext] 进入构建模式（直接构建，无规划摘要）');
    }
  }, []);

  const exitToDefaultMode = useCallback(() => {
    setWorkflowState(prev => ({
      ...prev,
      mode: 'default',
      isImplementReady: false,
    }));
    console.log('[WorkflowContext] 退出到默认模式');
  }, []);

  const setImplementReady = useCallback((ready: boolean) => {
    setWorkflowState(prev => ({
      ...prev,
      isImplementReady: ready,
    }));
    if (ready) {
      console.log('[WorkflowContext] AI 已准备好实施，显示 Implement 按钮');
    }
  }, []);

  const resetWorkflow = useCallback(() => {
    setWorkflowState(initialWorkflowState);
    console.log('[WorkflowContext] 工作流已重置');
  }, []);

  const value: WorkflowContextType = {
    workflowState,
    mode: workflowState.mode,
    planSummary: workflowState.planSummary,
    isImplementReady: workflowState.isImplementReady,
    isPlanningMode: workflowState.mode === 'planning',
    isBuildMode: workflowState.mode === 'build',
    isDefaultMode: workflowState.mode === 'default',
    enterPlanningMode,
    enterBuildMode,
    exitToDefaultMode,
    setImplementReady,
    resetWorkflow,
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}
