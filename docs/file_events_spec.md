# File 事件规范 (File Events Specification)

本文档定义了项目文件变更事件的数据结构和语义。这些事件用于驱动前端文件树实时更新和预览热刷新。

## 1. 数据库表结构

### file_events 表

```sql
CREATE TABLE file_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,               -- 关联的项目 ID
  path text NOT NULL,                     -- 文件路径（相对于项目根目录）
  op text NOT NULL,                       -- 操作类型
  summary text,                           -- 操作摘要
  content_ref text,                       -- 内容引用（存储 URL/key/hash）
  version text,                           -- 版本标识
  from_path text,                         -- 源路径（仅 move 操作）
  created_at timestamptz DEFAULT now()    -- 创建时间
);

-- 索引
CREATE INDEX idx_file_events_project_id ON file_events(project_id);
CREATE INDEX idx_file_events_path ON file_events(path);
CREATE INDEX idx_file_events_created_at ON file_events(created_at DESC);

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE file_events;
ALTER TABLE file_events REPLICA IDENTITY FULL;
```

### 操作类型约束

```sql
CHECK (op IN ('create', 'update', 'delete', 'move'))
```

## 2. 操作类型 (op)

| 操作 | 描述 | 必填字段 | 可选字段 |
|------|------|----------|----------|
| `create` | 创建新文件 | project_id, path | summary, content_ref, version |
| `update` | 更新文件内容 | project_id, path | summary, content_ref, version |
| `delete` | 删除文件 | project_id, path | summary |
| `move` | 移动/重命名文件 | project_id, path, from_path | summary |

## 3. 数据库记录示例

### 3.1 创建文件

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "project_id": "789e0123-e45b-67d8-a901-234567890abc",
  "path": "src/components/Button.tsx",
  "op": "create",
  "summary": "创建 Button 组件",
  "content_ref": null,
  "version": "v1",
  "from_path": null,
  "created_at": "2025-11-29T14:00:00.000Z"
}
```

### 3.2 更新文件

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "project_id": "789e0123-e45b-67d8-a901-234567890abc",
  "path": "src/App.tsx",
  "op": "update",
  "summary": "添加路由配置",
  "content_ref": null,
  "version": "v2",
  "from_path": null,
  "created_at": "2025-11-29T14:01:00.000Z"
}
```

### 3.3 删除文件

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "project_id": "789e0123-e45b-67d8-a901-234567890abc",
  "path": "src/old-component.tsx",
  "op": "delete",
  "summary": "删除废弃组件",
  "content_ref": null,
  "version": null,
  "from_path": null,
  "created_at": "2025-11-29T14:02:00.000Z"
}
```

### 3.4 移动文件

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "project_id": "789e0123-e45b-67d8-a901-234567890abc",
  "path": "src/components/ui/Button.tsx",
  "op": "move",
  "summary": "移动 Button 到 ui 目录",
  "content_ref": null,
  "version": null,
  "from_path": "src/components/Button.tsx",
  "created_at": "2025-11-29T14:03:00.000Z"
}
```

## 4. 前端类型定义

```typescript
// 数据库 file_events 表记录类型
interface DbFileEvent {
  id: string;
  project_id: string;
  path: string;
  op: 'create' | 'update' | 'delete' | 'move';
  summary: string | null;
  content_ref: string | null;
  version: string | null;
  from_path: string | null;
  created_at: string;
}
```

## 5. 事件写入时机

### 5.1 Edge Function 写入

在 `process-ai-tasks` Edge Function 中，以下操作会写入 file_events：

| 操作 | 触发条件 | op 值 |
|------|----------|-------|
| `handleWriteFile` | 文件写入成功后 | `create` 或 `update` |
| `handleDeleteFile` | 文件删除成功后 | `delete` |
| `handleMoveFile` | 文件移动成功后 | `move` |

### 5.2 写入示例代码

```typescript
// 写入文件事件
await logFileEvent(
  supabase,
  projectId,
  filePath,
  isNewFile ? 'create' : 'update',
  `${isNewFile ? '创建' : '更新'}文件: ${filePath}`,
  undefined,  // contentRef
  undefined   // version
);

// 移动文件事件
await logFileEvent(
  supabase,
  projectId,
  toPath,
  'move',
  `移动文件: ${fromPath} -> ${toPath}`,
  undefined,
  undefined,
  fromPath
);
```

## 6. 前端订阅

### 6.1 订阅配置

```typescript
const unsubscribe = subscribeFileEvents({
  projectId,
  onFileEvent: (event: DbFileEvent) => {
    console.log('收到文件事件:', event.op, event.path);
    // 处理事件...
  },
  onError: (error) => {
    console.error('订阅错误:', error);
  }
});
```

### 6.2 热刷新节流

为避免短时间内大量文件事件导致频繁刷新，前端实现了 500ms 节流：

```typescript
const HOT_REFRESH_THROTTLE_MS = 500;

// 收到事件后加入队列
pendingFileEventsRef.current.push(event);

// 节流定时器
if (!hotRefreshTimerRef.current) {
  hotRefreshTimerRef.current = setTimeout(() => {
    const events = [...pendingFileEventsRef.current];
    pendingFileEventsRef.current = [];
    hotRefreshTimerRef.current = null;
    
    // 批量处理事件
    refreshFiles();
    
    // 触发预览刷新
    window.dispatchEvent(new CustomEvent('file-hot-refresh', {
      detail: { events, projectId }
    }));
  }, HOT_REFRESH_THROTTLE_MS);
}
```

## 7. 前端处理指南

### 7.1 文件树更新

| 事件 op | 处理方式 |
|---------|----------|
| `create` | 在文件树中添加新节点 |
| `update` | 更新文件节点的元数据 |
| `delete` | 从文件树中移除节点 |
| `move` | 移除 from_path 节点，在 path 位置添加新节点 |

### 7.2 预览热刷新

收到 `file-hot-refresh` 自定义事件后：

1. 检查事件中的文件路径
2. 如果是代码文件变更，触发 WebContainer 重新加载
3. 如果是静态资源变更，刷新对应资源

### 7.3 断线重连

断线重连后，应补拉最近的文件事件：

```typescript
// 重连后获取最近 10 分钟的事件
const { data } = await supabase
  .from('file_events')
  .select('*')
  .eq('project_id', projectId)
  .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
  .order('created_at', { ascending: true });
```

## 8. 与 agent_events 的关系

`file_events` 表专注于文件系统变更，而 `agent_events` 表记录 Agent 行为。两者的关系：

- `agent_events` 中的 `file_update` 类型事件是 Agent 视角的文件操作记录
- `file_events` 是实际文件系统变更的权威记录
- 前端可以同时订阅两个表，获得完整的实时更新

## 9. RLS 策略

```sql
-- 用户只能查看自己项目的文件事件
CREATE POLICY "用户可查看自己项目的文件事件"
  ON file_events FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- 服务端可插入文件事件
CREATE POLICY "服务端可插入文件事件"
  ON file_events FOR INSERT
  WITH CHECK (true);
```

## 10. 性能考虑

### 10.1 索引设计

- `project_id` 索引：按项目过滤
- `path` 索引：按文件路径查询
- `created_at DESC` 索引：按时间倒序获取最新事件

### 10.2 数据清理

建议定期清理旧的文件事件记录：

```sql
-- 删除 30 天前的文件事件
DELETE FROM file_events
WHERE created_at < NOW() - INTERVAL '30 days';
```

### 10.3 事件量控制

- Edge Function 写入事件时使用 best-effort 模式，不影响主流程
- 前端使用节流机制，避免事件风暴
- 考虑对高频操作（如批量文件更新）进行合并
