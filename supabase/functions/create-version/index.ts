import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreateVersionRequest {
  projectId: string;
  versionNumber: number;
  codeSnapshot?: Record<string, any>;
  previewUrl?: string;
  copyFromVersionId?: string;
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

    const { projectId, versionNumber, codeSnapshot, previewUrl, copyFromVersionId } = await req.json() as CreateVersionRequest;

    if (!projectId || !versionNumber) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: version, error: versionError } = await supabase
      .from('project_versions')
      .insert({
        project_id: projectId,
        version_number: versionNumber,
        code_snapshot: codeSnapshot || {},
        preview_url: previewUrl,
        storage_path: `${projectId}/v${versionNumber}`,
        total_files: 0,
        total_size: 0
      })
      .select()
      .maybeSingle();

    if (versionError || !version) {
      return new Response(
        JSON.stringify({ error: '创建版本失败', details: versionError }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (copyFromVersionId) {
      const copyFunctionUrl = `${supabaseUrl}/functions/v1/copy-version-files`;
      const copyResponse = await fetch(copyFunctionUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceVersionId: copyFromVersionId,
          targetVersionId: version.id,
          projectId: projectId
        })
      });

      if (!copyResponse.ok) {
        const errorData = await copyResponse.json();
        return new Response(
          JSON.stringify({ error: '复制文件失败', details: errorData }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const copyResult = await copyResponse.json();
      
      return new Response(
        JSON.stringify({
          success: true,
          version,
          copiedFiles: copyResult.copiedFiles
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        version
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('创建版本出错:', error);
    return new Response(
      JSON.stringify({ error: '服务器错误', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
