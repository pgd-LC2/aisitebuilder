import { useEffect, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {filename}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {getLanguageDisplay()} · {code.split('\n').length} 行
            </p>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>复制代码</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-900">
          <pre className="!m-0 !bg-transparent">
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode || code }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
}
