/*
  # 启用构建日志实时更新功能

  ## 变更说明
  为 build_logs 表启用 Supabase Realtime 功能，使前端能够实时接收新的日志记录

  ## 技术细节
  - 将 build_logs 表添加到 supabase_realtime publication
  - 这允许客户端通过 WebSocket 订阅表的 INSERT/UPDATE/DELETE 事件
*/

-- 启用 build_logs 表的 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE build_logs;
