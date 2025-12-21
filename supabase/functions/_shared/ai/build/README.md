# Build 模块

## 概述

Build 模块负责处理 `build` 模式的 AI 任务。该模块复用 TaskRunner，与 chat/plan 模式保持一致的执行流程。

## 设计原则

1. **单一职责**：只负责 build 模式的业务编排
2. **复用优先**：直接复用 TaskRunner，不重复实现通用能力
3. **简洁清晰**：不实现自我修复循环，失败直接返回错误

## 目录结构

```
build/
├── index.ts              # 统一导出入口
├── types.ts              # 类型定义
├── buildTaskHandler.ts   # 主处理逻辑
├── buildConfig.ts        # 配置
└── README.md             # 本文档
```

## API

### handleBuildTask

处理 build 模式任务的主函数。

```typescript
import { handleBuildTask } from './build/index.ts';

const result = await handleBuildTask({
  task: {
    id: 'task-id',
    type: 'build_site',
    project_id: 'project-id',
    payload: { ... },
    attempts: 1,
    max_attempts: 3
  },
  supabase: supabaseClient,
  apiKey: 'openrouter-api-key',
  projectFilesContext: {
    bucket: 'project-files',
    path: 'project-id/default',
    versionId: 'default'
  }
});

if (result.success) {
  console.log('任务完成:', result.finalResponse);
  console.log('修改的文件:', result.modifiedFiles);
} else {
  console.error('任务失败:', result.error);
}
```

### 类型定义

#### BuildTaskInput

```typescript
interface BuildTaskInput {
  task: {
    id: string;
    type: string;
    project_id: string;
    payload?: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  };
  supabase: SupabaseClient;
  apiKey: string;
  projectFilesContext?: {
    bucket: string;
    path: string;
    versionId?: string;
  };
}
```

#### BuildTaskResult

```typescript
interface BuildTaskResult {
  success: boolean;
  taskId: string;
  finalResponse?: string;
  modifiedFiles?: string[];
  generatedImages?: string[];
  error?: string;
}
```

## 配置

`BUILD_CONFIG` 包含以下配置项：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| maxIterations | 50 | Agent 循环最大迭代次数 |
| defaultBucket | 'project-files' | 默认存储桶 |
| defaultVersionId | 'default' | 默认版本 ID |

## 与其他模块的关系

- **TaskRunner**：Build 模块复用 TaskRunner 执行任务
- **AgentLoop**：TaskRunner 内部调用 AgentLoop 执行 Agent 循环
- **Tools**：通过 TaskRunner 使用完整工具集（build 模式）
