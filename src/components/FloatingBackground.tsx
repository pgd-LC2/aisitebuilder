import { useMemo, memo } from 'react';

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

interface BlobAnimationParams {
  driftX: number;
  driftY: number;
  scaleStart: number;
  scaleEnd: number;
  rotateStart: number;
  rotateEnd: number;
  driftDuration: number;
  breatheDuration: number;
  opacityMin: number;
  opacityMax: number;
  blurMin: number;
  blurMax: number;
}

const blurValues: Record<FloatingBlob['blur'], { min: number; max: number }> = {
  'blur-xl': { min: 24, max: 28 },
  'blur-2xl': { min: 40, max: 48 },
  'blur-3xl': { min: 64, max: 72 },
};

function generateDriftParams(blob: FloatingBlob): BlobAnimationParams {
  const randomRange = (min: number, max: number) => 
    Math.floor(Math.random() * (max - min + 1)) + min;
  const randomFloat = (min: number, max: number) =>
    min + Math.random() * (max - min);
  
  const baseScale = blob.baseScale ?? 1;
  const baseRotate = blob.baseRotate ?? 0;
  const blurRange = blurValues[blob.blur];
  
  return {
    driftX: randomRange(40, 80) * (Math.random() > 0.5 ? 1 : -1),
    driftY: randomRange(30, 60) * (Math.random() > 0.5 ? 1 : -1),
    scaleStart: baseScale,
    scaleEnd: baseScale * randomFloat(1.01, 1.04),
    rotateStart: baseRotate,
    rotateEnd: baseRotate + randomRange(3, 8) * (Math.random() > 0.5 ? 1 : -1),
    driftDuration: randomRange(35, 55),
    breatheDuration: randomRange(8, 14),
    opacityMin: (0.3 + Math.random() * 0.15) * blob.baseOpacity,
    opacityMax: (0.5 + Math.random() * 0.2) * blob.baseOpacity,
    blurMin: blurRange.min,
    blurMax: blurRange.max,
  };
}

function createBlobStyle(params: BlobAnimationParams): React.CSSProperties {
  return {
    '--drift-x': `${params.driftX}px`,
    '--drift-y': `${params.driftY}px`,
    '--drift-scale-start': params.scaleStart,
    '--drift-scale-end': params.scaleEnd,
    '--drift-rotate-start': `${params.rotateStart}deg`,
    '--drift-rotate-end': `${params.rotateEnd}deg`,
    '--drift-duration': `${params.driftDuration}s`,
    '--breathe-duration': `${params.breatheDuration}s`,
    '--breathe-opacity-min': params.opacityMin,
    '--breathe-opacity-max': params.opacityMax,
    '--blur-min': `${params.blurMin}px`,
    '--blur-max': `${params.blurMax}px`,
  } as React.CSSProperties;
}

interface BlobItemProps {
  blob: FloatingBlob;
}

const BlobItem = memo(function BlobItem({ blob }: BlobItemProps) {
  const animationStyle = useMemo(() => {
    const params = generateDriftParams(blob);
    return createBlobStyle(params);
  }, [blob]);

  const positionStyle = useMemo(() => ({
    ...blob.position,
    width: blob.size,
    height: blob.size,
  }), [blob]);

  return (
    <div
      className="absolute asb-floating-blob"
      style={{
        ...positionStyle,
        ...animationStyle,
      }}
    >
      <img
        src={blob.src}
        alt=""
        className="w-full h-full object-cover"
      />
    </div>
  );
});

function FloatingBackground({ blobs, className = '' }: FloatingBackgroundProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {blobs.map((blob) => (
        <BlobItem key={blob.id} blob={blob} />
      ))}
    </div>
  );
}

export default memo(FloatingBackground);
