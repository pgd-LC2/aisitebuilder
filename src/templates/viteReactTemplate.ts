export interface TemplateFile {
  path: string;
  content: string;
  mimeType: string;
  category: 'code' | 'asset' | 'document' | 'build';
}

export interface ProjectTemplate {
  name: string;
  description: string;
  files: TemplateFile[];
}

export function generateViteReactTemplate(projectTitle: string, projectDescription: string): ProjectTemplate {
  return {
    name: 'Vite + React + TypeScript',
    description: 'A modern React app with TypeScript, Tailwind CSS, and Lucide icons',
    files: [
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
    ]
  };
}
