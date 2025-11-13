import { generateTitle } from '../src/utils/titleGenerator.js';

type TestCase = {
  name: string;
  run: () => void;
};

const cases: TestCase[] = [];

function test(name: string, run: () => void) {
  cases.push({ name, run });
}

function expectEqual(actual: string, expected: string, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `期望值 "${expected}", 实际为 "${actual}"`);
  }
}

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

test('空描述返回默认标题', () => {
  expectEqual(generateTitle('   '), '未命名项目');
});

test('会忽略停用词并拼接关键词', () => {
  const title = generateTitle('我要 一个 智能 任务管理 工具');
  expectEqual(title, '工具智能任务管理');
});

test('当缺少项目类型时会追加合适的后缀', () => {
  const title = generateTitle('打造智能健身APP');
  expectEqual(title, '打造智能健身APP应用');
});

test('超长标题会被截断到 30 个字符', () => {
  const longDescription = '超长描述'.repeat(6);
  const title = generateTitle(longDescription);
  expect(title.length <= 30, '生成的标题长度应该被限制在 30 个字符以内');
});

let failed = 0;

cases.forEach(({ name, run }) => {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}`);
    console.error(`  ${message}`);
  }
});

if (failed > 0) {
  throw new Error(`共有 ${failed} 个测试未通过`);
} else {
  console.log(`所有 ${cases.length} 个测试均已通过`);
}
