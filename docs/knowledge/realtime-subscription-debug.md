# 实时订阅问题排查指南

## 概述

本指南涵盖 aisitebuilder 项目中实时订阅相关的常见问题，包括订阅状态循环和认证竞态条件。

## 订阅状态循环问题

### 问题描述

在使用 Supabase Realtime 订阅时，可能出现状态更新导致的无限循环：
- 订阅回调更新状态
- 状态更新触发组件重渲染
- 重渲染导致订阅重建
- 新订阅再次触发回调

### 常见原因

#### 1. useEffect 依赖不当

```typescript
// 错误：每次 messages 变化都会重建订阅
useEffect(() => {
  const channel = supabase.channel('messages');
  channel.on('INSERT', (payload) => {
    setMessages([...messages, payload.new]); // messages 在依赖中
  });
  return () => channel.unsubscribe();
}, [messages]); // 问题：messages 在依赖数组中
```

#### 2. 回调函数引用变化

```typescript
// 错误：每次渲染都创建新的回调
const handleMessage = (payload) => {
  setMessages(prev => [...prev, payload.new]);
};

useEffect(() => {
  channel.on('INSERT', handleMessage);
}, [handleMessage]); // handleMessage 每次渲染都是新引用
```

### 解决方案

#### 1. 使用函数式更新

```typescript
useEffect(() => {
  const channel = supabase.channel('messages');
  channel.on('INSERT', (payload) => {
    // 使用函数式更新，不依赖外部 messages
    setMessages(prev => [...prev, payload.new]);
  });
  return () => channel.unsubscribe();
}, []); // 空依赖数组
```

#### 2. 使用 useRef 存储回调

```typescript
const handleMessageRef = useRef(handleMessage);
handleMessageRef.current = handleMessage;

useEffect(() => {
  const channel = supabase.channel('messages');
  channel.on('INSERT', (payload) => {
    handleMessageRef.current(payload);
  });
  return () => channel.unsubscribe();
}, []); // 空依赖数组
```

#### 3. 使用 useCallback 稳定回调

```typescript
const handleMessage = useCallback((payload) => {
  setMessages(prev => [...prev, payload.new]);
}, []); // 空依赖数组

useEffect(() => {
  channel.on('INSERT', handleMessage);
}, [handleMessage]); // handleMessage 是稳定的
```

## 认证与订阅竞态条件

### 问题描述

认证状态变化和实时订阅之间存在竞态条件，可能导致：
- 订阅在认证完成前建立，导致权限错误
- 认证变化后旧订阅未正确清理
- 多个订阅实例同时存在

### 根本原因

1. **异步时序问题**：Supabase 认证状态变化是异步的，订阅建立也是异步的
2. **组件生命周期**：React 组件可能在认证状态确定前就尝试建立订阅
3. **状态同步延迟**：Context 状态更新和订阅回调之间存在延迟

### 解决方案

#### 1. 使用 authReady 标志

```typescript
// AuthContext 中
const authReady = !loading && user !== null;

// 在需要订阅的组件中
useEffect(() => {
  if (!authReady) return;
  // 只有在认证就绪后才建立订阅
  setupSubscription();
}, [authReady]);
```

#### 2. Generation 机制

使用 generation 追踪订阅会话，防止旧回调影响新订阅：

```typescript
class RealtimeClient {
  private sessionGeneration = 0;
  
  cleanup(reason: CloseReason): void {
    this.sessionGeneration++;
    // 清理所有订阅
  }
  
  isGenerationValid(generation: number): boolean {
    return generation === this.sessionGeneration;
  }
}
```

#### 3. 订阅前清理

在建立新订阅前，确保清理旧订阅：

```typescript
const setupSubscription = async () => {
  // 先清理旧订阅
  await cleanupOldSubscription();
  
  // 再建立新订阅
  const channel = supabase.channel('my-channel');
  // ...
};
```

## 调试技巧

1. 在 useEffect 中添加日志，检查执行次数
2. 使用 React DevTools Profiler 检查重渲染
3. 检查依赖数组中的每个依赖是否必要
4. 添加详细日志，记录认证状态变化和订阅建立的时序
5. 检查 Supabase Realtime 连接状态
