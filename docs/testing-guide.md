# 单元测试指南

本文档介绍如何在 AI Site Builder 项目中使用 Vitest 进行单元测试。

## 快速开始

### 运行测试

```bash
npm run test           # 运行所有测试（单次）
npm run test:watch     # 监听模式（文件变化时自动重跑）
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run test:ui        # 启动 Vitest UI 界面
```

### 测试文件位置

测试文件放置在 `tests/` 目录下，按照与 `src/` 相同的目录结构组织：

```
tests/
├── setup.ts                    # 测试环境配置
├── utils/
│   └── titleGenerator.test.ts  # src/utils/titleGenerator.ts 的测试
└── components/                 # 组件测试（如需要）
```

## 编写测试

### BDD 风格结构

使用 `describe`、`it`、`test` 组织测试，遵循行为驱动开发（BDD）风格：

```typescript
import { describe, it, expect } from 'vitest';

describe('模块名称', () => {
  describe('功能分组', () => {
    it('应该完成某个行为', () => {
      // 测试代码
    });
  });
});
```

### AAA 模式

每个测试用例遵循 Arrange-Act-Assert 模式：

```typescript
it('计算两数之和', () => {
  // Arrange（准备）
  const a = 1;
  const b = 2;

  // Act（执行）
  const result = add(a, b);

  // Assert（断言）
  expect(result).toBe(3);
});
```

### 参数化测试

使用 `test.each` 进行数据驱动测试，覆盖多种输入情况：

```typescript
const cases = [
  { input: 0, expected: 0 },
  { input: 100, expected: 10 },
  { input: -50, expected: -5 },
];

test.each(cases)('calculateTax($input) -> $expected', ({ input, expected }) => {
  expect(calculateTax(input)).toBe(expected);
});
```

## 常用断言

```typescript
expect(value).toBe(expected);              // 严格相等
expect(value).toEqual(expected);           // 深度相等
expect(value).toBeTruthy();                // 真值
expect(value).toBeFalsy();                 // 假值
expect(value).toBeNull();                  // null
expect(value).toBeUndefined();             // undefined
expect(value).toContain(item);             // 包含
expect(value).toHaveLength(length);        // 长度
expect(value).toBeGreaterThan(number);     // 大于
expect(value).toBeLessThanOrEqual(number); // 小于等于
expect(fn).toThrow();                      // 抛出异常
expect(fn).toThrow('error message');       // 抛出特定异常
```

## Mock 与 Spy

### 模拟函数

```typescript
import { vi } from 'vitest';

const mockFn = vi.fn();
mockFn.mockReturnValue(42);
mockFn.mockResolvedValue(Promise.resolve('data'));

expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenCalledTimes(2);
```

### 监听函数

```typescript
const spy = vi.spyOn(object, 'method');
spy.mockImplementation(() => 'mocked');

// 测试后恢复
spy.mockRestore();
```

### 模拟模块

```typescript
vi.mock('../src/services/api', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: 'mocked' }),
}));
```

## 测试 React 组件

使用 `@testing-library/react` 测试组件：

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from '../src/components/MyComponent';

describe('MyComponent', () => {
  it('渲染正确的文本', () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('点击按钮触发事件', async () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

## 覆盖率要求

项目配置了以下覆盖率阈值（在 `vitest.config.ts` 中定义）：

| 指标 | 阈值 |
|------|------|
| 分支覆盖率 (Branches) | 80% |
| 函数覆盖率 (Functions) | 80% |
| 行覆盖率 (Lines) | 80% |
| 语句覆盖率 (Statements) | 80% |

运行 `npm run test:coverage` 查看详细覆盖率报告。

## 最佳实践

1. **测试行为而非实现**：关注函数的输入输出，而非内部实现细节
2. **保持测试独立**：每个测试用例应该独立运行，不依赖其他测试的状态
3. **使用有意义的描述**：测试描述应清晰表达被测试的行为
4. **覆盖边界情况**：空值、极大值、极小值、特殊字符等
5. **避免测试私有方法**：只测试公开的 API
6. **及时清理**：使用 `afterEach` 清理测试产生的副作用

## 调试测试

```bash
# 运行单个测试文件
npx vitest run tests/utils/titleGenerator.test.ts

# 运行匹配特定名称的测试
npx vitest run -t "空描述返回默认标题"

# 调试模式
npx vitest --inspect-brk
```

## 配置文件

测试配置位于 `vitest.config.ts`，主要配置项：

- `environment: 'jsdom'`：使用 jsdom 模拟浏览器环境
- `setupFiles`：测试前执行的设置文件
- `coverage`：覆盖率相关配置
- `include/exclude`：测试文件匹配规则
