import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, ToastAndroid } from 'react-native'
import { getAndroidAlarmModule } from '../androidAlarmScheduler'

const {
  createAndroidAlarmPermissionChecklist,
  createPermissionGuideState,
  createPermissionScenarioCards,
  getPermissionIssueGuide
} = require('../timerCore')

export default function useAndroidAlarmPermissions({
  showLogScreen,
  writeLog
}) {
  const [alarmPermissionIssues, setAlarmPermissionIssues] = useState([])
  const [showPermissionGuide, setShowPermissionGuide] = useState(false)
  const [permissionGuideDismissed, setPermissionGuideDismissed] = useState(false)
  const alarmPermissionStateRef = useRef(null)

  const permissionGuideState = useMemo(
    () => createPermissionGuideState(alarmPermissionIssues),
    [alarmPermissionIssues]
  )
  const permissionScenarioCards = useMemo(
    () => createPermissionScenarioCards(alarmPermissionIssues),
    [alarmPermissionIssues]
  )
  const hasPendingBackgroundReminder = permissionScenarioCards.some(
    card => card.id === 'backgroundReminder' && !card.completed
  )
  const visiblePermissionScenarioCards = permissionScenarioCards.filter(
    card => hasPendingBackgroundReminder || card.id === 'lockScreenReminder'
  )
  const currentPermissionIssue = permissionGuideState.currentIssue
  const permissionGuidePrimaryIssue = currentPermissionIssue || {
    id: 'lockScreenReminder',
    title: '锁屏提醒',
    action: 'openOverlaySettings'
  }
  const shouldShowPermissionRecheckButton =
    currentPermissionIssue?.id === 'overlay'
  const currentPermissionGuide = getPermissionIssueGuide(
    permissionGuidePrimaryIssue.id
  )

  useEffect(() => {
    if (Platform.OS !== 'android') return

    if (
      alarmPermissionIssues.length > 0 &&
      !permissionGuideDismissed &&
      !showLogScreen
    ) {
      setShowPermissionGuide(true)
    }
  }, [alarmPermissionIssues, permissionGuideDismissed, showLogScreen])

  const openPermissionGuide = () => {
    setShowPermissionGuide(true)
  }

  const closePermissionGuide = () => {
    setPermissionGuideDismissed(true)
    setShowPermissionGuide(false)
  }

  const refreshAndroidAlarmPermissions = async ({ showAlert = false } = {}) => {
    const alarmModule = getAndroidAlarmModule()
    if (!alarmModule?.getAlarmPermissionState) {
      setAlarmPermissionIssues([])
      return []
    }

    try {
      const state = await alarmModule.getAlarmPermissionState()
      alarmPermissionStateRef.current = state
      const issues = createAndroidAlarmPermissionChecklist(state)
      setAlarmPermissionIssues(issues)
      writeLog('info', 'permissions', 'Android alarm permissions checked', {
        state,
        missing: issues.map(issue => issue.id)
      })

      if (issues.length > 0 && showAlert && !permissionGuideDismissed) {
        setShowPermissionGuide(true)
      }

      return issues
    } catch (error) {
      console.warn('Failed to check Android alarm permissions:', error)
      writeLog('error', 'permissions', 'failed to check Android alarm permissions', error)
      alarmPermissionStateRef.current = null
      return []
    }
  }

  const openAndroidAlarmSetting = async issue => {
    const alarmModule = getAndroidAlarmModule()
    if (!issue?.action || !alarmModule?.[issue.action]) return

    try {
      writeLog('info', 'permissions', 'opening Android alarm setting', issue)
      if (Platform.OS === 'android' && issue.id === 'overlay') {
        ToastAndroid.show(
          '先开启「显示悬浮窗」；如果系统里还有「后台弹出界面」「锁屏显示」，后面也一并开启',
          ToastAndroid.LONG
        )
      }
      if (
        Platform.OS === 'android' &&
        (
          issue.id === 'backgroundPopup' ||
          issue.id === 'lockScreenDisplay' ||
          issue.id === 'lockScreenReminder'
        )
      ) {
        ToastAndroid.show(
          '进入后点「其他权限」，把「后台弹出界面」「锁屏显示」允许，返回后再确认',
          ToastAndroid.LONG
        )
      }
      await alarmModule[issue.action]()
    } catch (error) {
      console.warn('Failed to open Android alarm settings:', error)
      writeLog('error', 'permissions', 'failed to open Android alarm setting', {
        issue,
        error
      })
    }
  }

  return {
    alarmPermissionIssues,
    showPermissionGuide,
    hasPendingBackgroundReminder,
    visiblePermissionScenarioCards,
    currentPermissionGuide,
    permissionGuidePrimaryIssue,
    shouldShowPermissionRecheckButton,
    openPermissionGuide,
    closePermissionGuide,
    refreshAndroidAlarmPermissions,
    openAndroidAlarmSetting
  }
}
