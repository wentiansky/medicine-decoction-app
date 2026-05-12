const DEFAULT_SETTINGS = {
  soakTime: 15,
  highHeatTime: 7,
  lowHeatTime: 15
}

const NOTIFICATION_CHANNEL_ID = 'medicine-decoction-timer'
const NATIVE_ALARM_REQUEST_CODE = 1001

const ANDROID_ALARM_PERMISSION_ITEMS = [
  {
    key: 'canScheduleExactAlarms',
    id: 'exactAlarm',
    title: '允许设置闹钟和提醒',
    action: 'openExactAlarmSettings'
  },
  {
    key: 'notificationsEnabled',
    id: 'notifications',
    title: '允许通知',
    action: 'openNotificationSettings'
  },
  {
    key: 'canDrawOverlays',
    id: 'overlay',
    title: '允许显示在其他应用上层',
    action: 'openOverlaySettings'
  }
]

const PERMISSION_GUIDES = {
  exactAlarm: {
    detail: '开启后，计时器才能按设定时间准时触发提醒。',
    settingHint: '进入系统页后，开启本应用的闹钟和提醒权限。'
  },
  notifications: {
    detail: '开启后，通知栏会保留阶段完成提醒，方便你回到 App。',
    settingHint: '在系统弹窗或通知设置中选择允许。'
  },
  overlay: {
    detail: '开启后，时间到时可以用浮窗提醒覆盖当前正在使用的应用。',
    settingHint: '进入系统页后，点「其他权限」，找到「显示悬浮窗」或「显示在其他应用上层」，选择允许。'
  }
}

const COMPLETION_MESSAGES = {
  1: '泡水完成',
  2: '第一次熬药 - 大火完成',
  3: '第一次熬药 - 小火完成',
  4: '第二次熬药 - 大火完成',
  5: '第二次熬药 - 小火完成',
  6: '第三次熬药 - 大火完成',
  7: '第三次熬药 - 小火完成',
  8: '所有阶段已完成'
}

const STAGE_NAMES = {
  2: '第一次煎药',
  3: '第二次煎药',
  4: '第三次煎药'
}

const normalizeMinute = (value, fallback) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeSettings = settings => ({
  soakTime: normalizeMinute(settings?.soakTime, DEFAULT_SETTINGS.soakTime),
  highHeatTime: normalizeMinute(settings?.highHeatTime, DEFAULT_SETTINGS.highHeatTime),
  lowHeatTime: normalizeMinute(settings?.lowHeatTime, DEFAULT_SETTINGS.lowHeatTime)
})

const buildPhases = settings => {
  const safeSettings = normalizeSettings(settings)
  const phases = [
    {
      id: 1,
      name: '阶段一：泡水',
      shortName: '泡水',
      durationMinutes: safeSettings.soakTime,
      subtitle: '',
      description: `泡水 ${safeSettings.soakTime} 分钟`,
      completionMessage: COMPLETION_MESSAGES[1]
    }
  ]

  for (let round = 1; round <= 3; round += 1) {
    const stageNumber = round + 1
    const highHeatId = round * 2
    const lowHeatId = highHeatId + 1

    phases.push({
      id: highHeatId,
      name: STAGE_NAMES[stageNumber],
      shortName: `${STAGE_NAMES[stageNumber]} - 大火`,
      durationMinutes: safeSettings.highHeatTime,
      subtitle: '大火',
      description: `大火熬 ${safeSettings.highHeatTime} 分钟`,
      completionMessage: COMPLETION_MESSAGES[highHeatId]
    })

    phases.push({
      id: lowHeatId,
      name: STAGE_NAMES[stageNumber],
      shortName: `${STAGE_NAMES[stageNumber]} - 小火`,
      durationMinutes: safeSettings.lowHeatTime,
      subtitle: '小火',
      description: `小火熬 ${safeSettings.lowHeatTime} 分钟`,
      completionMessage: COMPLETION_MESSAGES[lowHeatId]
    })
  }

  return phases
}

const getPhaseInfo = (phaseId, settings) =>
  buildPhases(settings).find(phase => phase.id === phaseId)

const getPhaseDurationSeconds = phaseInfo =>
  Math.max(1, Math.round((phaseInfo?.durationMinutes || 0) * 60))

const getCompletionMessage = phaseId =>
  COMPLETION_MESSAGES[phaseId] || '任务完成'

const isFlowComplete = phaseId => phaseId > 7

const getPhaseDisplaySeconds = ({
  phaseId,
  settings,
  timeLeft,
  isWaitingForContinue
}) => {
  if (timeLeft > 0 || !isWaitingForContinue || isFlowComplete(phaseId)) {
    return timeLeft
  }

  return getPhaseDurationSeconds(getPhaseInfo(phaseId, settings))
}

const createPhaseNotificationRequest = (phaseInfo, seconds) => ({
  content: {
    title: '熬中药提醒',
    body: phaseInfo?.completionMessage || '任务完成',
    sound: 'default',
    priority: 'max'
  },
  trigger: {
    type: 'timeInterval',
    seconds: Math.max(1, Math.round(Number.parseFloat(seconds)) || 1),
    repeats: false,
    channelId: NOTIFICATION_CHANNEL_ID
  }
})

const createNativeAlarmRequest = (phaseInfo, seconds) => ({
  requestCode: NATIVE_ALARM_REQUEST_CODE,
  seconds: Math.max(1, Math.round(Number.parseFloat(seconds)) || 1),
  title: '熬中药提醒',
  body: phaseInfo?.completionMessage || '任务完成'
})

const shouldSchedulePhaseReminder = ({
  isRunning,
  isWaitingForContinue,
  currentPhase,
  timeLeft,
  scheduledPhase
}) =>
  Boolean(isRunning) &&
  !isWaitingForContinue &&
  currentPhase <= 7 &&
  timeLeft > 0 &&
  scheduledPhase !== currentPhase

const shouldShowInAppFallbackAlert = ({
  platform,
  hasNativeAlarmModule,
  alarmPermissionState
}) => {
  if (platform !== 'android' || !hasNativeAlarmModule) {
    return true
  }

  return !(
    alarmPermissionState?.canScheduleExactAlarms === true &&
    alarmPermissionState?.canDrawOverlays === true
  )
}

const createAndroidAlarmPermissionChecklist = state =>
  ANDROID_ALARM_PERMISSION_ITEMS
    .filter(item => state?.[item.key] === false)
    .map(({ id, title, action }) => ({ id, title, action }))

const createPermissionGuideState = issues => {
  const safeIssues = Array.isArray(issues) ? issues : []

  return {
    currentIssue: safeIssues[0] || null,
    completedCount: Math.max(0, ANDROID_ALARM_PERMISSION_ITEMS.length - safeIssues.length),
    totalCount: ANDROID_ALARM_PERMISSION_ITEMS.length
  }
}

const getPermissionIssueGuide = issueId =>
  PERMISSION_GUIDES[issueId] || {
    detail: '开启后，熬药时间到时可以及时提醒你。',
    settingHint: '进入系统设置后，开启对应权限。'
  }

const completePhase = phaseId => ({
  currentPhase: phaseId + 1,
  timeLeft: 0,
  isRunning: false,
  isWaitingForContinue: phaseId < 7
})

module.exports = {
  DEFAULT_SETTINGS,
  NOTIFICATION_CHANNEL_ID,
  NATIVE_ALARM_REQUEST_CODE,
  buildPhases,
  completePhase,
  createAndroidAlarmPermissionChecklist,
  createNativeAlarmRequest,
  createPermissionGuideState,
  createPhaseNotificationRequest,
  getCompletionMessage,
  getPermissionIssueGuide,
  getPhaseDisplaySeconds,
  getPhaseDurationSeconds,
  getPhaseInfo,
  isFlowComplete,
  normalizeSettings,
  shouldShowInAppFallbackAlert,
  shouldSchedulePhaseReminder
}
