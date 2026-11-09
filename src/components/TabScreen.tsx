import { ReactNode, RefObject } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppTab, SessionParams } from '../services/session-params';
import { colors } from '../styles/theme';
import AppHeader from './AppHeader';
import BottomTabs from './BottomTabs';

type Props = SessionParams & {
  title: string;
  active: AppTab;
  children: ReactNode;
  /** Ancho máximo del contenido (por defecto el de un celular). */
  maxWidth?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Para desplazar el contenido desde la pantalla (p. ej. ir a una sección). */
  scrollRef?: RefObject<ScrollView | null>;
};

/**
 * El marco de las cuatro pestañas: cabecera azul, hoja clara con esquinas
 * redondeadas encima de la cabecera, contenido desplazable y barra inferior.
 */
export default function TabScreen({ title, active, children, maxWidth = 560, refreshing = false, onRefresh, scrollRef, fullName, rol, email }: Props) {
  const params = { fullName, rol, email };
  return (
    <View style={styles.page}>
      <AppHeader title={title} active={active} {...params} />
      <View style={styles.sheet}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { maxWidth }]}
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      </View>
      <BottomTabs active={active} {...params} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fondo claro: si fuera azul se vería en las esquinas redondeadas de la barra inferior.
  page: { flex: 1, backgroundColor: colors.background },
  sheet: {
    flex: 1,
    marginTop: -18,
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  content: { width: '100%', alignSelf: 'center', paddingHorizontal: 14, paddingTop: 16, paddingBottom: 28, gap: 14 },
});
