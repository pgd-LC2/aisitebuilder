# 单例模式与状态机模式

## 概述

本项目在多个核心组件中使用了单例模式和状态机模式来管理复杂的生命周期和状态转换。

## 单例模式

### RealtimeClient 单例

`RealtimeClient` 是管理所有 Supabase Realtime 订阅的单例类。

```typescript
class RealtimeClient {
  private static instance: RealtimeClient | null = null;
  
  // 私有构造函数，确保单例模式
  private constructor() {}
  
  /**
   * 获取 RealtimeClient 单例实例
   */
  static getInstance(): RealtimeClient {
    if (!RealtimeClient.instance) {
      RealtimeClient.instance = new RealtimeClient();
    }
    return RealtimeClient.instance;
  }
  
  /**
   * 重置单例实例（用于认证变更时）
   */
  static resetInstance(): void {
    if (RealtimeClient.instance) {
      RealtimeClient.instance.cleanup('RESET');
    }
    RealtimeClient.instance = null;
  }
}
```

**使用场景**：
- 确保整个应用只有一个 Realtime 连接管理器
- 集中管理所有订阅的生命周期
- 在认证变更时统一清理所有订阅

### WebContainerManager 单例

`WebContainerManager` 管理 WebContainer 实例的生命周期。

```typescript
// 模块级单例状态
let state: ManagerState = 'idle';
let instance: WebContainerInstance | null = null;
let devServerProcess: WebContainerProcess | null = null;

// 导出单例管理器
export const webContainerManager: WebContainerManager = {
  getState: () => state,
  getInstance: () => instance,
  getDevServerProcess: () => devServerProcess,
  setDevServerProcess: (process) => { devServerProcess = process; },
  boot,
  teardown,
  isSupported,
  getUnsupportedReason,
  loadWebContainerClass
};
```

**关键约束**：WebContainer 有一个关键的单例约束 - 同一时间只能启动一个 WebContainer 实例。

## 状态机模式

### WebContainerManager 状态机

WebContainerManager 使用状态机管理生命周期：

```typescript
type ManagerState = 'idle' | 'booting' | 'ready' | 'tearing_down';
```

**状态转换图**：

```
                    boot()
    ┌─────────────────────────────────────┐
    │                                     ▼
  idle ──────────────────────────────► booting
    ▲                                     │
    │                                     │ success
    │                                     ▼
    │                                   ready
    │                                     │
    │                                     │ teardown()
    │                                     ▼
    └─────────────────────────────── tearing_down
```

### AITask 状态机

AITask 使用状态机管理任务生命周期：

```typescript
type AITaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
```

**状态转换图**：

```
                claim()
  queued ──────────────────────────► running
    │                                   │
    │ cancel()                          │ success
    ▼                                   ▼
 cancelled                           completed
                                        │
                                        │ error
                                        ▼
                                      failed
```

## Generation 机制

RealtimeClient 使用 `sessionGeneration` 来追踪订阅会话，防止旧回调影响新订阅：

```typescript
class RealtimeClient {
  /** 当前会话世代，每次 cleanup/reset 时递增 */
  private sessionGeneration = 0;
  
  /**
   * 检查给定的 generation 是否仍然有效
   */
  isGenerationValid(generation: number): boolean {
    return generation === this.sessionGeneration;
  }
  
  /**
   * 清理所有订阅并递增 generation
   */
  cleanup(reason: CloseReason): void {
    this.sessionGeneration++;
    // ... 清理逻辑
  }
}
```

## 最佳实践

1. **单例重置**：在认证变更或项目切换时，确保正确重置单例实例
2. **状态检查**：在执行操作前检查当前状态，避免无效的状态转换
3. **并发控制**：使用状态机防止并发操作导致的竞态条件
4. **Generation 验证**：在异步回调中验证 generation，防止过期回调影响新状态
5. **清理顺序**：销毁时按正确顺序清理资源（先停止进程，再销毁实例）
