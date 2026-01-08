# React 状态管理模式

## 概述

本项目在 React 组件中使用了多种状态管理模式，包括 useReducer、useRef 和 Context。

## useReducer 模式

### 适用场景

当组件状态复杂且有多种更新方式时，使用 useReducer 替代 useState：

- 状态对象包含多个相关字段
- 有多种不同的状态更新操作
- 状态更新逻辑复杂，需要基于当前状态计算新状态

### 实现模式

```typescript
// 1. 定义状态接口
interface AgentState {
  currentTask: AITask | null;
  messages: ChatMessage[];
  isProcessing: boolean;
  lastError: string | null;
}

// 2. 定义 Action 类型（使用联合类型）
type AgentAction =
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'APPEND_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CURRENT_TASK'; payload: AITask | null }
  | { type: 'TASK_UPDATED'; payload: AITask }
  | { type: 'SET_ERROR'; payload: string | null };

// 3. 实现 Reducer 函数
function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    
    case 'APPEND_MESSAGE': {
      // 去重检查
      if (state.messages.some(m => m.id === action.payload.id)) {
        return state;
      }
      return { ...state, messages: [...state.messages, action.payload] };
    }
    // ... 其他 case
    default:
      return state;
  }
}

// 4. 在 Hook 中使用
function useAgentEvents(options: UseAgentEventsOptions) {
  const [state, dispatch] = useReducer(agentReducer, initialState);
  
  const appendMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: 'APPEND_MESSAGE', payload: message });
  }, []);
  
  return { ...state, appendMessage };
}
```

## useRef 模式

### 回调函数引用

使用 ref 存储回调函数，避免因回调变化导致的订阅循环：

```typescript
const onTaskCompletedRef = useRef(onTaskCompleted);
onTaskCompletedRef.current = onTaskCompleted;

const handleTaskUpdate = useCallback(async (task: AITask) => {
  onTaskCompletedRef.current?.(task);
}, []); // 依赖数组为空，避免重新创建
```

### 挂载状态追踪

```typescript
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => { isMountedRef.current = false; };
}, []);

// 在异步操作中检查
const fetchData = async () => {
  const data = await someAsyncOperation();
  if (!isMountedRef.current) return;
  dispatch({ type: 'SET_DATA', payload: data });
};
```

### 版本追踪

```typescript
const loadVersionRef = useRef(0);

const refreshData = async () => {
  loadVersionRef.current += 1;
  const currentVersion = loadVersionRef.current;
  
  const data = await fetchData();
  
  if (currentVersion < loadVersionRef.current) {
    console.log('版本已过期，忽略结果');
    return;
  }
  
  dispatch({ type: 'SET_DATA', payload: data });
};
```

## Context 模式

### Provider 实现

```typescript
interface AuthContextType {
  user: User | null;
  loading: boolean;
  authReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  const authReady = !loading && user !== null;
  
  const value = { user, loading, authReady, /* ... */ };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

## 最佳实践

1. **状态分离**：将相关状态组织在一起，不相关的状态分开管理
2. **派生状态**：使用 useMemo 或直接计算派生状态，避免冗余状态
3. **回调稳定性**：使用 useCallback 和 ref 确保回调函数的稳定性
4. **异步安全**：在异步操作中检查组件挂载状态和数据版本
5. **类型安全**：使用 TypeScript 联合类型定义 Action，确保类型安全
