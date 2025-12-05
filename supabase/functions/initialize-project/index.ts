import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// --- CORS 配置 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// --- 常量配置 ---
const BUCKET_NAME = 'project-files';
const MAX_CONCURRENT_UPLOADS = 10; // Edge Function 内部并发上传数

// --- 类型定义 ---
interface TemplateFile {
  path: string;
  content: string;
  mimeType: string;
  category: 'code' | 'asset' | 'document' | 'build';
}

interface InitializeProjectRequest {
  projectId: string;
  title: string;
  description: string;
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

// --- 模板生成函数 ---
function generateViteReactTemplate(projectTitle: string, projectDescription: string): TemplateFile[] {
  return [
    {
      path: 'package.json',
      mimeType: 'application/json',
      category: 'code',
      content: JSON.stringify({
        name: projectTitle.toLowerCase().replace(/\s+/g, '-'),
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          lint: 'eslint .',
          preview: 'vite preview'
        },
        dependencies: {
          'react': '^18.3.1',
          'react-dom': '^18.3.1',
          'lucide-react': '^0.344.0'
        },
        devDependencies: {
          '@types/react': '^18.3.5',
          '@types/react-dom': '^18.3.0',
          '@vitejs/plugin-react': '^4.3.1',
          'autoprefixer': '^10.4.18',
          'postcss': '^8.4.35',
          'tailwindcss': '^3.4.1',
          'typescript': '^5.5.3',
          'vite': '^5.4.2'
        }
      }, null, 2)
    },
    {
      path: 'vite.config.ts',
      mimeType: 'text/typescript',
      category: 'code',
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`
    },
    {
      path: 'tsconfig.json',
      mimeType: 'application/json',
      category: 'code',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true
        },
        include: ['src']
      }, null, 2)
    },
    {
      path: 'tsconfig.app.json',
      mimeType: 'application/json',
      category: 'code',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true
        },
        include: ['src']
      }, null, 2)
    },
    {
      path: 'tsconfig.node.json',
      mimeType: 'application/json',
      category: 'code',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2023'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowSyntheticDefaultImports: true,
          strict: true,
          noEmit: true
        },
        include: ['vite.config.ts']
      }, null, 2)
    },
    {
      path: 'tailwind.config.js',
      mimeType: 'text/javascript',
      category: 'code',
      content: `export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`
    },
    {
      path: 'postcss.config.js',
      mimeType: 'text/javascript',
      category: 'code',
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`
    },
    {
      path: 'index.html',
      mimeType: 'text/html',
      category: 'document',
      content: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/icons/icon-32.png" sizes="32x32" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectTitle}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    },
    {
      path: 'public/_redirects',
      mimeType: 'text/plain',
      category: 'document',
      content: `/*    /index.html    200
`
    },
    {
      path: 'public/favicon.svg',
      mimeType: 'image/svg+xml',
      category: 'asset',
      content: `<svg width="512" height="512" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path 
    d="M32 56C17.5 56 6 46.5 6 32C6 21.5 12.5 13.5 22 9" 
    stroke="#334155" 
    stroke-width="4" 
    stroke-linecap="round" 
    stroke-linejoin="round"
  />
  
  <path 
    d="M12 50L6 58" 
    stroke="#334155" 
    stroke-width="4" 
    stroke-linecap="round" 
    stroke-linejoin="round"
  />

  <path 
    d="M22 26L32 31L42 26M32 31V43" 
    stroke="#2563EB" 
    stroke-width="4" 
    stroke-linecap="round" 
    stroke-linejoin="round"
  />
  <path 
    d="M22 26V38L32 43L42 38V26L32 21L22 26Z" 
    stroke="#2563EB" 
    stroke-width="4" 
    stroke-linecap="round" 
    stroke-linejoin="round"
  />

  <path 
    d="M44 20L56 8M56 8H46M56 8V18" 
    stroke="#2563EB" 
    stroke-width="4" 
    stroke-linecap="round" 
    stroke-linejoin="round"
  />
</svg>
`
    },
    {
      path: 'src/main.tsx',
      mimeType: 'text/typescript',
      category: 'code',
      content: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`
    },
    {
      path: 'src/index.css',
      mimeType: 'text/css',
      category: 'code',
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
`
    },
    {
      path: 'src/App.tsx',
      mimeType: 'text/typescript',
      category: 'code',
      content: `import { Sparkles } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-12">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl">
            <Sparkles className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
            ${projectTitle}
          </h1>

          <p className="text-lg text-gray-600 max-w-lg mx-auto">
            ${projectDescription}
          </p>

          <div className="pt-4">
            <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/30">
              开始使用
            </button>
          </div>

          <div className="pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              由 AI BUILD 创建 · Vite + React + TypeScript
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`
    },
    {
      path: 'src/vite-env.d.ts',
      mimeType: 'text/typescript',
      category: 'code',
      content: `/// <reference types="vite/client" />
`
    },
    {
      path: '.gitignore',
      mimeType: 'text/plain',
      category: 'document',
      content: `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`
    },
    {
      path: 'README.md',
      mimeType: 'text/markdown',
      category: 'document',
      content: `# ${projectTitle}

${projectDescription}

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React Icons

## 开发

\`\`\`bash
npm install
npm run dev
\`\`\`

## 构建

\`\`\`bash
npm run build
\`\`\`

---

由 AI BUILD 创建
`
    }
  ];
}

// --- 并发上传控制 ---
async function uploadFilesWithConcurrency(
  supabase: ReturnType<typeof createClient>,
  files: TemplateFile[],
  projectId: string,
  versionId: string
): Promise<{ successCount: number; errorCount: number; fileRecords: FileRecord[] }> {
  const fileQueue = [...files];
  const fileRecords: FileRecord[] = [];
  let successCount = 0;
  let errorCount = 0;

  const worker = async () => {
    while (fileQueue.length > 0) {
      const file = fileQueue.shift();
      if (!file) continue;

      try {
        // 构建存储路径
        const storagePath = `${projectId}/v${versionId}/${file.path}`.replace(/\/+/g, '/');
        
        // 将内容转换为 Uint8Array
        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(file.content);
        
        // 上传到 Storage
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storagePath, contentBytes, {
            contentType: file.mimeType,
            cacheControl: '3600',
            upsert: true // 使用 upsert 保证幂等性
          });

        if (uploadError) {
          console.error(`上传文件失败: ${file.path}`, uploadError);
          errorCount++;
          continue;
        }

        // 记录文件信息（稍后批量插入数据库）
        const fileName = file.path.includes('/') 
          ? file.path.split('/').pop() || file.path 
          : file.path;

        fileRecords.push({
          project_id: projectId,
          version_id: versionId,
          file_name: fileName,
          file_path: storagePath,
          file_size: contentBytes.length,
          mime_type: file.mimeType,
          file_category: file.category,
          source_type: 'ai_generated',
          is_public: false
        });

        successCount++;
      } catch (err) {
        console.error(`上传文件出错 ${file.path}:`, err);
        errorCount++;
      }
    }
  };

  // 创建并发 worker
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, files.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return { successCount, errorCount, fileRecords };
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

    // 生成模板文件
    const templateFiles = generateViteReactTemplate(title, description || '');
    await writeBuildLog(supabase, projectId, 'info', `使用模板: Vite + React + TypeScript (${templateFiles.length} 个文件)`);

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
      return new Response(
        JSON.stringify({ error: '创建版本失败', details: versionError }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await writeBuildLog(supabase, projectId, 'success', `创建版本 v${version.version_number}`);

    // 并发上传文件到 Storage
    const { successCount, errorCount, fileRecords } = await uploadFilesWithConcurrency(
      supabase,
      templateFiles,
      projectId,
      version.id
    );

    await writeBuildLog(supabase, projectId, 'info', `已上传 ${successCount}/${templateFiles.length} 个文件`);

    if (errorCount > 0) {
      await writeBuildLog(supabase, projectId, 'error', `文件初始化完成，但有 ${errorCount} 个文件失败`);
    }

    // 批量插入文件记录到数据库
    if (fileRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('project_files')
        .insert(fileRecords);

      if (insertError) {
        console.error('批量插入文件记录失败:', insertError);
        await writeBuildLog(supabase, projectId, 'error', '保存文件记录失败');
        // 不返回错误，因为文件已经上传成功
      }
    }

    // 生成代码快照
    const codeSnapshot: Record<string, string> = {};
    templateFiles.forEach(file => {
      codeSnapshot[file.path] = file.content;
    });

    // 计算总大小
    const totalSize = fileRecords.reduce((sum, record) => sum + record.file_size, 0);

    // 更新版本记录
    const { error: updateError } = await supabase
      .from('project_versions')
      .update({
        code_snapshot: codeSnapshot,
        storage_path: `${projectId}/v${version.id}`,
        total_files: successCount,
        total_size: totalSize
      })
      .eq('id', version.id);

    if (updateError) {
      console.error('更新版本记录失败:', updateError);
    }

    // 写入完成日志
    if (successCount > 0) {
      await writeBuildLog(supabase, projectId, 'success', `成功初始化 ${successCount} 个文件`);
      await writeBuildLog(supabase, projectId, 'success', '项目初始化完成');
    } else {
      await writeBuildLog(supabase, projectId, 'error', '没有文件成功上传');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: '文件上传失败',
          filesCreated: 0
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        versionId: version.id,
        filesCreated: successCount,
        filesError: errorCount,
        totalSize: totalSize
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
