import { generateViteReactTemplate } from '../templates/viteReactTemplate';
import { fileService } from './fileService';
import { versionService } from './versionService';
import { buildLogService } from './buildLogService';

export const templateService = {
  async initializeProjectWithTemplate(
    projectId: string,
    projectTitle: string,
    projectDescription: string
  ): Promise<{ success: boolean; error?: any; versionId?: string }> {
    try {
      await buildLogService.addBuildLog(projectId, 'info', '开始初始化项目文件...');

      const template = generateViteReactTemplate(projectTitle, projectDescription);

      await buildLogService.addBuildLog(
        projectId,
        'info',
        `使用模板: ${template.name} (${template.files.length} 个文件)`
      );

      const { data: version, error: versionError } = await versionService.createVersion(
        projectId,
        1,
        {}
      );

      if (versionError || !version) {
        await buildLogService.addBuildLog(projectId, 'error', '创建项目版本失败');
        return { success: false, error: versionError };
      }

      await buildLogService.addBuildLog(projectId, 'success', `创建版本 v${version.version_number}`);

      const uploadedFiles = [];
      let successCount = 0;
      let errorCount = 0;

      for (const templateFile of template.files) {
        try {
          const blob = new Blob([templateFile.content], { type: templateFile.mimeType });
          const file = new File([blob], templateFile.path.split('/').pop() || templateFile.path, {
            type: templateFile.mimeType
          });

          const folderPath = templateFile.path.includes('/')
            ? templateFile.path.substring(0, templateFile.path.lastIndexOf('/') + 1)
            : '';

          const { data: uploadedFile, error: uploadError } = await fileService.uploadFile(
            projectId,
            version.id,
            file,
            templateFile.category,
            'ai_generated',
            folderPath
          );

          if (uploadError) {
            errorCount++;
            await buildLogService.addBuildLog(
              projectId,
              'error',
              `上传文件失败: ${templateFile.path}`
            );
          } else if (uploadedFile) {
            successCount++;
            uploadedFiles.push(uploadedFile);

            if (successCount % 3 === 0 || successCount === template.files.length) {
              await buildLogService.addBuildLog(
                projectId,
                'info',
                `已上传 ${successCount}/${template.files.length} 个文件`
              );
            }
          }
        } catch (err) {
          errorCount++;
          console.error(`上传文件出错 ${templateFile.path}:`, err);
          await buildLogService.addBuildLog(
            projectId,
            'error',
            `上传文件出错: ${templateFile.path}`
          );
        }
      }

      if (errorCount > 0) {
        await buildLogService.addBuildLog(
          projectId,
          'error',
          `文件初始化完成，但有 ${errorCount} 个文件失败`
        );
      }

      if (successCount > 0) {
        await buildLogService.addBuildLog(
          projectId,
          'success',
          `成功初始化 ${successCount} 个文件`
        );

        const codeSnapshot: Record<string, any> = {};
        template.files.forEach(file => {
          codeSnapshot[file.path] = file.content;
        });

        await versionService.updateVersion(version.id, {
          code_snapshot: codeSnapshot,
          storage_path: `${projectId}/v${version.version_number}`
        });

        await buildLogService.addBuildLog(projectId, 'success', '项目初始化完成');
        return { success: true, versionId: version.id };
      } else {
        await buildLogService.addBuildLog(projectId, 'error', '没有文件成功上传');
        return { success: false, error: '文件上传失败' };
      }
    } catch (err) {
      console.error('初始化项目模板出错:', err);
      await buildLogService.addBuildLog(projectId, 'error', `初始化失败: ${err}`);
      return { success: false, error: err };
    }
  },

  async getTemplateFileTree(projectTitle: string, projectDescription: string) {
    const template = generateViteReactTemplate(projectTitle, projectDescription);

    const tree: Record<string, any> = {};

    template.files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current[part] = {
            type: 'file',
            content: file.content,
            mimeType: file.mimeType,
            category: file.category
          };
        } else {
          if (!current[part]) {
            current[part] = { type: 'folder', children: {} };
          }
          current = current[part].children;
        }
      });
    });

    return tree;
  }
};
