const assert = require('node:assert/strict')
const test = require('node:test')

const {
  NOTIFICATION_CHANNEL_ID,
  buildPhases,
  createAndroidAlarmPermissionChecklist,
  createPhaseNotificationRequest,
  createNativeAlarmRequest,
  createPermissionGuideState,
  completePhase,
  getPhaseDisplaySeconds,
  getPhaseInfo,
  getPhaseDurationSeconds,
  getPermissionIssueGuide,
  isFlowComplete,
  normalizeSettings,
  shouldShowInAppFallbackAlert,
  shouldSchedulePhaseReminder
} = require('./timerCore')

test('normalizeSettings keeps valid positive minute values', () => {
  assert.deepEqual(
    normalizeSettings({ soakTime: 20, highHeatTime: 8, lowHeatTime: 18 }),
    { soakTime: 20, highHeatTime: 8, lowHeatTime: 18 }
  )
})

test('normalizeSettings keeps valid decimal minute values for testing', () => {
  assert.deepEqual(
    normalizeSettings({ soakTime: '0.1', highHeatTime: 0.2, lowHeatTime: '.5' }),
    { soakTime: 0.1, highHeatTime: 0.2, lowHeatTime: 0.5 }
  )
})

test('normalizeSettings replaces empty or invalid values with defaults', () => {
  assert.deepEqual(
    normalizeSettings({ soakTime: 0, highHeatTime: Number.NaN, lowHeatTime: -3 }),
    { soakTime: 15, highHeatTime: 7, lowHeatTime: 15 }
  )
})

test('buildPhases creates the full seven-step decoction flow', () => {
  const phases = buildPhases({ soakTime: 1, highHeatTime: 2, lowHeatTime: 3 })

  assert.equal(phases.length, 7)
  assert.deepEqual(
    phases.map(phase => phase.id),
    [1, 2, 3, 4, 5, 6, 7]
  )
  assert.deepEqual(
    phases.map(phase => phase.durationMinutes),
    [1, 2, 3, 2, 3, 2, 3]
  )
})

test('getPhaseDurationSeconds rounds decimal minutes to whole seconds', () => {
  assert.equal(
    getPhaseDurationSeconds(getPhaseInfo(1, { soakTime: 0.1 })),
    6
  )
  assert.equal(
    getPhaseDurationSeconds(getPhaseInfo(2, { highHeatTime: 0.2 })),
    12
  )
})

test('getPhaseInfo returns normalized phase metadata by id', () => {
  assert.deepEqual(getPhaseInfo(3, { highHeatTime: 2, lowHeatTime: 4 }), {
    id: 3,
    name: '第一次煎药',
    shortName: '第一次煎药 - 小火',
    durationMinutes: 4,
    subtitle: '小火',
    description: '小火熬 4 分钟',
    completionMessage: '第一次熬药 - 小火完成'
  })
})

test('createPhaseNotificationRequest uses a schedulable time interval trigger and alarm channel', () => {
  assert.deepEqual(createPhaseNotificationRequest(getPhaseInfo(2), 120), {
    content: {
      title: '熬中药提醒',
      body: '第一次熬药 - 大火完成',
      sound: 'default',
      priority: 'max'
    },
    trigger: {
      type: 'timeInterval',
      seconds: 120,
      repeats: false,
      channelId: NOTIFICATION_CHANNEL_ID
    }
  })
})

test('createNativeAlarmRequest creates stable alarm payload for Android', () => {
  assert.deepEqual(createNativeAlarmRequest(getPhaseInfo(1), 6), {
    requestCode: 1001,
    seconds: 6,
    title: '熬中药提醒',
    body: '泡水完成'
  })
})

test('createAndroidAlarmPermissionChecklist lists missing Android alarm permissions', () => {
  assert.deepEqual(
    createAndroidAlarmPermissionChecklist({
      canScheduleExactAlarms: false,
      canUseFullScreenIntent: false,
      notificationsEnabled: false,
      canDrawOverlays: false
    }),
    [
      {
        id: 'exactAlarm',
        title: '允许设置闹钟和提醒',
        action: 'openExactAlarmSettings'
      },
      {
        id: 'notifications',
        title: '允许通知',
        action: 'openNotificationSettings'
      },
      {
        id: 'overlay',
        title: '允许显示在其他应用上层',
        action: 'openOverlaySettings'
      }
    ]
  )
})

test('createAndroidAlarmPermissionChecklist is empty when Android can alarm loudly', () => {
  assert.deepEqual(
    createAndroidAlarmPermissionChecklist({
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
      canDrawOverlays: true
    }),
    []
  )
})

test('createPermissionGuideState points to the next missing permission', () => {
  const issues = createAndroidAlarmPermissionChecklist({
    canScheduleExactAlarms: true,
    canUseFullScreenIntent: true,
    notificationsEnabled: false,
    canDrawOverlays: false
  })

  assert.deepEqual(createPermissionGuideState(issues), {
    currentIssue: {
      id: 'notifications',
      title: '允许通知',
      action: 'openNotificationSettings'
    },
    completedCount: 1,
    totalCount: 3
  })
})

test('createPermissionGuideState reports complete when no permissions are missing', () => {
  assert.deepEqual(createPermissionGuideState([]), {
    currentIssue: null,
    completedCount: 3,
    totalCount: 3
  })
})

test('getPermissionIssueGuide explains overlay permission steps', () => {
  const guide = getPermissionIssueGuide('overlay')

  assert.match(guide.detail, /浮窗提醒/)
  assert.match(guide.settingHint, /其他权限/)
  assert.match(guide.settingHint, /显示/)
})

test('completePhase advances to the next phase and leaves the timer paused', () => {
  assert.deepEqual(completePhase(1), {
    currentPhase: 2,
    timeLeft: 0,
    isRunning: false,
    isWaitingForContinue: true
  })
})

test('completePhase marks the flow complete after the final phase without restarting', () => {
  assert.deepEqual(completePhase(7), {
    currentPhase: 8,
    timeLeft: 0,
    isRunning: false,
    isWaitingForContinue: false
  })
})

test('getPhaseDisplaySeconds shows full duration while waiting to continue', () => {
  assert.equal(
    getPhaseDisplaySeconds({
      phaseId: 2,
      settings: { highHeatTime: 0.2 },
      timeLeft: 0,
      isWaitingForContinue: true
    }),
    12
  )
})

test('getPhaseDisplaySeconds keeps live countdown while running or paused mid-phase', () => {
  assert.equal(
    getPhaseDisplaySeconds({
      phaseId: 2,
      settings: { highHeatTime: 0.2 },
      timeLeft: 5,
      isWaitingForContinue: true
    }),
    5
  )
})

test('isFlowComplete is true only after all phases finish', () => {
  assert.equal(isFlowComplete(7), false)
  assert.equal(isFlowComplete(8), true)
})

test('shouldSchedulePhaseReminder reschedules after paused alarm is cleared', () => {
  assert.equal(
    shouldSchedulePhaseReminder({
      isRunning: true,
      isWaitingForContinue: false,
      currentPhase: 2,
      timeLeft: 5,
      scheduledPhase: null
    }),
    true
  )
})

test('shouldSchedulePhaseReminder skips already scheduled current phase', () => {
  assert.equal(
    shouldSchedulePhaseReminder({
      isRunning: true,
      isWaitingForContinue: false,
      currentPhase: 2,
      timeLeft: 5,
      scheduledPhase: 2
    }),
    false
  )
})

test('shouldShowInAppFallbackAlert skips app alert when Android native overlay alarm can appear', () => {
  assert.equal(
    shouldShowInAppFallbackAlert({
      platform: 'android',
      hasNativeAlarmModule: true,
      alarmPermissionState: {
        canScheduleExactAlarms: true,
        canDrawOverlays: true
      }
    }),
    false
  )

  assert.equal(
    shouldShowInAppFallbackAlert({
      platform: 'android',
      hasNativeAlarmModule: true,
      alarmPermissionState: {
        canScheduleExactAlarms: true,
        canDrawOverlays: false
      }
    }),
    true
  )

  assert.equal(
    shouldShowInAppFallbackAlert({
      platform: 'android',
      hasNativeAlarmModule: true,
      alarmPermissionState: {
        canScheduleExactAlarms: false,
        canDrawOverlays: true
      }
    }),
    true
  )
})
