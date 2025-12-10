#!/usr/bin/env node

/**
 * 一键部署 Supabase Edge Function
 * 
 * 使用方法:
 *   node tools/deploy-edge-function.cjs <function-name>
 * 
 * 示例:
 *   node tools/deploy-edge-function.cjs process-ai-tasks
 * 
 * 功能:
 *   1. 自动生成 MCP JSON 文件
 *   2. 调用 mcp-cli 部署到 Supabase
 *   3. 清理临时文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 默认项目 ID (aisitebuilder)
const DEFAULT_PROJECT_ID = 'bsiukgyvrfkanuhjkxuh';

// 配置
const DEPLOY_TOOLS_DIR = __dirname;
const PROJECT_ROOT = path.join(DEPLOY_TOOLS_DIR, '..');
const FUNCTIONS_DIR = path.join(PROJECT_ROOT, 'supabase', 'functions');
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
function generateMcpJson(functionName, projectId) {
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
 * 列出所有可用的边缘函数
 */
function listAvailableFunctions() {
  return fs.readdirSync(FUNCTIONS_DIR)
    .filter(f => {
      const fullPath = path.join(FUNCTIONS_DIR, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('_');
    });
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 显示帮助信息
  if (args.length < 1 || args[0] === '--help' || args[0] === '-h') {
    console.log('一键部署 Supabase Edge Function');
    console.log('');
    console.log('使用方法:');
    console.log('  node tools/deploy-edge-function.cjs <function-name> [project-id]');
    console.log('');
    console.log('参数:');
    console.log('  function-name  要部署的边缘函数名称');
    console.log('  project-id     Supabase 项目 ID (可选，默认: ' + DEFAULT_PROJECT_ID + ')');
    console.log('');
    console.log('示例:');
    console.log('  node tools/deploy-edge-function.cjs process-ai-tasks');
    console.log('  node tools/deploy-edge-function.cjs process-ai-tasks bsiukgyvrfkanuhjkxuh');
    console.log('');
    console.log('可用的边缘函数:');
    
    const functions = listAvailableFunctions();
    functions.forEach(f => console.log(`  - ${f}`));
    process.exit(0);
  }

  const functionName = args[0];
  const projectId = args[1] || DEFAULT_PROJECT_ID;

  console.log('========================================');
  console.log('  一键部署 Supabase Edge Function');
  console.log('========================================');
  console.log('');
  console.log(`函数名称: ${functionName}`);
  console.log(`项目 ID:  ${projectId}`);
  console.log('');

  // 检查函数是否存在
  const availableFunctions = listAvailableFunctions();
  if (!availableFunctions.includes(functionName)) {
    console.error(`错误: 边缘函数 "${functionName}" 不存在`);
    console.log('');
    console.log('可用的边缘函数:');
    availableFunctions.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  // 步骤 1: 生成 MCP JSON
  console.log('[1/3] 生成 MCP JSON...');
  const mcpJson = generateMcpJson(functionName, projectId);
  console.log(`      包含 ${mcpJson.files.length} 个文件`);

  // 保存临时 JSON 文件
  const tempJsonPath = path.join(DEPLOY_TOOLS_DIR, `.temp-deploy-${functionName}.json`);
  fs.writeFileSync(tempJsonPath, JSON.stringify(mcpJson));
  console.log(`      临时文件: ${tempJsonPath}`);

  // 步骤 2: 调用 mcp-cli 部署
  console.log('');
  console.log('[2/3] 调用 MCP 部署...');
  
  try {
    const mcpCommand = `mcp-cli tool call deploy_edge_function --server supabase --input "$(cat ${tempJsonPath})"`;
    console.log('      执行命令中，请稍候...');
    
    const result = execSync(mcpCommand, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      cwd: PROJECT_ROOT
    });

    // 解析结果
    const toolResultMatch = result.match(/Tool result:\s*\n([\s\S]*?)$/);
    if (toolResultMatch) {
      try {
        const deployResult = JSON.parse(toolResultMatch[1].trim());
        console.log('');
        console.log('[3/3] 部署成功!');
        console.log('');
        console.log('========================================');
        console.log('  部署结果');
        console.log('========================================');
        console.log(`函数 ID:    ${deployResult.id}`);
        console.log(`函数名称:   ${deployResult.name}`);
        console.log(`版本号:     ${deployResult.version}`);
        console.log(`状态:       ${deployResult.status}`);
        console.log(`更新时间:   ${new Date(deployResult.updated_at).toLocaleString()}`);
      } catch (e) {
        console.log('      部署完成，但无法解析结果');
        console.log(result.slice(-500));
      }
    } else {
      console.log('      部署完成');
      console.log(result.slice(-500));
    }
  } catch (error) {
    console.error('');
    console.error('部署失败!');
    console.error(error.message);
    process.exit(1);
  } finally {
    // 步骤 3: 清理临时文件
    if (fs.existsSync(tempJsonPath)) {
      fs.unlinkSync(tempJsonPath);
      console.log('');
      console.log('临时文件已清理');
    }
  }
}

main().catch(error => {
  console.error('发生错误:', error);
  process.exit(1);
});
