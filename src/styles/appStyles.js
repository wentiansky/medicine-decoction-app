import { StyleSheet } from 'react-native'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  content: {
    flex: 1,
    padding: 16
  },
  startContainer: {
    alignItems: 'center',
    marginTop: 40
  },
  welcomeText: {
    marginBottom: 8,
    textAlign: 'center',
    color: '#1976D2'
  },
  descText: {
    marginBottom: 24,
    textAlign: 'center',
    color: '#666'
  },
  scheduleCard: {
    width: '100%',
    marginBottom: 24
  },
  cardTitle: {
    marginBottom: 12,
    fontWeight: 'bold'
  },
  phaseText: {
    marginBottom: 8,
    fontSize: 14,
    color: '#333'
  },
  permissionBanner: {
    minHeight: 46,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  permissionBannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2FE'
  },
  permissionBannerIconText: {
    color: '#0369A1',
    fontSize: 13,
    fontWeight: 'bold'
  },
  permissionBannerText: {
    flex: 1,
    color: '#374151',
    fontSize: 14
  },
  permissionBannerButton: {
    borderRadius: 8
  },
  permissionBannerButtonLabel: {
    marginHorizontal: 10,
    marginVertical: 3,
    fontSize: 13
  },
  permissionGuide: {
    margin: 20,
    padding: 22,
    borderRadius: 8,
    backgroundColor: '#fff'
  },
  permissionGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  permissionGuideTitle: {
    flex: 1,
    color: '#111827',
    fontWeight: 'bold'
  },
  permissionGuideCloseButton: {
    margin: -6
  },
  permissionGuideText: {
    marginBottom: 16,
    color: '#4B5563',
    lineHeight: 22
  },
  permissionScenarioCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  permissionScenarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8
  },
  permissionScenarioTitle: {
    flex: 1,
    color: '#111827',
    fontWeight: 'bold'
  },
  permissionScenarioBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999
  },
  permissionScenarioBadgeDone: {
    backgroundColor: '#DCFCE7'
  },
  permissionScenarioBadgePending: {
    backgroundColor: '#FEF3C7'
  },
  permissionScenarioBadgeText: {
    fontSize: 12,
    fontWeight: 'bold'
  },
  permissionScenarioBadgeTextDone: {
    color: '#166534'
  },
  permissionScenarioBadgeTextPending: {
    color: '#B45309'
  },
  permissionScenarioDetail: {
    color: '#4B5563',
    lineHeight: 21
  },
  permissionScenarioMissing: {
    marginTop: 8,
    color: '#92400E'
  },
  permissionGuideHint: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF'
  },
  permissionGuideHintTitle: {
    marginBottom: 4,
    color: '#1D4ED8',
    fontWeight: 'bold'
  },
  permissionGuideHintText: {
    color: '#1F2937',
    lineHeight: 21
  },
  permissionGuideButton: {
    marginTop: 10
  },
  timerContainer: {
    alignItems: 'center',
    marginTop: 20
  },
  timerCard: {
    width: '100%',
    marginBottom: 20,
    elevation: 8
  },
  timerContent: {
    alignItems: 'center',
    paddingVertical: 40
  },
  phaseName: {
    color: '#1976D2',
    marginBottom: 8
  },
  phaseSubtitle: {
    color: '#FF6F00',
    marginBottom: 20
  },
  timer: {
    color: '#D32F2F',
    fontWeight: 'bold'
  },
  completeCard: {
    width: '100%',
    marginBottom: 20,
    elevation: 8
  },
  completeContent: {
    alignItems: 'center',
    paddingVertical: 48
  },
  completeTitle: {
    color: '#2E7D32',
    marginBottom: 16,
    fontWeight: 'bold'
  },
  completeMark: {
    color: '#1976D2',
    marginBottom: 12
  },
  completeText: {
    color: '#555',
    textAlign: 'center'
  },
  progressCard: {
    width: '100%',
    marginBottom: 20
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  buttonContainer: {
    padding: 16,
    gap: 12
  },
  button: {
    paddingVertical: 8
  },
  buttonLabel: {
    fontSize: 16
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 12
  },
  modalTitle: {
    marginBottom: 20
  },
  input: {
    marginBottom: 16
  },
  testSettingsButton: {
    marginBottom: 16
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20
  },
  modalButton: {
    flex: 1
  }
})

export default styles
