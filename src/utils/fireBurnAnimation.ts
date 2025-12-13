/**
 * 火焰燃烧消散动画工具函数
 *
 * 实现逼真的火焰燃烧效果：卡片边缘被火焰侵蚀，
 * 同时产生火焰粒子和灰尘粒子向上飘散。
 */

/** 粒子类型 */
export type ParticleType = 'fire' | 'ember' | 'ash' | 'smoke';

/** 单个粒子的属性 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  type: ParticleType;
  color: string;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
}

/** 火焰燃烧动画配置 */
export interface FireBurnConfig {
  /** 火焰粒子数量 */
  fireParticleCount: number;
  /** 余烬粒子数量 */
  emberParticleCount: number;
  /** 灰烬粒子数量 */
  ashParticleCount: number;
  /** 烟雾粒子数量 */
  smokeParticleCount: number;
  /** 动画总时长（毫秒） */
  duration: number;
  /** 侵蚀速度（0-1，每帧侵蚀的比例） */
  erosionSpeed: number;
  /** 粒子生成间隔（毫秒） */
  spawnInterval: number;
}

/** 默认火焰燃烧配置 */
export const DEFAULT_FIRE_BURN_CONFIG: FireBurnConfig = {
  fireParticleCount: 60,
  emberParticleCount: 40,
  ashParticleCount: 50,
  smokeParticleCount: 30,
  duration: 1200,
  erosionSpeed: 0.015,
  spawnInterval: 20,
};

/** 火焰颜色渐变 */
const FIRE_COLORS = [
  '#FF4500', // 橙红
  '#FF6B35', // 亮橙
  '#FF8C42', // 橙色
  '#FFA500', // 金橙
  '#FFD700', // 金黄
  '#FFEC8B', // 浅黄
];

/** 余烬颜色 */
const EMBER_COLORS = [
  '#FF4500',
  '#FF6347',
  '#FF7F50',
  '#DC143C',
];

/** 灰烬颜色 */
const ASH_COLORS = [
  '#4A4A4A',
  '#5C5C5C',
  '#6E6E6E',
  '#808080',
  '#969696',
];

/** 烟雾颜色 */
const SMOKE_COLORS = [
  '#2F2F2F',
  '#3D3D3D',
  '#4B4B4B',
  '#595959',
];

/**
 * 从数组中随机选择一个元素
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 在范围内生成随机数
 */
function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * 非线性缓动函数 - easeOutCubic
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 非线性缓动函数 - easeOutQuart
 */
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * 非线性缓动函数 - easeInOutBack（弹性效果）
 */
export function easeInOutBack(t: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

/**
 * 创建火焰粒子
 */
export function createFireParticle(x: number, y: number, width: number): Particle {
  const spawnX = x + randomRange(0, width);
  return {
    x: spawnX,
    y: y + randomRange(-5, 5),
    vx: randomRange(-1.5, 1.5),
    vy: randomRange(-4, -2),
    size: randomRange(3, 8),
    life: 1,
    maxLife: randomRange(0.4, 0.8),
    type: 'fire',
    color: randomChoice(FIRE_COLORS),
    alpha: 1,
    rotation: randomRange(0, Math.PI * 2),
    rotationSpeed: randomRange(-0.1, 0.1),
  };
}

/**
 * 创建余烬粒子
 */
export function createEmberParticle(x: number, y: number, width: number, height: number): Particle {
  const spawnX = x + randomRange(0, width);
  const spawnY = y + randomRange(0, height * 0.5);
  return {
    x: spawnX,
    y: spawnY,
    vx: randomRange(-2, 2),
    vy: randomRange(-3, -1),
    size: randomRange(2, 4),
    life: 1,
    maxLife: randomRange(0.6, 1.0),
    type: 'ember',
    color: randomChoice(EMBER_COLORS),
    alpha: 1,
    rotation: randomRange(0, Math.PI * 2),
    rotationSpeed: randomRange(-0.2, 0.2),
  };
}

/**
 * 创建灰烬粒子
 */
export function createAshParticle(x: number, y: number, width: number, height: number): Particle {
  const spawnX = x + randomRange(0, width);
  const spawnY = y + randomRange(0, height);
  return {
    x: spawnX,
    y: spawnY,
    vx: randomRange(-1, 1),
    vy: randomRange(-1.5, -0.5),
    size: randomRange(1, 3),
    life: 1,
    maxLife: randomRange(1.0, 1.5),
    type: 'ash',
    color: randomChoice(ASH_COLORS),
    alpha: 0.8,
    rotation: randomRange(0, Math.PI * 2),
    rotationSpeed: randomRange(-0.05, 0.05),
  };
}

/**
 * 创建烟雾粒子
 */
export function createSmokeParticle(x: number, y: number, width: number): Particle {
  const spawnX = x + randomRange(0, width);
  return {
    x: spawnX,
    y: y - randomRange(0, 10),
    vx: randomRange(-0.5, 0.5),
    vy: randomRange(-2, -0.8),
    size: randomRange(8, 15),
    life: 1,
    maxLife: randomRange(1.2, 2.0),
    type: 'smoke',
    color: randomChoice(SMOKE_COLORS),
    alpha: 0.3,
    rotation: randomRange(0, Math.PI * 2),
    rotationSpeed: randomRange(-0.02, 0.02),
  };
}

/**
 * 更新粒子状态
 */
export function updateParticle(particle: Particle, deltaTime: number): void {
  const dt = deltaTime / 16.67;

  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  particle.rotation += particle.rotationSpeed * dt;

  const lifeDecay = (1 / particle.maxLife) * (deltaTime / 1000);
  particle.life -= lifeDecay;

  switch (particle.type) {
    case 'fire':
      particle.vy -= 0.05 * dt;
      particle.size *= 0.98;
      particle.alpha = particle.life * 0.9;
      break;
    case 'ember':
      particle.vy -= 0.02 * dt;
      particle.vx *= 0.99;
      particle.alpha = particle.life;
      if (Math.random() < 0.02) {
        particle.alpha *= 0.5;
      }
      break;
    case 'ash':
      particle.vx += randomRange(-0.05, 0.05) * dt;
      particle.vy *= 0.995;
      particle.alpha = particle.life * 0.6;
      break;
    case 'smoke':
      particle.size += 0.1 * dt;
      particle.vx *= 0.98;
      particle.alpha = particle.life * 0.25;
      break;
  }
}

/**
 * 绘制单个粒子
 */
export function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle): void {
  if (particle.alpha <= 0 || particle.life <= 0) return;

  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.globalAlpha = Math.max(0, particle.alpha);

  switch (particle.type) {
    case 'fire': {
      const fireGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, particle.size);
      fireGradient.addColorStop(0, particle.color);
      fireGradient.addColorStop(0.4, particle.color);
      fireGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = fireGradient;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'ember':
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'ash':
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      break;

    case 'smoke': {
      const smokeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, particle.size);
      smokeGradient.addColorStop(0, particle.color);
      smokeGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = smokeGradient;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

/**
 * 生成 Perlin 噪声值（简化版）
 * 用于创建不规则的侵蚀边缘
 */
export function simpleNoise(x: number, y: number, seed: number = 0): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * 计算侵蚀遮罩值
 * 返回 0-1 之间的值，0 表示完全侵蚀，1 表示完全保留
 */
export function calculateErosionMask(
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  seed: number
): number {
  const normalizedY = y / height;
  const normalizedX = x / width;

  const noise1 = simpleNoise(normalizedX * 5, normalizedY * 5, seed);
  const noise2 = simpleNoise(normalizedX * 10, normalizedY * 10, seed + 100);
  const combinedNoise = noise1 * 0.7 + noise2 * 0.3;

  const erosionLine = progress * 1.5;
  const threshold = erosionLine - combinedNoise * 0.4;

  if (normalizedY < threshold) {
    return 0;
  }

  const edgeWidth = 0.1;
  if (normalizedY < threshold + edgeWidth) {
    return (normalizedY - threshold) / edgeWidth;
  }

  return 1;
}

/**
 * 生成火焰边缘发光效果的颜色
 */
export function getFireEdgeColor(erosionValue: number): string {
  if (erosionValue <= 0 || erosionValue >= 1) return 'transparent';

  const intensity = 1 - erosionValue;
  if (intensity < 0.3) {
    return `rgba(255, 200, 100, ${intensity * 2})`;
  } else if (intensity < 0.6) {
    return `rgba(255, 150, 50, ${intensity * 1.5})`;
  } else {
    return `rgba(255, 100, 0, ${intensity})`;
  }
}
