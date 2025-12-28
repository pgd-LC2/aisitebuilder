# 样式统一实施方案

## 概述

本文档描述了将项目中的非语义颜色类和硬编码颜色值统一到 CSS 变量系统的实施方案。

## 一、新增 CSS 变量

在 `src/index.css` 的 `:root` 和 `.dark` 中添加以下语义颜色变量：

### 亮色模式 (:root)

```css
/* 成功状态 - 绿色 */
--success: 142.1 76.2% 36.3%;           /* green-600 */
--success-foreground: 0 0% 100%;         /* white */
--success-muted: 142.1 76.2% 36.3%;      /* green-600 用于背景 */

/* 警告状态 - 琥珀色 */
--warning: 45.4 93.4% 47.5%;             /* amber-500 */
--warning-foreground: 0 0% 100%;          /* white */
--warning-muted: 48 96.5% 88.8%;          /* amber-100 */

/* 信息状态 - 使用 primary */
/* 已有 --primary */

/* 代码编辑器背景 */
--code-background: 0 0% 17.6%;           /* #2d2d2d */
```

### 暗色模式 (.dark)

```css
/* 成功状态 - 绿色 */
--success: 142.1 70.6% 45.3%;            /* green-500 */
--success-foreground: 0 0% 100%;
--success-muted: 142.1 76.2% 36.3%;

/* 警告状态 - 琥珀色 */
--warning: 45.4 93.4% 47.5%;
--warning-foreground: 0 0% 0%;
--warning-muted: 43.3 96.4% 56.3%;

/* 代码编辑器背景 */
--code-background: 0 0% 12%;
```

## 二、Tailwind 配置更新

在 `tailwind.config.js` 的 `theme.extend.colors` 中添加：

```javascript
success: {
  DEFAULT: 'hsl(var(--success))',
  foreground: 'hsl(var(--success-foreground))',
  muted: 'hsl(var(--success-muted) / 0.1)',
},
warning: {
  DEFAULT: 'hsl(var(--warning))',
  foreground: 'hsl(var(--warning-foreground))',
  muted: 'hsl(var(--warning-muted))',
},
code: {
  background: 'hsl(var(--code-background))',
},
```

## 三、需要统一的文件和样式

### 3.1 成功状态 (green-* → success)

| 文件 | 行号 | 原样式 | 新样式 |
|------|------|--------|--------|
| `App.tsx` | 374 | `bg-green-500` | `bg-success` |
| `StatusIndicator.tsx` | 14 | `bg-green-500` | `bg-success` |
| `FileUploader.tsx` | 164 | `text-green-500` | `text-success` |
| `ActivityTimeline.tsx` | 149 | `text-green-500` | `text-success` |
| `CodeViewer.tsx` | 111-112 | `text-green-600` | `text-success` |
| `BuildLogPanel.tsx` | 24 | `text-green-500 bg-green-50` | `text-success bg-success-muted` |
| `VersionManager.tsx` | 404 | `bg-green-100 text-green-700` | `bg-success/10 text-success` |
| `VersionManager.tsx` | 430 | `bg-green-100 text-green-700` | `bg-success/10 text-success` |
| `InitializingPage.tsx` | 132 | `bg-green-50 border-green-200` | `bg-success/10 border-success/30` |
| `InitializingPage.tsx` | 133 | `text-green-800` | `text-success` |
| `InitializingPage.tsx` | 139 | `bg-green-600 hover:bg-green-700` | `bg-success hover:bg-success/90` |
| `PreviewPanel.tsx` | 925 | `bg-green-100 text-green-700` | `bg-success/10 text-success` |
| `PreviewPanel.tsx` | 942 | `bg-green-300` | `bg-success/50` |
| `PreviewPanel.tsx` | 1122 | `bg-green-50 border-green-200 text-green-800` | `bg-success/10 border-success/30 text-success` |
| `PreviewPanel.tsx` | 1127 | `bg-green-600 hover:bg-green-700` | `bg-success hover:bg-success/90` |
| `SignUpPage.tsx` | 163 | `bg-green-500` | `bg-success` |
| `ChatInput.tsx` | 224 | `bg-green-500/20 text-green-700` | `bg-success/20 text-success` |
| `QuickCommands.tsx` | 40 | `text-green-500` | `text-success` |

### 3.2 错误状态 (red-* → destructive)

| 文件 | 行号 | 原样式 | 新样式 |
|------|------|--------|--------|
| `StatusIndicator.tsx` | 29 | `bg-red-500` | `bg-destructive` |
| `FileUploader.tsx` | 157 | `text-red-600` | `text-destructive` |
| `FileUploader.tsx` | 168 | `text-red-500` | `text-destructive` |
| `FileManagerPanel.tsx` | 641 | `hover:bg-red-50` | `hover:bg-destructive/10` |
| `FileManagerPanel.tsx` | 644 | `text-red-600` | `text-destructive` |
| `PreviewPanel.tsx` | 951 | `text-red-500` | `text-destructive` |

### 3.3 警告状态 (yellow-*/amber-* → warning)

| 文件 | 行号 | 原样式 | 新样式 |
|------|------|--------|--------|
| `StatusIndicator.tsx` | 24 | `bg-yellow-500` | `bg-warning` |
| `ActivityTimeline.tsx` | 273 | `text-yellow-600 border-yellow-600` | `text-warning border-warning` |
| `ChatPanel.tsx` | 492 | `bg-yellow-50 border-yellow-200` | `bg-warning-muted border-warning/30` |
| `ChatPanel.tsx` | 493 | `text-yellow-700` | `text-warning` |
| `PreviewPanel.tsx` | 899 | `bg-amber-50 border-amber-200` | `bg-warning-muted border-warning/30` |
| `PreviewPanel.tsx` | 900 | `text-amber-800` | `text-warning` |
| `ChatInput.tsx` | 213 | `bg-amber-500/20 text-amber-700` | `bg-warning/20 text-warning` |

### 3.4 代码编辑器背景

| 文件 | 行号 | 原样式 | 新样式 |
|------|------|--------|--------|
| `CodeViewer.tsx` | 125 | `bg-[#2d2d2d]` | `bg-code-background` |

### 3.5 行号颜色

| 文件 | 行号 | 原样式 | 新样式 |
|------|------|--------|--------|
| `FileManagerPanel.tsx` | 690 | `color: '#9ca3af'` | `color: 'hsl(var(--muted-foreground))'` |

## 四、排除项（不修改）

以下样式因特殊用途而保留原样：

### 4.1 品牌图标颜色

| 文件 | 行号 | 颜色 | 用途 |
|------|------|------|------|
| `HomePage.tsx` | 78 | `#F24E1E` | Figma 品牌色 |
| `HomePage.tsx` | 84 | `#24292f` | GitHub 品牌色 |
| `QuickCommands.tsx` | 27-28 | `#3ECF8E` | Supabase 品牌色 |
| `ChatInput.tsx` | 186-187 | `#4285F4` | Google/Gemini 品牌色 |

### 4.2 视觉效果颜色

| 文件 | 行号 | 颜色 | 用途 |
|------|------|------|------|
| `ParticleField.tsx` | 18-23 | BLUE_PALETTE rgba 值 | 粒子效果专用颜色 |

### 4.3 Agent 角色颜色（语义化区分）

| 文件 | 行号 | 颜色 | 用途 |
|------|------|------|------|
| `ActivityTimeline.tsx` | 75 | `text-purple-600` | 规划者角色 |
| `ActivityTimeline.tsx` | 77 | `text-green-600` | 审查者角色（保留，因为是角色区分） |
| `ActivityTimeline.tsx` | 78 | `text-orange-600` | 调试者角色 |
| `QuickCommands.tsx` | 34 | `text-orange-500` | 搜索图标 |
| `QuickCommands.tsx` | 36 | `text-purple-500` | 手动图标 |
| `QuickCommands.tsx` | 38 | `text-yellow-500` | 星星图标（保留，因为是图标装饰） |
| `QuickCommands.tsx` | 145 | `hover:text-yellow-400` | 收藏星星 |
| `InitializingPage.tsx` | 117 | `text-purple-600` | 魔法图标 |
| `UserProfilePanel.tsx` | 331, 333 | `border-purple-200 bg-purple-50/60 text-purple-500` | 实验性功能区域 |

### 4.4 动态计算的内联样式

这些样式需要 JavaScript 动态计算，无法使用 Tailwind 类：

- `FloatingBackground.tsx`: 动画参数
- `ParticleField.tsx`: 粒子位置和大小
- `FileManagerPanel.tsx`: 树形缩进
- `FileUploader.tsx`: 进度条宽度
- `ChatPanel.tsx`: 滚动空间高度
- `FireBurnOverlay.tsx`: mixBlendMode（可选：改为 `mix-blend-screen` 类）

## 五、实施步骤

1. **更新 CSS 变量**: 在 `src/index.css` 中添加新的语义颜色变量
2. **更新 Tailwind 配置**: 在 `tailwind.config.js` 中添加新的颜色映射
3. **批量替换组件样式**: 按照第三节的映射表更新各组件
4. **运行检查**: 执行 `npm run lint` 和 `npm run typecheck`
5. **创建 PR**: 提交更改并创建 Pull Request

## 六、预期效果

- 所有状态颜色（成功、警告、错误）使用统一的语义变量
- 支持暗色模式自动切换
- 代码更易维护，颜色修改只需更新 CSS 变量
- 保留品牌颜色和特殊视觉效果的独立性
