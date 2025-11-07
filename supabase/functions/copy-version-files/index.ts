import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CopyRequest {
  sourceVersionId: string;
  targetVersionId: string;
  projectId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { sourceVersionId, targetVersionId, projectId } = await req.json() as CopyRequest;

    if (!sourceVersionId || !targetVersionId || !projectId) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: sourceFiles, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('version_id', sourceVersionId);

    if (fetchError || !sourceFiles || sourceFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: '未找到源文件', details: fetchError }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const copiedFiles = [];
    const errors = [];

    for (const sourceFile of sourceFiles) {
      const sourcePath = sourceFile.file_path;
      const targetPath = sourcePath.replace(
        /\/v[^/]+\//,
        `/v${targetVersionId}/`
      );

      const { error: copyError } = await supabase.storage
        .from('project-files')
        .copy(sourcePath, targetPath);

      if (copyError) {
        errors.push({ file: sourceFile.file_name, error: copyError });
        continue;
      }

      const newFileRecord = {
        project_id: projectId,
        version_id: targetVersionId,
        file_name: sourceFile.file_name,
        file_path: targetPath,
        file_size: sourceFile.file_size,
        mime_type: sourceFile.mime_type,
        file_category: sourceFile.file_category,
        source_type: sourceFile.source_type,
        is_public: false
      };

      const { data: newFile, error: insertError } = await supabase
        .from('project_files')
        .insert(newFileRecord)
        .select()
        .maybeSingle();

      if (insertError) {
        errors.push({ file: sourceFile.file_name, error: insertError });
      } else if (newFile) {
        copiedFiles.push(newFile);
      }
    }

    if (copiedFiles.length > 0) {
      const totalSize = copiedFiles.reduce((sum, file) => sum + (file.file_size || 0), 0);

      await supabase
        .from('project_versions')
        .update({
          total_files: copiedFiles.length,
          total_size: totalSize
        })
        .eq('id', targetVersionId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        copiedFiles: copiedFiles.length,
        errors: errors.length > 0 ? errors : null
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('复制文件出错:', error);
    return new Response(
      JSON.stringify({ error: '服务器错误', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
