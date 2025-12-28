import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface ParticleFieldProps {
  count?: number;
  color?: string;
}

interface Particle {
  id: number;
  startX: number;
  startY: number;
  delay: number;
  size: number;
  color: string;
}

const BLUE_PALETTE = [
  'rgba(59,130,246,0.35)',
  'rgba(37, 99, 235, 0.45)',
  'rgba(147,197,253,0.35)',
  'rgba(14,165,233,0.3)'
];

export default function ParticleField({ count = 114, color = 'rgba(59,130,246,0.5)' }: ParticleFieldProps) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }).map((_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 500 + Math.random() * 260;
      return {
        id: index,
        startX: Math.cos(angle) * radius,
        startY: Math.sin(angle) * (radius-100),
        delay: Math.random() * 0.6,
        size: 10 + Math.random() * 18,
        color: BLUE_PALETTE[Math.floor(Math.random() * BLUE_PALETTE.length)] || color
      };
    });
  }, [count, color]);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {particles.map(particle => (
        <motion.span
          key={particle.id}
          className="absolute rounded-full blur-sm"
          style={{
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            left: '50%',
            top: '50%',
            boxShadow: `0 0 ${particle.size * 1.5}px ${particle.color}`
          }}
          initial={{ opacity: 0, scale: 0.5, x: particle.startX, y: particle.startY }}
          animate={{
            opacity: [0, 0.8, 0.6, 1],
            scale: [0.6, 1.2, 0.9],
            x: [particle.startX, particle.startX * 0.15],
            y: [particle.startY, particle.startY * 0.15]
          }}
          transition={{
            duration: 2.6,
            delay: particle.delay,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  );
}
