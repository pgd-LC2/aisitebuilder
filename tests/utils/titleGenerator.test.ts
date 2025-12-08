import { describe, it, expect, test } from 'vitest';
import { generateTitle } from '../../src/utils/titleGenerator';

describe('generateTitle 函数', () => {
  describe('基础功能', () => {
    it('空描述返回默认标题', () => {
      expect(generateTitle('   ')).toBe('未命名项目');
    });

    it('空字符串返回默认标题', () => {
      expect(generateTitle('')).toBe('未命名项目');
    });
  });

  describe('关键词提取', () => {
    it('会忽略停用词并拼接关键词', () => {
      const title = generateTitle('我要 一个 智能 任务管理 工具');
      expect(title).toBe('工具智能任务管理');
    });

    it('当缺少项目类型时会追加合适的后缀', () => {
      const title = generateTitle('打造智能健身APP');
      expect(title).toBe('打造智能健身APP应用');
    });
  });

  describe('边界情况', () => {
    it('超长标题会被截断到 30 个字符', () => {
      const longDescription = '超长描述'.repeat(6);
      const title = generateTitle(longDescription);
      expect(title.length).toBeLessThanOrEqual(30);
    });

    it('处理特殊字符', () => {
      const title = generateTitle('创建一个【电商】平台，用于销售商品！');
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
    });
  });

  describe('参数化测试 - 项目类型后缀', () => {
    const cases = [
      { input: '创建一个网站', expected: '网站' },
      { input: '开发一个应用', expected: '应用' },
      { input: '搭建一个平台', expected: '平台' },
      { input: '构建一个系统', expected: '系统' },
      { input: '制作一个游戏', expected: '游戏' },
    ];

    test.each(cases)('$input 应包含 $expected', ({ input, expected }) => {
      const title = generateTitle(input);
      expect(title).toContain(expected);
    });
  });
});
