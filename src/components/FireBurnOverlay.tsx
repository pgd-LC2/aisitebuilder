import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Particle,
  DEFAULT_FIRE_BURN_CONFIG,
  FireBurnConfig,
  createFireParticle,
  createEmberParticle,
  createAshParticle,
  createSmokeParticle,
  updateParticle,
  drawParticle,
  calculateErosionMask,
  getFireEdgeColor,
} from '../utils/fireBurnAnimation';

interface FireBurnOverlayProps {
  targetRect: DOMRect;
  onComplete: () => void;
  config?: Partial<FireBurnConfig>;
}

export default function FireBurnOverlay({
  targetRect,
  onComplete,
  config: userConfig,
}: FireBurnOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const seedRef = useRef<number>(Math.random() * 1000);
  const isCompletedRef = useRef<boolean>(false);

  const config: FireBurnConfig = useMemo(() => ({
    ...DEFAULT_FIRE_BURN_CONFIG,
    ...userConfig,
  }), [userConfig]);

  const spawnParticles = useCallback((progress: number) => {
    const { x, y, width, height } = targetRect;
    const particles = particlesRef.current;

    const spawnRate = 1 - progress * 0.5;
    const erosionY = y + height * (1 - progress * 1.2);

    if (progress < 0.8) {
      for (let i = 0; i < Math.ceil(config.fireParticleCount * 0.1 * spawnRate); i++) {
        particles.push(createFireParticle(x, erosionY, width));
      }
    }

    if (progress < 0.9) {
      for (let i = 0; i < Math.ceil(config.emberParticleCount * 0.08 * spawnRate); i++) {
        particles.push(createEmberParticle(x, erosionY, width, height * progress));
      }
    }

    for (let i = 0; i < Math.ceil(config.ashParticleCount * 0.06); i++) {
      particles.push(createAshParticle(x, y, width, height));
    }

    if (progress > 0.2) {
      for (let i = 0; i < Math.ceil(config.smokeParticleCount * 0.04); i++) {
        particles.push(createSmokeParticle(x, erosionY, width));
      }
    }
  }, [targetRect, config]);

  const animate = useCallback((timestamp: number) => {
    if (isCompletedRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
      lastFrameTimeRef.current = timestamp;
      lastSpawnTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const deltaTime = timestamp - lastFrameTimeRef.current;
    lastFrameTimeRef.current = timestamp;

    const progress = Math.min(elapsed / config.duration, 1);

    if (timestamp - lastSpawnTimeRef.current > config.spawnInterval) {
      spawnParticles(progress);
      lastSpawnTimeRef.current = timestamp;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { x, y, width, height } = targetRect;

    if (progress < 1) {
      ctx.save();

      for (let py = 0; py < height; py += 2) {
        for (let px = 0; px < width; px += 2) {
          const maskValue = calculateErosionMask(
            px, py, width, height, progress, seedRef.current
          );

          if (maskValue > 0 && maskValue < 1) {
            const edgeColor = getFireEdgeColor(maskValue);
            ctx.fillStyle = edgeColor;
            ctx.fillRect(x + px, y + py, 3, 3);
          }
        }
      }

      ctx.restore();
    }

    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      updateParticle(particle, deltaTime);

      if (particle.life <= 0 || particle.alpha <= 0) {
        particles.splice(i, 1);
      } else {
        drawParticle(ctx, particle);
      }
    }

    if (progress >= 1 && particles.length === 0) {
      isCompletedRef.current = true;
      onComplete();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [targetRect, config, spawnParticles, onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
