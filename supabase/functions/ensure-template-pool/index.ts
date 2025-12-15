import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// --- CORS 配置 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// --- 常量配置 ---
const MIN_POOL_SIZE = 2;
const MAX_POOL_SIZE = 3;
const TIMEOUT_MINUTES = 5;

// --- 类型定义 ---
interface PoolStatus {
  ready_count: number;
  creating_count: number;
  reserved_count: number;
  total_active: number;
}

interface EnsurePoolRequest {
  templateKey?: string;
  force?: boolean;
}

// --- 获取模板池状态 ---
async function getPoolStatus(
  supabase: ReturnType<typeof createClient>,
  templateKey: string
): Promise<PoolStatus> {
  const { data, error } = await supabase
    .rpc('get_template_pool_status', {
      p_template_key: templateKey
    });

  if (error) {
    console.error('获取池状态失败:', error);
    return {
      ready_count: 0,
      creating_count: 0,
      reserved_count: 0,
      total_active: 0
    };
  }

  if (!data || data.length === 0) {
    return {
      ready_count: 0,
      creating_count: 0,
      reserved_count: 0,
      total_active: 0
    };
  }

  return data[0] as PoolStatus;
}

// --- 清理超时的 reserved 模板 ---
async function cleanupTimeoutReserved(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data, error } = await supabase
    .from('precreated_templates')
    .update({
      status: 'ready',
      reserved_at: null,
      reserved_project_id: null,
      reserved_by_user_id: null,
      error: 'timeout_recovered'
    })
    .eq('status', 'reserved')
    .lt('reserved_at', new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString())
    .select('id');

  if (error) {
    console.error('清理超时模板失败:', error);
    return 0;
  }

  return data?.length || 0;
}

// --- 清理长时间处于 creating 状态的模板 ---
async function cleanupStuckCreating(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  // 超过 10 分钟还在 creating 状态的视为卡住
  const { data, error } = await supabase
    .from('precreated_templates')
    .update({
      status: 'failed',
      error: 'creation_timeout'
    })
    .eq('status', 'creating')
    .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select('id');

  if (error) {
    console.error('清理卡住的模板失败:', error);
    return 0;
  }

  return data?.length || 0;
}

// --- 触发创建新模板 ---
async function triggerCreateTemplate(
  supabaseUrl: string,
  templateKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-precreated-template`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ templateKey })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('触发创建模板失败:', error);
      return false;
    }

    const result = await response.json();
    console.log('触发创建模板成功:', result);
    return true;
  } catch (error) {
    console.error('触发创建模板出错:', error);
    return false;
  }
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

    // 解析请求体（可选）
    let templateKey = 'vite-react-ts';
    let force = false;
    
    try {
      const body = await req.json() as EnsurePoolRequest;
      if (body.templateKey) {
        templateKey = body.templateKey;
      }
      if (body.force) {
        force = body.force;
      }
    } catch {
      // 使用默认值
    }

    console.log(`检查模板池状态: ${templateKey}`);

    // 1. 清理超时的 reserved 模板
    const recoveredCount = await cleanupTimeoutReserved(supabase);
    if (recoveredCount > 0) {
      console.log(`恢复了 ${recoveredCount} 个超时的模板`);
    }

    // 2. 清理卡住的 creating 模板
    const cleanedCount = await cleanupStuckCreating(supabase);
    if (cleanedCount > 0) {
      console.log(`清理了 ${cleanedCount} 个卡住的模板`);
    }

    // 3. 获取当前池状态
    const poolStatus = await getPoolStatus(supabase, templateKey);
    console.log('当前池状态:', poolStatus);

    // 4. 判断是否需要补充
    const needCreate = poolStatus.ready_count < MIN_POOL_SIZE && 
                       poolStatus.total_active < MAX_POOL_SIZE &&
                       poolStatus.creating_count === 0;  // 避免重复创建

    if (!needCreate && !force) {
      return new Response(
        JSON.stringify({
          success: true,
          action: 'none',
          message: '模板池状态正常，无需补充',
          poolStatus,
          recoveredCount,
          cleanedCount
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. 计算需要创建的数量
    const targetCount = MIN_POOL_SIZE - poolStatus.ready_count;
    const canCreate = MAX_POOL_SIZE - poolStatus.total_active;
    const createCount = Math.min(targetCount, canCreate, 1);  // 单次最多创建 1 个

    if (createCount <= 0 && !force) {
      return new Response(
        JSON.stringify({
          success: true,
          action: 'none',
          message: '已达到最大池容量或正在创建中',
          poolStatus,
          recoveredCount,
          cleanedCount
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 6. 触发创建新模板（异步，不等待完成）
    console.log(`触发创建 ${force ? 1 : createCount} 个新模板`);
    
    // 使用 fire-and-forget 方式触发创建
    // 不使用 await，让创建在后台进行
    triggerCreateTemplate(supabaseUrl, templateKey);

    return new Response(
      JSON.stringify({
        success: true,
        action: 'create_triggered',
        message: `已触发创建 1 个新模板`,
        poolStatus,
        recoveredCount,
        cleanedCount,
        createTriggered: 1
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('确保模板池出错:', error);
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
