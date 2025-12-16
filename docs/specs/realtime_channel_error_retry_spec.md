# Realtime CHANNEL_ERROR 自动重试与 Token 刷新协调机制

## 概述

本文档描述了解决 Realtime 订阅在退出重进项目时出现 CHANNEL_ERROR 的修复方案。问题的根本原因是 Token 刷新事件触发 socket 重连，导致刚建立的 channels 同时进入 CHANNEL_ERROR 状态，且缺乏自动重试机制。

## 问题分析

### 问题现象

用户退出项目再重新进入时，所有 Realtime 频道（agent-events, build-logs, agent-tasks, agent-messages）几乎同时进入 CHANNEL_ERROR 状态，导致实时订阅永久失效。

### 根本原因

1. **Token 刷新触发重连**：当 `TOKEN_REFRESHED` 事件发生时，`refreshRealtimeAuth()` 检测到 token 变化后执行 `disconnect()` 然后 `connect()`
2. **时序冲突**：这个重连过程与订阅建立过程发生冲突，导致刚建立的 channels 收到 CHANNEL_ERROR
3. **缺乏重试机制**：RealtimeClient 在收到 CHANNEL_ERROR 时会 `removeChannel()` 并从缓存删除，但没有自动重试逻辑
4. **永久失效**：订阅失效后只能靠用户再次退出重进才能恢复

### 为什么"有时候"出现

只有在特定时刻会发生 TOKEN_REFRESHED（如 token 快过期、离开一段时间再回来、浏览器后台恢复），当这个事件恰好撞上"正在建立订阅/刚建立成功"的窗口时，才会出现问题。

## 修复方案

### 方案 1：CHANNEL_ERROR 自动重试机制

在 `RealtimeClient.subscribe()` 内部添加自动重试逻辑。

#### 设计原则

1. **只在非预期关闭时重试**：`isExpectedClose=false` 且 `closeReason='ERROR'` 时才重试
2. **指数退避 + 抖动**：避免重试风暴，使用 `delay = baseDelay * 2^(attempt-1) * jitter`
3. **最大重试次数**：默认 3 次，避免无限重试
4. **不可重试错误分流**：权限/RLS 错误不重试
5. **统一管理**：重试状态放在 `retryInfoMap` 中，便于取消和追踪

#### 代码修改

**文件**: `src/realtime/realtimeClient.ts`

```typescript
// 1. 扩展 RetryInfo 接口（第34-37行）
interface RetryInfo {
  timeoutId: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
  attempt: number;        // 新增：当前重试次数
  inFlight: boolean;      // 新增：是否正在重试中
  handledTerminal: boolean; // 新增：是否已处理过终态
}

// 2. 在 subscribe 函数中初始化 retryInfo（第217-219行附近）
const retryInfo: RetryInfo = { 
  timeoutId: null, 
  cancelled: false, 
  attempt: 0,
  inFlight: false,
  handledTerminal: false
};
this.retryInfoMap.set(subscriptionId, retryInfo);

// 3. 在 CHANNEL_ERROR 处理中添加重试逻辑（第324-380行之后）
// 在现有的 CHANNEL_ERROR 处理逻辑末尾，removeChannel 之前添加：

// 检查是否应该重试
const shouldRetry = !this.isExpectedClose && 
                    closeReason === 'ERROR' && 
                    !this.isNonRetryableError(errorObj);

if (shouldRetry) {
  const retryInfo = this.retryInfoMap.get(subscriptionId);
  if (retryInfo && !retryInfo.cancelled && retryInfo.attempt < 3 && !retryInfo.handledTerminal) {
    retryInfo.handledTerminal = true; // 标记已处理，防止重复触发
    retryInfo.attempt += 1;
    
    // 指数退避 + 抖动
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, retryInfo.attempt - 1);
    const jitter = 0.8 + Math.random() * 0.4; // 0.8 ~ 1.2
    const delay = Math.floor(exponentialDelay * jitter);
    
    console.log(`[RealtimeClient] 频道 ${baseChannelKey} 将在 ${delay}ms 后重试 (第 ${retryInfo.attempt} 次)`);
    
    // 广播 RETRYING 状态给所有订阅者
    subs?.forEach(subId => {
      const info = this.subscriptions.get(subId);
      if (info?.onStatusChange) {
        const meta: StatusChangeMeta = {
          generation: info.generation,
          channelName: baseChannelKey,
          isExpectedClose: false
        };
        try {
          info.onStatusChange('RETRYING', null, meta);
        } catch (e) {
          console.error(`[RealtimeClient] 广播 RETRYING 到订阅 ${subId} 时出错:`, e);
        }
      }
    });
    
    // 设置重试定时器
    retryInfo.timeoutId = setTimeout(() => {
      if (retryInfo.cancelled) {
        console.log(`[RealtimeClient] 订阅 ${subscriptionId} 重试已取消`);
        return;
      }
      if (!this.isGenerationValid(subscriptionGeneration)) {
        console.log(`[RealtimeClient] 订阅 ${subscriptionId} generation 已过期，跳过重试`);
        return;
      }
      if (retryInfo.inFlight) {
        console.log(`[RealtimeClient] 订阅 ${subscriptionId} 已有重试在进行中，跳过`);
        return;
      }
      
      retryInfo.inFlight = true;
      retryInfo.handledTerminal = false; // 重置，允许下次错误触发重试
      console.log(`[RealtimeClient] 开始重试订阅 ${subscriptionId}`);
      
      // 重新执行 setupSubscription
      setupSubscription().finally(() => {
        retryInfo.inFlight = false;
      });
    }, delay);
  }
}

// 继续执行现有的 removeChannel 逻辑...

// 4. 添加不可重试错误判断方法（在 class 中添加新方法）
/**
 * 判断错误是否不可重试（权限/RLS 错误）
 */
private isNonRetryableError(error: Error | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  const nonRetryablePatterns = [
    'permission denied',
    'forbidden',
    'unauthorized',
    '401',
    '403',
    'rls',
    'policy',
    'not allowed'
  ];
  return nonRetryablePatterns.some(pattern => message.includes(pattern));
}
```

### 方案 2：Token 刷新协调机制

根据 Supabase realtime-js 源码分析，`setAuth()` 方法会通过 `channel._push(CHANNEL_EVENTS.access_token, ...)` 向已连接的 channels 推送新 token，**不需要 disconnect/connect**。

因此，在 `TOKEN_REFRESHED` 场景下，可以跳过重连。

#### 代码修改

**文件**: `src/lib/supabase.ts`

```typescript
// 修改 refreshRealtimeAuth 函数签名和实现（第26-62行）
export const refreshRealtimeAuth = async (options?: { 
  forceReconnect?: boolean; 
  ensureConnected?: boolean;
  skipReconnectOnTokenChange?: boolean; // 新增：TOKEN_REFRESHED 时使用
}): Promise<void> => {
  const forceReconnect = options?.forceReconnect ?? false;
  const ensureConnected = options?.ensureConnected ?? false;
  const skipReconnectOnTokenChange = options?.skipReconnectOnTokenChange ?? false;

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? supabaseAnonKey;
    const tokenChanged = currentRealtimeToken !== token;

    if (tokenChanged) {
      currentRealtimeToken = token;
      supabase.realtime.setAuth(token);
      console.log('[supabase] Token 已更新，通过 setAuth 推送到现有连接');
    }

    const connected = isRealtimeSocketConnected();
    
    // 关键修改：TOKEN_REFRESHED 时跳过重连
    // setAuth 会自动将新 token 推送到已连接的 channels
    const shouldReconnect = forceReconnect || (tokenChanged && !skipReconnectOnTokenChange);
    const shouldEnsureConnect = ensureConnected && !connected;

    if (shouldReconnect) {
      console.log('[supabase] 执行 disconnect/connect');
      await supabase.realtime.disconnect();
    }

    if (shouldReconnect || shouldEnsureConnect) {
      await supabase.realtime.connect();
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};
```

**文件**: `src/contexts/AuthContext.tsx`

```typescript
// 修改 TOKEN_REFRESHED 处理（第105-109行）
} else if (event === 'TOKEN_REFRESHED') {
  // Token 刷新：这是正常的后台行为，只需要更新 token，不需要重建连接
  // setAuth 会自动将新 token 推送到已连接的 channels，无需 disconnect/connect
  console.log('[AuthContext] Token 刷新，仅更新认证信息（不重连）');
  await refreshRealtimeAuth({ 
    forceReconnect: false, 
    ensureConnected: true, 
    skipReconnectOnTokenChange: true  // 关键：跳过因 token 变化导致的重连
  });
}
```

### 方案 3：增强错误日志

在 CHANNEL_ERROR 回调中打印更详细的错误信息，便于区分错误类型。

#### 代码修改

**文件**: `src/realtime/realtimeClient.ts`

```typescript
// 在 CHANNEL_ERROR 处理中（第324行附近），增强日志输出
} else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
  // 增强错误日志
  const errorDetails = {
    status,
    errorType: err?.constructor?.name ?? 'unknown',
    errorMessage: err instanceof Error ? err.message : String(err ?? 'no error'),
    errorCode: (err as { code?: string | number })?.code,
    errorStatus: (err as { status?: number })?.status,
    channelKey: baseChannelKey,
    generation: subscriptionGeneration,
    currentGeneration: this.sessionGeneration,
    isExpectedClose: this.isExpectedClose,
    closeReason: this.isExpectedClose ? this.currentCloseReason : 'ERROR'
  };
  
  console.error(`[RealtimeClient] 频道错误详情:`, errorDetails);
  
  // 继续现有逻辑...
```

## 实现顺序

建议按以下顺序实现：

1. **方案 3（增强日志）**：先实现，便于后续调试
2. **方案 2（Token 刷新协调）**：这是根因修复，优先级最高
3. **方案 1（自动重试）**：作为兜底机制，确保即使有其他原因导致 CHANNEL_ERROR 也能恢复

## 测试验证

### 测试场景

1. **Token 刷新场景**：
   - 进入项目，等待 token 快过期
   - 观察是否触发 disconnect/connect
   - 验证订阅是否保持正常

2. **网络抖动场景**：
   - 进入项目，模拟网络断开
   - 观察是否触发自动重试
   - 验证重试后订阅是否恢复

3. **权限错误场景**：
   - 模拟 RLS 拒绝
   - 验证不会无限重试
   - 验证错误日志包含足够信息

### 验证指标

- CHANNEL_ERROR 后能自动恢复（非权限错误）
- Token 刷新不再触发 disconnect/connect
- 错误日志包含 errorType、errorCode、errorMessage 等详细信息
- 重试次数不超过 3 次
- 重试间隔符合指数退避（约 1s, 2s, 4s）

## 文档更新

实现后需要更新以下文档：

1. `docs/specs/realtime_architecture_v2.md`：
   - 添加"自动重试机制"章节
   - 更新"TOKEN_REFRESHED 处理"说明（当前文档与代码不一致）

2. `AGENTS.md`：
   - 如有必要，添加 Realtime 重试机制的说明

## 注意事项

1. **竞态条件**：确保 `setupSubscription` 在 `channels.set` 之前不会触发回调。当前实现中 Supabase SDK 的 subscribe callback 是异步的，风险较低，但建议在 subscribe 回调中使用 closure 变量而非依赖 `this.channels.get()`。

2. **重试风暴控制**：同一页面多个订阅可能同时失败，指数退避 + jitter 可以分散重试时间。

3. **Generation 验证**：重试时必须检查 generation 是否仍然有效，避免旧订阅影响新会话。

4. **取消机制**：`unsubscribe()` 和 `cleanup()` 必须正确取消所有 pending retry timeout。

## 参考资料

- Supabase realtime-js 源码：`node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js`
- `setAuth()` 实现（第339-346行）：通过 `_performAuth` 向已连接 channels 推送新 token
- `_performAuth()` 实现（第636-662行）：使用 `channel._push(CHANNEL_EVENTS.access_token, ...)` 更新 token
