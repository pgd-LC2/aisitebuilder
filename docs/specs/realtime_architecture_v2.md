# Realtime 架构 V2 - Generation 和 CloseReason 机制

## 概述

本文档描述了 Realtime 订阅系统的 V2 架构，引入了「会话世代（Generation）」和「关闭原因（CloseReason）」两个核心概念，用于解决标签页切换时的订阅竞态条件问题。

## 核心概念

### 会话世代（Session Generation）

会话世代是一个递增的计数器，用于标识 RealtimeClient 的生命周期阶段。每当发生以下事件时，generation 会递增：

- `cleanup()` 被调用
- `resetInstance()` 被调用
- 认证状态变化（SIGNED_IN、SIGNED_OUT、TOKEN_REFRESHED）

每个订阅在创建时会记录当前的 generation，后续的状态回调会携带这个 generation。Hook 可以通过比较 generation 来判断回调是否仍然有效。

### 关闭原因（Close Reason）

关闭原因用于区分不同类型的连接关闭：

| CloseReason | 描述 | 是否触发兜底刷新 |
|-------------|------|-----------------|
| `CLEANUP` | 由 cleanup() 主动触发 | 否 |
| `UNSUBSCRIBE` | 由 unsubscribe() 主动触发 | 否 |
| `AUTH_CHANGE` | 由认证状态变化触发 | 否 |
| `ERROR` | 由网络错误、RLS 拒绝等异常触发 | 是 |
| `UNKNOWN` | 未知原因 | 是 |

### 状态变化元数据（StatusChangeMeta）

状态回调现在携带元数据，包含：

```typescript
interface StatusChangeMeta {
  /** 订阅创建时的会话世代 */
  generation: number;
  /** 关闭原因（仅在 CLOSED 状态时有值） */
  closeReason?: CloseReason;
  /** 是否是预期关闭 */
  isExpectedClose?: boolean;
}
```

## 架构组件

### RealtimeClient

单例客户端，负责管理所有 Supabase Realtime 连接。

关键属性：
- `sessionGeneration: number` - 当前会话世代
- `isExpectedClose: boolean` - 是否正在进行预期关闭
- `currentCloseReason: CloseReason` - 当前关闭原因

关键方法：
- `getSessionGeneration()` - 获取当前 generation
- `isGenerationValid(gen)` - 检查给定 generation 是否仍然有效
- `markExpectedClose()` - 标记开始预期关闭
- `clearExpectedClose()` - 清除预期关闭标记
- `incrementGeneration()` - 递增 generation
- `cleanup(reason)` - 清理所有连接，传递关闭原因

### RealtimeContext

React Context，用于在组件树中共享 Realtime 状态。

提供的值：
- `sessionGeneration` - 当前会话世代
- `connectionStatus` - 全局连接状态
- `authReady` - 认证是否就绪
- `authVersion` - 认证版本号
- `isExpectedClose` - 是否正在进行预期关闭
- `incrementGeneration()` - 递增会话世代
- `markExpectedClose()` - 标记开始预期关闭
- `clearExpectedClose()` - 清除预期关闭标记
- `isGenerationValid(gen)` - 检查 generation 是否有效
- `getCurrentGeneration()` - 获取当前 generation

### useRealtimeResource

通用 Hook，统一处理 "fetch snapshot first, then subscribe to increments" 模式。

配置选项：
```typescript
interface RealtimeResourceConfig<T> {
  resourceKey: string;           // 资源唯一标识
  projectId: string | undefined; // 项目 ID
  fetchSnapshot: () => Promise<T[]>;  // 获取初始快照
  subscribeIncrements: (handlers) => () => void;  // 建立增量订阅
  getItemId: (item: T) => string;  // 获取项目唯一标识
  enabled?: boolean;             // 是否启用
  refreshThrottleMs?: number;    // 刷新节流时间
  deps?: unknown[];              // 依赖项
}
```

返回值：
```typescript
interface RealtimeResourceReturn<T> {
  data: T[];           // 数据列表
  isLoading: boolean;  // 是否正在加载
  isConnected: boolean; // 是否已连接
  error: string | null; // 错误信息
  generation: number;   // 当前订阅的 generation
  refresh: (options?) => Promise<void>;  // 刷新数据
  appendItem: (item: T) => void;  // 追加单个项目
  updateItem: (item: T) => void;  // 更新单个项目
  removeItem: (id: string) => void;  // 删除单个项目
  setData: (data: T[]) => void;  // 设置完整数据
}
```

## 数据流

### 正常订阅流程

```
1. Hook 挂载
   ↓
2. 检查 authReady === true
   ↓
3. 记录当前 generation
   ↓
4. 获取初始快照 (fetchSnapshot)
   ↓
5. 建立增量订阅 (subscribeIncrements)
   ↓
6. 收到 SUBSCRIBED 状态
   ↓
7. 执行 catch-up 刷新
   ↓
8. 设置 isConnected = true
```

### 认证状态变化流程

```
1. onAuthStateChange 触发
   ↓
2. 递增 authVersion（让 Hook 知道即将重建）
   ↓
3. cleanupRealtime('AUTH_CHANGE')
   - 递增 generation
   - 标记 closeReason = 'AUTH_CHANGE'
   - 关闭所有频道
   ↓
4. 频道触发 CLOSED 回调
   - 携带 meta: { generation: old, closeReason: 'AUTH_CHANGE' }
   ↓
5. Hook 收到 CLOSED 回调
   - 检查 generation → 已过期，忽略
   - 或检查 closeReason → AUTH_CHANGE，不触发兜底刷新
   ↓
6. resetInstance()
   ↓
7. refreshRealtimeAuth()
   ↓
8. Hook 因 authVersion 变化重新订阅
   - 使用新的 generation
   - 正常建立订阅
```

### 异常关闭流程

```
1. 网络错误或 RLS 拒绝
   ↓
2. 频道触发 CLOSED/CHANNEL_ERROR 回调
   - 携带 meta: { generation: current, closeReason: 'ERROR' }
   ↓
3. Hook 收到错误回调
   - 检查 generation → 有效
   - 检查 closeReason → ERROR
   ↓
4. 触发兜底刷新
   ↓
5. 设置 isConnected = false
```

## 最佳实践

### 创建新的资源 Hook

推荐使用 `useRealtimeResource` 通用 Hook：

```typescript
function useMyResource(projectId: string | undefined) {
  return useRealtimeResource<MyItem>({
    resourceKey: 'my-resource',
    projectId,
    fetchSnapshot: async () => {
      const { data } = await myService.getItems(projectId!);
      return data || [];
    },
    subscribeIncrements: (handlers) => {
      return subscribeMyEvents({
        projectId: projectId!,
        onItemCreated: handlers.onInsert,
        onItemUpdated: handlers.onUpdate,
        onItemDeleted: handlers.onDelete,
        onStatusChange: handlers.onStatusChange,
      });
    },
    getItemId: (item) => item.id,
  });
}
```

### 处理状态变化

如果需要自定义状态处理，确保：

1. 检查组件是否仍然挂载
2. 检查 generation 是否仍然有效
3. 检查 closeReason 是否是预期关闭
4. 使用边缘检测避免重复处理

```typescript
const handleStatusChange = useCallback(
  (status, error, meta) => {
    // 1. 检查挂载状态
    if (!isMountedRef.current) return;
    
    // 2. 检查 generation
    if (meta?.generation !== undefined && !client.isGenerationValid(meta.generation)) {
      return;
    }
    
    // 3. 处理 SUBSCRIBED
    if (status === 'SUBSCRIBED') {
      setIsConnected(true);
      // catch-up 刷新...
      return;
    }
    
    // 4. 处理错误状态
    if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
      setIsConnected(false);
      
      // 检查是否是预期关闭
      if (meta?.isExpectedClose || meta?.closeReason === 'CLEANUP' || meta?.closeReason === 'AUTH_CHANGE') {
        return; // 不触发兜底刷新
      }
      
      // 边缘检测
      if (prevStatus !== 'CLOSED' && prevStatus !== 'CHANNEL_ERROR') {
        refresh(); // 触发兜底刷新
      }
    }
  },
  [client, refresh]
);
```

## 迁移指南

### 从 V1 迁移到 V2

1. 更新 `handleStatusChange` 签名，接受 `StatusChangeMeta` 参数
2. 添加 generation 检查逻辑
3. 添加 closeReason 检查逻辑
4. 确保 `onStatusChange` 回调被传递给订阅函数
5. 考虑使用 `useRealtimeResource` 简化代码
