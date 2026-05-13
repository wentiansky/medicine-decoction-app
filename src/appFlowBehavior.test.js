const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'App.js'),
  'utf8'
)
const timerCoreSource = fs.readFileSync(
  path.join(__dirname, 'timerCore.js'),
  'utf8'
)

test('timer start and restart are not blocked by missing alarm permissions', () => {
  assert.match(appSource, /start continuing with missing permissions/)
  assert.match(appSource, /restart continuing with missing permissions/)
  assert.doesNotMatch(appSource, /start blocked by missing permissions/)
  assert.doesNotMatch(appSource, /restart blocked by missing permissions/)
})

test('permission guide does not force reopen after user dismisses it', () => {
  assert.match(
    appSource,
    /issues\.length > 0 && showAlert && !permissionGuideDismissed/
  )
  const startTimerSection =
    appSource.match(/const startTimer = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  const restartTimerSection =
    appSource.match(/const restartTimer = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.doesNotMatch(
    startTimerSection,
    /setPermissionGuideDismissed\(false\)/
  )
  assert.doesNotMatch(
    restartTimerSection,
    /setPermissionGuideDismissed\(false\)/
  )
})

test('permission guide presents progressive background and lock-screen reminder copy', () => {
  assert.match(timerCoreSource, /步骤 1 后台提醒/)
  assert.match(timerCoreSource, /步骤 2 锁屏提醒/)
  assert.match(timerCoreSource, /需要开启「悬浮窗」权限/)
  assert.match(timerCoreSource, /需要再开启「后台弹出界面」和「锁屏显示」/)
  assert.doesNotMatch(appSource, /当前还需开启/)
})

test('permission guide keeps lock-screen reminder concise without manual confirmation controls', () => {
  assert.doesNotMatch(appSource, /我已开启「后台弹出界面」/)
  assert.doesNotMatch(appSource, /我已开启「锁屏显示」/)
  assert.doesNotMatch(appSource, /我已完成设置/)
  assert.doesNotMatch(appSource, /我已从系统设置返回，重新检测/)
  assert.match(appSource, />\s*重新检测\s*</)
})

test('permission guide removes step number from lock-screen reminder when overlay is enabled', () => {
  assert.match(
    appSource,
    /hasPendingBackgroundReminder = permissionScenarioCards\.some\([\s\S]*card\.id === 'backgroundReminder'[\s\S]*!card\.completed/
  )
  assert.match(
    appSource,
    /visiblePermissionScenarioCards = permissionScenarioCards[\s\S]*filter\([\s\S]*card => hasPendingBackgroundReminder \|\| card\.id === 'lockScreenReminder'[\s\S]*\)/
  )
  assert.match(
    appSource,
    /card\.id === 'lockScreenReminder' && !hasPendingBackgroundReminder[\s\S]*\? '锁屏提醒'[\s\S]*: card\.title/
  )
  assert.match(
    appSource,
    /shouldShowPermissionRecheckButton =[\s\S]*currentPermissionIssue\?\.id === 'overlay'/
  )
})

test('permission guide falls back to lock-screen instructions after automatic issues are clear', () => {
  assert.match(
    appSource,
    /currentPermissionIssue \|\| \{[\s\S]*id: 'lockScreenReminder'[\s\S]*action: 'openOverlaySettings'/
  )
  assert.match(
    appSource,
    /issue\.id === 'lockScreenReminder'/
  )
})

test('permission guide stays open after overlay permission is enabled', () => {
  assert.doesNotMatch(
    appSource,
    /showPermissionGuide && !missingOverlayPermission/
  )
  assert.match(
    appSource,
    /alarmPermissionIssues\.length > 0[\s\S]*!permissionGuideDismissed[\s\S]*!showLogScreen[\s\S]*setShowPermissionGuide\(true\)/
  )
})

test('home screen keeps a persistent Android permission entry', () => {
  assert.match(appSource, /Platform\.OS === 'android'/)
  assert.match(appSource, /permissionBanner/)
  assert.match(appSource, /permissionBannerIcon/)
  assert.match(appSource, /后台\/锁屏提醒权限可按需开启/)
  assert.match(appSource, />\s*开启\s*</)
  assert.doesNotMatch(
    appSource,
    /后台提醒建议先开启悬浮窗；锁屏提醒里的后台弹出界面和锁屏显示可以按需补充。/
  )
})

test('persistent permission entry opens the guide without resetting dismissed state', () => {
  const bannerSection =
    appSource.match(/<View style=\{styles\.permissionBanner\}>[\s\S]*?<\/View>\n            \)/)?.[0] || ''

  assert.match(bannerSection, /setShowPermissionGuide\(true\)/)
  assert.doesNotMatch(
    bannerSection,
    /setPermissionGuideDismissed\(false\)/
  )
})

test('Android system back closes modals, returns from child pages, then confirms app exit', () => {
  assert.match(appSource, /BackHandler/)
  assert.match(appSource, /getAndroidBackAction/)
  assert.match(appSource, /closeSettingsModal/)
  assert.match(appSource, /closePermissionGuide/)
  assert.match(appSource, /closeLogScreen/)
  assert.match(appSource, /再按一次退出应用/)
  assert.match(appSource, /BackHandler\.exitApp\(\)/)
})

test('timer phases are memoized and test settings are dev-only', () => {
  assert.match(
    appSource,
    /const phases = useMemo\(\(\) => buildPhases\(settings\), \[settings\]\)/
  )
  assert.match(appSource, /const fillTestSettings = __DEV__/)
  assert.match(appSource, /\{__DEV__ && \(/)
  assert.match(appSource, /填入测试值 0\.11 分钟/)
})

test('scheduled reminder refs are cleared only after cancel attempts succeed', () => {
  const cancelSection =
    appSource.match(/const cancelScheduledNotification = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  const stopTimerSection =
    appSource.match(/const stopTimer = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  const pauseTimerSection =
    appSource.match(/const pauseTimer = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(cancelSection, /let didCancel = true/)
  assert.match(cancelSection, /didCancel = false/)
  assert.match(cancelSection, /if \(didCancel\) \{[\s\S]*scheduledNotificationId\.current = null[\s\S]*scheduledPhaseRef\.current = null[\s\S]*phaseDeadlineRef\.current = null/)
  assert.match(cancelSection, /return didCancel/)
  assert.doesNotMatch(stopTimerSection, /phaseDeadlineRef\.current = null/)
  assert.doesNotMatch(pauseTimerSection, /phaseDeadlineRef\.current = null/)
})
