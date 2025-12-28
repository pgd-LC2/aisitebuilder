import { X, GitBranch, RotateCcw, Trash2, Clock, ChevronRight, Folder, FileText, Plus, Code } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { ProjectVersion, ProjectFile } from '../../types/project';
import { versionService } from '../../services/versionService';
import { fileService } from '../../services/fileService';
import CodeViewer from './CodeViewer';
import { Button } from '@/components/ui/button';

interface VersionManagerProps {
  projectId: string;
  currentVersionId?: string;
  onClose: () => void;
  onVersionRestore?: (version: ProjectVersion) => void;
  onVersionChange?: () => void;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  file?: ProjectFile;
}

const extractRelativePath = (file: ProjectFile) => {
  const source = (file.file_path || file.file_name || '').split('/').filter(Boolean);
  if (source.length > 2) {
    return source.slice(2).join('/');
  }
  return source[source.length - 1] || file.file_name;
};

const buildFileTree = (files: ProjectFile[]): FileNode => {
  const root: FileNode = {
    name: 'root',
    path: '',
    type: 'folder',
    children: []
  };

  const folderMap = new Map<string, FileNode>();
  folderMap.set('', root);

  const ensureFolder = (parent: FileNode, folderName: string, fullPath: string) => {
    let folder = folderMap.get(fullPath);
    if (!folder) {
      folder = {
        name: folderName,
        path: fullPath,
        type: 'folder',
        children: []
      };
      parent.children?.push(folder);
      folderMap.set(fullPath, folder);
    }
    return folder;
  };

  files.forEach(file => {
    const relativePath = extractRelativePath(file);
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) return;

    let currentPath = '';
    let currentNode = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;

      if (isFile) {
        const alreadyExists = currentNode.children?.some(
          child => child.type === 'file' && child.path === relativePath
        );
        if (!alreadyExists) {
          currentNode.children?.push({
            name: part,
            path: relativePath,
            type: 'file',
            file
          });
        }
        return;
      }

      currentPath = currentPath ? `${currentPath}/${part}` : part;
      currentNode = ensureFolder(currentNode, part, currentPath);
    });
  });

  const sortTree = (node: FileNode) => {
    if (!node.children) return;
    node.children.forEach(sortTree);
    node.children.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      return a.type === 'folder' ? -1 : 1;
    });
  };

  sortTree(root);
  return root;
};

export default function VersionManager({
  projectId,
  currentVersionId,
  onClose,
  onVersionRestore,
  onVersionChange
}: VersionManagerProps) {
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<ProjectVersion | null>(null);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [viewingCode, setViewingCode] = useState<{ code: string; language: string; filename: string } | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await versionService.getVersionsByProjectId(projectId);
    if (!error && data) {
      setVersions(data);
      if (data.length > 0 && !selectedVersion) {
        setSelectedVersion(data[0]);
      }
    }
    setLoading(false);
  }, [projectId, selectedVersion]);

  const loadVersionFiles = useCallback(async (versionId: string) => {
    setLoadingFiles(true);
    const { data: files } = await fileService.getFilesByProject(projectId, versionId);

    if (files && files.length > 0) {
      const tree = buildFileTree(files);
      setFileTree(tree);
    } else {
      setFileTree(null);
    }
    setLoadingFiles(false);
  }, [projectId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    if (selectedVersion) {
      loadVersionFiles(selectedVersion.id);
    }
  }, [selectedVersion, loadVersionFiles]);

const findCodeInSnapshot = (
  snapshot: Record<string, any> | undefined,
  file: ProjectFile
): string | null => {
  if (!snapshot) return null;

  const relativePath = extractRelativePath(file);
  const candidates = [
    relativePath,
    file.file_name,
    file.file_path,
    relativePath.startsWith('./') ? relativePath.slice(2) : `./${relativePath}`,
    relativePath.replace(/^\/+/, '')
  ].filter(Boolean);

  for (const key of candidates) {
    if (!key) continue;
    const code = snapshot[key];
    if (code) {
      return typeof code === 'string' ? code : JSON.stringify(code, null, 2);
    }
  }

  return null;
};

  const getCurrentFolder = (): FileNode => {
    if (!fileTree) return { name: 'root', path: '', type: 'folder', children: [] };

    let current = fileTree;
    for (const pathPart of currentPath) {
      const found = current.children?.find(c => c.name === pathPart && c.type === 'folder');
      if (found) current = found;
    }
    return current;
  };

  const handleFolderClick = (folderName: string) => {
    setCurrentPath([...currentPath, folderName]);
    setSelectedFile(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    setCurrentPath(currentPath.slice(0, index));
    setSelectedFile(null);
  };

  const handleFileClick = (file: ProjectFile) => {
    setSelectedFile(file);
  };

  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'css': 'css',
      'html': 'html',
      'json': 'json',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'md': 'markdown',
    };
    return langMap[ext || ''] || 'plaintext';
  };

  const handleViewCode = (file: ProjectFile) => {
    const code = findCodeInSnapshot(selectedVersion?.code_snapshot, file);
    if (code) {
      setViewingCode({
        code,
        language: getLanguageFromFilename(file.file_name),
        filename: extractRelativePath(file)
      });
    } else {
      alert('未找到该文件的代码快照，请确认版本是否包含代码内容');
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedVersion) return;

    const description = prompt('请输入新版本的描述（可选）:');
    if (description === null) return;

    const newVersionNumber = Math.max(...versions.map(v => v.version_number)) + 1;

    const { data, error } = await versionService.createVersion(
      projectId,
      newVersionNumber,
      selectedVersion.code_snapshot,
      selectedVersion.preview_url,
      selectedVersion.id
    );

      if (!error && data) {
        alert(`成功创建版本 v${newVersionNumber}`);
        await loadVersions();
        setSelectedVersion(data);
        onVersionChange?.();
      } else {
        alert('创建版本失败，请重试');
      }
  };

  const handleRestore = async (version: ProjectVersion) => {
    if (confirm(`确定要回退到版本 v${version.version_number} 吗？这将创建一个新版本。`)) {
      const newVersionNumber = Math.max(...versions.map(v => v.version_number)) + 1;

      const { data, error } = await versionService.createVersion(
        projectId,
        newVersionNumber,
        version.code_snapshot,
        version.preview_url,
        version.id
      );

      if (!error && data) {
        alert(`成功回退到版本 v${version.version_number}，新版本号为 v${newVersionNumber}`);
        await loadVersions();
        onVersionRestore?.(data);
        onVersionChange?.();
      } else {
        alert('回退失败，请重试');
      }
    }
  };

  const handleDelete = async (version: ProjectVersion) => {
    if (versions.length <= 1) {
      alert('无法删除最后一个版本');
      return;
    }

    if (confirm(`确定要删除版本 v${version.version_number} 吗？此操作不可撤销。`)) {
      const { error } = await versionService.deleteVersion(version.id);
      if (!error) {
        alert('版本已删除');
        await loadVersions();
        if (selectedVersion?.id === version.id) {
          setSelectedVersion(versions[0]);
        }
        onVersionChange?.();
      } else {
        alert('删除失败，请重试');
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-background rounded-xl p-6 max-w-4xl w-full max-h-[80vh] flex items-center justify-center shadow-2xl">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
          <p className="text-sm text-muted-foreground">加载版本历史...</p>
        </div>
      </div>
    );
  }

  const currentFolder = getCurrentFolder();

  return (
    <div className="relative">
      {viewingCode && (
        <CodeViewer
          code={viewingCode.code}
          language={viewingCode.language}
          filename={viewingCode.filename}
          onClose={() => setViewingCode(null)}
        />
      )}
      <div className="bg-background rounded-xl max-w-6xl w-full max-h-[85vh] flex flex-col shadow-xl md:min-w-[1200px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">版本管理</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                共 {versions.length} 个版本
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleCreateVersion}>
              <Plus className="w-4 h-4 mr-2" />
              创建新版本
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="w-64 border-r border-border overflow-y-auto bg-muted">
            <div className="p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-2">
                版本列表
              </p>
              <div className="space-y-1">
                {versions.map((version) => {
                  const isSelected = selectedVersion?.id === version.id;
                  const isCurrent = version.id === currentVersionId;

                  return (
                    <motion.div
                      key={version.id}
                      onClick={() => {
                        setSelectedVersion(version);
                        setCurrentPath([]);
                        setSelectedFile(null);
                      }}
                      className={`
                        relative p-3 rounded-lg cursor-pointer transition-all
                        ${isSelected
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'bg-background border border-border hover:border-primary/50'
                        }
                      `}
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`
                          text-sm font-semibold
                          ${isSelected ? 'text-primary' : 'text-foreground'}
                        `}>
                          v{version.version_number}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 bg-success/10 text-success text-[10px] font-medium rounded-full">
                            当前
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDate(version.created_at)}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedVersion && (
              <>
                <div className="px-6 py-4 border-b border-border bg-muted">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-foreground">
                      版本 v{selectedVersion.version_number}
                    </h3>
                    {selectedVersion.id === currentVersionId && (
                      <span className="px-3 py-1 bg-success/10 text-success text-xs font-medium rounded-full">
                        当前版本
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <Clock className="w-4 h-4" />
                    {formatDate(selectedVersion.created_at)}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedVersion.id !== currentVersionId && (
                      <Button
                        size="sm"
                        onClick={() => handleRestore(selectedVersion)}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        回退到此版本
                      </Button>
                    )}

                    {versions.length > 1 && selectedVersion.id !== currentVersionId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/50 hover:bg-destructive/10"
                        onClick={() => handleDelete(selectedVersion)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        删除版本
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden p-6">
                  {loadingFiles ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                        <p className="text-sm text-muted-foreground">加载文件列表...</p>
                      </div>
                    </div>
                  ) : fileTree && fileTree.children && fileTree.children.length > 0 ? (
                    <div className="h-full w-full flex gap-6">
                      <div className="flex-1 flex flex-col overflow-hidden bg-background border border-border rounded-xl">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-4 py-3 border-b border-border">
                          <button
                            onClick={() => setCurrentPath([])}
                            className="hover:text-primary transition-colors"
                          >
                            根目录
                          </button>
                          {currentPath.map((part, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <ChevronRight className="w-4 h-4" />
                              <button
                                onClick={() => handleBreadcrumbClick(index + 1)}
                                className="hover:text-primary transition-colors"
                              >
                                {part}
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-border">
                          {currentFolder.children?.map((node) => (
                            <div
                              key={node.path}
                              onClick={() => node.type === 'folder' ? handleFolderClick(node.name) : handleFileClick(node.file!)}
                              className={`
                                flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                                ${selectedFile?.id === node.file?.id ? 'bg-primary/10' : 'hover:bg-muted'}
                              `}
                            >
                              {node.type === 'folder' ? (
                                <>
                                  <Folder className="w-5 h-5 text-primary" />
                                  <span className="text-sm font-medium text-foreground">{node.name}</span>
                                </>
                              ) : (
                                <>
                                  <FileText className="w-5 h-5 text-muted-foreground" />
                                  <span className="text-sm text-foreground">{node.name}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {fileService.formatFileSize(node.file?.file_size || 0)}
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="w-80 flex-shrink-0">
                        {selectedFile ? (
                          <div className="bg-muted border border-border rounded-xl p-4 h-full flex flex-col">
                            <div className="mb-3">
                              <h4 className="text-sm font-semibold text-foreground">{selectedFile.file_name}</h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {fileService.formatFileSize(selectedFile.file_size)} · {selectedFile.mime_type}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-2">
                              <p>
                                路径:{' '}
                                <code className="bg-background px-2 py-1 rounded break-all block">
                                  {selectedFile.file_path}
                                </code>
                              </p>
                            </div>
                            {selectedFile.file_category === 'code' && selectedVersion?.code_snapshot && (
                              <Button
                                className="mt-auto w-full"
                                onClick={() => handleViewCode(selectedFile)}
                              >
                                <Code className="w-4 h-4 mr-2" />
                                查看代码
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="h-full border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground text-sm">
                            <FileText className="w-10 h-10 mb-3 text-muted-foreground/50" />
                            选择一个文件以查看详情
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">该版本没有文件</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
