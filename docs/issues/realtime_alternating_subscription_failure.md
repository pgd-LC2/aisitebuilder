# Realtime 订阅交替失败问题修复

## 问题描述

用户在切换浏览器标签页后返回时，订阅状态交替出现正常和异常：
- 首次打开项目：正常订阅（SUBSCRIBED）
- 切换标签页返回（第1次）：异常订阅（TIMED_OUT）
- 再次切换返回（第2次）：正常订阅
- 如此交替...

## 根本原因分析

### 1. 多处 disconnect 调用导致竞态条件

问题的核心在于 socket 的 disconnect/connect 操作分散在多处：

**位置1：realtimeClient.ts 的 cleanup 方法（第 544 行）**
```typescript
// 彻底断开 Realtime 连接，确保下次订阅使用全新 socket
void supabase.realtime.disconnect();  // 异步但没有 await
```

**位置2：supabase.ts 的 refreshRealtimeAuth 方法（第 48-54 行）**
```typescript
if (shouldReconnect) {
  await supabase.realtime.disconnect();
}
if (shouldReconnect || shouldEnsureConnect) {
  await supabase.realtime.connect();
}
```

当用户切换标签页返回时，触发链路如下：
1. Supabase SDK 触发 `SIGNED_IN` 事件（session 恢复/多标签页同步）
2. AuthContext 调用 `cleanupRealtime('AUTH_CHANGE')` → 内部调用 `void disconnect()`（不等待）
3. AuthContext 调用 `RealtimeClient.resetInstance()` → 再次调用 `cleanup()`
4. AuthContext 调用 `await refreshRealtimeAuth({ forceReconnect: true })` → 调用 `await disconnect()` 和 `await connect()`

这导致在短时间内可能有 **3 次 disconnect 调用**，其中只有 1 次被 await。

### 2. 对所有认证事件一律做彻底重置过于激进

当前 AuthContext 对 `SIGNED_IN`、`SIGNED_OUT`、`TOKEN_REFRESHED` 三种事件都执行相同的彻底重置逻辑：

```typescript
if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
  cleanupRealtime('AUTH_CHANGE');
  RealtimeClient.resetInstance();
  await refreshRealtimeAuth({ forceReconnect: true, ensureConnected: true });
}
```

但实际上：
- `TOKEN_REFRESHED`：只是 token 刷新，不需要重建连接
- `SIGNED_IN`（session 恢复）：用户 ID 没变，不需要重建连接
- `SIGNED_IN`（切换账号）：用户 ID 变化，需要重建连接
- `SIGNED_OUT`：需要彻底清理

### 3. 交替出现的原因

| 场景 | cleanup 前频道数 | 结果 |
|------|-----------------|------|
| 首次打开 | 0 | 正常（无残留，socket 状态干净） |
| 第1次切换返回 | 4 | 异常（多个 disconnect 并发，socket 状态混乱） |
| 第2次切换返回 | 0 或较少 | 正常（上次 TIMED_OUT 清理了频道，socket 已稳定） |

## 解决方案

### 核心思路

1. **Socket 管理集中化**：将所有 disconnect/connect 逻辑集中到 `refreshRealtimeAuth` 一处管理
2. **区分认证事件**：只在真正需要时（登出、切换账号）才做彻底重置
3. **职责分离**：`cleanup()` 只负责清理内部状态，不直接操作 socket

### 具体实现

#### 1. 修改 AuthContext.tsx

区分不同的认证事件，采用不同的处理策略：

```typescript
// 保存上一个用户 ID，用于检测账号切换
const prevUserIdRef = useRef<string | null>(null);

// 在 onAuthStateChange 中
if (event === 'SIGNED_OUT') {
  // 登出：需要彻底清理
  cleanupRealtime('AUTH_CHANGE');
  RealtimeClient.resetInstance();
  prevUserIdRef.current = null;
  setAuthVersion(v => v + 1);
} else if (event === 'SIGNED_IN') {
  const newUserId = session?.user?.id ?? null;
  const isUserSwitch = prevUserIdRef.current !== null && prevUserIdRef.current !== newUserId;
  
  if (isUserSwitch) {
    // 切换账号：需要彻底清理
    cleanupRealtime('AUTH_CHANGE');
    RealtimeClient.resetInstance();
    setAuthVersion(v => v + 1);
  }
  
  prevUserIdRef.current = newUserId;
  // 只在切换账号时 forceReconnect
  await refreshRealtimeAuth({ forceReconnect: isUserSwitch, ensureConnected: true });
} else if (event === 'TOKEN_REFRESHED') {
  // Token 刷新：只更新 token，不重建连接
  await refreshRealtimeAuth({ forceReconnect: false, ensureConnected: true });
}
```

#### 2. 修改 realtimeClient.ts 的 cleanup 方法

移除 cleanup 中的 disconnect 调用，socket 管理交给 refreshRealtimeAuth：

```typescript
cleanup(reason: CloseReason = 'CLEANUP'): void {
  // ... 清理 channels 和 subscriptions
  
  // 移除这行：
  // void supabase.realtime.disconnect();
  
  // cleanup 只负责清理内部状态，socket 的 disconnect 由 refreshRealtimeAuth 统一管理
}
```

#### 3. 修改 supabase.ts 的 refreshRealtimeAuth

增强 refreshRealtimeAuth，使其成为 socket 管理的唯一入口：

```typescript
export const refreshRealtimeAuth = async (options?: { 
  forceReconnect?: boolean; 
  ensureConnected?: boolean;
}): Promise<void> => {
  // ... 原有逻辑保持不变
  // 这里已经正确地 await disconnect 和 connect
};
```

## 修改的文件

- `src/contexts/AuthContext.tsx` - 区分认证事件，优化处理策略
- `src/realtime/realtimeClient.ts` - 移除 cleanup 中的 disconnect 调用
- `src/lib/supabase.ts` - 保持不变（已经是正确的实现）

## 设计原则

1. **单一职责**：
   - `cleanup()` 只负责清理内部状态（channels、subscriptions、retryInfo）
   - `refreshRealtimeAuth()` 负责所有 socket 级别的操作

2. **最小化重建**：
   - 只在真正需要时（登出、切换账号）才重建连接
   - Token 刷新和 session 恢复不触发重建

3. **避免竞态**：
   - 所有 disconnect/connect 都在 refreshRealtimeAuth 中 await
   - 不会出现多个并发的 disconnect 调用

## 测试验证

1. 打开项目页面，确认订阅正常建立（SUBSCRIBED）
2. 切换到其他标签页，等待几秒
3. 返回项目页面，确认订阅仍然正常（不再出现 TIMED_OUT）
4. 重复多次切换，确认每次都能正常恢复
5. 测试登出再登录，确认订阅能正确重建
6. 测试切换账号，确认订阅能正确重建

## 预期效果

1. **消除交替失败**：不再出现正常/异常交替的情况
2. **减少不必要的重连**：Token 刷新不再触发连接重建
3. **提高稳定性**：socket 状态管理更加可预测
4. **保持错误处理能力**：真正的网络错误仍然会被正确处理
