import { useRef, useCallback } from 'react';
import {
  capturePositions,
  executeHuarongdaoAnimation,
  AnimationConfig,
  DEFAULT_ANIMATION_CONFIG,
} from './huarongdaoAnimation';

/**
 * 华融道拼图风格删除动画 Hook
 *
 * 使用 FLIP 动画技术实现项目删除后的重排动画效果。
 * 当项目被删除时，剩余项目会像华融道棋子一样移动填补空位。
 */
export function useHuarongdaoAnimation(config: AnimationConfig = DEFAULT_ANIMATION_CONFIG) {
  const containerRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());
  const isAnimatingRef = useRef(false);

  /**
   * 在删除操作前调用，记录当前所有项目的位置
   */
  const captureBeforeDelete = useCallback(() => {
    if (containerRef.current) {
      positionsRef.current = capturePositions(containerRef.current);
    }
  }, []);

  /**
   * 在删除操作后调用，执行华融道风格的重排动画
   */
  const animateAfterDelete = useCallback(async () => {
    if (isAnimatingRef.current || !containerRef.current) return;

    isAnimatingRef.current = true;

    await new Promise(resolve => requestAnimationFrame(resolve));

    await executeHuarongdaoAnimation(
      containerRef.current,
      positionsRef.current,
      config
    );

    isAnimatingRef.current = false;
    positionsRef.current = new Map();
  }, [config]);

  /**
   * 执行完整的删除动画流程
   * @param deleteCallback 实际执行删除的回调函数
   * @param deletedItemId 被删除项目的 ID（用于消失动画）
   */
  const executeDeleteAnimation = useCallback(async (
    deleteCallback: () => Promise<void>,
    deletedItemId: string
  ) => {
    captureBeforeDelete();

    const deletedElement = containerRef.current?.querySelector(
      `[data-project-id="${deletedItemId}"]`
    ) as HTMLElement;

    if (deletedElement) {
      deletedElement.style.animation = 'huarongdaoDisappear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await deleteCallback();

    await new Promise(resolve => setTimeout(resolve, 50));

    await animateAfterDelete();
  }, [captureBeforeDelete, animateAfterDelete]);

  return {
    containerRef,
    captureBeforeDelete,
    animateAfterDelete,
    executeDeleteAnimation,
    isAnimating: isAnimatingRef.current,
  };
}

export default useHuarongdaoAnimation;
