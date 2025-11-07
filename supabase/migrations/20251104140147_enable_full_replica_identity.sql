/*
  # 启用完整副本标识以支持 Realtime

  1. 修改
    - 将 `build_logs` 表的 replica identity 设置为 FULL
    - 将 `chat_messages` 表的 replica identity 设置为 FULL
  
  2. 说明
    - Supabase Realtime 需要 REPLICA IDENTITY FULL 才能推送完整的行数据
    - 这使得客户端订阅能够接收到新插入记录的所有字段
    - 对于已启用 Realtime 的表，这是必需的配置
*/

-- 为 build_logs 表启用完整副本标识
ALTER TABLE build_logs REPLICA IDENTITY FULL;

-- 为 chat_messages 表启用完整副本标识
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
