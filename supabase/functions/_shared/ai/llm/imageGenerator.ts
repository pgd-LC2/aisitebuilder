/**
 * 图片生成模块
 * 负责调用 OpenRouter API 生成图片并保存到 Storage
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { IMAGE_MODEL, OPENROUTER_API_URL, OPENROUTER_REFERER, OPENROUTER_TITLE } from '../config.ts';

// 生成图片
export async function generateImage(
  prompt: string,
  apiKey: string,
  aspectRatio = '1:1'
): Promise<string> {
  const requestBody = {
    model: IMAGE_MODEL,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    modalities: ['image', 'text'],
    image_config: {
      aspect_ratio: aspectRatio
    }
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`图片生成API错误: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const message = data.choices[0].message;
  
  if (message.images && message.images.length > 0) {
    const imageUrl = message.images[0].image_url.url;
    return imageUrl;
  }
  
  throw new Error('未能生成图片');
}

// 保存图片到 Storage
export async function saveImageToStorage(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  versionId: string,
  imageDataUrl: string,
  fileName: string
): Promise<string> {
  const base64Data = imageDataUrl.split(',')[1];
  const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  
  const bucket = 'project-files';
  const path = `${projectId}/${versionId}/${fileName}`;
  
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: 'image/png',
      upsert: true
    });
  
  if (error) {
    throw new Error(`保存图片失败: ${error.message}`);
  }
  
  const { error: dbError } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      version_id: versionId,
      file_name: fileName,
      file_path: path,
      file_size: buffer.length,
      mime_type: 'image/png',
      file_category: 'asset',
      source_type: 'ai_generated',
      is_public: false
    })
    .select()
    .maybeSingle();
  
  if (dbError) {
    console.error('保存文件记录失败:', dbError);
  }
  
  return path;
}
