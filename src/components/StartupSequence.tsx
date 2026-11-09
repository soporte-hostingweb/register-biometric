import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLanguage } from '../services/language';

/**
 * Arranque animado, en tres pasos:
 *  1. el logo entra de derecha a izquierda;
 *  2. «Validando dispositivo…» con un anillo que gira mientras se revisa la sesión;
 *  3. si la sesión es válida, un escudo con check y recién se entra al dashboard.
 * Sin sesión válida termina en el paso 2 y se muestra el login.
 *
 * `status` lo decide quien la usa (index.tsx): 'pending' mientras restoreSession
 * trabaja, y luego 'valid' o 'none'. `onFinish` se llama una sola vez.
 */
type Props = {
  status: 'pending' | 'valid' | 'none';
  onFinish: (result: 'valid' | 'none') => void;
};

// Fondo exacto del logo (public/icons/hwperu-splash-v5.png): así no se ve el recorte.
const BG = '#051C33';
const ACCENT = '#2F8BFF';
const useNative = Platform.OS !== 'web';

const LOGO_IN_MS = 750;
const LOGO_HOLD_MS = 650;
const MIN_VALIDATING_MS = 1400;
const SHIELD_HOLD_MS = 1100;
const START_OFFSET = 420;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function StartupSequence({ status, onFinish }: Props) {
  const { tr } = useLanguage();
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<'logo' | 'validating' | 'verified'>('logo');
  const statusRef = useRef(status);
  statusRef.current = status;
  const finished = useRef(false);

  // Desde fuera por la derecha. Valor fijo: en el pre-render web el ancho aún es 0.
  const logoX = useRef(new Animated.Value(START_OFFSET)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const stageOpacity = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const shieldScale = useRef(new Animated.Value(0.5)).current;
  const shieldOpacity = useRef(new Animated.Value(0)).current;

  // Paso 1: el logo entra.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoX, { toValue: 0, duration: LOGO_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }),
      Animated.timing(logoOpacity, { toValue: 1, duration: LOGO_IN_MS * 0.8, useNativeDriver: useNative }),
    ]).start();

    let cancelled = false;
    (async () => {
      await wait(LOGO_IN_MS + LOGO_HOLD_MS);
      if (cancelled) return;
      // Sale hacia la izquierda y entra la validación.
      Animated.parallel([
        Animated.timing(logoX, { toValue: -START_OFFSET * 0.7, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: useNative }),
        Animated.timing(logoOpacity, { toValue: 0, duration: 320, useNativeDriver: useNative }),
      ]).start();
      await wait(300);
      if (cancelled) return;
      setPhase('validating');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paso 2: anillo girando hasta que se sepa si hay sesión.
  useEffect(() => {
    if (phase !== 'validating') return;
    Animated.timing(stageOpacity, { toValue: 1, duration: 350, useNativeDriver: useNative }).start();
    const spinLoop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: useNative }));
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
    ]));
    spinLoop.start();
    pulseLoop.start();

    let cancelled = false;
    (async () => {
      const startedAt = Date.now();
      while (!cancelled && statusRef.current === 'pending') await wait(100);
      const rest = MIN_VALIDATING_MS - (Date.now() - startedAt);
      if (rest > 0) await wait(rest);
      if (cancelled) return;
      if (statusRef.current === 'valid') {
        Animated.timing(stageOpacity, { toValue: 0, duration: 250, useNativeDriver: useNative }).start();
        await wait(230);
        if (!cancelled) setPhase('verified');
      } else if (!finished.current) {
        finished.current = true;
        onFinish('none');
      }
    })();
    return () => {
      cancelled = true;
      spinLoop.stop();
      pulseLoop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Paso 3: escudo con check y al dashboard.
  useEffect(() => {
    if (phase !== 'verified') return;
    Animated.parallel([
      Animated.timing(stageOpacity, { toValue: 1, duration: 250, useNativeDriver: useNative }),
      Animated.spring(shieldScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: useNative }),
      Animated.timing(shieldOpacity, { toValue: 1, duration: 300, useNativeDriver: useNative }),
    ]).start();
    const timer = setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      onFinish('valid');
    }, SHIELD_HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const logoWidth = width > 0 ? Math.min(width * 0.78, 330) : 300;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={styles.page}>
      {/* Brillos de fondo, lejos del centro para no tapar el logo */}
      <View pointerEvents="none" style={[styles.glow, styles.glowTop]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowBottom]} />
      <View pointerEvents="none" style={styles.lineGlow} />

      {phase === 'logo' && (
        <Animated.View style={{ alignItems: 'center', opacity: logoOpacity, transform: [{ translateX: logoX }] }}>
          {/* La imagen es cuadrada con el mismo fondo que la pantalla: el cuadrado no
              se ve. El texto sube para quedar justo debajo del logotipo. */}
          <Image
            source={require('../../public/icons/hwperu-splash-v5.png')}
            style={{ width: logoWidth, height: logoWidth }}
            resizeMode="contain"
          />
          <Text style={[styles.logoCaption, { marginTop: -logoWidth * 0.36 }]}>{tr('Validating device...', 'Validando dispositivo...')}</Text>
        </Animated.View>
      )}

      {phase === 'validating' && (
        <Animated.View style={[styles.stage, { opacity: stageOpacity }]}>
          <View style={styles.ringBox}>
            <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
            <View style={styles.ringTrack} />
            <Animated.View style={[styles.ringArc, { transform: [{ rotate }] }]} />
            <View style={styles.ringCenter}>
              <Ionicons name="laptop-outline" size={58} color="#8CC8FF" />
              <View style={styles.laptopCheck}>
                <Ionicons name="checkmark" size={18} color="#4FD1FF" />
              </View>
            </View>
          </View>
          <Text style={styles.title}>{tr('Validating device...', 'Validando dispositivo...')}</Text>
          <Text style={styles.subtitle}>{tr('Please wait a moment', 'Por favor, espera un momento')}</Text>
        </Animated.View>
      )}

      {phase === 'verified' && (
        <Animated.View style={[styles.stage, { opacity: stageOpacity }]}>
          <View style={styles.ringBox}>
            <View style={styles.shieldOrbitOuter} />
            <View style={styles.shieldOrbitInner} />
            <Animated.View style={{ opacity: shieldOpacity, transform: [{ scale: shieldScale }] }}>
              <Ionicons name="shield-checkmark" size={112} color={ACCENT} />
            </Animated.View>
          </View>
          <Text style={styles.title}>{tr('Device verified', 'Dispositivo verificado')}</Text>
          <Text style={styles.subtitle}>{tr('Opening your dashboard…', 'Entrando a tu panel…')}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const RING = 190;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: '#0B4FBF' },
  glowTop: { width: 520, height: 520, top: -330, right: -230, opacity: 0.22 },
  glowBottom: { width: 560, height: 560, bottom: -400, left: -240, opacity: 0.2 },
  lineGlow: { position: 'absolute', bottom: '22%', width: 120, height: 3, borderRadius: 2, backgroundColor: ACCENT, opacity: 0.55 },
  logoCaption: { color: '#AFC4E0', fontSize: 15, marginTop: 14, letterSpacing: 0.3 },
  stage: { alignItems: 'center', paddingHorizontal: 24 },
  ringBox: { width: RING + 50, height: RING + 50, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  halo: { position: 'absolute', width: RING + 40, height: RING + 40, borderRadius: (RING + 40) / 2, borderWidth: 1, borderColor: '#1E5FB8' },
  ringTrack: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 5, borderColor: 'rgba(47, 139, 255, 0.14)' },
  ringArc: {
    position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 5,
    borderColor: 'transparent', borderTopColor: ACCENT, borderRightColor: '#3FD0FF',
  },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  laptopCheck: { position: 'absolute', top: 12 },
  shieldOrbitOuter: { position: 'absolute', width: RING + 40, height: RING + 40, borderRadius: (RING + 40) / 2, borderWidth: 1, borderColor: 'rgba(47, 139, 255, 0.25)' },
  shieldOrbitInner: { position: 'absolute', width: RING - 20, height: RING - 20, borderRadius: (RING - 20) / 2, borderWidth: 1, borderColor: 'rgba(47, 139, 255, 0.4)', backgroundColor: 'rgba(47, 139, 255, 0.06)' },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#9FB3CF', fontSize: 14, marginTop: 6, textAlign: 'center' },
});
