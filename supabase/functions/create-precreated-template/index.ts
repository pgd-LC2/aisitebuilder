import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// --- CORS 配置 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// --- 常量配置 ---
const TEMPLATE_BUCKET = 'template-files';
const MAX_CONCURRENT_UPLOADS = 10;

// --- 类型定义 ---
interface TemplateFile {
  path: string;
  content: string;
  mimeType: string;
  category: 'code' | 'asset' | 'document' | 'build';
}

interface FileManifestItem {
  relative_path: string;
  file_name: string;
  mime_type: string;
  file_category: string;
  file_size: number;
}

interface CreateTemplateRequest {
  templateKey?: string;
}

// --- 模板生成函数（与 initialize-project 保持一致，但使用占位符） ---
function generateViteReactTemplate(): TemplateFile[] {
  // 使用占位符，消费时会被替换
  const projectTitle = '{{PROJECT_TITLE}}';
  const projectDescription = '{{PROJECT_DESCRIPTION}}';
  
  return [
    {
      path: 'package.json',
      mimeType: 'application/json',
      category: 'code',
      content: JSON.stringify({
        name: 'vite-react-project',
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
  storagePrefix: string
): Promise<{ successCount: number; errorCount: number; fileManifest: FileManifestItem[]; totalSize: number }> {
  const fileQueue = [...files];
  const fileManifest: FileManifestItem[] = [];
  let successCount = 0;
  let errorCount = 0;
  let totalSize = 0;

  const worker = async () => {
    while (fileQueue.length > 0) {
      const file = fileQueue.shift();
      if (!file) continue;

      try {
        // 构建存储路径
        const storagePath = `${storagePrefix}/${file.path}`.replace(/\/+/g, '/');
        
        // 将内容转换为 Uint8Array
        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(file.content);
        
        // 上传到 Storage
        const { error: uploadError } = await supabase.storage
          .from(TEMPLATE_BUCKET)
          .upload(storagePath, contentBytes, {
            contentType: file.mimeType,
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          console.error(`上传文件失败: ${file.path}`, uploadError);
          errorCount++;
          continue;
        }

        // 记录文件清单
        const fileName = file.path.includes('/') 
          ? file.path.split('/').pop() || file.path 
          : file.path;

        fileManifest.push({
          relative_path: file.path,
          file_name: fileName,
          mime_type: file.mimeType,
          file_category: file.category,
          file_size: contentBytes.length
        });

        totalSize += contentBytes.length;
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

  return { successCount, errorCount, fileManifest, totalSize };
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
    try {
      const body = await req.json() as CreateTemplateRequest;
      if (body.templateKey) {
        templateKey = body.templateKey;
      }
    } catch {
      // 使用默认值
    }

    // 目前只支持 vite-react-ts 模板
    if (templateKey !== 'vite-react-ts') {
      return new Response(
        JSON.stringify({ error: `不支持的模板类型: ${templateKey}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 生成唯一的模板 ID
    const templateId = crypto.randomUUID();
    const storagePrefix = `templates/${templateId}`;

    console.log(`开始创建预创建模板: ${templateId}`);

    // 创建 precreated_templates 记录（状态: creating）
    const { data: template, error: insertError } = await supabase
      .from('precreated_templates')
      .insert({
        id: templateId,
        template_key: templateKey,
        status: 'creating',
        storage_bucket: TEMPLATE_BUCKET,
        storage_prefix: storagePrefix
      })
      .select()
      .maybeSingle();

    if (insertError || !template) {
      console.error('创建模板记录失败:', insertError);
      return new Response(
        JSON.stringify({ error: '创建模板记录失败', details: insertError }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 生成模板文件
    const templateFiles = generateViteReactTemplate();
    console.log(`生成 ${templateFiles.length} 个模板文件`);

    // 并发上传文件到 Storage
    const { successCount, errorCount, fileManifest, totalSize } = await uploadFilesWithConcurrency(
      supabase,
      templateFiles,
      storagePrefix
    );

    console.log(`上传完成: ${successCount} 成功, ${errorCount} 失败`);

    // 生成代码快照
    const codeSnapshot: Record<string, string> = {};
    templateFiles.forEach(file => {
      codeSnapshot[file.path] = file.content;
    });

    // 根据上传结果更新模板状态
    if (errorCount > 0 || successCount === 0) {
      // 标记为失败
      await supabase
        .from('precreated_templates')
        .update({
          status: 'failed',
          error: `上传失败: ${errorCount} 个文件失败`
        })
        .eq('id', templateId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: '模板文件上传失败',
          templateId,
          successCount,
          errorCount
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 更新为 ready 状态
    const { error: updateError } = await supabase
      .from('precreated_templates')
      .update({
        status: 'ready',
        code_snapshot: codeSnapshot,
        file_manifest: fileManifest,
        total_files: successCount,
        total_size: totalSize
      })
      .eq('id', templateId);

    if (updateError) {
      console.error('更新模板状态失败:', updateError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: '更新模板状态失败',
          templateId
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`预创建模板创建成功: ${templateId}`);

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        templateId,
        templateKey,
        filesCreated: successCount,
        totalSize
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('创建预创建模板出错:', error);
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
