# Tools - 开发工具集

这个文件夹包含用于部署 Supabase Edge Function 的快捷命令工具，以及其他开发辅助工具（如 Perplexity 搜索）。

## 工具列表

### 1. deploy-edge-function.cjs - 一键部署

一键部署 Edge Function 到 Supabase，自动生成 MCP JSON 并调用 mcp-cli 完成部署。

**使用方法：**

```bash
# 部署 process-ai-tasks（使用默认项目 ID）
node tools/deploy-edge-function.cjs process-ai-tasks

# 部署到指定项目
node tools/deploy-edge-function.cjs process-ai-tasks <project-id>

# 查看帮助
node tools/deploy-edge-function.cjs --help
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
node tools/generate-edge-function-mcp.cjs process-ai-tasks

# 指定项目 ID
node tools/generate-edge-function-mcp.cjs process-ai-tasks <project-id>
```

**输出：**
- 在项目根目录生成 `mcp-deploy-<function-name>.json` 文件
- 控制台输出文件列表和大小统计

## 可用的边缘函数

运行以下命令查看所有可用的边缘函数：

```bash
node tools/deploy-edge-function.cjs --help
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

### 3. perplexity-search.py - Perplexity 搜索工具

使用 OpenRouter API 调用 Perplexity 模型进行 API/文档搜索和深度研究。当遇到不熟悉的 API 或技术问题时，使用此工具获取准确信息，而不是猜测。

**使用方法：**

```bash
# 快速搜索 (sonar-pro-search) - 用于 API/文档快速查询
python tools/perplexity-search.py search "OpenRouter API 如何调用 tool calling"

# 大上下文搜索 (sonar) - 用于需要更多上下文的复杂问题
python tools/perplexity-search.py context "Supabase Edge Functions 完整教程"

# 深度研究 (sonar-deep-research) - 生成全面的研究报告
python tools/perplexity-search.py research "WebContainer 技术原理和最佳实践"

# 将结果保存到文件
python tools/perplexity-search.py research "某个领域" -o report.md
```

**模型说明：**

| 模式 | 模型 | 用途 |
|------|------|------|
| `search` | perplexity/sonar-pro-search | 快速 API/文档搜索 |
| `context` | perplexity/sonar | 需要更大上下文的搜索 |
| `research` | perplexity/sonar-deep-research | 深度研究，生成全面报告 |

**环境变量：**

- `OPENROUTER_KEY` - OpenRouter API 密钥（必需）

## 注意事项

- 部署会创建新版本，不会覆盖旧版本
- 部署前请确保代码已通过 lint 和 typecheck
- 生成的临时 JSON 文件会在部署完成后自动清理
- 使用 perplexity-search.py 前需要设置 OPENROUTER_KEY 环境变量
