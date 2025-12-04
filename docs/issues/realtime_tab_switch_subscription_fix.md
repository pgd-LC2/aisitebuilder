# Realtime 标签页切换订阅异常修复

## 问题描述

用户在切换浏览器标签页后返回时，订阅状态交替出现正常和异常：
- 第一次返回：正常订阅
- 第二次返回：显示"连接中，请稍候..."
- 第三次返回：又正常
- 如此交替...

## 根本原因

问题出在 **cleanup 时触发的 CLOSED 回调与新订阅流程之间的竞态条件**：

1. 用户切换标签页返回时，Supabase SDK 触发 `onAuthStateChange: SIGNED_IN`
2. AuthContext 调用 `cleanupRealtime()` 关闭所有频道
3. 关闭频道触发 CLOSED 回调，被 Hook 当作错误处理
4. Hook 触发「错误兜底刷新」，设置 `isRefreshingRef.current = true`
5. `setAuthVersion(v + 1)` 触发 Hook 重新订阅
6. 新订阅的 `refreshMessages()` 被跳过（因为 `isRefreshingRef.current` 仍为 true）
7. `isConnected` 保持 false，UI 显示「连接中，请稍候...」

交替出现的原因：取决于 cleanup 时 channels 是否为空。

## 解决方案

### 核心思路

引入「会话世代（Generation）」和「关闭原因（CloseReason）」两个维度，将物理连接生命周期与逻辑订阅生命周期彻底解耦。

### 具体实现

#### 1. 类型定义 (types.ts)

新增 `CloseReason` 类型和 `StatusChangeMeta` 接口：

```typescript
// 关闭原因枚举
export type CloseReason = 
  | 'CLEANUP'      // 由 cleanup() 主动触发
  | 'UNSUBSCRIBE'  // 由 unsubscribe() 主动触发
  | 'ERROR'        // 由网络错误、RLS 拒绝等异常触发
  | 'AUTH_CHANGE'  // 由认证状态变化触发
  | 'UNKNOWN';     // 未知原因

// 状态变化元数据
export interface StatusChangeMeta {
  generation: number;
  closeReason?: CloseReason;
  isExpectedClose?: boolean;
}
```

#### 2. RealtimeClient 层面

- 引入 `sessionGeneration` 计数器，每次 cleanup/reset 时递增
- 在 cleanup 时标记 `closeReason`
- 状态回调分发时携带 `StatusChangeMeta`
- 提供 `isGenerationValid()` 方法检查 generation 是否仍然有效

#### 3. Hook 层面

在 `handleStatusChange` 中：
- 检查 generation 是否仍然有效，忽略旧 generation 的回调
- 检查 `closeReason`，如果是预期关闭（CLEANUP、UNSUBSCRIBE、AUTH_CHANGE）则不触发兜底刷新
- 只有真正的异常关闭才触发兜底刷新

#### 4. AuthContext 层面

优化处理顺序：
1. 先递增 `authVersion`，让 Hook 知道即将重建订阅
2. 调用 `cleanupRealtime('AUTH_CHANGE')`，传递关闭原因
3. 最后刷新认证，建立新连接

## 修改的文件

- `src/realtime/types.ts` - 新增类型定义
- `src/realtime/realtimeClient.ts` - 引入 generation 和 closeReason 机制
- `src/realtime/hooks/useBuildLogs.ts` - 使用新的 generation 检查
- `src/realtime/hooks/useAgentEvents.ts` - 使用新的 generation 检查
- `src/realtime/hooks/useFileEvents.ts` - 使用新的 generation 检查
- `src/realtime/subscribeFileEvents.ts` - 支持 onStatusChange 回调
- `src/contexts/AuthContext.tsx` - 优化处理顺序，传递 AUTH_CHANGE 原因
- `src/contexts/RealtimeContext.tsx` - 新增，集中管理连接状态
- `src/realtime/hooks/useRealtimeResource.ts` - 新增，通用资源 Hook

## 预期效果

1. **消除竞态条件**：旧 generation 的回调被忽略，不会干扰新订阅流程
2. **区分关闭原因**：预期关闭不触发兜底刷新，只有真正的错误才触发
3. **保持错误处理能力**：网络错误、RLS 拒绝等仍然会被正确处理
4. **减少状态循环**：不再出现 SUBSCRIBED → CLOSED → SUBSCRIBED 的无意义循环

## 测试验证

1. 打开项目页面，确认订阅正常建立
2. 切换到其他标签页，等待几秒
3. 返回项目页面，确认不再显示"连接中，请稍候..."
4. 重复多次切换，确认每次都能正常恢复订阅
