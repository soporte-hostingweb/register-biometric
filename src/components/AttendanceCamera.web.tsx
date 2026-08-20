import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';

type CameraStep = 'tips' | 'camera' | 'preview';

type AttendanceCameraProps = {
  visible: boolean;
  attendanceType: 'Entrada' | 'Salida';
  onCancel: () => void;
  onConfirm: (photoDataUrl: string) => void;
};

const VideoElement = 'video' as any;
const CanvasElement = 'canvas' as any;

export default function AttendanceCamera({
  visible,
  attendanceType,
  onCancel,
  onConfirm,
}: AttendanceCameraProps) {
  const [step, setStep] = useState<CameraStep>('tips');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [error, setError] = useState('');
  const [startingCamera, setStartingCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!visible) {
      stopCamera();
      setStep('tips');
      setPhotoDataUrl('');
      setError('');
    }

    return stopCamera;
  }, [visible]);

  useEffect(() => {
    if (step !== 'camera' || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {
      setError('No se pudo iniciar la vista previa de la cámara.');
    });
  }, [step]);

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
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      setStep('camera');
    } catch (cameraError: any) {
      const permissionDenied = cameraError?.name === 'NotAllowedError';
      setError(
        permissionDenied
          ? 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.'
          : cameraError?.message || 'No se pudo acceder a la cámara.',
      );
    } finally {
      setStartingCamera(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      setError('Espera unos segundos hasta que la cámara esté lista.');
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / sourceWidth);
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      setError('No se pudo procesar la fotografía.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedPhoto = canvas.toDataURL('image/jpeg', 0.72);
    setPhotoDataUrl(capturedPhoto);
    stopCamera();
    setStep('preview');
    setError('');
  };

  const repeatPhoto = async () => {
    setPhotoDataUrl('');
    await startCamera();
  };

  const closeModal = () => {
    stopCamera();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={cameraStyles.backdrop}>
        <View style={cameraStyles.modalCard}>
          <View style={cameraStyles.header}>
            <View>
              <Text style={cameraStyles.eyebrow}>EVIDENCIA FACIAL</Text>
              <Text style={cameraStyles.title}>Marcar {attendanceType}</Text>
            </View>
            <Pressable onPress={closeModal} style={cameraStyles.closeButton}>
              <Ionicons name="close" size={24} color="#DDEBFF" />
            </Pressable>
          </View>

          {step === 'tips' && (
            <View>
              <View style={cameraStyles.tipsHero}>
                <Ionicons name="scan-circle-outline" size={64} color="#65B9FF" />
                <Text style={cameraStyles.tipsTitle}>Prepara tu fotografía</Text>
                <Text style={cameraStyles.tipsDescription}>
                  La foto se asociará a esta marcación como evidencia de identidad.
                </Text>
              </View>

              {[
                ['sunny-outline', 'Busca un lugar con buena iluminación.'],
                ['person-outline', 'Mira de frente y mantén todo el rostro visible.'],
                ['glasses-outline', 'Retira gorra, mascarilla o elementos que cubran el rostro.'],
                ['people-outline', 'Asegúrate de aparecer tú solo en la imagen.'],
              ].map(([icon, tip]) => (
                <View style={cameraStyles.tipRow} key={tip}>
                  <Ionicons name={icon as any} size={21} color="#7EC3FF" />
                  <Text style={cameraStyles.tipText}>{tip}</Text>
                </View>
              ))}

              {error ? <Text style={cameraStyles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[cameraStyles.primaryButton, startingCamera && cameraStyles.disabledButton]}
                onPress={startCamera}
                disabled={startingCamera}
              >
                <Ionicons name="camera-outline" size={21} color="#071C35" />
                <Text style={cameraStyles.primaryButtonText}>
                  {startingCamera ? 'Abriendo cámara...' : 'Continuar con la cámara'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'camera' && (
            <View>
              <View style={cameraStyles.cameraFrame}>
                <VideoElement
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={cameraStyles.video as any}
                />
                <View pointerEvents="none" style={cameraStyles.faceGuide} />
                <Text style={cameraStyles.cameraHint}>Centra tu rostro dentro del óvalo</Text>
              </View>
              <CanvasElement ref={canvasRef} style={{ display: 'none' }} />
              {error ? <Text style={cameraStyles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={cameraStyles.captureButton} onPress={capturePhoto}>
                <View style={cameraStyles.captureButtonInner} />
              </TouchableOpacity>
            </View>
          )}

          {step === 'preview' && (
            <View>
              <Text style={cameraStyles.previewLabel}>Revisa que tu rostro se vea claramente</Text>
              <Image source={{ uri: photoDataUrl }} style={cameraStyles.previewImage} />
              <View style={cameraStyles.actionRow}>
                <TouchableOpacity style={cameraStyles.secondaryButton} onPress={repeatPhoto}>
                  <Ionicons name="refresh-outline" size={20} color="#CFE7FF" />
                  <Text style={cameraStyles.secondaryButtonText}>Repetir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cameraStyles.primaryButton, cameraStyles.confirmButton]}
                  onPress={() => onConfirm(photoDataUrl)}
                >
                  <Ionicons name="checkmark-circle-outline" size={21} color="#071C35" />
                  <Text style={cameraStyles.primaryButtonText}>Usar esta foto</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const cameraStyles: Record<string, any> = {
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '94vh',
    overflow: 'auto',
    backgroundColor: '#0E1C2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#294765',
    padding: 20,
    boxShadow: '0 22px 70px rgba(0, 0, 0, 0.5)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  eyebrow: { color: '#65B9FF', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 3 },
  closeButton: { padding: 8, borderRadius: 20, backgroundColor: '#192C43' },
  tipsHero: { alignItems: 'center', marginBottom: 18 },
  tipsTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 5 },
  tipsDescription: { color: '#AFC3D8', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#14273D',
    borderRadius: 11,
    padding: 12,
    marginBottom: 8,
  },
  tipText: { flex: 1, color: '#DCE9F7', fontSize: 13, lineHeight: 18 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#77C3FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 15,
  },
  primaryButtonText: { color: '#071C35', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  errorText: { color: '#FF9C9C', fontSize: 12.5, textAlign: 'center', marginTop: 10 },
  cameraFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#02070C',
    position: 'relative',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  faceGuide: {
    position: 'absolute',
    width: '48%',
    height: '72%',
    left: '26%',
    top: '10%',
    borderWidth: 3,
    borderColor: '#71C5FF',
    borderRadius: 999,
    boxShadow: '0 0 0 999px rgba(0, 0, 0, 0.18)',
  },
  cameraHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.66)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    fontSize: 12,
  },
  captureButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  captureButtonInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#77C3FF' },
  previewLabel: { color: '#DCE9F7', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  previewImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: '#02070C' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#47749D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryButtonText: { color: '#CFE7FF', fontSize: 14, fontWeight: '700' },
  confirmButton: { flex: 1.4, marginTop: 0 },
};
