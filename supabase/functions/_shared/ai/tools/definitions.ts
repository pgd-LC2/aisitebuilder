/**
 * AI Agent 工具定义模块
 * 定义所有可用工具的 schema 和工具能力矩阵
 * 
 * 设计原则：
 * - 工具权限由 InteractionMode 决定，不再使用 TaskType + WorkflowMode 组合
 * - 简化为三种模式：chat（只读）、plan（只读）、build（完整工具集）
 */

import type { ToolDefinition, InteractionMode } from '../types.ts';

// --- 工具分类 ---

// 只读工具：用于分析和查看代码，不会修改任何文件
const READ_ONLY_TOOLS = ['list_files', 'read_file', 'search_files', 'get_project_structure'];

// 写入工具：用于修改、创建、删除文件
const WRITE_TOOLS = ['write_file', 'delete_file', 'move_file'];

// 特殊工具：需要特殊处理的工具
const SPECIAL_TOOLS = ['generate_image'];

// 完整工具集：所有可用工具
const ALL_TOOLS = [...READ_ONLY_TOOLS, ...WRITE_TOOLS, ...SPECIAL_TOOLS];

// --- 基于 InteractionMode 的工具能力矩阵 ---

/**
 * InteractionMode 工具能力矩阵
 * 
 * | 模式   | 允许的工具                    |
 * |--------|------------------------------|
 * | chat   | 只读工具                      |
 * | plan   | 只读工具                      |
 * | build  | 完整工具集                    |
 */
const MODE_TOOL_MATRIX: Record<InteractionMode, string[]> = {
  'chat': READ_ONLY_TOOLS,
  'plan': READ_ONLY_TOOLS,
  'build': ALL_TOOLS
};

/**
 * 根据 InteractionMode 获取允许使用的工具名称列表
 * @param mode 交互模式
 * @returns 允许使用的工具名称数组
 */
export function getAllowedToolNamesByMode(mode: InteractionMode): string[] {
  const tools = MODE_TOOL_MATRIX[mode];
  if (tools) {
    console.log(`[ToolCapability] 模式: ${mode} -> ${tools.join(', ')}`);
    return tools;
  }
  
  // 默认回退到只读工具
  console.log(`[ToolCapability] 未知模式: ${mode}, 回退到只读工具`);
  return READ_ONLY_TOOLS;
}

/**
 * 根据 InteractionMode 过滤工具定义列表
 * @param mode 交互模式
 * @returns 过滤后的工具定义数组
 */
export function getFilteredToolsByMode(mode: InteractionMode): ToolDefinition[] {
  const allowedNames = getAllowedToolNamesByMode(mode);
  const filtered = TOOLS.filter(tool => allowedNames.includes(tool.function.name));
  console.log(`[ToolCapability] 模式: ${mode}, 过滤后工具数: ${filtered.length}/${TOOLS.length}`);
  return filtered;
}

// Chat Completions API 工具定义格式
export const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '生成图片。当用户要求创建、生成或绘制图片时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '图片生成的详细描述,用英文描述'
          },
          aspect_ratio: {
            type: 'string',
            description: '图片的宽高比',
            enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
          },
          model: {
            type: 'string',
            description: '图片生成模型（可选）。如果不指定，将使用默认模型。可用模型: google/gemini-3-pro-image-preview, openai/dall-e-3, openai/dall-e-2'
          }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出项目目录下的文件和子目录。用于了解项目结构。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要列出的目录路径，相对于项目根目录。留空表示根目录。'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取项目中指定文件的内容。用于查看现有代码或配置。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径，相对于项目根目录'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入或创建文件。用于生成新代码或修改现有文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要写入的文件路径，相对于项目根目录'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除指定文件或文件夹。支持递归删除文件夹及其所有内容。谨慎使用，仅在用户明确要求删除时调用。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的文件或文件夹路径，相对于项目根目录。如果是文件夹，将递归删除其中所有内容。'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在项目文件中搜索包含指定关键词或正则表达式的内容。支持递归搜索子目录。用于定位相关代码。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '要搜索的关键词或正则表达式模式'
          },
          file_extension: {
            type: 'string',
            description: '限制搜索的文件扩展名，如 .ts, .html 等（可选）'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归搜索子目录（默认 true）'
          },
          use_regex: {
            type: 'boolean',
            description: '是否将 keyword 作为正则表达式处理（默认 false）'
          },
          max_results: {
            type: 'number',
            description: '最大返回结果数（默认 50）'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_structure',
      description: '获取项目文件树结构。支持递归遍历、深度限制和文件过滤。用于全局了解项目组成。',
      parameters: {
        type: 'object',
        properties: {
          depth: {
            type: 'number',
            description: '递归深度限制（默认 3，最大 10）。0 表示只列出根目录。'
          },
          include_patterns: {
            type: 'array',
            items: { type: 'string' },
            description: '包含的文件模式列表，如 ["*.ts", "*.tsx", "src/**"]。留空表示包含所有文件。'
          },
          exclude_patterns: {
            type: 'array',
            items: { type: 'string' },
            description: '排除的文件/目录模式列表，如 ["node_modules", "*.log"]。默认排除 node_modules、.git 等。'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: '移动或重命名文件。将文件从一个路径移动到另一个路径。',
      parameters: {
        type: 'object',
        properties: {
          fromPath: {
            type: 'string',
            description: '源文件路径，相对于项目根目录'
          },
          toPath: {
            type: 'string',
            description: '目标文件路径，相对于项目根目录'
          },
          overwrite: {
            type: 'boolean',
            description: '目标文件已存在时是否覆盖（默认 false）'
          }
        },
        required: ['fromPath', 'toPath']
      }
    }
  }
];
