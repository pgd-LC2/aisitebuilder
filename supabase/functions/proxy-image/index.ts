import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Cross-Origin-Resource-Policy': 'cross-origin'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('缺少必要的环境变量设置');
    }
    
    // 从请求的 apikey 参数中获取 anon key(用于用户认证)
    const url = new URL(req.url);
    const anonKeyFromRequest = url.searchParams.get('apikey');
    
    if (!anonKeyFromRequest) {
      return new Response(JSON.stringify({ error: '缺少 apikey 参数' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const path = url.searchParams.get('path');
    const fileId = url.searchParams.get('fileId');
    const token = url.searchParams.get('token');

    if (!path && !fileId) {
      return new Response(JSON.stringify({ error: '缺少 path 或 fileId 参数' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authHeader = req.headers.get('Authorization');
    const authToken = token || (authHeader ? authHeader.replace('Bearer ', '') : null);
    
    if (!authToken) {
      return new Response(JSON.stringify({ error: '未授权：缺少认证令牌' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, anonKeyFromRequest, {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '未授权：无效的访问令牌' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let filePath = path;
    let mimeType = 'image/png';

    if (fileId) {
      const { data: fileRecord, error: fileError } = await supabase
        .from('project_files')
        .select('file_path, mime_type, project_id')
        .eq('id', fileId)
        .maybeSingle();

      if (fileError || !fileRecord) {
        return new Response(JSON.stringify({ error: '文件不存在' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', fileRecord.project_id)
        .maybeSingle();

      if (projectError || !project || project.user_id !== user.id) {
        return new Response(JSON.stringify({ error: '无权访问此文件' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      filePath = fileRecord.file_path;
      mimeType = fileRecord.mime_type || 'image/png';
    } else if (path) {
      const pathParts = path.split('/');
      if (pathParts.length < 2) {
        return new Response(JSON.stringify({ error: '无效的文件路径' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const projectId = pathParts[0];

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', projectId)
        .maybeSingle();

      if (projectError || !project || project.user_id !== user.id) {
        return new Response(JSON.stringify({ error: '无权访问此文件' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (path.endsWith('.gif')) {
        mimeType = 'image/gif';
      } else if (path.endsWith('.webp')) {
        mimeType = 'image/webp';
      } else if (path.endsWith('.svg')) {
        mimeType = 'image/svg+xml';
      }
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: imageData, error: downloadError } = await serviceSupabase.storage
      .from('project-files')
      .download(filePath);

    if (downloadError || !imageData) {
      console.error('下载图片失败:', downloadError);
      return new Response(JSON.stringify({ error: '下载图片失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await imageData.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': mimeType,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });

  } catch (error) {
    console.error('代理图片请求失败:', error);
    return new Response(JSON.stringify({ error: error.message || '服务器内部错误' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
