const stopWords = new Set([
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '着', '之', '等', '于', '在',
  '我', '你', '他', '她', '它', '们', '要', '想', '会', '能', '可以', '给', '让',
  '一个', '这个', '那个', '什么', '怎么', '为什么', '哪里', '谁', '多少',
  '请', '帮', '我想', '我要', '帮我', '给我', '需要', '希望'
]);

const keywordWeights: Record<string, number> = {
  '网站': 2,
  '应用': 2,
  '平台': 2,
  '系统': 2,
  '工具': 2,
  '游戏': 2,
  '管理': 1.5,
  '商城': 1.5,
  '电商': 1.5,
  '社交': 1.5,
  '博客': 1.5,
  '论坛': 1.5,
  '在线': 1.5,
  '企业': 1.3,
  '个人': 1.3,
  '课程': 1.3,
  '作品': 1.3
};

function extractKeywords(text: string): string[] {
  const normalized = text
    .replace(/[，。！？；：""''（）【】《》、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ').filter(word => word.length > 0);

  const keywords: { word: string; weight: number }[] = [];

  for (const word of words) {
    if (stopWords.has(word) || word.length < 2) {
      continue;
    }

    const weight = keywordWeights[word] || 1;
    keywords.push({ word, weight });
  }

  keywords.sort((a, b) => {
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    return words.indexOf(a.word) - words.indexOf(b.word);
  });

  return keywords.slice(0, 5).map(k => k.word);
}

export function generateTitle(description: string): string {
  if (!description || description.trim().length === 0) {
    return '未命名项目';
  }

  const keywords = extractKeywords(description);

  if (keywords.length === 0) {
    const truncated = description.trim().slice(0, 20);
    return truncated.length < description.trim().length ? `${truncated}...` : truncated;
  }

  let title = keywords.join('');

  const projectKeywords = ['网站', '应用', '平台', '系统', '工具', '游戏'];
  const hasProjectKeyword = keywords.some(k => projectKeywords.includes(k));

  if (!hasProjectKeyword && keywords.length > 0) {
    if (description.includes('网站')) {
      title += '网站';
    } else if (description.includes('应用') || description.includes('APP')) {
      title += '应用';
    } else if (description.includes('平台')) {
      title += '平台';
    } else if (description.includes('系统')) {
      title += '系统';
    } else if (description.includes('游戏')) {
      title += '游戏';
    }
  }

  if (title.length > 30) {
    title = title.slice(0, 30);
  }

  return title || '未命名项目';
}
