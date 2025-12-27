import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Upload, FilePlus, X, Download, Trash2, Search } from 'lucide-react';
import { ProjectFile, FileUploadProgress, FileCategory, FileTreeNode } from '../../types/project';
import { fileService } from '../../services/fileService';
import { FileUploader } from '../common';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const TEXTUAL_MIME_PREFIXES = ['text/', 'application/json', 'application/javascript', 'application/typescript', 'application/xml'];
const TEXTUAL_MIME_SUFFIXES = ['+json', '+xml'];

const isImageFile = (file: ProjectFile | null) => {
  if (!file) return false;
  if (file.mime_type && file.mime_type.startsWith('image/')) return true;
  const name = file.file_name.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(name);
};

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  html: 'markup',
  htm: 'markup',
  svg: 'markup',
  xml: 'markup',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  env: 'bash',
  sh: 'bash',
  bash: 'bash',
  txt: 'plaintext',
  conf: 'bash',
  ini: 'ini'
};

const isTextLikeFile = (file: ProjectFile | null) => {
  if (!file) return false;
  if (!file.mime_type) return true;
  return (
    TEXTUAL_MIME_PREFIXES.some(prefix => file.mime_type.startsWith(prefix)) ||
    TEXTUAL_MIME_SUFFIXES.some(suffix => file.mime_type.endsWith(suffix))
  );
};

const getSyntaxLanguage = (file: ProjectFile | null) => {
  if (!file) return null;
  const parts = file.file_name.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : undefined;
  if (!ext) return null;
  return LANGUAGE_EXTENSION_MAP[ext] || null;
};

interface FileManagerPanelProps {
  projectId: string;
  versionId?: string;
}

export default function FileManagerPanel({ projectId, versionId }: FileManagerPanelProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [showUploader, setShowUploader] = useState(false);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const term = searchQuery.toLowerCase();
    return files.filter(file => file.file_name.toLowerCase().includes(term)).slice(0, 8);
  }, [searchQuery, files]);
  const syntaxLanguage = useMemo(() => getSyntaxLanguage(selectedFile), [selectedFile]);
  const enableSyntaxHighlight = useMemo(
    () => Boolean(selectedFile && isTextLikeFile(selectedFile) && syntaxLanguage),
    [selectedFile, syntaxLanguage]
  );

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fileService.getFilesByProject(projectId, versionId);
    if (!error && data) {
      setFiles(data);
      // 使用函数式更新来检查是否需要设置默认选中文件
      // 这样可以避免将 selectedFile 加入依赖数组，防止选择文件时触发重新加载
      setSelectedFile(prev => {
        if (!prev && data.length > 0) {
          return data[0];
        }
        return prev;
      });
    }
    setLoading(false);
  }, [projectId, versionId]);

  const loadFileContent = useCallback(async (file: ProjectFile) => {
    setLoadingContent(true);
    setFileContent('');
    setFileUrl(null);
    setPreviewMessage(null);

    const { data, error } = await fileService.downloadFile(file.id);
    if (!error && data) {
      try {
        if (isImageFile(file)) {
          setFileUrl(data);
        } else if (isTextLikeFile(file)) {
          const response = await fetch(data);
          const text = await response.text();
          setFileContent(text);
        } else {
          setPreviewMessage('当前文件类型暂不支持在线预览，请下载后查看。');
        }
      } catch (err) {
        console.error('读取文件内容失败:', err);
        setPreviewMessage('无法读取文件内容');
      }
    } else if (error) {
      setPreviewMessage('文件下载失败');
    }
    setLoadingContent(false);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
    }
  }, [selectedFile, loadFileContent]);

  useEffect(() => {
    if (searchQuery) {
      const filteredFiles = files.filter(file =>
        file.file_name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (filteredFiles.length > 0) {
        const pathsToExpand = new Set<string>(['root']);
        filteredFiles.forEach(file => {
          const pathParts = file.file_path.split('/').filter(p => p);
          const relevantParts = pathParts.slice(2);
          for (let i = 0; i < relevantParts.length - 1; i++) {
            pathsToExpand.add(relevantParts.slice(0, i + 1).join('/'));
          }
        });
        setExpandedFolders(pathsToExpand);
      }
    }
  }, [searchQuery, files]);

  const buildFileTree = (): FileTreeNode => {
    const root: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'folder',
      children: []
    };

    const filteredFiles = searchQuery
      ? files.filter(file => file.file_name.toLowerCase().includes(searchQuery.toLowerCase()))
      : files;

    filteredFiles.forEach(file => {
      const pathParts = file.file_path.split('/').filter(p => p);
      const relevantParts = pathParts.slice(2);

      let currentNode = root;

      relevantParts.forEach((part, index) => {
        const isLastPart = index === relevantParts.length - 1;

        if (isLastPart) {
          currentNode.children?.push({
            name: part,
            path: file.file_path,
            type: 'file',
            size: file.file_size,
            mimeType: file.mime_type,
            file: file
          });
        } else {
          let folderNode = currentNode.children?.find(
            child => child.name === part && child.type === 'folder'
          );

          if (!folderNode) {
            folderNode = {
              name: part,
              path: relevantParts.slice(0, index + 1).join('/'),
              type: 'folder',
              children: []
            };
            currentNode.children?.push(folderNode);
          }

          currentNode = folderNode;
        }
      });
    });

    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'folder' ? -1 : 1;
      });
    };

    const sortTree = (node: FileTreeNode) => {
      if (node.children) {
        node.children = sortNodes(node.children);
        node.children.forEach(sortTree);
      }
    };

    sortTree(root);
    return root;
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const focusFile = useCallback((file: ProjectFile) => {
    const pathParts = file.file_path.split('/').filter(Boolean);
    if (pathParts.length > 2) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        const relativeParts = pathParts.slice(2, -1);
        let current = '';
        relativeParts.forEach(part => {
          current = current ? `${current}/${part}` : part;
          next.add(current);
        });
        return next;
      });
    }
    setSelectedFile(file);
  }, []);

  const renderTreeNode = (node: FileTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path || 'root');
    const isSelected = selectedFile?.id === node.file?.id;

    if (node.type === 'folder') {
      return (
        <motion.div key={node.path || 'root'} layout>
          {node.name !== 'root' && (
            <motion.div
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onClick={() => toggleFolder(node.path)}
              className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm ${
                depth === 0 ? '' : ''
              }`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
              )}
              <span className="text-gray-700 truncate">{node.name}</span>
            </motion.div>
          )}
          <AnimatePresence initial={false}>
            {isExpanded && node.children && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.8, 0.25, 1] }}
              >
                {node.children.map(child => renderTreeNode(child, depth + 1))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    return (
      <motion.div
        layout
        whileHover={{ x: 6 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        key={node.file?.id}
        onClick={() => node.file && focusFile(node.file)}
        className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm ${
          isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        <File className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
        <span className={`truncate ${isSelected ? 'font-medium' : ''}`}>{node.name}</span>
      </motion.div>
    );
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
    setUploading(true);
    const initialProgress: FileUploadProgress[] = selectedFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending'
    }));
    setUploadProgress(initialProgress);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      setUploadProgress(prev =>
        prev.map(p =>
          p.file.name === file.name
            ? { ...p, status: 'uploading', progress: 0 }
            : p
        )
      );

      const category: FileCategory = file.type.startsWith('image/') ? 'asset' :
                                     file.type.startsWith('video/') ? 'asset' :
                                     file.type.includes('javascript') || file.type.includes('html') || file.type.includes('css') ? 'code' :
                                     'document';

      const { data, error } = await fileService.uploadFile(
        projectId,
        versionId,
        file,
        category,
        'user_upload'
      );

      if (error) {
        setUploadProgress(prev =>
          prev.map(p =>
            p.file.name === file.name
              ? { ...p, status: 'error', error: '上传失败' }
              : p
          )
        );
      } else if (data) {
        setUploadProgress(prev =>
          prev.map(p =>
            p.file.name === file.name
              ? { ...p, status: 'success', progress: 100, result: data }
              : p
          )
        );
        setFiles(prev => [data, ...prev]);
      }
    }

    setTimeout(() => {
      setUploading(false);
      setUploadProgress([]);
      setShowUploader(false);
    }, 1500);
  };

  const handleCreateNewFile = async () => {
    if (!newFileName.trim()) {
      alert('请输入文件名');
      return;
    }

    setCreatingFile(true);

    const fileExtension = newFileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypeMap: Record<string, string> = {
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript',
      'jsx': 'text/javascript',
      'ts': 'text/typescript',
      'tsx': 'text/typescript',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain'
    };

    const mimeType = mimeTypeMap[fileExtension] || 'text/plain';
    const category: FileCategory = ['html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json'].includes(fileExtension)
      ? 'code'
      : 'document';

    const blob = new Blob([newFileContent], { type: mimeType });
    const file = new (File as any)([blob], newFileName, { type: mimeType }) as File;

    const { data, error } = await fileService.uploadFile(
      projectId,
      versionId,
      file,
      category,
      'ai_generated'
    );

    setCreatingFile(false);

    if (!error && data) {
      setFiles(prev => [data, ...prev]);
      setShowNewFileDialog(false);
      setNewFileName('');
      setNewFileContent('');
      setSelectedFile(data);
    } else {
      alert('文件创建失败');
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    if (!confirm(`确定要删除文件 "${selectedFile.file_name}" 吗？`)) {
      return;
    }

    const { error } = await fileService.deleteFile(selectedFile.id);
    if (!error) {
      setFiles(prev => prev.filter(f => f.id !== selectedFile.id));
      setSelectedFile(null);
      setFileContent('');
    } else {
      alert('删除文件失败');
    }
  };

  const handleDownloadFile = async () => {
    if (!selectedFile) return;

    const { data, error } = await fileService.downloadFile(selectedFile.id);
    if (!error && data) {
      window.open(data, '_blank');
    } else {
      alert('下载失败');
    }
  };

  const getBreadcrumb = () => {
    if (!selectedFile) return [];
    const pathParts = selectedFile.file_path.split('/').filter(p => p);
    return pathParts.slice(2);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
          <p className="text-sm text-gray-600">加载文件中...</p>
        </div>
      </div>
    );
  }

  const fileTree = buildFileTree();

  return (
    <div className="h-full flex bg-white">
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase">文件</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowUploader(!showUploader)}
              title="上传文件"
            >
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowNewFileDialog(true)}
              title="新建文件"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文件..."
              className="w-full pl-7 pr-7 h-7 text-xs"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-3 space-y-1">
              <AnimatePresence>
                {searchResults.length > 0 ? (
                  searchResults.map((file, index) => (
                    <motion.button
                      key={file.id}
                      onClick={() => focusFile(file)}
                      className="w-full text-left text-xs px-2 py-1 rounded-lg flex items-center gap-2 bg-white/80 hover:bg-blue-50 border border-gray-200"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.25, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <File className="w-3.5 h-3.5 text-blue-500" />
                      <span className="truncate">{file.file_name}</span>
                    </motion.button>
                  ))
                ) : (
                  <motion.div
                    className="text-[11px] text-gray-500 bg-white/70 border border-dashed border-gray-300 rounded px-2 py-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    未找到匹配文件
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {showUploader && (
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
            <FileUploader
              onFilesSelected={handleFilesSelected}
              uploading={uploading}
              uploadProgress={uploadProgress}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="p-4 text-center">
              <Folder className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-xs text-gray-500">暂无文件</p>
            </div>
          ) : fileTree.children && fileTree.children.length === 0 ? (
            <div className="p-4 text-center">
              <Search className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-xs text-gray-500">未找到匹配的文件</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700"
              >
                清除搜索
              </button>
            </div>
          ) : (
            <div className="py-1">
              {renderTreeNode(fileTree, 0)}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile ? (
          <>
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center text-xs text-gray-500">
                  {getBreadcrumb().map((part, index) => (
                    <div key={index} className="flex items-center">
                      {index > 0 && <ChevronRight className="w-3 h-3 mx-1" />}
                      <span className={index === getBreadcrumb().length - 1 ? 'text-gray-900 font-medium' : ''}>
                        {part}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDownloadFile}
                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  title="下载"
                >
                  <Download className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  onClick={handleDeleteFile}
                  className="p-1.5 hover:bg-red-50 rounded transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-white">
              {loadingContent ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mb-2"></div>
                    <p className="text-sm text-gray-600">加载中...</p>
                  </div>
                </div>
              ) : isImageFile(selectedFile) ? (
                <div className="flex items-center justify-center h-full bg-gray-50 p-4">
                  {fileUrl ? (
                    <img
                      src={fileUrl}
                      alt={selectedFile?.file_name || '图片预览'}
                      className="max-w-full max-h-full object-contain shadow-lg border border-gray-200 bg-white rounded"
                    />
                  ) : (
                    <p className="text-sm text-gray-500">无法加载图片预览</p>
                  )}
                </div>
              ) : previewMessage ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <File className="w-12 h-12 mx-auto mb-3 text-gray-400 opacity-50" />
                    <p className="text-sm text-gray-500">{previewMessage}</p>
                  </div>
                </div>
              ) : enableSyntaxHighlight ? (
                <SyntaxHighlighter
                  language={syntaxLanguage ?? undefined}
                  style={oneLight}
                  showLineNumbers
                  wrapLongLines
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    background: 'transparent',
                    minHeight: '100%',
                    fontSize: '0.875rem',
                    lineHeight: '1.5'
                  }}
                  lineNumberStyle={{ minWidth: '2.5rem', marginRight: '1rem', color: '#9ca3af' }}
                >
                  {fileContent || ' '}
                </SyntaxHighlighter>
              ) : (
                <pre className="p-4 text-sm font-mono leading-6 text-gray-800 whitespace-pre-wrap break-words">
                  {fileContent.split('\n').map((line, index) => (
                    <div key={index} className="flex">
                      <span className="inline-block w-12 text-right pr-4 text-gray-400 select-none flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="flex-1">{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <File className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">选择一个文件以查看内容</p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showNewFileDialog} onOpenChange={(open) => {
        if (!open && !creatingFile) {
          setShowNewFileDialog(false);
          setNewFileName('');
          setNewFileContent('');
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <FilePlus className="w-5 h-5 text-primary" />
              新建文件
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="filename">文件名</Label>
              <Input
                id="filename"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="例如: index.html, styles.css, script.js"
                disabled={creatingFile}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filecontent">文件内容（可选）</Label>
              <Textarea
                id="filecontent"
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                placeholder="在这里输入文件内容..."
                rows={12}
                className="font-mono text-sm"
                disabled={creatingFile}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFileDialog(false);
                setNewFileName('');
                setNewFileContent('');
              }}
              disabled={creatingFile}
            >
              取消
            </Button>
            <Button
              onClick={handleCreateNewFile}
              disabled={!newFileName.trim() || creatingFile}
            >
              {creatingFile ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  创建中...
                </>
              ) : (
                <>
                  <FilePlus className="w-4 h-4 mr-2" />
                  创建文件
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
