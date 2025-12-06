# Deploy Tools - 部署工具集

这个文件夹包含用于部署 Supabase Edge Function 的快捷命令工具。

## 工具列表

### 1. deploy-edge-function.cjs - 一键部署

一键部署 Edge Function 到 Supabase，自动生成 MCP JSON 并调用 mcp-cli 完成部署。

**使用方法：**

```bash
# 部署 process-ai-tasks（使用默认项目 ID）
node deploy-tools/deploy-edge-function.cjs process-ai-tasks

# 部署到指定项目
node deploy-tools/deploy-edge-function.cjs process-ai-tasks <project-id>

# 查看帮助
node deploy-tools/deploy-edge-function.cjs --help
```

**功能：**
- 自动收集边缘函数目录和 `_shared` 目录下的所有依赖文件
- 生成符合 Supabase MCP `deploy_edge_function` 格式的 JSON
- 调用 mcp-cli 执行部署
- 自动清理临时文件
- 显示部署结果（版本号、状态等）

### 2. generate-edge-function-mcp.cjs - 生成 MCP JSON

仅生成 MCP JSON 文件，不执行部署。适用于需要手动检查或修改 JSON 的场景。

**使用方法：**

```bash
# 生成 MCP JSON 文件
node deploy-tools/generate-edge-function-mcp.cjs process-ai-tasks

# 指定项目 ID
node deploy-tools/generate-edge-function-mcp.cjs process-ai-tasks <project-id>
```

**输出：**
- 在项目根目录生成 `mcp-deploy-<function-name>.json` 文件
- 控制台输出文件列表和大小统计

## 可用的边缘函数

运行以下命令查看所有可用的边缘函数：

```bash
node deploy-tools/deploy-edge-function.cjs --help
```

当前可用的边缘函数：
- `process-ai-tasks` - AI 任务处理主入口

## 默认配置

- **默认项目 ID**: `bsiukgyvrfkanuhjkxuh` (aisitebuilder)
- **函数目录**: `supabase/functions/`
- **共享模块目录**: `supabase/functions/_shared/`

## 前置要求

1. 已安装 Node.js
2. 已配置 mcp-cli 并连接到 Supabase MCP 服务器
3. 有权限访问目标 Supabase 项目

## 注意事项

- 部署会创建新版本，不会覆盖旧版本
- 部署前请确保代码已通过 lint 和 typecheck
- 生成的临时 JSON 文件会在部署完成后自动清理
