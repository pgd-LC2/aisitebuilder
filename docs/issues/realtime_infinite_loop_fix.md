# Realtime 订阅死循环问题修复文档

## 问题描述

用户退出网页再打开后，控制台出现死循环日志，主要表现为两种模式：

### 模式1：agent-messages 频道的 CLOSED 状态无限循环

```
[RealtimeClient] 频道 agent-messages-xxx subscribe 原始回调: CLOSED
[RealtimeClient] 频道 xxx 状态: CLOSED
[RealtimeClient] 状态广播: baseChannelKey=xxx, status=CLOSED, subs=[sub_xxx]
[useAgentEvents] 已处于错误状态 (prev=CLOSED, curr=CLOSED)，跳过刷新
[RealtimeClient] 频道 xxx 进入 CLOSED 状态，从缓存中移除
```

这个模式不断重复，同一个 subscriptionId 反复收到 CLOSED 回调。

### 模式2：useBuildLogs 的重复加载

```
[useBuildLogs] 加载到 387 条日志
data: (387) [{…}, ...]
```

日志被反复加载，造成性能问题和资源浪费。

## 根本原因分析

### 1. AuthContext 的 TOKEN_REFRESHED 事件触发连锁反应

在 `src/contexts/AuthContext.tsx:39-46`：

```typescript
if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
  cleanupRealtime();
  RealtimeClient.resetInstance();
  await refreshRealtimeAuth({ forceReconnect: true, ensureConnected: true });
  setAuthVersion(v => v + 1);  // 递增 authVersion
}
```

当用户退出网页再打开时，Supabase 会触发 `TOKEN_REFRESHED` 事件，导致：
- 调用 `cleanupRealtime()` 清理所有频道
- 调用 `RealtimeClient.resetInstance()` 重置单例
- 递增 `authVersion`，触发订阅 hooks 重新创建订阅

### 2. authVersion 变化触发 useEffect 重跑

在 `useAgentEvents.ts` 和 `useBuildLogs.ts` 中，effect 的依赖包含 `authVersion`：

```typescript
useEffect(() => {
  // ... 订阅逻辑
}, [authReady, authVersion, handleStatusChange, projectId, refreshMessages, handleTaskUpdateInternal]);
```

每次 `authVersion` 变化，effect 会清理旧订阅并创建新订阅。

### 3. RealtimeClient 的 CLOSED 处理逻辑缺陷

在 `realtimeClient.ts:241-263`，当频道进入 CLOSED 状态时：

```typescript
if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
  // 广播给所有订阅者
  subs.forEach(subId => {
    subInfo?.onStatusChange?.(status, errorObj);
  });
  
  // 从缓存中移除频道
  if (currentChannelInfo) {
    supabase.removeChannel(currentChannelInfo.channel);
    this.channels.delete(baseChannelKey);
  }
}
```

问题：
- 频道被移除后，订阅信息（subscriptions Map）仍然存在
- Supabase 的 `channel.subscribe()` 回调可能被多次调用
- 没有防抖机制，导致重复处理

### 4. useBuildLogs 缺少边缘检测（关键差异）

`useAgentEvents.ts` 有边缘检测：

```typescript
const wasErrorBefore = prevStatus === 'CLOSED' || prevStatus === 'CHANNEL_ERROR' || prevStatus === 'TIMED_OUT';
if (!wasErrorBefore && isMountedRef.current) {
  refreshMessages();
} else {
  console.log(`[useAgentEvents] 已处于错误状态，跳过刷新`);
}
```

但 `useBuildLogs.ts` 没有：

```typescript
if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || error) {
  setIsConnected(false);
  if (isMountedRef.current) {
    refreshLogs();  // 每次 CLOSED 都刷新！
  }
}
```

## 死循环的完整链条

```
用户退出网页再打开
    ↓
Supabase 触发 TOKEN_REFRESHED
    ↓
AuthContext 调用 cleanupRealtime() + resetInstance()
    ↓
authVersion 递增
    ↓
useAgentEvents/useBuildLogs 的 useEffect 重跑
    ↓
创建新订阅 → setupSubscription() 被调用
    ↓
refreshRealtimeAuth() 尝试连接
    ↓
Supabase 返回 CLOSED（可能因为旧连接状态残留）
    ↓
RealtimeClient 广播 CLOSED 给订阅者
    ↓
useBuildLogs 调用 refreshLogs()（没有边缘检测）
    ↓
同时，RealtimeClient 从缓存中移除频道
    ↓
但 Supabase SDK 内部可能再次触发 CLOSED 回调
    ↓
循环继续...
```

## 重构方案

### 修复1：在 useBuildLogs 中添加边缘检测

与 `useAgentEvents` 保持一致，只在首次进入错误状态时触发刷新。

**修改文件**: `src/realtime/hooks/useBuildLogs.ts`

```typescript
// 添加 lastStatusRef
const lastStatusRef = useRef<RealtimeSubscribeStatus | undefined>(undefined);

const handleStatusChange = useCallback(
  (status?: RealtimeSubscribeStatus, error?: Error | null) => {
    if (!isMountedRef.current) {
      return;
    }
    
    // 记录上一次状态，用于边缘检测
    const prevStatus = lastStatusRef.current;
    lastStatusRef.current = status;

    if (status === 'SUBSCRIBED') {
      setIsConnected(true);
      setTimeout(() => {
        if (isMountedRef.current && projectId === currentProjectIdRef.current) {
          refreshLogs();
        }
      }, 250);
      return;
    }

    if (status === 'RETRYING') {
      setIsConnected(false);
      return;
    }

    const isErrorStatus = status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';
    if (isErrorStatus || error) {
      setIsConnected(false);
      
      // 边缘检测：只在从非错误状态变为错误状态时触发一次刷新
      const wasErrorBefore = prevStatus === 'CLOSED' || prevStatus === 'CHANNEL_ERROR' || prevStatus === 'TIMED_OUT';
      if (!wasErrorBefore && isMountedRef.current) {
        console.log('[useBuildLogs] 首次进入错误状态，做一次兜底刷新');
        refreshLogs();
      } else {
        console.log(`[useBuildLogs] 已处于错误状态 (prev=${prevStatus}, curr=${status})，跳过刷新`);
      }
    }
  },
  [projectId, refreshLogs]
);
```

### 修复2：在 RealtimeClient 的 CLOSED 分支添加防抖

给 channelInfo 添加 `closed` 标记，避免重复处理。

**修改文件**: `src/realtime/realtimeClient.ts`

```typescript
interface ChannelInfo {
  channel: RealtimeChannel;
  refCount: number;
  subscriptions: Set<string>;
  lastStatus?: string;
  lastError?: Error | null;
  closed?: boolean;  // 新增：标记频道是否已处理 CLOSED
}

// 在 CLOSED 处理分支中：
if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
  // 防抖：如果已经处理过 CLOSED，跳过
  if (currentChannelInfo?.closed) {
    console.log(`[RealtimeClient] 频道 ${baseChannelKey} 已处理过 ${status}，跳过重复处理`);
    return;
  }
  
  // 标记为已处理
  if (currentChannelInfo) {
    currentChannelInfo.closed = true;
  }
  
  // ... 后续处理逻辑
}
```

### 修复3：统一订阅清理机制

当频道进入 CLOSED 状态时，同时清理相关的订阅信息。

**修改文件**: `src/realtime/realtimeClient.ts`

```typescript
// 在 CLOSED 处理分支中，清理订阅信息
if (currentChannelInfo) {
  // 清理所有相关订阅
  currentChannelInfo.subscriptions.forEach(subId => {
    this.subscriptions.delete(subId);
    this.retryInfoMap.delete(subId);
  });
  
  supabase.removeChannel(currentChannelInfo.channel);
  this.channels.delete(baseChannelKey);
}
```

## 测试验证

修复完成后，需要验证以下场景：

1. 正常进入项目页面，订阅应该正常建立
2. 退出网页再打开，不应该出现死循环日志
3. 网络断开重连后，订阅应该能够恢复
4. 切换项目时，旧订阅应该被正确清理

## 总结

这个死循环问题的根源是代码对 CLOSED 状态的处理不够"终局化"，再叠加上 React 的 effect 重跑机制，放大成了用户感知上的"死循环"。

核心问题：
- useBuildLogs 缺少边缘检测
- RealtimeClient 的 CLOSED 处理没有防抖
- 订阅清理不彻底

通过以上三个修复，可以从根本上解决死循环问题，而不是简单地打补丁。
