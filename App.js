import { useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import {
  View,
  BackHandler,
  ToastAndroid
} from 'react-native'
import {
  PaperProvider,
  Appbar,
  Portal
} from 'react-native-paper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import LogScreen from './src/LogScreen'
import PermissionGuideModal from './src/components/PermissionGuideModal'
import SettingsModal from './src/components/SettingsModal'
import TimerScreen from './src/components/TimerScreen'
import { getAndroidAlarmModule } from './src/androidAlarmScheduler'
import styles from './src/styles/appStyles'
import useAndroidAlarmPermissions from './src/hooks/useAndroidAlarmPermissions'
import useStoredSettings from './src/hooks/useStoredSettings'
import useTimerFlow from './src/hooks/useTimerFlow'
const { createAppLogger } = require('./src/appLogger')
const { getAndroidBackAction } = require('./src/timerCore')

export default function App() {
  const [showLogScreen, setShowLogScreen] = useState(false)
  const appLoggerRef = useRef(null)
  const lastExitAttemptAtRef = useRef(0)

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

  const {
    settings,
    tempSettings,
    setTempSettings,
    showSettingsModal,
    openSettingsModal,
    closeSettingsModal,
    saveSettings,
    fillTestSettings
  } = useStoredSettings({ writeLog })
  const {
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
  } = useAndroidAlarmPermissions({
    showLogScreen,
    writeLog
  })
  const {
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
  } = useTimerFlow({
    settings,
    refreshAndroidAlarmPermissions,
    syncNativeAlarmDebugEvents,
    writeLog
  })

  const handleBackPress = () => {
    const backAction = getAndroidBackAction({
      showSettingsModal,
      showPermissionGuide,
      showLogScreen,
      lastExitAttemptAt: lastExitAttemptAtRef.current
    })

    if (backAction.action === 'closeSettingsModal') {
      closeSettingsModal()
      return true
    }

    if (backAction.action === 'closePermissionGuide') {
      closePermissionGuide()
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
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    )

    return () => subscription.remove()
  }, [showSettingsModal, showPermissionGuide, showLogScreen])

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
                onPress={openSettingsModal}
              />
            </>
          )}
        </Appbar.Header>

        {showLogScreen ? (
          <LogScreen logger={appLoggerRef.current} />
        ) : (
          <View style={styles.container}>
            <Portal>
              <SettingsModal
                visible={showSettingsModal}
                tempSettings={tempSettings}
                setTempSettings={setTempSettings}
                onDismiss={closeSettingsModal}
                onSave={saveSettings}
                onFillTestSettings={fillTestSettings}
                showTestSettings={__DEV__}
              />
              <PermissionGuideModal
                visible={showPermissionGuide && !showSettingsModal}
                visiblePermissionScenarioCards={visiblePermissionScenarioCards}
                hasPendingBackgroundReminder={hasPendingBackgroundReminder}
                currentPermissionGuide={currentPermissionGuide}
                permissionGuidePrimaryIssue={permissionGuidePrimaryIssue}
                shouldShowPermissionRecheckButton={shouldShowPermissionRecheckButton}
                onDismiss={closePermissionGuide}
                onOpenSetting={openAndroidAlarmSetting}
                onRecheck={() => refreshAndroidAlarmPermissions()}
              />
            </Portal>
            <TimerScreen
              flowComplete={flowComplete}
              phases={phases}
              isRunning={isRunning}
              isWaitingForContinue={isWaitingForContinue}
              currentPhase={currentPhase}
              timeLeft={timeLeft}
              currentPhaseInfo={currentPhaseInfo}
              displaySeconds={displaySeconds}
              formatTime={formatTime}
              onOpenPermissionGuide={openPermissionGuide}
              onStartTimer={startTimer}
              onPauseTimer={pauseTimer}
              onStopTimer={stopTimer}
              onRestartTimer={restartTimer}
            />
          </View>
        )}
      </PaperProvider>
    </SafeAreaProvider>
  )
}
