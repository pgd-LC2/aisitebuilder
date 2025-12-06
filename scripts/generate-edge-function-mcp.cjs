#!/usr/bin/env node

/**
 * 生成 MCP JSON 用于部署 Supabase Edge Function
 * 
 * 使用方法:
 *   node scripts/generate-edge-function-mcp.js <function-name>
 * 
 * 示例:
 *   node scripts/generate-edge-function-mcp.js process-ai-tasks
 * 
 * 输出:
 *   生成 mcp-deploy-<function-name>.json 文件，包含所有需要的文件内容
 */

const fs = require('fs');
const path = require('path');

// 配置
const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const SHARED_DIR = path.join(FUNCTIONS_DIR, '_shared');

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * 获取相对于 functions 目录的路径
 */
function getRelativePath(filePath) {
  return path.relative(FUNCTIONS_DIR, filePath);
}

/**
 * 生成 MCP deploy_edge_function 的 JSON 参数
 */
function generateMcpJson(functionName, projectId = 'YOUR_PROJECT_ID') {
  const functionDir = path.join(FUNCTIONS_DIR, functionName);
  
  if (!fs.existsSync(functionDir)) {
    console.error(`错误: 边缘函数目录不存在: ${functionDir}`);
    process.exit(1);
  }

  // 收集所有需要的文件
  const files = [];

  // 1. 添加函数目录下的所有文件
  const functionFiles = getAllFiles(functionDir);
  functionFiles.forEach(filePath => {
    // 只包含 .ts 和 .md 文件
    if (filePath.endsWith('.ts') || filePath.endsWith('.md')) {
      const relativePath = getRelativePath(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      files.push({
        name: relativePath,
        content: content
      });
    }
  });

  // 2. 添加 _shared 目录下的所有文件
  if (fs.existsSync(SHARED_DIR)) {
    const sharedFiles = getAllFiles(SHARED_DIR);
    sharedFiles.forEach(filePath => {
      // 只包含 .ts 文件
      if (filePath.endsWith('.ts')) {
        const relativePath = getRelativePath(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        files.push({
          name: relativePath,
          content: content
        });
      }
    });
  }

  // 3. 检查是否有 import_map.json
  const importMapPath = path.join(FUNCTIONS_DIR, 'import_map.json');
  let importMapRelativePath = null;
  if (fs.existsSync(importMapPath)) {
    const content = fs.readFileSync(importMapPath, 'utf-8');
    files.push({
      name: 'import_map.json',
      content: content
    });
    importMapRelativePath = 'import_map.json';
  }

  // 生成 MCP JSON
  const mcpJson = {
    project_id: projectId,
    name: functionName,
    entrypoint_path: `${functionName}/index.ts`,
    files: files
  };

  if (importMapRelativePath) {
    mcpJson.import_map_path = importMapRelativePath;
  }

  return mcpJson;
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('使用方法: node scripts/generate-edge-function-mcp.js <function-name> [project-id]');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/generate-edge-function-mcp.js process-ai-tasks');
    console.log('  node scripts/generate-edge-function-mcp.js process-ai-tasks abcdefghijklmnop');
    console.log('');
    console.log('可用的边缘函数:');
    
    // 列出所有可用的边缘函数
    const functions = fs.readdirSync(FUNCTIONS_DIR)
      .filter(f => {
        const fullPath = path.join(FUNCTIONS_DIR, f);
        return fs.statSync(fullPath).isDirectory() && !f.startsWith('_');
      });
    
    functions.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  const functionName = args[0];
  const projectId = args[1] || 'YOUR_PROJECT_ID';

  console.log(`正在为边缘函数 "${functionName}" 生成 MCP JSON...`);
  console.log(`项目 ID: ${projectId}`);
  console.log('');

  const mcpJson = generateMcpJson(functionName, projectId);

  // 输出文件统计
  console.log(`包含的文件数量: ${mcpJson.files.length}`);
  console.log('文件列表:');
  mcpJson.files.forEach(f => {
    const sizeKb = (f.content.length / 1024).toFixed(2);
    console.log(`  - ${f.name} (${sizeKb} KB)`);
  });
  console.log('');

  // 保存到文件
  const outputPath = path.join(__dirname, '..', `mcp-deploy-${functionName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(mcpJson, null, 2));
  console.log(`MCP JSON 已保存到: ${outputPath}`);

  // 同时输出到控制台（用于直接复制）
  console.log('');
  console.log('=== MCP 工具调用参数 ===');
  console.log(JSON.stringify(mcpJson));
}

main();
