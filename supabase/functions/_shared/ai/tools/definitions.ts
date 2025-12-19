/**
 * AI Agent 工具定义模块
 * 定义所有可用工具的 schema 和工具能力矩阵
 */

import type { ToolDefinition, TaskType, WorkflowMode, InteractionMode } from '../types.ts';

// --- 工具能力矩阵 ---
// 定义不同任务类型和工作流模式下允许使用的工具

// 只读工具：用于分析和查看代码，不会修改任何文件
const READ_ONLY_TOOLS = ['list_files', 'read_file', 'search_files', 'get_project_structure'];

// 写入工具：用于修改、创建、删除文件
const WRITE_TOOLS = ['write_file', 'delete_file', 'move_file'];

// 特殊工具：需要特殊处理的工具
const SPECIAL_TOOLS = ['generate_image', 'spawn_subagent'];

// 完整工具集：所有可用工具
const ALL_TOOLS = [...READ_ONLY_TOOLS, ...WRITE_TOOLS, ...SPECIAL_TOOLS];

/**
 * 工具能力矩阵
 * 定义每种 (taskType, workflowMode) 组合允许使用的工具
 * 
 * | 任务类型      | 工作流模式  | 允许的工具                    |
 * |--------------|------------|------------------------------|
 * | chat_reply   | default    | 只读工具                      |
 * | chat_reply   | planning   | 只读工具                      |
 * | chat_reply   | build      | 完整工具集（特殊情况）         |
 * | build_site   | *          | 完整工具集                    |
 * | refactor_code| *          | 完整工具集                    |
 * | debug        | *          | 完整工具集                    |
 */
type ToolCapabilityKey = `${TaskType}:${WorkflowMode}` | TaskType;

const TOOL_CAPABILITY_MATRIX: Record<ToolCapabilityKey, string[]> = {
  // chat_reply 任务默认只有只读能力
  'chat_reply:default': READ_ONLY_TOOLS,
  'chat_reply:planning': READ_ONLY_TOOLS,
  // chat_reply + build 模式允许完整工具集（用户明确要求构建时）
  'chat_reply:build': ALL_TOOLS,
  // chat_reply 默认（无工作流模式时）只有只读能力
  'chat_reply': READ_ONLY_TOOLS,
  
  // build_site 任务始终有完整工具能力
  'build_site:default': ALL_TOOLS,
  'build_site:planning': ALL_TOOLS,
  'build_site:build': ALL_TOOLS,
  'build_site': ALL_TOOLS,
  
  // refactor_code 任务始终有完整工具能力
  'refactor_code:default': ALL_TOOLS,
  'refactor_code:planning': ALL_TOOLS,
  'refactor_code:build': ALL_TOOLS,
  'refactor_code': ALL_TOOLS,
  
  // debug 任务始终有完整工具能力
  'debug:default': ALL_TOOLS,
  'debug:planning': ALL_TOOLS,
  'debug:build': ALL_TOOLS,
  'debug': ALL_TOOLS,
};

/**
 * 获取指定任务类型和工作流模式下允许使用的工具名称列表
 * @param taskType 任务类型
 * @param workflowMode 工作流模式（可选）
 * @returns 允许使用的工具名称数组
 */
export function getAllowedToolNames(taskType: TaskType, workflowMode?: WorkflowMode): string[] {
  // 优先使用精确匹配 (taskType:workflowMode)
  if (workflowMode) {
    const key = `${taskType}:${workflowMode}` as ToolCapabilityKey;
    if (TOOL_CAPABILITY_MATRIX[key]) {
      console.log(`[ToolCapability] 使用精确匹配: ${key} -> ${TOOL_CAPABILITY_MATRIX[key].join(', ')}`);
      return TOOL_CAPABILITY_MATRIX[key];
    }
  }
  
  // 回退到任务类型默认值
  const defaultKey = taskType as ToolCapabilityKey;
  if (TOOL_CAPABILITY_MATRIX[defaultKey]) {
    console.log(`[ToolCapability] 使用默认匹配: ${defaultKey} -> ${TOOL_CAPABILITY_MATRIX[defaultKey].join(', ')}`);
    return TOOL_CAPABILITY_MATRIX[defaultKey];
  }
  
  // 最终回退：返回只读工具（最安全的选择）
  console.log(`[ToolCapability] 未找到匹配，回退到只读工具`);
  return READ_ONLY_TOOLS;
}

/**
 * 根据任务类型和工作流模式过滤工具定义列表
 * @deprecated 使用 getFilteredToolsByMode 替代
 * @param taskType 任务类型
 * @param workflowMode 工作流模式（可选）
 * @returns 过滤后的工具定义数组
 */
export function getFilteredTools(taskType: TaskType, workflowMode?: WorkflowMode): ToolDefinition[] {
  const allowedNames = getAllowedToolNames(taskType, workflowMode);
  const filtered = TOOLS.filter(tool => allowedNames.includes(tool.function.name));
  console.log(`[ToolCapability] 任务类型: ${taskType}, 工作流模式: ${workflowMode || 'none'}, 过滤后工具数: ${filtered.length}/${TOOLS.length}`);
  return filtered;
}

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
      description: '在项目文件中搜索包含指定关键词的内容。用于定位相关代码。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '要搜索的关键词'
          },
          file_extension: {
            type: 'string',
            description: '限制搜索的文件扩展名，如 .ts, .html 等（可选）'
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
      description: '获取完整的项目文件树结构。用于全局了解项目组成。',
      parameters: {
        type: 'object',
        properties: {},
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
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description: '创建一个子代理来执行特定任务。子代理可以执行代码重构等专门任务。注意：最多只能嵌套 1 层，子代理不能再创建子代理。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '子代理类型。可用类型: refactor_code (代码重构)',
            enum: ['refactor_code']
          },
          instruction: {
            type: 'string',
            description: '给子代理的具体指令，描述需要执行的任务'
          },
          target_files: {
            type: 'string',
            description: '目标文件路径列表，用逗号分隔（可选）。例如: "src/App.tsx,src/utils/helper.ts"'
          }
        },
        required: ['type', 'instruction']
      }
    }
  }
];
