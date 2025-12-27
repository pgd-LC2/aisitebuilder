import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface CodeViewerProps {
  code: string;
  language: string;
  filename: string;
  onClose: () => void;
}

export default function CodeViewer({ code, language, filename, onClose }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<string>('');

  useEffect(() => {
    const loadPrism = async () => {
      if (!(window as any).Prism) {
        const prismCSS = document.createElement('link');
        prismCSS.rel = 'stylesheet';
        prismCSS.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
        document.head.appendChild(prismCSS);

        const prismScript = document.createElement('script');
        prismScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
        document.head.appendChild(prismScript);

        await new Promise((resolve) => {
          prismScript.onload = resolve;
        });

        const languages = ['javascript', 'typescript', 'jsx', 'tsx', 'css', 'html', 'json', 'python', 'java', 'go', 'rust'];
        for (const lang of languages) {
          const script = document.createElement('script');
          script.src = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js`;
          document.head.appendChild(script);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if ((window as any).Prism) {
        const highlighted = (window as any).Prism.highlight(
          code,
          (window as any).Prism.languages[language] || (window as any).Prism.languages.plaintext,
          language
        );
        setHighlightedCode(highlighted);
      } else {
        setHighlightedCode(code);
      }
    };

    loadPrism();
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLanguageDisplay = () => {
    const langMap: Record<string, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      jsx: 'JSX',
      tsx: 'TSX',
      css: 'CSS',
      html: 'HTML',
      json: 'JSON',
      python: 'Python',
      java: 'Java',
      go: 'Go',
      rust: 'Rust',
      markdown: 'Markdown',
    };
    return langMap[language] || language.toUpperCase();
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base truncate">
                {filename}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {getLanguageDisplay()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {code.split('\n').length} 行
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-600" />
                    <span className="text-green-600">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    <span>复制代码</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-gray-900">
          <pre className="!m-0 !bg-transparent p-4">
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode || code }}
            />
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
