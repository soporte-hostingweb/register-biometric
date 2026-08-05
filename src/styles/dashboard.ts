import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  menuButton: {
    padding: 2,
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E3A5F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dropdown: {
    position: 'absolute',
    top: 90,
    right: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingVertical: 6,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  logoutText: {
    color: '#FF6B6B',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#2C2C2C',
    marginHorizontal: 12,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  roleTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5CADFF',
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  clockCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  date: {
    fontSize: 12,
    color: '#9A9A9A',
    textTransform: 'capitalize',
  },
  clock: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 6,
    marginBottom: 16,
  },
  markButton: {
    width: '100%',
    backgroundColor: '#208AEF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  markButtonDisabled: {
    opacity: 0.6,
  },
  markButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    color: '#C4C4C4',
    marginTop: 12,
    textAlign: 'center',
  },
  historySection: {
    width: '100%',
    maxWidth: 360,
    marginTop: 20,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#8A8A8A',
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  dotIn: {
    backgroundColor: '#208AEF',
  },
  dotOut: {
    backgroundColor: '#E53935',
  },
  historyInfo: {
    flex: 1,
  },
  historyType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  historyTime: {
    fontSize: 13,
    color: '#C4C4C4',
    marginTop: 2,
  },
  historyLocation: {
    fontSize: 12,
    color: '#8A8A8A',
    marginTop: 2,
  },
  // Nuevos estilos para Estadísticas e Historial Reciente
  statsSection: {
    width: '100%',
    maxWidth: 360,
    marginTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  statLabel: {
    fontSize: 10,
    color: '#8A8A8A',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  statValueWarn: {
    color: '#FFA726',
  },
  statValueGood: {
    color: '#66BB6A',
  },
  recentTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentItem: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  recentItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgePuntual: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  textPuntual: {
    color: '#4CAF50',
  },
  badgeTardanza: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
  },
  textTardanza: {
    color: '#FF9800',
  },
  badgeFalta: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
  },
  textFalta: {
    color: '#F44336',
  },
  recentItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentTimeText: {
    fontSize: 12,
    color: '#C4C4C4',
  },
  recentHours: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8A',
  },
  desktopContent: {
    alignItems: 'stretch',
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    padding: 24,
  },
  desktopContainer: {
    flexDirection: 'row',
    gap: 24,
    width: '100%',
  },
  desktopLeftCol: {
    flex: 1.2,
  },
  desktopRightCol: {
    flex: 1.8,
  },
});