import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#F4F6F9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 4,
  },
  menuButton: {
    padding: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  dropdown: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
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
    color: '#1A1D29',
  },
  logoutText: {
    color: '#E53935',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#EEF0F3',
    marginHorizontal: 12,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1D29',
  },
  roleTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#208AEF',
    backgroundColor: '#E8F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 6,
    alignSelf: 'flex-start',
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 14,
    color: '#8A8F9A',
    textTransform: 'capitalize',
    marginTop: 12,
  },
  clock: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1A1D29',
    marginBottom: 24,
  },
  markButton: {
    width: '100%',
    maxWidth: 320,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  markButtonIn: {
    backgroundColor: '#208AEF',
  },
  markButtonOut: {
    backgroundColor: '#E53935',
  },
  markButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    color: '#3D4152',
    marginBottom: 12,
    textAlign: 'center',
  },
  historySection: {
    width: '100%',
    maxWidth: 400,
    marginTop: 20,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1D29',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#A0A5B1',
    textAlign: 'center',
    marginTop: 20,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
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
    color: '#1A1D29',
  },
  historyTime: {
    fontSize: 13,
    color: '#3D4152',
    marginTop: 2,
  },
  historyLocation: {
    fontSize: 12,
    color: '#A0A5B1',
    marginTop: 2,
  },
});