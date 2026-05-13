const assert = require('node:assert/strict')
const test = require('node:test')

const {
  NOTIFICATION_CHANNEL_ID,
  buildPhases,
  createAndroidAlarmPermissionChecklist,
  createPermissionScenarioCards,
  createPhaseNotificationRequest,
  createNativeAlarmRequest,
  createPermissionGuideState,
  completePhase,
  getPhaseDisplaySeconds,
  getPhaseInfo,
  getPhaseDurationSeconds,
  getAndroidBackAction,
  getPermissionIssueGuide,
  getWallClockRemainingSeconds,
  isFlowComplete,
  normalizeSettings,
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

test('getAndroidBackAction prioritizes modals, child pages, then double-back exit', () => {
  assert.deepEqual(
    getAndroidBackAction({
      showSettingsModal: true,
      showPermissionGuide: true,
      showLogScreen: true,
      lastExitAttemptAt: 900,
      now: 1000
    }),
    { action: 'closeSettingsModal' }
  )

  assert.deepEqual(
    getAndroidBackAction({
      showPermissionGuide: true,
      showLogScreen: true,
      lastExitAttemptAt: 900,
      now: 1000
    }),
    { action: 'closePermissionGuide' }
  )

  assert.deepEqual(
    getAndroidBackAction({
      showLogScreen: true,
      lastExitAttemptAt: 900,
      now: 1000
    }),
    { action: 'closeLogScreen' }
  )

  assert.deepEqual(
    getAndroidBackAction({ lastExitAttemptAt: 0, now: 1000 }),
    { action: 'promptExit', lastExitAttemptAt: 1000 }
  )

  assert.deepEqual(
    getAndroidBackAction({ lastExitAttemptAt: 1000, now: 2500 }),
    { action: 'exitApp', lastExitAttemptAt: 0 }
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
        id: 'notifications',
        title: '允许通知',
        action: 'openNotificationSettings'
      },
      {
        id: 'overlay',
        title: '允许悬浮窗',
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
    completedCount: 0,
    totalCount: 2
  })
})

test('createPermissionGuideState reports complete when no permissions are missing', () => {
  assert.deepEqual(createPermissionGuideState([]), {
    currentIssue: null,
    completedCount: 2,
    totalCount: 2
  })
})

test('getPermissionIssueGuide explains overlay permission steps', () => {
  const guide = getPermissionIssueGuide('overlay')

  assert.match(guide.detail, /其他应用/)
  assert.match(guide.settingHint, /其他权限/)
  assert.match(guide.settingHint, /显示/)
})

test('getPermissionIssueGuide explains manual lock-screen permission confirmation', () => {
  const guide = getPermissionIssueGuide('backgroundPopup')

  assert.match(guide.detail, /锁屏/)
  assert.match(guide.detail, /后台弹出界面/)
  assert.match(guide.settingHint, /重新检测/)
})

test('getPermissionIssueGuide explains optional lock-screen reminder as two settings', () => {
  const guide = getPermissionIssueGuide('lockScreenReminder')

  assert.match(guide.detail, /锁屏/)
  assert.match(guide.settingHint, /后台弹出界面/)
  assert.match(guide.settingHint, /锁屏显示/)
  assert.doesNotMatch(guide.settingHint, /显示悬浮窗/)
})

test('createPermissionScenarioCards groups missing permissions by reminder scene', () => {
  const cards = createPermissionScenarioCards([
    {
      id: 'overlay',
      title: '允许悬浮窗',
      action: 'openOverlaySettings'
    },
    {
      id: 'backgroundPopup',
      title: '允许后台弹出界面',
      action: 'openOverlaySettings'
    }
  ])

  assert.deepEqual(cards, [
    {
      id: 'backgroundReminder',
      title: '步骤 1 后台提醒',
      detail: '切到后台或浏览其他应用时，需要开启「悬浮窗」权限。',
      missingIssueIds: ['overlay'],
      missingTitles: ['允许悬浮窗'],
      completed: false,
      statusText: '未开启'
    },
    {
      id: 'lockScreenReminder',
      title: '步骤 2 锁屏提醒',
      detail: '锁屏或息屏时，需要再开启「后台弹出界面」和「锁屏显示」。',
      missingIssueIds: [],
      missingTitles: [],
      completed: false,
      statusText: '按需开启'
    }
  ])
})

test('createPermissionScenarioCards marks background reminder complete when overlay is enabled', () => {
  const cards = createPermissionScenarioCards([])

  assert.deepEqual(cards, [
    {
      id: 'backgroundReminder',
      title: '步骤 1 后台提醒',
      detail: '切到后台或浏览其他应用时，需要开启「悬浮窗」权限。',
      missingIssueIds: [],
      missingTitles: [],
      completed: true,
      statusText: '已开启'
    },
    {
      id: 'lockScreenReminder',
      title: '步骤 2 锁屏提醒',
      detail: '锁屏或息屏时，需要再开启「后台弹出界面」和「锁屏显示」。',
      missingIssueIds: [],
      missingTitles: [],
      completed: false,
      statusText: '按需开启'
    }
  ])
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

test('getWallClockRemainingSeconds corrects countdown after delayed ticks', () => {
  assert.equal(
    getWallClockRemainingSeconds({
      deadlineAt: 10_000,
      now: 4_200
    }),
    6
  )
  assert.equal(
    getWallClockRemainingSeconds({
      deadlineAt: 10_000,
      now: 10_500
    }),
    0
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
