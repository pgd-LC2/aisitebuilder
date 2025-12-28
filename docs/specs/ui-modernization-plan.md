# UI 现代化重构规划

> 版本: v1.0  
> 创建日期: 2024-12-28  
> 状态: 待审批

## 一、背景与目标

### 1.1 背景

当前 aisitebuilder 项目已经正确集成了 Shadcn UI 组件库（Radix UI + Tailwind CSS + CSS 变量），但整体视觉效果与 Shadcn 官网展示的现代化设计存在差距。主要原因包括：

1. **字体未正确加载**：CSS 中声明了 Inter 字体，但未实际引入字体文件
2. **页面级设计不足**：缺少精心设计的页面布局和组件组合（Blocks）
3. **视觉细节缺失**：阴影、间距、背景分区等细节不够统一和精致

### 1.2 目标

将 aisitebuilder 打造成一个**现代化、实用性强、视觉克制**的 AI 网站构建平台。

**核心原则**：
- **实用优先**：信息架构清晰，交互效率高
- **视觉克制**：不花里胡哨，避免过度装饰
- **一致性**：统一的设计系统，可复用的组件规范
- **可访问性**：良好的对比度、焦点状态、响应式适配

### 1.3 非目标（明确排除）

- 不使用复杂的 3D 效果或玻璃拟态
- 不添加过度的动画效果（保持现有动画，不新增装饰性动画）
- 不使用大面积渐变或噪点背景
- 不追求与 Shadcn 官网一模一样（借鉴结构，不复制设计）

---

## 二、现状盘点

### 2.1 已有基础

| 项目 | 状态 | 说明 |
|------|------|------|
| Shadcn UI 组件 | 已完成 | 28 个标准组件，API 与官方一致 |
| CSS 变量系统 | 已完成 | 完整的 design tokens（颜色、圆角、间距） |
| Tailwind 配置 | 已完成 | 正确映射 CSS 变量，启用 tailwindcss-animate |
| 主色调 | 蓝色 | `--primary: 221.2 83.2% 53.3%` |
| 暗色模式 | 已配置 | CSS 变量已定义，但页面适配待验证 |

### 2.2 当前痛点

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 字体未加载 | 回退到系统字体，观感"老旧" | P0 |
| 首页布局简单 | 信息密度低，视觉层次不足 | P0 |
| 卡片缺少阴影 | 层次感不强，"扁平" | P1 |
| 间距不统一 | 页面各区块间距不一致 | P1 |
| 背景分区不明显 | 区块边界模糊 | P2 |

### 2.3 改造范围

**Phase 1（本次实施）**：
- 全局字体系统
- 首页（HomePage）重设计
- 通用组件视觉优化（Card、Button、Input 等）
- 项目卡片（ProjectCard）优化

**Phase 2（后续迭代）**：
- 登录/注册页面
- 项目列表页（ProjectsPage）
- 用户设置面板（UserProfilePanel）
- 编辑器相关页面

---

## 三、设计系统规范

### 3.1 Typography（字体排版）

#### 3.1.1 字体选择

采用 **Geist** 字体家族（Vercel 出品，现代、清晰、专为开发者设计）：

- **Geist Sans**：用于正文、标题、UI 文本
- **Geist Mono**：用于代码、技术内容

#### 3.1.2 引入方式

推荐使用 `geist` 官方 npm 包（支持 Variable Font，文件体积小）：

```bash
npm install geist
```

在 `src/main.tsx` 中引入：

```typescript
import 'geist/font/sans.css';
import 'geist/font/mono.css';
```

更新 `src/index.css`：

```css
body {
  font-family: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

code, pre, .font-mono {
  font-family: 'Geist Mono', ui-monospace, SFMono-Regular, monospace;
}
```

#### 3.1.3 字号比例

| 用途 | 类名 | 字号 | 字重 | 行高 |
|------|------|------|------|------|
| Display | `text-5xl` | 48px | 700 (bold) | 1.1 |
| H1 | `text-4xl` | 36px | 700 (bold) | 1.2 |
| H2 | `text-2xl` | 24px | 600 (semibold) | 1.3 |
| H3 | `text-xl` | 20px | 600 (semibold) | 1.4 |
| Body | `text-base` | 16px | 400 (normal) | 1.5 |
| Small | `text-sm` | 14px | 400 (normal) | 1.5 |
| Caption | `text-xs` | 12px | 400 (normal) | 1.4 |

#### 3.1.4 字体渲染优化

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

### 3.2 Spacing（间距系统）

#### 3.2.1 基础间距

基于 4px 网格系统：

| Token | 值 | 用途 |
|-------|-----|------|
| `space-1` | 4px | 图标与文字间距 |
| `space-2` | 8px | 紧凑元素间距 |
| `space-3` | 12px | 表单元素间距 |
| `space-4` | 16px | 卡片内边距 |
| `space-6` | 24px | 区块内边距 |
| `space-8` | 32px | 区块间距 |
| `space-12` | 48px | 大区块间距 |
| `space-16` | 64px | Section 间距 |

#### 3.2.2 容器宽度

| 用途 | 类名 | 最大宽度 |
|------|------|----------|
| 窄内容（表单、登录） | `max-w-md` | 448px |
| 中等内容（首页主区） | `max-w-2xl` | 672px |
| 宽内容（项目列表） | `max-w-6xl` | 1152px |
| 全宽内容 | `max-w-7xl` | 1280px |

### 3.3 Elevation（层次与阴影）

#### 3.3.1 阴影层级

采用 3 级阴影系统，保持克制：

| 层级 | 类名 | 用途 | CSS 值 |
|------|------|------|--------|
| Level 0 | `shadow-none` | 默认状态 | none |
| Level 1 | `shadow-sm` | 卡片默认、输入框 | `0 1px 2px rgba(0,0,0,0.05)` |
| Level 2 | `shadow-md` | 卡片悬停、下拉菜单 | `0 4px 6px rgba(0,0,0,0.07)` |
| Level 3 | `shadow-lg` | 模态框、弹出层 | `0 10px 15px rgba(0,0,0,0.1)` |

#### 3.3.2 边框策略

- **卡片**：`border border-border` + `shadow-sm`
- **输入框**：`border border-input`，focus 时 `ring-2 ring-ring`
- **分隔线**：`border-t border-border`

### 3.4 Color（配色策略）

#### 3.4.1 现有配色（保持不变）

当前蓝色主题色符合 AI/科技产品调性，无需修改：

```css
--primary: 221.2 83.2% 53.3%;        /* 主色：蓝色 */
--primary-foreground: 210 40% 98%;   /* 主色上的文字 */
```

#### 3.4.2 配色使用原则

| 颜色 | 用途 | 示例 |
|------|------|------|
| `primary` | 主要操作、强调 | 主按钮、链接、选中状态 |
| `secondary` | 次要操作 | 次要按钮、标签 |
| `muted` | 背景分区、禁用状态 | 区块背景、占位符 |
| `destructive` | 危险操作、错误 | 删除按钮、错误提示 |
| `success` | 成功状态 | 成功提示、完成标记 |
| `warning` | 警告状态 | 警告提示 |

#### 3.4.3 背景分区

使用 `bg-muted/50` 或 `bg-muted/30` 创建轻微的背景分区，避免大面积纯色块。

### 3.5 Accessibility（可访问性）

- **焦点状态**：所有可交互元素必须有清晰的 `focus-visible` 样式
- **对比度**：文本与背景对比度至少 4.5:1（WCAG AA）
- **点击区域**：按钮最小高度 36px，触摸目标最小 44px
- **表单反馈**：错误状态使用 `destructive` 颜色 + 文字说明

---

## 四、首页重设计方案

### 4.1 页面结构

将首页拆分为 3 个核心区块：

```
┌─────────────────────────────────────────┐
│              Header (导航栏)              │
├─────────────────────────────────────────┤
│                                         │
│              Hero Section               │
│         (价值主张 + 主输入框)             │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│           Recent Projects               │
│            (最近项目网格)                 │
│                                         │
└─────────────────────────────────────────┘
```

### 4.2 Hero Section 设计

**目标**：清晰传达产品价值，引导用户开始创建

**布局**：
- 垂直居中，最大宽度 `max-w-2xl`
- 上下 padding：`py-16` (移动端) / `py-24` (桌面端)

**内容层次**：
1. **Badge**（可选）：产品版本/公告，使用 `outline` 变体
2. **主标题**：`text-5xl font-bold tracking-tight`
3. **副标题**：`text-lg text-muted-foreground`
4. **ChatInput**：主交互区，带卡片容器
5. **辅助入口**：Figma/GitHub 导入按钮

**视觉优化**：
- ChatInput 容器添加 `shadow-sm` + `border`
- 主标题中的强调词使用 `text-primary` + `italic`

### 4.3 Recent Projects Section 设计

**目标**：快速访问最近项目，展示用户成果

**布局**：
- 背景分区：`bg-muted/30` + `border-t`
- 内边距：`py-8`
- 最大宽度：`max-w-6xl`

**内容**：
- Section 标题 + "查看全部"链接
- 3 列网格（响应式：1/2/3 列）
- 项目卡片带 hover 效果

### 4.4 响应式策略

| 断点 | Hero padding | 项目网格 | 容器宽度 |
|------|--------------|----------|----------|
| < 640px | `py-12` | 1 列 | `px-4` |
| 640-1024px | `py-16` | 2 列 | `px-6` |
| > 1024px | `py-24` | 3 列 | `px-8` |

---

## 五、组件视觉优化清单

### 5.1 Card 组件

**当前问题**：缺少阴影，hover 状态不明显

**优化方案**：

```tsx
// src/components/ui/card.tsx
const Card = React.forwardRef<...>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      "transition-shadow hover:shadow-md",
      className
    )}
    {...props}
  />
));
```

**修改符号**：
- `Card` 组件：添加 `shadow-sm` 和 `hover:shadow-md`

### 5.2 ProjectCard 组件

**当前问题**：视觉层次不够，状态展示不突出

**优化方案**：

```tsx
// src/components/project/ProjectCard.tsx
// 修改卡片容器样式
<Card className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/20">
  ...
</Card>

// 优化 Badge 状态显示
<Badge variant={statusVariant} className="text-xs">
  {statusLabel}
</Badge>
```

**修改符号**：
- `ProjectCard` 组件：优化卡片 hover 效果、状态 Badge 样式

### 5.3 ChatInput 组件

**当前问题**：容器边界不够清晰

**优化方案**：

```tsx
// src/components/chat/ChatInput.tsx
// 外层容器添加卡片样式
<Card className="shadow-sm">
  <div className="p-4">
    {/* 输入区域 */}
  </div>
</Card>
```

**修改符号**：
- `ChatInput` 组件：添加卡片容器包裹

### 5.4 Button 组件

**当前状态**：已符合 Shadcn UI 标准，无需大改

**微调**：
- 确保所有按钮有 `transition-colors` 过渡
- 图标按钮间距统一为 `gap-2`

### 5.5 Input/Textarea 组件

**当前状态**：已符合 Shadcn UI 标准

**微调**：
- 确保 focus 状态有 `ring-2 ring-ring ring-offset-2`

---

## 六、实施步骤

### Phase 1: 字体与全局排版（Day 1）

**步骤**：
1. 安装 `geist` 包
2. 在 `src/main.tsx` 引入字体 CSS
3. 更新 `src/index.css` 字体栈和渲染优化
4. 验证字体加载（DevTools Network/Computed）

**修改文件**：
- `package.json`（添加依赖）
- `src/main.tsx`（引入字体）
- `src/index.css`（更新字体栈）

**验证方式**：
- 浏览器 DevTools 确认 Geist 字体加载
- 视觉对比截图

### Phase 2: 首页布局重构（Day 1-2）

**步骤**：
1. 重构 `HomePage.tsx` 布局结构
2. 优化 Hero Section 间距和样式
3. 优化 Recent Projects Section 背景分区
4. 响应式适配测试

**修改文件**：
- `src/components/pages/HomePage.tsx`

**验证方式**：
- 多分辨率截图对比
- 移动端适配检查

### Phase 3: 组件视觉优化（Day 2）

**步骤**：
1. 更新 `Card` 组件添加阴影
2. 优化 `ProjectCard` hover 效果
3. 优化 `ChatInput` 容器样式
4. 统一检查其他组件一致性

**修改文件**：
- `src/components/ui/card.tsx`
- `src/components/project/ProjectCard.tsx`
- `src/components/chat/ChatInput.tsx`

**验证方式**：
- 组件 hover/focus 状态检查
- 视觉一致性检查

### Phase 4: 验证与提交（Day 2）

**步骤**：
1. 运行 `npm run lint` 和 `npm run typecheck`
2. 本地视觉测试
3. 创建 PR
4. 等待 CI 通过

---

## 七、影响面与风险

### 7.1 潜在影响

| 变更 | 影响 | 风险等级 | 缓解措施 |
|------|------|----------|----------|
| 字体切换 | 文本宽度变化，可能影响布局 | 中 | 测试关键页面布局 |
| 卡片阴影 | 视觉层次变化 | 低 | 使用轻量阴影 |
| 首页布局 | 用户习惯变化 | 低 | 保持核心交互不变 |

### 7.2 回滚策略

所有变更在单独分支进行，如有问题可快速回滚：
- 字体：移除 `geist` 依赖和引入代码
- 样式：Git revert 相关 commit

---

## 八、验收标准

### 8.1 功能验收

- [ ] 字体正确加载（Network 面板可见 Geist 字体请求）
- [ ] 首页在 1920px、1440px、768px、375px 宽度下布局正常
- [ ] 所有按钮、输入框、卡片的 hover/focus 状态清晰
- [ ] 项目卡片点击、创建项目等核心交互正常

### 8.2 视觉验收

- [ ] 整体风格"现代、克制、实用"
- [ ] 无过度装饰性元素
- [ ] 阴影层级一致（最多 3 级）
- [ ] 间距节奏统一
- [ ] 配色符合蓝色主题调性

### 8.3 技术验收

- [ ] `npm run lint` 无错误
- [ ] `npm run typecheck` 无错误
- [ ] CI 流水线通过

---

## 九、附录

### A. 参考资源

- [Shadcn UI 官方文档](https://ui.shadcn.com/)
- [Shadcn Blocks](https://ui.shadcn.com/blocks)
- [Geist 字体](https://vercel.com/font)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)

### B. 相关文件清单

| 文件路径 | 修改类型 | 说明 |
|----------|----------|------|
| `package.json` | 新增依赖 | 添加 `geist` |
| `src/main.tsx` | 新增引入 | 引入字体 CSS |
| `src/index.css` | 修改 | 更新字体栈 |
| `src/components/pages/HomePage.tsx` | 重构 | 布局优化 |
| `src/components/ui/card.tsx` | 修改 | 添加阴影 |
| `src/components/project/ProjectCard.tsx` | 修改 | hover 效果 |
| `src/components/chat/ChatInput.tsx` | 修改 | 容器样式 |

---

**文档状态**：待用户审批

**下一步**：用户确认后开始实施
