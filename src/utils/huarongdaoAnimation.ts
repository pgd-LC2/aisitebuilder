/**
 * 华融道拼图风格删除动画工具函数
 *
 * 实现类似华融道拼图的移动效果：当一个项目被删除时，
 * 剩余项目像棋子一样移动填补空位，最终整齐排列。
 */

/** 项目位置信息 */
export interface ItemPosition {
  id: string;
  rect: DOMRect;
}

/** 动画配置 */
export interface AnimationConfig {
  /** 基础动画持续时间（毫秒） */
  baseDuration: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 缓动函数 */
  easing: string;
  /** 是否启用随机路径效果 */
  enableRandomPath: boolean;
}

/** 默认动画配置 - 高端精致风格 */
export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  baseDuration: 500,
  maxDelay: 200,
  easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  enableRandomPath: true,
};

/**
 * 记录所有项目的当前位置
 * @param containerRef 容器元素引用
 * @param itemSelector 项目元素选择器
 * @returns 项目位置映射
 */
export function capturePositions(
  containerRef: HTMLElement | null,
  itemSelector: string = '[data-project-id]'
): Map<string, DOMRect> {
  const positions = new Map<string, DOMRect>();

  if (!containerRef) return positions;

  const items = containerRef.querySelectorAll(itemSelector);
  items.forEach((item) => {
    const id = item.getAttribute('data-project-id');
    if (id) {
      positions.set(id, item.getBoundingClientRect());
    }
  });

  return positions;
}

/**
 * 计算位置差异并生成动画样式
 * @param oldPositions 旧位置映射
 * @param newPositions 新位置映射
 * @param config 动画配置
 * @returns 动画样式映射
 */
export function calculateAnimationStyles(
  oldPositions: Map<string, DOMRect>,
  newPositions: Map<string, DOMRect>,
  config: AnimationConfig = DEFAULT_ANIMATION_CONFIG
): Map<string, { transform: string; transition: string }> {
  const styles = new Map<string, { transform: string; transition: string }>();
  const itemsToAnimate = Array.from(newPositions.keys());

  itemsToAnimate.forEach((id, index) => {
    const oldPos = oldPositions.get(id);
    const newPos = newPositions.get(id);

    if (oldPos && newPos) {
      const deltaX = oldPos.left - newPos.left;
      const deltaY = oldPos.top - newPos.top;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        const delay = config.enableRandomPath
          ? Math.random() * config.maxDelay
          : (index / itemsToAnimate.length) * config.maxDelay;

        const duration = config.baseDuration + (config.enableRandomPath ? Math.random() * 100 : 0);

        styles.set(id, {
          transform: `translate(${deltaX}px, ${deltaY}px)`,
          transition: `transform ${duration}ms ${config.easing} ${delay}ms`,
        });
      }
    }
  });

  return styles;
}

/**
 * 生成华融道风格的随机移动路径
 * 模拟棋子在有限空间内的滑动效果
 * @param deltaX X轴位移
 * @param deltaY Y轴位移
 * @returns CSS transform 关键帧数组
 */
export function generateHuarongdaoPath(
  deltaX: number,
  deltaY: number
): string[] {
  const keyframes: string[] = [];

  const midX = deltaX * (0.3 + Math.random() * 0.4);
  const midY = deltaY * (0.3 + Math.random() * 0.4);

  const wobbleX = (Math.random() - 0.5) * 20;
  const wobbleY = (Math.random() - 0.5) * 20;

  keyframes.push(`translate(${deltaX}px, ${deltaY}px)`);
  keyframes.push(`translate(${midX + wobbleX}px, ${midY + wobbleY}px)`);
  keyframes.push(`translate(0px, 0px)`);

  return keyframes;
}

/**
 * 应用 FLIP 动画到元素
 * @param element 目标元素
 * @param deltaX X轴位移
 * @param deltaY Y轴位移
 * @param config 动画配置
 * @param delay 延迟时间
 */
export function applyFlipAnimation(
  element: HTMLElement,
  deltaX: number,
  deltaY: number,
  config: AnimationConfig = DEFAULT_ANIMATION_CONFIG,
  delay: number = 0
): Promise<void> {
  return new Promise((resolve) => {
    element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    element.style.transition = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const duration = config.baseDuration + (config.enableRandomPath ? Math.random() * 100 : 0);
        element.style.transition = `transform ${duration}ms ${config.easing} ${delay}ms`;
        element.style.transform = 'translate(0px, 0px)';

        const totalTime = duration + delay;
        setTimeout(() => {
          element.style.transform = '';
          element.style.transition = '';
          resolve();
        }, totalTime);
      });
    });
  });
}

/**
 * 执行华融道风格的重排动画
 * @param containerRef 容器元素引用
 * @param oldPositions 删除前的位置映射
 * @param config 动画配置
 */
export async function executeHuarongdaoAnimation(
  containerRef: HTMLElement | null,
  oldPositions: Map<string, DOMRect>,
  config: AnimationConfig = DEFAULT_ANIMATION_CONFIG
): Promise<void> {
  if (!containerRef) return;

  const newPositions = capturePositions(containerRef);
  const animationPromises: Promise<void>[] = [];

  const itemsToAnimate = Array.from(newPositions.keys());
  const totalItems = itemsToAnimate.length;

  itemsToAnimate.forEach((id, index) => {
    const oldPos = oldPositions.get(id);
    const newPos = newPositions.get(id);

    if (oldPos && newPos) {
      const deltaX = oldPos.left - newPos.left;
      const deltaY = oldPos.top - newPos.top;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        const element = containerRef.querySelector(`[data-project-id="${id}"]`) as HTMLElement;

        if (element) {
          const delay = config.enableRandomPath
            ? Math.random() * config.maxDelay
            : (index / totalItems) * config.maxDelay;

          animationPromises.push(
            applyFlipAnimation(element, deltaX, deltaY, config, delay)
          );
        }
      }
    }
  });

  await Promise.all(animationPromises);
}
