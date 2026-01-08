# OpenRouter API 与 AI 模型配置规范

## API 配置

本项目使用 OpenRouter API（而非直接使用 OpenAI API）实现 AI 功能。

### 端点配置
- **正确端点**: `https://openrouter.ai/api/v1/chat/completions`
- **错误端点**: `/api/v1/responses`（请勿使用）
- **环境变量**: 使用 `OPENROUTER_KEY`（而非 `OPENAI_API_KEY`）

### API 格式
API 格式与 OpenAI 兼容，但必须使用 OpenRouter 端点和密钥。

## AI 模型选择

### 图片/视频 查看(万能)
- **模型**: `google/gemini-3-pro-preview`
- **用途**: 所有类 AI 操作

### 文本生成
- **模型**: `google/gemini-3-pro-preview`
- **用途**: 所有文本类 AI 操作

### 图像生成
- **模型**: `google/gemini-3-pro-image-preview`
- **用途**: 图像生成功能

## 参考文档

- 工具调用文档: https://openrouter.ai/docs/guides/features/tool-calling
- 本地测试时可使用 `OPENROUTER_KEY` 环境变量

## 注意事项

- 实现或修改 API 集成时，请参考 OpenRouter 官方文档
- 模型选择不应更改，除非有明确的技术需求
