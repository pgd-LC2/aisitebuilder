import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// --- CORS 配置 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// --- 常量配置 ---
const TEMPLATE_BUCKET = 'template-files';
const PROJECT_BUCKET = 'project-files';
const MAX_CONCURRENT_COPIES = 10;

// --- 类型定义 ---
interface InitializeProjectRequest {
  projectId: string;
  title: string;
  description: string;
}

interface FileManifestItem {
  relative_path: string;
  file_name: string;
  mime_type: string;
  file_category: string;
  file_size: number;
}

interface ClaimedTemplate {
  id: string;
  template_key: string;
  storage_bucket: string;
  storage_prefix: string;
  code_snapshot: Record<string, string>;
  file_manifest: FileManifestItem[];
  total_files: number;
  total_size: number;
}

interface FileRecord {
  project_id: string;
  version_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_category: string;
  source_type: string;
  is_public: boolean;
}

// --- 写入构建日志 ---
async function writeBuildLog(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  logType: 'info' | 'success' | 'error',
  message: string
): Promise<void> {
  const { error } = await supabase
    .from('build_logs')
    .insert({
      project_id: projectId,
      log_type: logType,
      message: message
    });
  
  if (error) {
    console.error('写入构建日志失败:', error);
  }
}

// --- 领取预创建模板 ---
async function claimTemplate(
  supabase: ReturnType<typeof createClient>,
  templateKey: string,
  projectId: string,
  userId: string
): Promise<ClaimedTemplate | null> {
  // 使用数据库函数进行原子操作
  const { data, error } = await supabase
    .rpc('claim_precreated_template', {
      p_template_key: templateKey,
      p_project_id: projectId,
      p_user_id: userId
    });

  if (error) {
    console.error('领取模板失败:', error);
    return null;
  }

  if (!data || data.length === 0) {
    console.log('没有可用的预创建模板');
    return null;
  }

  return data[0] as ClaimedTemplate;
}

// --- 标记模板为已消费 ---
async function markTemplateConsumed(
  supabase: ReturnType<typeof createClient>,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .rpc('mark_template_consumed', {
      p_template_id: templateId
    });

  if (error) {
    console.error('标记模板为已消费失败:', error);
  }
}

// --- 标记模板为失败 ---
async function markTemplateFailed(
  supabase: ReturnType<typeof createClient>,
  templateId: string,
  errorMessage: string,
  rollbackToReady: boolean = false
): Promise<void> {
  const { error } = await supabase
    .rpc('mark_template_failed', {
      p_template_id: templateId,
      p_error: errorMessage,
      p_rollback_to_ready: rollbackToReady
    });

  if (error) {
    console.error('标记模板为失败失败:', error);
  }
}

// --- 并发复制文件 ---
async function copyFilesWithConcurrency(
  supabase: ReturnType<typeof createClient>,
  fileManifest: FileManifestItem[],
  sourcePrefix: string,
  targetPrefix: string,
  projectId: string,
  versionId: string
): Promise<{ successCount: number; errorCount: number; fileRecords: FileRecord[] }> {
  const fileQueue = [...fileManifest];
  const fileRecords: FileRecord[] = [];
  let successCount = 0;
  let errorCount = 0;

  const worker = async () => {
    while (fileQueue.length > 0) {
      const file = fileQueue.shift();
      if (!file) continue;

      try {
        // 构建源路径和目标路径
        const sourcePath = `${sourcePrefix}/${file.relative_path}`.replace(/\/+/g, '/');
        const targetPath = `${targetPrefix}/${file.relative_path}`.replace(/\/+/g, '/');
        
        // 使用 Storage copy API 复制文件
        const { error: copyError } = await supabase.storage
          .from(TEMPLATE_BUCKET)
          .copy(sourcePath, targetPath, {
            destinationBucket: PROJECT_BUCKET
          });

        if (copyError) {
          console.error(`复制文件失败: ${file.relative_path}`, copyError);
          errorCount++;
          continue;
        }

        // 记录文件信息
        fileRecords.push({
          project_id: projectId,
          version_id: versionId,
          file_name: file.file_name,
          file_path: targetPath,
          file_size: file.file_size,
          mime_type: file.mime_type,
          file_category: file.file_category,
          source_type: 'ai_generated',
          is_public: false
        });

        successCount++;
      } catch (err) {
        console.error(`复制文件出错 ${file.relative_path}:`, err);
        errorCount++;
      }
    }
  };

  // 创建并发 worker
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(MAX_CONCURRENT_COPIES, fileManifest.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return { successCount, errorCount, fileRecords };
}

// --- 降级到原有初始化逻辑 ---
async function fallbackToOriginalInitialize(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  title: string,
  description: string,
  supabaseUrl: string,
  userToken: string
): Promise<Response> {
  console.log('降级到原有初始化逻辑');
  
  // 调用原有的 initialize-project Edge Function
  // 使用用户的 token 而不是 service role key，因为 initialize-project 的 verify_jwt=true
  const response = await fetch(`${supabaseUrl}/functions/v1/initialize-project`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      title,
      description
    })
  });

  const result = await response.json();
  
  return new Response(
    JSON.stringify({
      ...result,
      usedPrecreatedTemplate: false,
      fallback: true
    }),
    {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

// --- 主处理函数 ---
Deno.serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // 初始化 Supabase 客户端（使用 Service Role Key）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 验证授权
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: '未授权' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 获取用户信息
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: '无效的授权令牌' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 解析请求体
    const { projectId, title, description } = await req.json() as InitializeProjectRequest;

    if (!projectId || !title) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数: projectId 和 title 是必需的' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 验证项目所有权
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: '项目不存在' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (project.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: '无权操作此项目' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 写入开始日志
    await writeBuildLog(supabase, projectId, 'info', '开始初始化项目文件...');

    // 尝试领取预创建模板
    const template = await claimTemplate(supabase, 'vite-react-ts', projectId, user.id);

    if (!template) {
      // 没有可用的预创建模板，降级到原有逻辑
      await writeBuildLog(supabase, projectId, 'info', '预创建模板池为空，使用标准初始化流程');
      return await fallbackToOriginalInitialize(supabase, projectId, title, description, supabaseUrl, token);
    }

    console.log(`使用预创建模板: ${template.id}`);
    await writeBuildLog(supabase, projectId, 'info', `使用预创建模板: Vite + React + TypeScript (${template.total_files} 个文件)`);

    // 创建版本记录
    const { data: version, error: versionError } = await supabase
      .from('project_versions')
      .insert({
        project_id: projectId,
        version_number: 1,
        code_snapshot: {},
        storage_path: `${projectId}/v1`,
        total_files: 0,
        total_size: 0
      })
      .select()
      .maybeSingle();

    if (versionError || !version) {
      await writeBuildLog(supabase, projectId, 'error', '创建项目版本失败');
      // 回滚模板状态
      await markTemplateFailed(supabase, template.id, '创建版本失败', true);
      return new Response(
        JSON.stringify({ error: '创建版本失败', details: versionError }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await writeBuildLog(supabase, projectId, 'success', `创建版本 v${version.version_number}`);

    // 构建目标路径
    const targetPrefix = `${projectId}/v${version.id}`;

    // 并发复制文件
    const { successCount, errorCount, fileRecords } = await copyFilesWithConcurrency(
      supabase,
      template.file_manifest,
      template.storage_prefix,
      targetPrefix,
      projectId,
      version.id
    );

    await writeBuildLog(supabase, projectId, 'info', `已复制 ${successCount}/${template.total_files} 个文件`);

    if (errorCount > 0) {
      await writeBuildLog(supabase, projectId, 'error', `文件初始化完成，但有 ${errorCount} 个文件失败`);
    }

    // 如果所有文件都失败，标记模板为失败并降级
    if (successCount === 0) {
      await markTemplateFailed(supabase, template.id, '所有文件复制失败', false);
      await writeBuildLog(supabase, projectId, 'error', '文件复制全部失败，尝试标准初始化流程');
      return await fallbackToOriginalInitialize(supabase, projectId, title, description, supabaseUrl, token);
    }

    // 批量插入文件记录到数据库
    if (fileRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('project_files')
        .insert(fileRecords);

      if (insertError) {
        console.error('批量插入文件记录失败:', insertError);
        await writeBuildLog(supabase, projectId, 'error', '保存文件记录失败');
      }
    }

    // 更新版本记录（直接使用模板的 code_snapshot）
    const { error: updateError } = await supabase
      .from('project_versions')
      .update({
        code_snapshot: template.code_snapshot,
        storage_path: targetPrefix,
        total_files: successCount,
        total_size: template.total_size
      })
      .eq('id', version.id);

    if (updateError) {
      console.error('更新版本记录失败:', updateError);
    }

    // 标记模板为已消费
    await markTemplateConsumed(supabase, template.id);

    // 写入完成日志
    await writeBuildLog(supabase, projectId, 'success', `成功初始化 ${successCount} 个文件`);
    await writeBuildLog(supabase, projectId, 'success', '项目初始化完成');

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        versionId: version.id,
        filesCreated: successCount,
        filesError: errorCount,
        totalSize: template.total_size,
        usedPrecreatedTemplate: true,
        templateId: template.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('初始化项目出错:', error);
    return new Response(
      JSON.stringify({ 
        error: '服务器错误', 
        details: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
