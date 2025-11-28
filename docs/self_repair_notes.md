# 自我修复循环 (Self-Repair Auto Loop) - Step 4

## 概述

自我修复循环是 `process-ai-tasks` Edge Function 的一个增强功能，使系统能够在任务失败时自动检测错误、调用 Debugger 进行诊断、应用修复建议，并重新执行任务。

## 核心特性

### 1. 有界修复循环

- **最大尝试次数**: `SELF_REPAIR_MAX = 3`
- 循环包装现有的 `processTask` 函数
- 任务成功时立即退出循环
- 达到最大尝试次数后标记任务失败

### 2. 错误检测与分类

系统能够识别以下可修复的错误类型：

- 模块未找到 (`Module not found`, `Cannot find module`)
- 语法错误 (`SyntaxError`)
- 类型错误 (`TypeError`)
- 引用错误 (`ReferenceError`)
- 构建失败 (`Build failed`, `Compilation failed`)
- Lint 错误 (`lint.*error`)
- TypeScript 类型检查错误

### 3. Debugger 集成

当检测到可修复错误时，系统会：

1. 收集错误上下文（错误信息、堆栈、最近修改的文件、项目结构）
2. 通过 PromptRouter 调用 Debugger 层（`debug` 任务类型）
3. 解析 Debugger 输出获取修复建议
4. 应用文件修改
5. 记录验证命令（在下次执行时验证）

### 4. 结构化日志

所有自我修复操作都使用 `[SelfRepairLoop]` 前缀记录，包括：

- 任务 ID 和类型
- 当前尝试次数
- 错误类型和摘要
- Debugger 是否被调用
- 修复是否已应用
- 最终状态（`completed`, `recovered`, `failed_after_repair`, `failed`）

## 任务类型兼容性

| 任务类型 | 自我修复循环 | 说明 |
|---------|------------|------|
| `build_site` | 启用 | 完整的修复流程 |
| `refactor_code` | 启用 | 完整的修复流程 |
| `chat_reply` | 跳过 | 简单对话不需要修复 |
| `debug` | 启用 | 可用于调试任务本身 |

## API 响应格式

成功或修复后成功：
```json
{
  "success": true,
  "taskId": "task-uuid",
  "message": "任务处理完成" | "任务在 N 次尝试后成功完成（已自动修复）",
  "selfRepairResult": {
    "status": "completed" | "recovered",
    "totalAttempts": 1,
    "repairHistory": []
  }
}
```

修复失败：
```json
{
  "success": false,
  "taskId": "task-uuid",
  "message": "任务处理失败: 错误信息",
  "selfRepairResult": {
    "status": "failed_after_repair",
    "totalAttempts": 3,
    "repairHistory": [...],
    "finalError": "错误信息"
  }
}
```

## 测试场景

### 场景 1: 可修复的失败任务

**步骤**:
1. 创建一个 `build_site` 任务，要求生成包含故意错误的代码
2. 系统检测到构建/类型错误
3. 自动调用 Debugger 进行诊断
4. 应用 Debugger 建议的修复
5. 重新执行任务
6. 任务成功完成

**预期结果**:
- 状态: `recovered`
- 日志显示 `[SelfRepairLoop]` 前缀的修复过程
- `repairHistory` 包含修复尝试记录

### 场景 2: 不可修复的失败任务

**步骤**:
1. 创建一个会产生不可修复错误的任务（如网络错误、权限问题）
2. 系统检测到错误不可修复
3. 立即标记任务失败，不进入修复循环

**预期结果**:
- 状态: `failed`
- 日志显示错误不可修复
- `totalAttempts` 为 1

### 场景 3: 修复次数耗尽

**步骤**:
1. 创建一个会持续失败的任务
2. 系统尝试修复 3 次
3. 每次修复后仍然失败
4. 达到 `SELF_REPAIR_MAX` 后停止

**预期结果**:
- 状态: `failed_after_repair`
- `totalAttempts` 为 3
- `repairHistory` 包含 3 次修复尝试记录
- 日志显示每次修复尝试的详细信息

## 日志示例

```
[SelfRepairLoop] 启动自我修复循环 (最大 3 次尝试)
[SelfRepairLoop] 尝试 #1/3
[SelfRepairLoop] 任务执行失败 (尝试 #1): TypeError: Cannot read property 'x' of undefined
[SelfRepairLoop] 调用 Debugger 进行诊断...
[SelfRepairLoop] Debugger 诊断: 变量未初始化导致的类型错误
[SelfRepairLoop] 应用 1 个文件修改...
[SelfRepairLoop] 已修改文件: src/components/App.tsx
[SelfRepairLoop] 修复已应用，将在下次执行时验证: npm run typecheck
[SelfRepairLoop] 修复尝试 #1
- 任务ID: xxx
- 任务类型: build_site
- 错误类型: type_error
- 错误摘要: TypeError: Cannot read property 'x' of undefined
- Debugger 已调用: 是
- 修复已应用: true
- 验证结果: 成功
[SelfRepairLoop] 尝试 #2/3
[SelfRepairLoop] 最终状态: recovered
- 任务在修复后成功完成
- 总尝试次数: 2
```

## 类型定义

```typescript
interface ErrorContext {
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  failedCommand?: string;
  failedOutput?: string;
  recentFileChanges: string[];
  projectStructure?: string;
}

interface DebuggerSuggestion {
  rootCause: string;
  errorCategory: string;
  fileModifications: FileModification[];
  verificationCommands: string[];
}

interface FileModification {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
}

interface VerificationResult {
  command: string;
  success: boolean;
  output: string;
}

interface RepairAttempt {
  attemptNumber: number;
  errorContext: ErrorContext;
  debuggerResponse?: DebuggerSuggestion;
  repairApplied: boolean;
  verificationResult?: VerificationResult;
  timestamp: string;
}

interface SelfRepairLoopResult {
  status: 'completed' | 'recovered' | 'failed_after_repair' | 'failed';
  totalAttempts: number;
  repairHistory: RepairAttempt[];
  finalError?: string;
}
```

## 限制与注意事项

1. **Edge Function 环境限制**: 由于 Edge Function 无法直接执行 shell 命令，验证命令（如 `npm run lint`）会在下一次任务执行时通过实际构建结果体现。

2. **chat_reply 任务**: 简单对话任务不走自我修复循环，以保持响应速度。

3. **错误分类**: 只有被识别为"可修复"的错误才会触发修复流程，其他错误会直接标记失败。

4. **Debugger 输出格式**: Debugger 必须以指定的 JSON 格式输出修复建议，否则无法解析。

## 相关文件

- `supabase/functions/process-ai-tasks/index.ts` - 主要实现
- `prompts/debugger.error.diagnosis.v1.md` - Debugger 层提示词
- `docs/prompt_spec.md` - Prompt 架构规范
