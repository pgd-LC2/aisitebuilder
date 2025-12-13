import { useMemo, useEffect, useState } from 'react';

export interface FloatingBlob {
  id: string;
  src: string;
  position: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  size: string;
  blur: 'blur-xl' | 'blur-2xl' | 'blur-3xl';
  baseOpacity: number;
  baseRotate?: number;
  baseScale?: number;
}

interface FloatingBackgroundProps {
  blobs: FloatingBlob[];
  className?: string;
}

function generateRandomFloatParams() {
  const randomRange = (min: number, max: number) => 
    Math.floor(Math.random() * (max - min + 1)) + min;
  
  return {
    x1: randomRange(-15, 15),
    y1: randomRange(-15, 15),
    x2: randomRange(20, 50),
    y2: randomRange(-40, -15),
    x3: randomRange(-40, -10),
    y3: randomRange(10, 35),
    x4: randomRange(15, 45),
    y4: randomRange(-25, 5),
    scale: 1 + (Math.random() * 0.3 - 0.15),
    rotate: randomRange(-15, 15),
    floatDuration: randomRange(25, 45),
    floatDelay: randomRange(0, 10),
    breatheDuration: randomRange(6, 12),
    breatheDelay: randomRange(0, 5),
    opacityMin: 0.25 + Math.random() * 0.15,
    opacityMax: 0.45 + Math.random() * 0.2,
  };
}

export default function FloatingBackground({ blobs, className = '' }: FloatingBackgroundProps) {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  const blobStyles = useMemo(() => {
    if (!isClient) return [];
    
    return blobs.map((blob) => {
      const params = generateRandomFloatParams();
      
      return {
        id: blob.id,
        style: {
          '--float-x1': `${params.x1}px`,
          '--float-y1': `${params.y1}px`,
          '--float-x2': `${params.x2}px`,
          '--float-y2': `${params.y2}px`,
          '--float-x3': `${params.x3}px`,
          '--float-y3': `${params.y3}px`,
          '--float-x4': `${params.x4}px`,
          '--float-y4': `${params.y4}px`,
          '--float-scale': blob.baseScale ?? params.scale,
          '--float-rotate': `${blob.baseRotate ?? params.rotate}deg`,
          '--float-duration': `${params.floatDuration}s`,
          '--float-delay': `${params.floatDelay}s`,
          '--breathe-duration': `${params.breatheDuration}s`,
          '--breathe-delay': `${params.breatheDelay}s`,
          '--breathe-opacity-min': params.opacityMin * blob.baseOpacity,
          '--breathe-opacity-max': params.opacityMax * blob.baseOpacity,
        } as React.CSSProperties,
      };
    });
  }, [blobs, isClient]);

  if (!isClient) {
    return (
      <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
        {blobs.map((blob) => (
          <div
            key={blob.id}
            className="absolute"
            style={{
              ...blob.position,
              width: blob.size,
              height: blob.size,
              opacity: blob.baseOpacity * 0.35,
            }}
          >
            <img
              src={blob.src}
              alt=""
              className={`w-full h-full object-cover ${blob.blur}`}
              style={{
                transform: `scale(${blob.baseScale ?? 1.25}) rotate(${blob.baseRotate ?? 0}deg)`,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {blobs.map((blob, index) => {
        const blobStyle = blobStyles[index];
        
        return (
          <div
            key={blob.id}
            className="absolute asb-floating-blob"
            style={{
              ...blob.position,
              width: blob.size,
              height: blob.size,
              ...blobStyle?.style,
            }}
          >
            <img
              src={blob.src}
              alt=""
              className={`w-full h-full object-cover ${blob.blur}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export const defaultProjectsPageBlobs: FloatingBlob[] = [
  {
    id: 'wave-top-right',
    src: '/images/gradient-wave.webp',
    position: { top: '-8rem', right: '-8rem' },
    size: '24rem',
    blur: 'blur-2xl',
    baseOpacity: 1,
    baseRotate: 12,
    baseScale: 1.5,
  },
  {
    id: 'pink-bottom-left',
    src: '/images/gradient-pink.webp',
    position: { bottom: '-8rem', left: '-8rem' },
    size: '24rem',
    blur: 'blur-xl',
    baseOpacity: 0.8,
    baseRotate: -12,
    baseScale: 1.5,
  },
  {
    id: 'blue-center',
    src: '/images/gradient-blue.webp',
    position: { top: '33%', left: '25%' },
    size: '20rem',
    blur: 'blur-2xl',
    baseOpacity: 0.7,
    baseRotate: 45,
    baseScale: 1.25,
  },
];

export const defaultIntroPageBlobs: FloatingBlob[] = [
  {
    id: 'wave-top-left',
    src: '/images/gradient-wave.webp',
    position: { top: '-5rem', left: '-5rem' },
    size: '24rem',
    blur: 'blur-2xl',
    baseOpacity: 1,
    baseRotate: 12,
    baseScale: 1.5,
  },
  {
    id: 'blue-top-right',
    src: '/images/gradient-blue.webp',
    position: { top: '25%', right: '-8rem' },
    size: '20rem',
    blur: 'blur-xl',
    baseOpacity: 0.85,
    baseRotate: -6,
    baseScale: 1.25,
  },
  {
    id: 'flower-center-left',
    src: '/images/gradient-flower.webp',
    position: { bottom: '25%', left: '25%' },
    size: '18rem',
    blur: 'blur-2xl',
    baseOpacity: 0.7,
    baseRotate: 45,
    baseScale: 1.1,
  },
  {
    id: 'pink-bottom-right',
    src: '/images/gradient-pink.webp',
    position: { bottom: '-5rem', right: '33%' },
    size: '24rem',
    blur: 'blur-xl',
    baseOpacity: 0.85,
    baseRotate: -12,
    baseScale: 1.5,
  },
];

export const defaultHomePageBlobs: FloatingBlob[] = [
  {
    id: 'wave-top-right',
    src: '/images/gradient-wave.webp',
    position: { top: '-10rem', right: '-5rem' },
    size: '28rem',
    blur: 'blur-2xl',
    baseOpacity: 0.5,
    baseRotate: 15,
    baseScale: 1.4,
  },
  {
    id: 'blue-bottom-left',
    src: '/images/gradient-blue.webp',
    position: { bottom: '10%', left: '-8rem' },
    size: '22rem',
    blur: 'blur-2xl',
    baseOpacity: 0.4,
    baseRotate: -20,
    baseScale: 1.3,
  },
  {
    id: 'pink-center-right',
    src: '/images/gradient-pink.webp',
    position: { top: '40%', right: '10%' },
    size: '16rem',
    blur: 'blur-xl',
    baseOpacity: 0.35,
    baseRotate: 30,
    baseScale: 1.2,
  },
];
