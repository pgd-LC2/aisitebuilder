# 实时功能架构约束

aisitebuilder 项目遵循 "Step1 Realtime" 架构，有严格的约束。

## 禁止事项

1. **禁止轮询**: 不允许使用 polling 或 setInterval
2. **禁止看门狗模式**: 不允许使用 watchdog 模式

## 必须遵循

1. **统一入口**: 所有实时功能必须通过 `src/realtime/` 目录
2. **数据加载模式**: 必须使用"先获取快照，再订阅增量"模式

## 调试数据显示问题

调试显示问题时，始终验证以下两点是否正常工作：
1. 初始数据获取（fetch）
2. 实时订阅（subscription）

## 关键文件

- 构建日志订阅: `subscribeBuildLogs.ts`
- Agent 事件订阅: `subscribeAgentEvents.ts`

## WebContainer 单例约束

### 关键约束

WebContainer 有一个关键的单例约束：**同一时间只能启动一个 WebContainer 实例**。

### 项目切换处理

切换项目或退出项目时，必须完全销毁旧的 WebContainer：
- 使用 teardown/dispose/kill API 进行销毁
- 在启动新实例前确保旧实例已完全清理

### 未正确清理的后果

未正确清理会导致以下错误：
- "Only a single WebContainer instance can be booted"
- 渲染失败

### 项目退出逻辑要求

项目退出逻辑必须：
1. 取消所有与实例绑定的异步任务/订阅
2. 清除 state/context/singletons 中的所有实例引用

详细参考：[singleton-statemachine-patterns.md](./singleton-statemachine-patterns.md)
