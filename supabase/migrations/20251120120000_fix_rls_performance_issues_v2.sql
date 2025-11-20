
BEGIN;

ALTER POLICY "用户可以创建自己的项目" ON public.projects 
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "用户可以删除自己的项目" ON public.projects 
  USING ((select auth.uid()) = user_id);

ALTER POLICY "用户可以更新自己的项目" ON public.projects 
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "用户可以查看自己的项目" ON public.projects 
  USING ((select auth.uid()) = user_id);

ALTER POLICY "用户可以创建自己项目的版本" ON public.project_versions 
  WITH CHECK (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_versions.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以删除自己项目的版本" ON public.project_versions 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_versions.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以查看自己项目的版本" ON public.project_versions 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_versions.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以上传文件到自己的项目" ON public.project_files 
  WITH CHECK (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以删除自己项目的文件" ON public.project_files 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以更新自己项目的文件" ON public.project_files 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = (select auth.uid())))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以查看自己项目的文件" ON public.project_files 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以创建自己项目的消息" ON public.chat_messages 
  WITH CHECK (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = chat_messages.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以删除自己项目的消息" ON public.chat_messages 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = chat_messages.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以查看自己项目的消息" ON public.chat_messages 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = chat_messages.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以创建自己项目的日志" ON public.build_logs 
  WITH CHECK (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = build_logs.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以删除自己项目的日志" ON public.build_logs 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = build_logs.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "用户可以查看自己项目的日志" ON public.build_logs 
  USING (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = build_logs.project_id) AND (projects.user_id = (select auth.uid())))));

ALTER POLICY "ai_tasks_insert" ON public.ai_tasks 
  WITH CHECK ((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = ai_tasks.project_id) AND (projects.user_id = (select auth.uid()))))));

ALTER POLICY "ai_tasks_select" ON public.ai_tasks 
  USING ((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = ai_tasks.project_id) AND (projects.user_id = (select auth.uid()))))));

ALTER POLICY "ai_tasks_update" ON public.ai_tasks 
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

COMMIT;
