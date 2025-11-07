/*
  # 修复版本文件统计数据

  1. 目的
    - 为所有现有版本重新计算并更新 total_files 和 total_size
    - 确保统计数据与实际文件记录一致

  2. 操作
    - 使用 project_files 表的实际数据更新 project_versions 表的统计字段
    - 对每个版本汇总其文件数量和总大小

  3. 说明
    - 此迁移是幂等的，可以安全地多次运行
    - 使用 COALESCE 确保即使没有文件也能正确设置为 0
*/

-- 更新所有版本的文件统计信息
UPDATE project_versions pv
SET 
  total_files = COALESCE(stats.file_count, 0),
  total_size = COALESCE(stats.total_size, 0)
FROM (
  SELECT 
    version_id,
    COUNT(*) as file_count,
    SUM(file_size) as total_size
  FROM project_files
  GROUP BY version_id
) stats
WHERE pv.id = stats.version_id;

-- 将没有文件的版本统计设置为 0
UPDATE project_versions
SET 
  total_files = 0,
  total_size = 0
WHERE id NOT IN (
  SELECT DISTINCT version_id 
  FROM project_files 
  WHERE version_id IS NOT NULL
);