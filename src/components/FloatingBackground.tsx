import { useRef } from 'react';

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
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
  scale: number;
  rotate: number;
  floatDuration: number;
  floatDelay: number;
  breatheDuration: number;
  breatheDelay: number;
  opacityMin: number;
  opacityMax: number;
}

function generateRandomFloatParams(): BlobAnimationParams {
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

function createBlobStyle(blob: FloatingBlob, params: BlobAnimationParams): React.CSSProperties {
  return {
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
  } as React.CSSProperties;
}

export default function FloatingBackground({ blobs, className = '' }: FloatingBackgroundProps) {
  const paramsMapRef = useRef<Map<string, BlobAnimationParams>>(new Map());

  const getOrCreateParams = (blobId: string): BlobAnimationParams => {
    const existingParams = paramsMapRef.current.get(blobId);
    if (existingParams) {
      return existingParams;
    }
    const newParams = generateRandomFloatParams();
    paramsMapRef.current.set(blobId, newParams);
    return newParams;
  };

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {blobs.map((blob) => {
        const params = getOrCreateParams(blob.id);
        const style = createBlobStyle(blob, params);
        
        return (
          <div
            key={blob.id}
            className="absolute asb-floating-blob"
            style={{
              ...blob.position,
              width: blob.size,
              height: blob.size,
              ...style,
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
