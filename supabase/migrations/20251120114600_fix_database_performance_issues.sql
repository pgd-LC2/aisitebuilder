
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_id ON public.ai_tasks USING btree (user_id);

DROP INDEX IF EXISTS public.idx_projects_created_at;
DROP INDEX IF EXISTS public.idx_project_files_category;
DROP INDEX IF EXISTS public.idx_project_files_source;
DROP INDEX IF EXISTS public.idx_project_files_created_at;
DROP INDEX IF EXISTS public.idx_ai_tasks_status;
