export type FaceAnalysis = {
  ready: boolean;
  message: string;
  embedding?: number[];
  realScore?: number;
  liveScore?: number;
};

let humanPromise: Promise<any> | null = null;

async function createHuman() {
  const { default: HumanClass } = await import('@vladmandic/human/dist/human.esm');
  const human = new HumanClass({
    backend: 'webgl',
    modelBasePath: '/models/human/',
    cacheModels: true,
    debug: false,
    face: {
      enabled: true,
      detector: {
        modelPath: 'blazeface.json',
        maxDetected: 2,
        minConfidence: 0.65,
        minSize: 80,
        rotation: true,
        return: false,
      },
      mesh: { enabled: true, modelPath: 'facemesh.json' },
      iris: { enabled: false },
      description: { enabled: true, modelPath: 'faceres.json', minConfidence: 0.65 },
      antispoof: { enabled: true, modelPath: 'antispoof.json' },
      liveness: { enabled: true, modelPath: 'liveness.json' },
      emotion: { enabled: false },
      attention: { enabled: false },
      gear: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  });
  await human.load();
  await human.warmup();
  return human;
}

export function loadFaceEngine() {
  if (!humanPromise) humanPromise = createHuman();
  return humanPromise;
}

function imageSharpness(video: HTMLVideoElement, faceBox: [number, number, number, number]) {
  const sample = document.createElement('canvas');
  const width = 96;
  const height = 96;
  sample.width = width;
  sample.height = height;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return 0;

  const [x, y, boxWidth, boxHeight] = faceBox;
  context.drawImage(video, x, y, boxWidth, boxHeight, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  let brightness = 0;
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
    brightness += gray[index];
  }

  let total = 0;
  let squared = 0;
  let count = 0;
  for (let row = 1; row < height - 1; row += 1) {
    for (let column = 1; column < width - 1; column += 1) {
      const index = row * width + column;
      const laplacian =
        gray[index - width] + gray[index + width] + gray[index - 1] + gray[index + 1] - 4 * gray[index];
      total += laplacian;
      squared += laplacian * laplacian;
      count += 1;
    }
  }
  const mean = total / Math.max(1, count);
  const variance = squared / Math.max(1, count) - mean * mean;
  return brightness / gray.length < 45 ? 0 : variance;
}

export async function analyzeFace(
  video: HTMLVideoElement,
  expectedPose: 'front' | 'left' | 'right' = 'front',
): Promise<FaceAnalysis> {
  const human = await loadFaceEngine();
  const result = await human.detect(video);
  if (result.face.length === 0) return { ready: false, message: 'Coloca tu rostro dentro del óvalo' };
  if (result.face.length > 1) return { ready: false, message: 'Debe aparecer una sola persona' };

  const face = result.face[0];
  const [x, y, width, height] = face.boxRaw;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  if (width < 0.24 || height < 0.34) return { ready: false, message: 'Acércate un poco a la cámara' };
  if (width > 0.82 || height > 0.94) return { ready: false, message: 'Aléjate un poco de la cámara' };
  if (Math.abs(centerX - 0.5) > 0.17 || Math.abs(centerY - 0.48) > 0.18) {
    return { ready: false, message: 'Centra tu rostro dentro del óvalo' };
  }

  const angle = face.rotation?.angle;
  if (angle) {
    if (Math.abs(angle.pitch) > 0.22 || Math.abs(angle.roll) > 0.18) {
      return { ready: false, message: 'Mantén la cabeza recta' };
    }
    if (expectedPose === 'front' && Math.abs(angle.yaw) > 0.2) {
      return { ready: false, message: 'Mira de frente a la cámara' };
    }
    if (expectedPose === 'left' && angle.yaw > -0.2) {
      return { ready: false, message: 'Gira lentamente el rostro hacia tu izquierda' };
    }
    if (expectedPose === 'right' && angle.yaw < 0.2) {
      return { ready: false, message: 'Gira lentamente el rostro hacia tu derecha' };
    }
  }

  const sharpness = imageSharpness(video, face.box);
  if (sharpness < 45) return { ready: false, message: 'Mantente quieto y mejora la iluminación' };
  if (!face.embedding || face.embedding.length < 64) {
    return { ready: false, message: 'Analizando rasgos faciales…' };
  }
  if (typeof face.real !== 'number' || face.real < 0.55) {
    return { ready: false, message: 'No se pudo validar un rostro real' };
  }
  if (typeof face.live !== 'number' || face.live < 0.5) {
    return { ready: false, message: 'Parpadea suavemente y mira a la cámara' };
  }

  return {
    ready: true,
    message: 'Rostro válido, mantente quieto',
    embedding: face.embedding,
    realScore: face.real,
    liveScore: face.live,
  };
}
