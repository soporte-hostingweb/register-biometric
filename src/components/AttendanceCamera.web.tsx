import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { analyzeFace, loadFaceEngine } from '../services/face-biometric.web';

type AttendanceCameraProps = {
  visible: boolean;
  attendanceType?: 'Entrada' | 'Salida';
  mode?: 'attendance' | 'enrollment' | 'password-change';
  onCancel: () => void;
  onConfirm: (photoDataUrl: string, faceDescriptor: number[], captures?: EnrollmentCapture[]) => void;
};

export type EnrollmentCapture = {
  angle: 'front' | 'left' | 'right';
  photoData: string;
  faceDescriptor: number[];
};

const enrollmentAngles: EnrollmentCapture['angle'][] = ['right', 'left', 'front'];
const enrollmentLabels = { front: 'Mira de frente', left: 'Gira hacia tu izquierda', right: 'Gira hacia tu derecha' };

const VideoElement = 'video' as any;
const CanvasElement = 'canvas' as any;

function selectRepresentativeEmbedding(samples: number[][]) {
  if (samples.length === 0) return [];
  if (samples.length === 1) return samples[0];

  let selected = samples[0];
  let lowestTotalDistance = Number.POSITIVE_INFINITY;
  for (const candidate of samples) {
    let totalDistance = 0;
    for (const other of samples) {
      for (let index = 0; index < candidate.length; index += 1) {
        const difference = candidate[index] - other[index];
        totalDistance += difference * difference;
      }
    }
    if (totalDistance < lowestTotalDistance) {
      lowestTotalDistance = totalDistance;
      selected = candidate;
    }
  }
  return selected;
}

export default function AttendanceCamera({
  visible,
  attendanceType = 'Entrada',
  mode = 'attendance',
  onCancel,
  onConfirm,
}: AttendanceCameraProps) {
  const isPasswordChange = mode === 'password-change';
  const { width: viewportWidth } = useWindowDimensions();
  const compactCamera = viewportWidth <= 600;
  const [step, setStep] = useState<'tips' | 'pose' | 'camera'>('tips');
  const [error, setError] = useState('');
  const [startingCamera, setStartingCamera] = useState(false);
  const [scanMessage, setScanMessage] = useState('Preparando análisis facial…');
  const [scanProgress, setScanProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(0);
  const processingRef = useRef(false);
  const embeddingSamplesRef = useRef<number[][]>([]);
  const enrollmentCapturesRef = useRef<EnrollmentCapture[]>([]);
  const [enrollmentIndex, setEnrollmentIndex] = useState(0);

  const stopCamera = () => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!visible) {
      stopCamera();
      setStep('tips');
      setError('');
      setScanProgress(0);
      setProcessing(false);
      progressRef.current = 0;
      processingRef.current = false;
      embeddingSamplesRef.current = [];
      enrollmentCapturesRef.current = [];
      setEnrollmentIndex(0);
    }
    return stopCamera;
  }, [visible]);

  useEffect(() => {
    if (step !== 'camera' || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => setError('No se pudo iniciar la vista previa de la cámara.'));
  }, [step]);

  const capturePhoto = (faceDescriptor: number[]) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      setError('Espera unos segundos hasta que la cámara esté lista.');
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setError('No se pudo procesar la fotografía.');
      processingRef.current = false;
      setProcessing(false);
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedPhoto = canvas.toDataURL('image/jpeg', 0.72);
    if (mode === 'enrollment') {
      const angle = enrollmentAngles[enrollmentIndex];
      const captures = [...enrollmentCapturesRef.current, { angle, photoData: capturedPhoto, faceDescriptor }];
      enrollmentCapturesRef.current = captures;
      if (captures.length < 3) {
        stopCamera();
        progressRef.current = 0;
        processingRef.current = false;
        setScanProgress(0);
        setProcessing(false);
        setEnrollmentIndex(captures.length);
        setStep('pose');
        return;
      }
      stopCamera();
      onConfirm(captures[0].photoData, captures[0].faceDescriptor, captures);
      return;
    }
    stopCamera();
    onConfirm(capturedPhoto, faceDescriptor);
  };

  useEffect(() => {
    if (step !== 'camera') return;
    let cancelled = false;

    const scan = async () => {
      const video = videoRef.current;
      if (cancelled || !video || video.readyState < 2 || processingRef.current) {
        if (!cancelled) scanTimerRef.current = setTimeout(scan, 350);
        return;
      }

      try {
        const expectedPose = mode === 'enrollment' ? enrollmentAngles[enrollmentIndex] : 'front';
        const analysis = await analyzeFace(video, expectedPose);
        if (cancelled) return;
        setScanMessage(analysis.message);
        if (analysis.ready && analysis.embedding) {
          embeddingSamplesRef.current = [...embeddingSamplesRef.current.slice(-4), analysis.embedding];
        } else {
          embeddingSamplesRef.current = [];
        }
        const nextProgress = analysis.ready
          ? Math.min(100, progressRef.current + 20)
          : Math.max(0, progressRef.current - 28);
        progressRef.current = nextProgress;
        setScanProgress(nextProgress);

        if (nextProgress >= 100 && embeddingSamplesRef.current.length >= 5) {
          processingRef.current = true;
          setProcessing(true);
          setScanMessage('Rostro capturado. Verificando identidad…');
          const samples = embeddingSamplesRef.current;
          capturePhoto(selectRepresentativeEmbedding(samples));
          return;
        }
      } catch (scanError: any) {
        setScanMessage(scanError?.message || 'No se pudo analizar el rostro');
      }
      if (!cancelled) scanTimerRef.current = setTimeout(scan, 350);
    };

    setScanMessage('Cargando reconocimiento facial…');
    loadFaceEngine()
      .then(() => {
        if (!cancelled) scan();
      })
      .catch((engineError: any) => {
        if (!cancelled) setError(engineError?.message || 'No se pudo cargar el reconocimiento facial.');
      });

    return () => {
      cancelled = true;
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [step, mode, enrollmentIndex]);

  const startCamera = async () => {
    setStartingCamera(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite usar la cámara. Abre la web mediante HTTPS.');
      }
      stopCamera();
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      progressRef.current = 0;
      processingRef.current = false;
      embeddingSamplesRef.current = [];
      setScanProgress(0);
      setProcessing(false);
      setStep('camera');
    } catch (cameraError: any) {
      setError(
        cameraError?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.'
          : cameraError?.message || 'No se pudo acceder a la cámara.',
      );
    } finally {
      setStartingCamera(false);
    }
  };

  const closeModal = () => {
    stopCamera();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{mode === 'enrollment' ? 'REGISTRO BIOMÉTRICO' : 'VERIFICACIÓN BIOMÉTRICA'}</Text>
              <Text style={styles.title}>
                {mode === 'enrollment'
                  ? 'Registrar mi rostro'
                  : isPasswordChange
                    ? 'Confirmar cambio de contraseña'
                    : `Marcar ${attendanceType}`}
              </Text>
            </View>
            <Pressable onPress={closeModal} style={styles.closeButton} disabled={processing}>
              <Ionicons name="close" size={24} color="#DDEBFF" />
            </Pressable>
          </View>

          {step === 'tips' ? (
            <View>
              <View style={styles.tipsHero}>
                <Ionicons name="scan-circle-outline" size={64} color="#65B9FF" />
                <Text style={styles.tipsTitle}>Prepara tu rostro</Text>
                <Text style={styles.tipsDescription}>
                  {mode === 'enrollment'
                    ? 'Tu rostro quedará asociado exclusivamente a esta cuenta para validar futuras marcaciones.'
                    : isPasswordChange
                      ? 'Compararemos esta captura con el rostro registrado antes de autorizar la nueva contraseña.'
                      : 'La captura será automática cuando la imagen sea nítida y se valide un rostro real.'}
                </Text>
              </View>
              {[
                ['sunny-outline', 'Busca un lugar con buena iluminación.'],
                ['person-outline', 'Mira de frente y mantén todo el rostro visible.'],
                ['glasses-outline', 'Retira gorra, mascarilla o elementos que cubran el rostro.'],
                ['people-outline', 'Asegúrate de aparecer tú solo en la imagen.'],
              ].map(([icon, tip]) => (
                <View style={styles.tipRow} key={tip}>
                  <Ionicons name={icon as any} size={21} color="#7EC3FF" />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryButton, startingCamera && styles.disabledButton]}
                onPress={mode === 'enrollment' ? () => setStep('pose') : startCamera}
                disabled={startingCamera}
              >
                <Ionicons name="camera-outline" size={21} color="#071C35" />
                <Text style={styles.primaryButtonText}>
                  {startingCamera
                    ? 'Abriendo cámara…'
                    : mode === 'enrollment'
                      ? 'Registrar mi rostro'
                      : 'Iniciar verificación facial'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : step === 'pose' ? (
            <View style={styles.poseCard}>
              <View style={styles.poseIcon}>
                <Ionicons
                  name={enrollmentAngles[enrollmentIndex] === 'right'
                    ? 'arrow-forward-outline'
                    : enrollmentAngles[enrollmentIndex] === 'left'
                      ? 'arrow-back-outline'
                      : 'person-outline'}
                  size={58}
                  color="#65B9FF"
                />
              </View>
              <Text style={styles.poseStep}>CAPTURA {enrollmentIndex + 1} DE 3</Text>
              <Text style={styles.poseTitle}>{enrollmentLabels[enrollmentAngles[enrollmentIndex]]}</Text>
              <Text style={styles.poseDescription}>
                {enrollmentAngles[enrollmentIndex] === 'front'
                  ? 'Mantén la cabeza recta y mira directamente a la cámara.'
                  : `Gira lentamente la cara hacia tu ${enrollmentAngles[enrollmentIndex] === 'right' ? 'derecha' : 'izquierda'}, sin mover los hombros.`}
              </Text>
              <Text style={styles.poseDescription}>La captura será automática cuando el círculo verde se complete.</Text>
              <TouchableOpacity
                style={[styles.primaryButton, startingCamera && styles.disabledButton]}
                onPress={startCamera}
                disabled={startingCamera}
              >
                <Ionicons name="camera-outline" size={21} color="#071C35" />
                <Text style={styles.primaryButtonText}>{startingCamera ? 'Abriendo cámara…' : 'Continuar'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.cameraFrame}>
                <VideoElement ref={videoRef} autoPlay muted playsInline style={styles.video as any} />
                <View pointerEvents="none" style={[styles.faceGuide, compactCamera && styles.faceGuideMobile]} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.progressRing,
                    compactCamera && styles.progressRingMobile,
                    { background: `conic-gradient(#35E58B ${scanProgress * 3.6}deg, transparent 0deg)` },
                  ]}
                />
                <Text style={[styles.cameraHint, scanProgress === 100 && styles.successHint]}>
                  {scanMessage}
                </Text>
              </View>
              {mode === 'enrollment' && (
                <Text style={styles.poseInstruction}>
                  Paso {enrollmentIndex + 1} de 3: {enrollmentLabels[enrollmentAngles[enrollmentIndex]]}
                </Text>
              )}
              <CanvasElement ref={canvasRef} style={{ display: 'none' }} />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <View style={styles.progressStatus}>
                <Text style={styles.progressStatusText}>{processing ? 'Procesando…' : `${scanProgress}%`}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles: Record<string, any> = {
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '94vh', overflow: 'auto', backgroundColor: '#0E1C2E', borderRadius: 20, borderWidth: 1, borderColor: '#294765', padding: 20, boxShadow: '0 22px 70px rgba(0,0,0,0.5)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { color: '#65B9FF', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 3 },
  closeButton: { padding: 8, borderRadius: 20, backgroundColor: '#192C43' },
  tipsHero: { alignItems: 'center', marginBottom: 18 },
  tipsTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 5 },
  tipsDescription: { color: '#AFC3D8', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#14273D', borderRadius: 11, padding: 12, marginBottom: 8 },
  tipText: { flex: 1, color: '#DCE9F7', fontSize: 13, lineHeight: 18 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#77C3FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingHorizontal: 15 },
  primaryButtonText: { color: '#071C35', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  errorText: { color: '#FF9C9C', fontSize: 12.5, textAlign: 'center', marginTop: 10 },
  cameraFrame: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden', borderRadius: 16, backgroundColor: '#02070C', position: 'relative' },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  faceGuide: { position: 'absolute', width: '48%', height: '72%', left: '26%', top: '10%', borderWidth: 3, borderColor: '#71C5FF', borderRadius: 999, boxShadow: '0 0 0 999px rgba(0,0,0,0.18)' },
  faceGuideMobile: { width: '64%', height: '78%', left: '18%', top: '7%' },
  progressRing: { position: 'absolute', width: '48%', height: '72%', left: '26%', top: '10%', borderRadius: 999, padding: 5, WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', filter: 'drop-shadow(0 0 5px rgba(53,229,139,0.8))' },
  progressRingMobile: { width: '64%', height: '78%', left: '18%', top: '7%' },
  cameraHint: { position: 'absolute', bottom: 12, alignSelf: 'center', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, fontSize: 12 },
  successHint: { backgroundColor: 'rgba(8,113,67,0.92)' },
  progressStatus: { alignItems: 'center', marginTop: 14 },
  progressStatusText: { color: '#79E7B0', fontSize: 15, fontWeight: '800' },
  poseInstruction: { color: '#7EC3FF', fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  poseCard: { alignItems: 'center', paddingVertical: 12 },
  poseIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#142D48', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  poseStep: { color: '#65B9FF', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  poseTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  poseDescription: { color: '#AFC3D8', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, maxWidth: 390 },
};
