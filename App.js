import { useEffect, useMemo, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  BackHandler,
  Platform,
  AppState,
  NativeModules,
  ToastAndroid
} from 'react-native'
import {
  PaperProvider,
  Text,
  Button,
  Card,
  Appbar,
  TextInput,
  Modal,
  Portal
} from 'react-native-paper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import LogScreen from './src/LogScreen'
const { createAppLogger } = require('./src/appLogger')
const {
  DEFAULT_SETTINGS,
  NATIVE_ALARM_REQUEST_CODE,
  NOTIFICATION_CHANNEL_ID,
  buildPhases,
  completePhase,
  createAndroidAlarmPermissionChecklist,
  createNativeAlarmRequest,
  createPermissionGuideState,
  createPermissionScenarioCards,
  createPhaseNotificationRequest,
  getCompletionMessage,
  getAndroidBackAction,
  getPhaseDisplaySeconds,
  getPhaseDurationSeconds,
  getPhaseInfo,
  getPermissionIssueGuide,
  isFlowComplete,
  normalizeSettings,
  shouldSchedulePhaseReminder
} = require('./src/timerCore')

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [tempSettings, setTempSettings] = useState(settings)
  const [isRunning, setIsRunning] = useState(false)
  const [isWaitingForContinue, setIsWaitingForContinue] = useState(false)
  const [currentPhase, setCurrentPhase] = useState(1) // 1-7 phases
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showLogScreen, setShowLogScreen] = useState(false)
  const [notificationSupported, setNotificationSupported] = useState(false)
  const [alarmPermissionIssues, setAlarmPermissionIssues] = useState([])
  const [showPermissionGuide, setShowPermissionGuide] = useState(false)
  const [permissionGuideDismissed, setPermissionGuideDismissed] = useState(false)
  const timerRef = useRef(null)
  const appLoggerRef = useRef(null)
  const notificationsRef = useRef(null)
  const scheduledNotificationId = useRef(null)
  const scheduledPhaseRef = useRef(null)
  const phaseDeadlineRef = useRef(null)
  const alarmPermissionStateRef = useRef(null)
  const appStateRef = useRef(AppState.currentState)
  const lastExitAttemptAtRef = useRef(0)
  const phases = useMemo(() => buildPhases(settings), [settings])
  const flowComplete = isFlowComplete(currentPhase)
  const displaySeconds = getPhaseDisplaySeconds({
    phaseId: currentPhase,
    settings,
    timeLeft,
    isWaitingForContinue
  })
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
    id: 'overlay',
    title: '允许悬浮窗',
    action: 'openOverlaySettings'
  }
  const shouldShowPermissionRecheckButton =
    currentPermissionIssue?.id === 'overlay'
  const currentPermissionGuide = getPermissionIssueGuide(
    permissionGuidePrimaryIssue.id
  )

  if (!appLoggerRef.current) {
    appLoggerRef.current = createAppLogger({ storage: AsyncStorage })
  }

  const writeLog = (level, moduleName, message, details) => {
    appLoggerRef.current[level](moduleName, message, details).catch(error => {
      console.warn('Failed to write app log:', error)
    })
  }

  const syncNativeAlarmDebugEvents = async () => {
    const alarmModule = getAndroidAlarmModule()
    if (!alarmModule?.getNativeAlarmDebugEvents) return

    try {
      const rawEvents = await alarmModule.getNativeAlarmDebugEvents()
      const events = JSON.parse(rawEvents)
      if (!Array.isArray(events) || events.length === 0) return

      for (const event of [...events].reverse()) {
        const level = ['info', 'warn', 'error'].includes(event.level)
          ? event.level
          : 'info'
        await appLoggerRef.current[level](
          event.module || 'native:alarm',
          event.message || 'native alarm event',
          {
            nativeTimestamp: event.timestamp,
            ...(event.details || {})
          }
        )
      }

      if (alarmModule.clearNativeAlarmDebugEvents) {
        await alarmModule.clearNativeAlarmDebugEvents()
      }
    } catch (error) {
      writeLog('error', 'logs', 'failed to sync native alarm debug events', error)
    }
  }

  // Load settings from storage on mount
  useEffect(() => {
    loadSettings()
    initNotifications()
  }, [])

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('medicineSettings')
      if (stored) {
        const parsed = normalizeSettings(JSON.parse(stored))
        setSettings(parsed)
        setTempSettings(parsed)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const initNotifications = async () => {
    if (Platform.OS === 'web') {
      setNotificationSupported(false)
      writeLog('warn', 'notifications', 'notifications unavailable on web')
      return
    }

    try {
      writeLog('info', 'notifications', 'initializing notification channel')
      const Notifications = await import('expo-notifications')
      notificationsRef.current = Notifications
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          priority: Notifications.AndroidNotificationPriority.MAX
        })
      })

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(
          NOTIFICATION_CHANNEL_ID,
          {
            name: '熬中药计时提醒',
            importance: Notifications.AndroidImportance.MAX,
            enableVibrate: true,
            vibrationPattern: [0, 500, 250, 500],
            audioAttributes: {
              usage: Notifications.AndroidAudioUsage.ALARM,
              contentType: Notifications.AndroidAudioContentType.SONIFICATION
            },
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PUBLIC
          }
        )
      }

      const { status } = await Notifications.requestPermissionsAsync()
      const granted = status === 'granted'
      setNotificationSupported(granted)
      writeLog('info', 'notifications', 'notification permission checked', {
        status,
        granted
      })
      refreshAndroidAlarmPermissions()
    } catch (error) {
      console.warn('Notifications unavailable in this environment:', error)
      writeLog('error', 'notifications', 'notification initialization failed', error)
      setNotificationSupported(false)
    }
  }

  const getAndroidAlarmModule = () => {
    if (Platform.OS !== 'android') return null
    return NativeModules.AndroidAlarmScheduler || null
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
        (issue.id === 'backgroundPopup' || issue.id === 'lockScreenDisplay')
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

      const missingOverlayPermission = issues.some(
        issue => issue.id === 'overlay'
      )
      if (showPermissionGuide && !missingOverlayPermission) {
        setShowPermissionGuide(false)
      }

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

  const saveSettings = async () => {
    const safeSettings = normalizeSettings(tempSettings)
    try {
      await AsyncStorage.setItem(
        'medicineSettings',
        JSON.stringify(safeSettings)
      )
      writeLog('info', 'settings', 'settings saved', safeSettings)
      setSettings(safeSettings)
      setTempSettings(safeSettings)
      setShowSettingsModal(false)
    } catch (error) {
      console.error('Error saving settings:', error)
      writeLog('error', 'settings', 'failed to save settings', error)
    }
  }

  const fillTestSettings = () => {
    const testSettings = {
      soakTime: 0.11,
      highHeatTime: 0.11,
      lowHeatTime: 0.11
    }
    setTempSettings(testSettings)
    writeLog('info', 'settings', 'test settings filled', testSettings)
  }

  const sendImmediateNotification = async phase => {
    const message = getCompletionMessage(phase)

    if (notificationSupported && notificationsRef.current) {
      try {
        await notificationsRef.current.scheduleNotificationAsync({
          content: {
            title: '熬中药提醒',
            body: message,
            sound: 'default',
            priority: 'max'
          },
          trigger:
            Platform.OS === 'android'
              ? { channelId: NOTIFICATION_CHANNEL_ID }
              : null
        })
        return
      } catch (error) {
        console.warn(
          'Failed to send notification, falling back to alert:',
          error
        )
      }
    }

    Alert.alert('熬中药提醒', message)
  }

  const cancelScheduledNotification = async () => {
    const notificationId = scheduledNotificationId.current
    scheduledNotificationId.current = null
    scheduledPhaseRef.current = null
    phaseDeadlineRef.current = null

    if (
      Platform.OS === 'android' &&
      NativeModules.AndroidAlarmScheduler
    ) {
      try {
        writeLog('info', 'alarm', 'canceling native alarm')
        await NativeModules.AndroidAlarmScheduler.cancelAlarm(
          NATIVE_ALARM_REQUEST_CODE
        )
      } catch (error) {
        console.warn('Failed to cancel native alarm:', error)
        writeLog('warn', 'alarm', 'failed to cancel native alarm', error)
      }
    }

    if (notificationId && notificationsRef.current) {
      try {
        await notificationsRef.current.cancelScheduledNotificationAsync(
          notificationId
        )
      } catch (error) {
        console.warn('Failed to cancel scheduled notification:', error)
        writeLog('warn', 'notifications', 'failed to cancel scheduled notification', error)
      }
    }
  }

  const schedulePhaseNotification = async (phaseInfo, seconds) => {
    await cancelScheduledNotification()

    try {
      if (
        Platform.OS === 'android' &&
        NativeModules.AndroidAlarmScheduler
      ) {
        const alarm = createNativeAlarmRequest(phaseInfo, seconds)
        writeLog('info', 'alarm', 'scheduling native Android alarm', {
          phaseId: phaseInfo.id,
          seconds: alarm.seconds
        })
        await NativeModules.AndroidAlarmScheduler.scheduleAlarm(
          alarm.requestCode,
          alarm.seconds,
          alarm.title,
          alarm.body
        )
        phaseDeadlineRef.current = Date.now() + alarm.seconds * 1000
        scheduledPhaseRef.current = phaseInfo.id
        writeLog('info', 'alarm', 'native Android alarm scheduled', {
          phaseId: phaseInfo.id,
          deadline: phaseDeadlineRef.current
        })
        return
      }

      if (!notificationSupported || !notificationsRef.current) {
        return
      }

      const id = await notificationsRef.current.scheduleNotificationAsync({
        ...createPhaseNotificationRequest(phaseInfo, seconds)
      })
      scheduledNotificationId.current = id
      phaseDeadlineRef.current =
        Date.now() +
        createNativeAlarmRequest(phaseInfo, seconds).seconds * 1000
      scheduledPhaseRef.current = phaseInfo.id
      writeLog('info', 'notifications', 'Expo notification scheduled', {
        phaseId: phaseInfo.id,
        notificationId: id,
        seconds
      })
    } catch (error) {
      if (error?.code === 'ERR_ANDROID_EXACT_ALARM_PERMISSION') {
        writeLog('error', 'alarm', 'native alarm blocked by exact alarm permission', error)
        await refreshAndroidAlarmPermissions({ showAlert: true })
        return
      }

      console.warn('Failed to schedule notification:', error)
      writeLog('error', 'alarm', 'failed to schedule phase reminder', error)
    }
  }

  const finishCurrentPhase = () => {
    const phaseToComplete = currentPhase
    const completionMessage = getCompletionMessage(phaseToComplete)
    writeLog('info', 'timer', 'phase finished', {
      phase: phaseToComplete,
      appState: appStateRef.current
    })

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (appStateRef.current === 'active') {
      const alarmModule = getAndroidAlarmModule()

      if (
        Platform.OS === 'android' &&
        alarmModule?.presentAlarmNow
      ) {
        cancelScheduledNotification()
        writeLog('info', 'timer', 'requesting native alarm presentation from active app', {
          phase: phaseToComplete
        })
        alarmModule
          .presentAlarmNow('熬中药提醒', completionMessage)
          .catch(error => {
            writeLog('error', 'alarm', 'failed to present native alarm from active app', error)
            Alert.alert('熬中药提醒', completionMessage)
          })
      } else {
        cancelScheduledNotification()
        writeLog('info', 'timer', 'showing in-app fallback alert', {
          phase: phaseToComplete
        })
        Alert.alert('熬中药提醒', completionMessage)
      }
    } else {
      scheduledPhaseRef.current = null
      phaseDeadlineRef.current = null
    }

    const nextState = completePhase(phaseToComplete)
    setCurrentPhase(nextState.currentPhase)
    setTimeLeft(nextState.timeLeft)
    setIsRunning(nextState.isRunning)
    setIsWaitingForContinue(nextState.isWaitingForContinue)
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      writeLog('info', 'appState', 'app state changed', {
        from: appStateRef.current,
        to: nextAppState
      })

      if (nextAppState === 'active') {
        syncNativeAlarmDebugEvents()
        refreshAndroidAlarmPermissions()
      }

      if (
        nextAppState === 'active' &&
        isRunning &&
        phaseDeadlineRef.current &&
        Date.now() >= phaseDeadlineRef.current
      ) {
        finishCurrentPhase()
      }

      appStateRef.current = nextAppState
    })

    return () => subscription.remove()
  }, [isRunning, currentPhase])

  useEffect(() => {
    if (Platform.OS !== 'android') return

    if (alarmPermissionIssues.length === 0) {
      setShowPermissionGuide(false)
      return
    }

    if (!permissionGuideDismissed && !showLogScreen) {
      setShowPermissionGuide(true)
    }
  }, [alarmPermissionIssues, permissionGuideDismissed, showLogScreen])

  useEffect(() => {
    if (Platform.OS !== 'android') return

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const backAction = getAndroidBackAction({
        showSettingsModal,
        showPermissionGuide,
        showLogScreen,
        lastExitAttemptAt: lastExitAttemptAtRef.current
      })

      if (backAction.action === 'closeSettingsModal') {
        setShowSettingsModal(false)
        return true
      }

      if (backAction.action === 'closePermissionGuide') {
        setPermissionGuideDismissed(true)
        setShowPermissionGuide(false)
        return true
      }

      if (backAction.action === 'closeLogScreen') {
        setShowLogScreen(false)
        return true
      }

      if (backAction.action === 'exitApp') {
        lastExitAttemptAtRef.current = backAction.lastExitAttemptAt
        BackHandler.exitApp()
        return true
      }

      lastExitAttemptAtRef.current = backAction.lastExitAttemptAt
      ToastAndroid.show('再按一次退出应用', ToastAndroid.SHORT)
      return true
    })

    return () => subscription.remove()
  }, [showSettingsModal, showPermissionGuide, showLogScreen])

  useEffect(() => {
    if (!isRunning || isWaitingForContinue) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    if (currentPhase > 7) {
      setIsRunning(false)
      setTimeLeft(0)
      sendImmediateNotification(8)
      return
    }

    if (timeLeft === 0) {
      const phaseInfo = getPhaseInfo(currentPhase, settings)
      setTimeLeft(getPhaseDurationSeconds(phaseInfo))
      return
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          finishCurrentPhase()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [
    isRunning,
    isWaitingForContinue,
    currentPhase,
    timeLeft,
    settings,
    notificationSupported
  ])

  useEffect(() => {
    if (!shouldSchedulePhaseReminder({
      isRunning,
      isWaitingForContinue,
      currentPhase,
      timeLeft,
      scheduledPhase: scheduledPhaseRef.current
    })) {
      return
    }

    const phaseInfo = getPhaseInfo(currentPhase, settings)
    schedulePhaseNotification(phaseInfo, timeLeft)
  }, [
    isRunning,
    isWaitingForContinue,
    currentPhase,
    timeLeft,
    notificationSupported,
    settings
  ])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      cancelScheduledNotification()
    }
  }, [])

  const startTimer = async () => {
    writeLog('info', 'timer', 'start requested', {
      phase: currentPhase,
      timeLeft,
      waiting: isWaitingForContinue
    })
    const issues = await refreshAndroidAlarmPermissions({ showAlert: true })
    if (issues.length > 0) {
      writeLog('warn', 'timer', 'start continuing with missing permissions', {
        missing: issues.map(issue => issue.id)
      })
    }

    if (currentPhase > 7) {
      setCurrentPhase(1)
      setTimeLeft(0)
    }
    setIsWaitingForContinue(false)
    setIsRunning(true)
  }

  const restartTimer = async () => {
    writeLog('info', 'timer', 'restart requested')
    const issues = await refreshAndroidAlarmPermissions({ showAlert: true })
    if (issues.length > 0) {
      writeLog('warn', 'timer', 'restart continuing with missing permissions', {
        missing: issues.map(issue => issue.id)
      })
    }

    setCurrentPhase(1)
    setTimeLeft(0)
    setIsWaitingForContinue(false)
    setIsRunning(true)
  }

  const stopTimer = () => {
    writeLog('info', 'timer', 'timer reset requested', {
      phase: currentPhase,
      timeLeft
    })
    setIsRunning(false)
    setIsWaitingForContinue(false)
    setCurrentPhase(1)
    setTimeLeft(0)
    phaseDeadlineRef.current = null
    cancelScheduledNotification()
  }

  const pauseTimer = () => {
    writeLog('info', 'timer', 'timer pause requested', {
      phase: currentPhase,
      timeLeft
    })
    setIsRunning(false)
    setIsWaitingForContinue(false)
    phaseDeadlineRef.current = null
    cancelScheduledNotification()
  }

  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <SafeAreaProvider>
      <PaperProvider>
        <StatusBar style="dark" />
        <Appbar.Header>
          {showLogScreen && (
            <Appbar.BackAction onPress={() => setShowLogScreen(false)} />
          )}
          <Appbar.Content
            title={showLogScreen ? '运行日志' : '熬中药计时器'}
            subtitle={showLogScreen ? '真机调试线索' : '智能提醒'}
          />
          {showLogScreen ? null : (
            <>
              <Appbar.Action
                icon="text-box-outline"
                onPress={async () => {
                  await syncNativeAlarmDebugEvents()
                  writeLog('info', 'logs', 'log screen opened')
                  setShowLogScreen(true)
                }}
              />
              <Appbar.Action
                icon="cog"
                onPress={() => {
                  setTempSettings(settings)
                  setShowSettingsModal(true)
                }}
              />
            </>
          )}
        </Appbar.Header>

        {showLogScreen ? (
          <LogScreen logger={appLoggerRef.current} />
        ) : (
          <View style={styles.container}>
          <Portal>
            <Modal
              visible={showSettingsModal}
              onDismiss={() => setShowSettingsModal(false)}
              contentContainerStyle={styles.modalContent}
            >
              <Text variant="headlineSmall" style={styles.modalTitle}>
                配置时间
              </Text>
              <Button
                mode="outlined"
                onPress={fillTestSettings}
                style={styles.testSettingsButton}
              >
                填入测试值 0.11 分钟
              </Button>
              <TextInput
                label="泡水时间（分钟）"
                value={tempSettings.soakTime.toString()}
                onChangeText={text =>
                  setTempSettings({
                    ...tempSettings,
                    soakTime: text
                  })
                }
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <TextInput
                label="大火熬药时间（分钟）"
                value={tempSettings.highHeatTime.toString()}
                onChangeText={text =>
                  setTempSettings({
                    ...tempSettings,
                    highHeatTime: text
                  })
                }
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <TextInput
                label="小火熬药时间（分钟）"
                value={tempSettings.lowHeatTime.toString()}
                onChangeText={text =>
                  setTempSettings({
                    ...tempSettings,
                    lowHeatTime: text
                  })
                }
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <View style={styles.modalButtons}>
                <Button
                  mode="outlined"
                  onPress={() => setShowSettingsModal(false)}
                  style={styles.modalButton}
                >
                  取消
                </Button>
                <Button
                  mode="contained"
                  onPress={saveSettings}
                  style={styles.modalButton}
                >
                  保存
                </Button>
              </View>
            </Modal>
            <Modal
              visible={
                showPermissionGuide &&
                !showSettingsModal
              }
              onDismiss={() => {
                setPermissionGuideDismissed(true)
                setShowPermissionGuide(false)
              }}
              contentContainerStyle={styles.permissionGuide}
            >
              <Text variant="headlineSmall" style={styles.permissionGuideTitle}>
                开启可靠提醒
              </Text>
              <Text variant="bodyMedium" style={styles.permissionGuideText}>
                为了在不同场景下都及时提醒你，建议按下面两步逐步开启权限。
              </Text>
              {visiblePermissionScenarioCards.map(card => (
                <View key={card.id} style={styles.permissionScenarioCard}>
                  <View style={styles.permissionScenarioHeader}>
                    <Text style={styles.permissionScenarioTitle}>
                      {card.id === 'lockScreenReminder' && !hasPendingBackgroundReminder
                        ? '锁屏提醒'
                        : card.title}
                    </Text>
                    <View
                      style={[
                        styles.permissionScenarioBadge,
                        card.completed
                          ? styles.permissionScenarioBadgeDone
                          : styles.permissionScenarioBadgePending
                      ]}
                    >
                      <Text
                        style={[
                          styles.permissionScenarioBadgeText,
                          card.completed
                            ? styles.permissionScenarioBadgeTextDone
                            : styles.permissionScenarioBadgeTextPending
                        ]}
                      >
                        {card.statusText}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.permissionScenarioDetail}>{card.detail}</Text>
                  {card.id === 'lockScreenReminder' &&
                  !card.completed &&
                  card.missingTitles.length > 0 ? (
                    <Text style={styles.permissionScenarioMissing}>
                      还需开启：{card.missingTitles.join('、')}
                    </Text>
                  ) : null}
                </View>
              ))}
              <View style={styles.permissionGuideHint}>
                <Text style={styles.permissionGuideHintTitle}>
                  下一步怎么操作
                </Text>
                <Text style={styles.permissionGuideHintText}>
                  {currentPermissionGuide.settingHint}
                </Text>
              </View>
              <Button
                mode="contained"
                onPress={() => openAndroidAlarmSetting(permissionGuidePrimaryIssue)}
                style={styles.permissionGuideButton}
              >
                去开启权限
              </Button>
              {shouldShowPermissionRecheckButton ? (
                <Button
                  mode="outlined"
                  onPress={() => refreshAndroidAlarmPermissions()}
                  style={styles.permissionGuideButton}
                >
                  重新检测
                </Button>
              ) : null}
              <Button
                mode="text"
                onPress={() => {
                  setPermissionGuideDismissed(true)
                  setShowPermissionGuide(false)
                }}
                style={styles.permissionGuideButton}
              >
                稍后再说
              </Button>
            </Modal>
          </Portal>

          <ScrollView style={styles.content}>
            {Platform.OS === 'android' && (
              <View style={styles.permissionBanner}>
                <View style={styles.permissionBannerIcon}>
                  <Text style={styles.permissionBannerIconText}>权</Text>
                </View>
                <Text
                  style={styles.permissionBannerText}
                  numberOfLines={1}
                >
                  后台/锁屏提醒权限可按需开启
                </Text>
                <Button
                  mode="contained-tonal"
                  compact
                  onPress={() => setShowPermissionGuide(true)}
                  style={styles.permissionBannerButton}
                  labelStyle={styles.permissionBannerButtonLabel}
                >
                  开启
                </Button>
              </View>
            )}

            {flowComplete ? (
              <View style={styles.timerContainer}>
                <Card style={styles.completeCard}>
                  <Card.Content style={styles.completeContent}>
                    <Text variant="displaySmall" style={styles.completeTitle}>
                      熬药完成
                    </Text>
                    <Text variant="headlineSmall" style={styles.completeMark}>
                      全部阶段已完成
                    </Text>
                    <Text variant="bodyLarge" style={styles.completeText}>
                      可以关火收药了
                    </Text>
                  </Card.Content>
                </Card>
                <Card style={styles.progressCard}>
                  <Card.Content>
                    <Text variant="labelMedium">进度</Text>
                    <View style={styles.progressBar}>
                      {phases.map(phase => (
                        <View
                          key={phase.id}
                          style={[
                            styles.progressDot,
                            { backgroundColor: '#4CAF50' }
                          ]}
                        />
                      ))}
                    </View>
                  </Card.Content>
                </Card>
              </View>
            ) : !isRunning &&
              !isWaitingForContinue &&
              currentPhase === 1 &&
              timeLeft === 0 ? (
              <View style={styles.startContainer}>
                <Text variant="displayMedium" style={styles.welcomeText}>
                  熬中药计时器
                </Text>
                <Text variant="bodyLarge" style={styles.descText}>
                  准备好开始熬中药了吗？
                </Text>
                <Card style={styles.scheduleCard}>
                  <Card.Content>
                    <Text variant="titleMedium" style={styles.cardTitle}>
                      今天的流程
                    </Text>
                    {phases.map((phase, index) => (
                      <Text key={index} style={styles.phaseText}>
                        • {phase.shortName}: {phase.description}
                      </Text>
                    ))}
                  </Card.Content>
                </Card>
              </View>
            ) : (
              <View style={styles.timerContainer}>
                <Card style={styles.timerCard}>
                  <Card.Content style={styles.timerContent}>
                    {currentPhase <= 7 ? (
                      <>
                        <Text variant="headlineSmall" style={styles.phaseName}>
                          {getPhaseInfo(currentPhase, settings).name}
                        </Text>
                        {getPhaseInfo(currentPhase, settings).subtitle && (
                          <Text
                            variant="titleMedium"
                            style={styles.phaseSubtitle}
                          >
                            {getPhaseInfo(currentPhase, settings).subtitle}
                          </Text>
                        )}
                        <Text variant="displayLarge" style={styles.timer}>
                          {formatTime(displaySeconds)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text variant="headlineSmall">✓ 完成！</Text>
                        <Text variant="bodyLarge">所有阶段已完成</Text>
                      </>
                    )}
                  </Card.Content>
                </Card>

                {currentPhase <= 7 && (
                  <Card style={styles.progressCard}>
                    <Card.Content>
                      <Text variant="labelMedium">进度</Text>
                      <View style={styles.progressBar}>
                        {phases.map((phase, index) => (
                          <View
                            key={index}
                            style={[
                              styles.progressDot,
                              {
                                backgroundColor:
                                  phase.id < currentPhase
                                    ? '#4CAF50'
                                    : phase.id === currentPhase
                                      ? '#2196F3'
                                      : '#E0E0E0'
                              }
                            ]}
                          />
                        ))}
                      </View>
                    </Card.Content>
                  </Card>
                )}
              </View>
            )}

            <View style={styles.buttonContainer}>
              {flowComplete ? (
                <>
                  <Button
                    mode="contained"
                    onPress={restartTimer}
                    style={styles.button}
                    labelStyle={styles.buttonLabel}
                  >
                    重新开始
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={stopTimer}
                    style={styles.button}
                    labelStyle={styles.buttonLabel}
                  >
                    重置
                  </Button>
                </>
              ) : !isRunning &&
                !isWaitingForContinue &&
                currentPhase === 1 &&
                timeLeft === 0 ? (
                <Button
                  mode="contained"
                  onPress={startTimer}
                  style={styles.button}
                  labelStyle={styles.buttonLabel}
                >
                  开始熬中药
                </Button>
              ) : (
                <>
                  {isRunning && !isWaitingForContinue ? (
                    <Button
                      mode="contained"
                      onPress={pauseTimer}
                      style={styles.button}
                      labelStyle={styles.buttonLabel}
                    >
                      暂停
                    </Button>
                  ) : (
                    <Button
                      mode="contained"
                      onPress={startTimer}
                      style={styles.button}
                      labelStyle={styles.buttonLabel}
                    >
                      继续
                    </Button>
                  )}
                  <Button
                    mode="outlined"
                    onPress={stopTimer}
                    style={styles.button}
                    labelStyle={styles.buttonLabel}
                  >
                    重置
                  </Button>
                </>
              )}
            </View>
          </ScrollView>
          </View>
        )}
      </PaperProvider>
    </SafeAreaProvider>
  )
}

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
  permissionGuideTitle: {
    marginBottom: 10,
    color: '#111827',
    fontWeight: 'bold'
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
