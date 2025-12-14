# 组件目录重构规划文档

## 1. 背景与目标

### 1.1 当前问题

目前 `src/components` 目录下有 25 个文件（24 个 `.tsx` 组件 + 1 个 `.ts` 工具文件），全部平铺在同一层级，缺乏合理的分类组织：

```
src/components/
├── ActivityTimeline.tsx
├── BuildLogPanel.tsx
├── ChatInput.tsx
├── ChatPanel.tsx
├── CodeViewer.tsx
├── FileManagerPanel.tsx
├── FilePreview.tsx
├── FileUploader.tsx
├── FireBurnOverlay.tsx
├── FloatingBackground.tsx
├── HomePage.tsx
├── ImplementationTrigger.tsx
├── InitializingPage.tsx
├── IntroPage.tsx
├── LoginPage.tsx
├── ParticleField.tsx
├── PreviewPanel.tsx
├── ProjectCard.tsx
├── ProjectsPage.tsx
├── QuickCommands.tsx
├── SignUpPage.tsx
├── StatusIndicator.tsx
├── UserProfilePanel.tsx
├── VersionManager.tsx
└── floatingBackgroundPresets.ts
```

### 1.2 重构目标

1. 按功能职责对组件进行合理分类
2. 建立清晰的目录层级结构
3. 提高代码可维护性和可发现性
4. 保持所有功能和行为的一致性，不引入任何回归

## 2. 组件分析与分类

### 2.1 组件功能分析

| 组件名称 | 功能描述 | 建议分类 |
|---------|---------|---------|
| HomePage.tsx | 首页/落地页，包含聊天输入和最近项目展示 | pages |
| LoginPage.tsx | 用户登录页面 | pages |
| SignUpPage.tsx | 用户注册页面 | pages |
| ProjectsPage.tsx | 项目列表页面，支持搜索、筛选、删除 | pages |
| InitializingPage.tsx | 项目初始化等待页面（含翻牌小游戏） | pages |
| IntroPage.tsx | 产品介绍页面 | pages |
| ChatPanel.tsx | AI 聊天主面板，协调消息显示和任务创建 | chat |
| ChatInput.tsx | 聊天输入组件，支持模式切换和快捷命令 | chat |
| BuildLogPanel.tsx | 构建日志面板，显示任务生命周期事件 | chat |
| ActivityTimeline.tsx | Agent 活动时间线，展示阶段变化和工具调用 | chat |
| ImplementationTrigger.tsx | 规划完成后的实现触发器 | chat |
| QuickCommands.tsx | 快捷命令菜单 | chat |
| PreviewPanel.tsx | WebContainer 预览面板 | editor |
| FileManagerPanel.tsx | 文件管理器面板，支持树形浏览和语法高亮 | editor |
| CodeViewer.tsx | 代码查看器，支持语法高亮 | editor |
| FilePreview.tsx | 文件预览组件（图片、PDF 等） | editor |
| VersionManager.tsx | 版本管理器，支持版本回退和删除 | editor |
| ProjectCard.tsx | 项目卡片组件 | project |
| UserProfilePanel.tsx | 用户资料设置面板 | user |
| StatusIndicator.tsx | 状态指示器组件 | common |
| FileUploader.tsx | 文件上传组件 | common |
| FloatingBackground.tsx | 浮动背景动画组件 | visual |
| floatingBackgroundPresets.ts | 浮动背景预设配置 | visual |
| ParticleField.tsx | 粒子场动画组件 | visual |
| FireBurnOverlay.tsx | 火焰燃烧动画覆盖层 | visual |

### 2.2 分类说明

1. **pages/** - 页面级组件
   - 完整的页面视图
   - 通常作为路由目标
   - 组合多个子组件

2. **chat/** - 聊天/AI 交互组件
   - 与 AI 对话相关的所有组件
   - 消息显示、输入、日志等

3. **editor/** - 编辑器/预览组件
   - 代码编辑和预览相关
   - 文件管理和版本控制

4. **project/** - 项目相关组件
   - 项目展示和管理

5. **user/** - 用户相关组件
   - 用户资料和设置

6. **common/** - 通用组件
   - 可在多处复用的基础组件

7. **visual/** - 视觉效果组件
   - 动画、背景等装饰性组件

## 3. 目标目录结构

```
src/components/
├── pages/
│   ├── HomePage.tsx
│   ├── LoginPage.tsx
│   ├── SignUpPage.tsx
│   ├── ProjectsPage.tsx
│   ├── InitializingPage.tsx
│   ├── IntroPage.tsx
│   └── index.ts
├── chat/
│   ├── ChatPanel.tsx
│   ├── ChatInput.tsx
│   ├── BuildLogPanel.tsx
│   ├── ActivityTimeline.tsx
│   ├── ImplementationTrigger.tsx
│   ├── QuickCommands.tsx
│   └── index.ts
├── editor/
│   ├── PreviewPanel.tsx
│   ├── FileManagerPanel.tsx
│   ├── CodeViewer.tsx
│   ├── FilePreview.tsx
│   ├── VersionManager.tsx
│   └── index.ts
├── project/
│   ├── ProjectCard.tsx
│   └── index.ts
├── user/
│   ├── UserProfilePanel.tsx
│   └── index.ts
├── common/
│   ├── StatusIndicator.tsx
│   ├── FileUploader.tsx
│   └── index.ts
├── visual/
│   ├── FloatingBackground.tsx
│   ├── floatingBackgroundPresets.ts
│   ├── ParticleField.tsx
│   ├── FireBurnOverlay.tsx
│   └── index.ts
└── index.ts
```

## 4. 导入路径变更

### 4.1 需要更新的文件

重构后，以下文件中的 import 语句需要更新：

1. **src/App.tsx** - 主应用入口
2. **src/components/** 内部的相互引用
3. 其他可能引用组件的文件

### 4.2 导入路径映射

| 原路径 | 新路径 |
|-------|-------|
| `./components/HomePage` | `./components/pages/HomePage` |
| `./components/LoginPage` | `./components/pages/LoginPage` |
| `./components/SignUpPage` | `./components/pages/SignUpPage` |
| `./components/ProjectsPage` | `./components/pages/ProjectsPage` |
| `./components/InitializingPage` | `./components/pages/InitializingPage` |
| `./components/IntroPage` | `./components/pages/IntroPage` |
| `./components/ChatPanel` | `./components/chat/ChatPanel` |
| `./components/ChatInput` | `./components/chat/ChatInput` |
| `./components/BuildLogPanel` | `./components/chat/BuildLogPanel` |
| `./components/ActivityTimeline` | `./components/chat/ActivityTimeline` |
| `./components/ImplementationTrigger` | `./components/chat/ImplementationTrigger` |
| `./components/QuickCommands` | `./components/chat/QuickCommands` |
| `./components/PreviewPanel` | `./components/editor/PreviewPanel` |
| `./components/FileManagerPanel` | `./components/editor/FileManagerPanel` |
| `./components/CodeViewer` | `./components/editor/CodeViewer` |
| `./components/FilePreview` | `./components/editor/FilePreview` |
| `./components/VersionManager` | `./components/editor/VersionManager` |
| `./components/ProjectCard` | `./components/project/ProjectCard` |
| `./components/UserProfilePanel` | `./components/user/UserProfilePanel` |
| `./components/StatusIndicator` | `./components/common/StatusIndicator` |
| `./components/FileUploader` | `./components/common/FileUploader` |
| `./components/FloatingBackground` | `./components/visual/FloatingBackground` |
| `./components/floatingBackgroundPresets` | `./components/visual/floatingBackgroundPresets` |
| `./components/ParticleField` | `./components/visual/ParticleField` |
| `./components/FireBurnOverlay` | `./components/visual/FireBurnOverlay` |

## 5. 组件内部依赖关系

### 5.1 依赖图

```
ChatPanel.tsx
├── BuildLogPanel.tsx (chat)
├── ActivityTimeline.tsx (chat)
└── ImplementationTrigger.tsx (chat)

ChatInput.tsx
└── QuickCommands.tsx (chat)

HomePage.tsx
├── ChatInput.tsx (chat)
└── ProjectCard.tsx (project)

ProjectsPage.tsx
├── ProjectCard.tsx (project)
├── FloatingBackground.tsx (visual)
├── floatingBackgroundPresets.ts (visual)
└── FireBurnOverlay.tsx (visual)

IntroPage.tsx
├── FloatingBackground.tsx (visual)
└── floatingBackgroundPresets.ts (visual)

VersionManager.tsx
└── CodeViewer.tsx (editor)
```

### 5.2 重构时需注意

- 同一分类内的组件相互引用使用相对路径 `./`
- 跨分类引用使用 `../category/` 形式
- 每个分类目录提供 `index.ts` 统一导出

## 6. 实施步骤

### 6.1 准备阶段

1. 创建新的目录结构
2. 为每个目录创建 `index.ts` 导出文件

### 6.2 迁移阶段

1. 按分类移动组件文件到对应目录
2. 更新组件内部的相对导入路径
3. 更新 `index.ts` 导出

### 6.3 验证阶段

1. 更新所有外部引用（App.tsx 等）
2. 运行 `npm run lint` 检查代码规范
3. 运行 `npm run typecheck` 检查类型
4. 本地启动应用验证功能正常

### 6.4 文档更新

1. 更新 README.md 中的项目结构说明
2. 更新 AGENTS.md 中的相关引用

## 7. 风险评估与缓解

### 7.1 潜在风险

| 风险 | 影响 | 缓解措施 |
|-----|-----|---------|
| 导入路径遗漏 | 编译错误 | TypeScript 类型检查会捕获 |
| 循环依赖 | 运行时错误 | 仔细规划依赖关系 |
| 动态导入失效 | 功能异常 | 全面测试所有功能 |

### 7.2 回滚方案

如果重构后出现严重问题，可通过 Git 回滚到重构前的状态。

## 8. 验收标准

1. 所有组件按规划分类到对应目录
2. `npm run lint` 无错误
3. `npm run typecheck` 无错误
4. 本地运行应用，所有页面和功能正常
5. CI 检查通过
6. 相关文档已更新

---

**文档版本**: 1.0  
**创建日期**: 2024-12-14  
**作者**: Devin
