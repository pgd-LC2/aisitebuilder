# 工具能力矩阵与权限控制

## 概述

AI Agent 的工具调用权限通过工具能力矩阵（Tool Capability Matrix）进行控制。该矩阵根据交互模式（InteractionMode）动态决定 Agent 可以使用哪些工具。

## 工具分类

### 只读工具 (READ_ONLY_TOOLS)

用于分析和查看代码，不会修改任何文件：

```typescript
const READ_ONLY_TOOLS = ['list_files', 'read_file', 'search_files', 'get_project_structure'];
```

### 写入工具 (WRITE_TOOLS)

用于修改、创建、删除文件：

```typescript
const WRITE_TOOLS = ['write_file', 'delete_file', 'move_file'];
```

### 特殊工具 (SPECIAL_TOOLS)

需要特殊处理的工具：

```typescript
const SPECIAL_TOOLS = ['generate_image'];
```

### 完整工具集 (ALL_TOOLS)

所有可用工具的集合：

```typescript
const ALL_TOOLS = [...READ_ONLY_TOOLS, ...WRITE_TOOLS, ...SPECIAL_TOOLS];
```

## 基于 InteractionMode 的能力矩阵

```typescript
/**
 * InteractionMode 工具能力矩阵
 * 
 * | 模式   | 允许的工具                    |
 * |--------|------------------------------|
 * | chat   | 只读工具                      |
 * | plan   | 只读工具                      |
 * | build  | 完整工具集                    |
 */
const MODE_TOOL_MATRIX: Record<InteractionMode, string[]> = {
  'chat': READ_ONLY_TOOLS,
  'plan': READ_ONLY_TOOLS,
  'build': ALL_TOOLS
};
```

## 权限查询 API

### getAllowedToolNamesByMode

获取指定交互模式下允许使用的工具名称列表：

```typescript
export function getAllowedToolNamesByMode(mode: InteractionMode): string[] {
  const tools = MODE_TOOL_MATRIX[mode];
  if (tools) {
    console.log(`[ToolCapability] 模式: ${mode} -> ${tools.join(', ')}`);
    return tools;
  }
  
  // 默认回退到只读工具
  console.log(`[ToolCapability] 未知模式: ${mode}, 回退到只读工具`);
  return READ_ONLY_TOOLS;
}
```

### getFilteredToolsByMode

根据交互模式过滤工具定义列表：

```typescript
export function getFilteredToolsByMode(mode: InteractionMode): ToolDefinition[] {
  const allowedNames = getAllowedToolNamesByMode(mode);
  const filtered = TOOLS.filter(tool => allowedNames.includes(tool.function.name));
  console.log(`[ToolCapability] 模式: ${mode}, 过滤后工具数: ${filtered.length}/${TOOLS.length}`);
  return filtered;
}
```

## 使用示例

在 TaskRunner 中：

```typescript
// 根据交互模式过滤工具列表
const agentLoopConfig: AgentLoopConfig = {
  model,
  apiKey,
  tools: getFilteredToolsByMode(mode),
  toolChoice: mode === 'chat' || mode === 'plan' ? 'auto' : 'required',
  maxIterations
};
```

## 权限矩阵总结

| 交互模式 | 允许的工具 | 用途 |
|----------|------------|------|
| chat | 只读工具 | 对话、问答、代码分析 |
| plan | 只读工具 | 需求澄清、方案规划 |
| build | 完整工具集 | 代码生成、文件修改、构建 |

## 安全原则

1. **最小权限原则**：chat 和 plan 模式只有只读权限
2. **显式授权**：只有 build 模式才能获得写入权限
3. **安全回退**：未知的交互模式回退到只读工具
4. **日志记录**：所有权限查询都会记录日志，便于调试和审计
