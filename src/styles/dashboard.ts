import { StyleSheet } from 'react-native';
import { cardShadow, colors } from './theme';

// Pestaña Inicio: tarjeta del colaborador, reloj, estado del día, los dos
// botones de marcar y las últimas marcaciones.
export const styles = StyleSheet.create({
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  wideCol: { flex: 1, gap: 14, minWidth: 0 },

  card: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, ...cardShadow },

  // Colaborador
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { width: 78, height: 78 },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  onlineDot: { position: 'absolute', right: 2, bottom: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.green, borderWidth: 3, borderColor: colors.card },
  profileInfo: { flex: 1, minWidth: 0, gap: 3 },
  profileName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileMeta: { color: colors.muted, fontSize: 13.5, flexShrink: 1 },
  profileButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  profileButtonText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },

  // Reloj
  clockCard: { borderRadius: 20, borderWidth: 1, borderColor: '#CFDDF6', backgroundColor: '#E4ECFB', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, overflow: 'hidden' },
  clockIconRow: { flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%' },
  clockLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: '#C3D4F3' },
  clockIcon: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  clock: { color: colors.text, fontSize: 56, fontWeight: '900', letterSpacing: 1, marginTop: 6, fontVariant: ['tabular-nums'] },
  clockDate: { color: colors.muted, fontSize: 17, fontWeight: '500' },
  clockShift: { color: colors.primaryText, fontSize: 12.5, fontWeight: '700', marginTop: 6 },

  // Estado del día
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingVertical: 13, paddingHorizontal: 14 },
  bannerText: { fontSize: 14.5, fontWeight: '700', textAlign: 'center', flexShrink: 1 },

  // Botones
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: 74, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12, ...cardShadow, shadowOpacity: 0.18 },
  actionIn: { backgroundColor: colors.primary },
  actionOut: { backgroundColor: colors.orange },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', lineHeight: 21 },

  // Modal del PIN: error y enlace para restablecerlo
  pinErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', backgroundColor: colors.redSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  pinErrorText: { flex: 1, color: colors.red, fontSize: 13, fontWeight: '700' },
  pinResetLink: { alignSelf: 'center', paddingVertical: 8, marginTop: 4 },
  pinResetText: { color: colors.primaryText, fontSize: 13.5, fontWeight: '700', textDecorationLine: 'underline' },

  // Historial
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  linkButtonText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyHint: { color: colors.muted, fontSize: 13, textAlign: 'center' },

  // Modales
  overlay: { flex: 1, backgroundColor: 'rgba(10, 20, 45, 0.5)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 22, padding: 22, alignItems: 'center' },
  modalIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  modalMessage: { color: colors.primaryText, fontSize: 13, textAlign: 'center', marginTop: 10 },
  modalButton: { width: '100%', minHeight: 50, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  modalButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalLater: { paddingVertical: 12, marginTop: 4 },
  modalLaterText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  pinInput: {
    width: '100%', marginTop: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, borderRadius: 14,
    paddingVertical: 14, textAlign: 'center', fontSize: 26, letterSpacing: 10, color: colors.text, fontWeight: '800',
  },
  option: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft, marginTop: 10 },
  optionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  optionHint: { color: colors.muted, fontSize: 12.5, marginTop: 1 },
});
