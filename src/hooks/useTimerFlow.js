import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import { getAndroidAlarmModule } from '../androidAlarmScheduler'

const {
  NATIVE_ALARM_REQUEST_CODE,
  NOTIFICATION_CHANNEL_ID,
  buildPhases,
  completePhase,
  createNativeAlarmRequest,
  createPhaseNotificationRequest,
  getCompletionMessage,
  getPhaseDisplaySeconds,
  getPhaseDurationSeconds,
  getPhaseInfo,
  getWallClockRemainingSeconds,
  isFlowComplete,
  shouldSchedulePhaseReminder
} = require('../timerCore')

export default function useTimerFlow({
  settings,
  refreshAndroidAlarmPermissions,
  syncNativeAlarmDebugEvents,
  writeLog
}) {
  const [isRunning, setIsRunning] = useState(false)
  const [isWaitingForContinue, setIsWaitingForContinue] = useState(false)
  const [currentPhase, setCurrentPhase] = useState(1)
  const [timeLeft, setTimeLeft] = useState(0)
  const [notificationSupported, setNotificationSupported] = useState(false)
  const timerRef = useRef(null)
  const notificationsRef = useRef(null)
  const scheduledNotificationId = useRef(null)
  const scheduledPhaseRef = useRef(null)
  const phaseDeadlineRef = useRef(null)
  const countdownDeadlineRef = useRef(null)
  const appStateRef = useRef(AppState.currentState)

  const phases = useMemo(() => buildPhases(settings), [settings])
  const flowComplete = isFlowComplete(currentPhase)
  const currentPhaseInfo = getPhaseInfo(currentPhase, settings)
  const displaySeconds = getPhaseDisplaySeconds({
    phaseId: currentPhase,
    settings,
    timeLeft,
    isWaitingForContinue
  })

  useEffect(() => {
    initNotifications()
  }, [])

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
    let didCancel = true
    const alarmModule = getAndroidAlarmModule()

    if (alarmModule) {
      try {
        writeLog('info', 'alarm', 'canceling native alarm')
        await alarmModule.cancelAlarm(NATIVE_ALARM_REQUEST_CODE)
      } catch (error) {
        didCancel = false
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
        didCancel = false
        console.warn('Failed to cancel scheduled notification:', error)
        writeLog('warn', 'notifications', 'failed to cancel scheduled notification', error)
      }
    }

    if (didCancel) {
      scheduledNotificationId.current = null
      scheduledPhaseRef.current = null
      phaseDeadlineRef.current = null
    }

    return didCancel
  }

  const schedulePhaseNotification = async (phaseInfo, seconds) => {
    const previousReminderCanceled = await cancelScheduledNotification()
    if (!previousReminderCanceled) {
      writeLog('warn', 'alarm', 'skipping new reminder because previous reminder cancel failed', {
        phaseId: phaseInfo.id
      })
      return
    }

    try {
      const alarmModule = getAndroidAlarmModule()
      if (alarmModule) {
        const alarm = createNativeAlarmRequest(phaseInfo, seconds)
        writeLog('info', 'alarm', 'scheduling native Android alarm', {
          phaseId: phaseInfo.id,
          seconds: alarm.seconds
        })
        await alarmModule.scheduleAlarm(
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
        Date.now() + createNativeAlarmRequest(phaseInfo, seconds).seconds * 1000
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

  const finishCurrentPhase = async () => {
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
    countdownDeadlineRef.current = null

    if (appStateRef.current === 'active') {
      const alarmModule = getAndroidAlarmModule()

      if (alarmModule?.presentAlarmNow) {
        await cancelScheduledNotification()
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
        await cancelScheduledNotification()
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
    if (!isRunning || isWaitingForContinue) {
      if (timerRef.current) clearInterval(timerRef.current)
      countdownDeadlineRef.current = null
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
      const durationSeconds = getPhaseDurationSeconds(phaseInfo)
      countdownDeadlineRef.current = Date.now() + durationSeconds * 1000
      setTimeLeft(durationSeconds)
      return
    }

    if (!countdownDeadlineRef.current) {
      countdownDeadlineRef.current = Date.now() + timeLeft * 1000
    }

    timerRef.current = setInterval(() => {
      const remaining = getWallClockRemainingSeconds({
        deadlineAt: countdownDeadlineRef.current
      })
      if (remaining <= 0) {
        finishCurrentPhase()
        return
      }
      setTimeLeft(remaining)
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
      countdownDeadlineRef.current = null
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
    countdownDeadlineRef.current = null
    cancelScheduledNotification()
  }

  const pauseTimer = () => {
    writeLog('info', 'timer', 'timer pause requested', {
      phase: currentPhase,
      timeLeft
    })
    setIsRunning(false)
    setIsWaitingForContinue(false)
    countdownDeadlineRef.current = null
    cancelScheduledNotification()
  }

  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return {
    isRunning,
    isWaitingForContinue,
    currentPhase,
    timeLeft,
    phases,
    flowComplete,
    currentPhaseInfo,
    displaySeconds,
    startTimer,
    restartTimer,
    stopTimer,
    pauseTimer,
    formatTime
  }
}
