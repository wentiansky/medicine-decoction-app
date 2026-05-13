const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'App.js'),
  'utf8'
)
const permissionGuideModalSource = fs.readFileSync(
  path.join(__dirname, 'components', 'PermissionGuideModal.js'),
  'utf8'
)
const settingsModalSource = fs.readFileSync(
  path.join(__dirname, 'components', 'SettingsModal.js'),
  'utf8'
)
const timerScreenSource = fs.readFileSync(
  path.join(__dirname, 'components', 'TimerScreen.js'),
  'utf8'
)
const permissionHookSource = fs.readFileSync(
  path.join(__dirname, 'hooks', 'useAndroidAlarmPermissions.js'),
  'utf8'
)
const settingsHookSource = fs.readFileSync(
  path.join(__dirname, 'hooks', 'useStoredSettings.js'),
  'utf8'
)
const timerFlowHookSource = fs.readFileSync(
  path.join(__dirname, 'hooks', 'useTimerFlow.js'),
  'utf8'
)
const appStylesSource = fs.readFileSync(
  path.join(__dirname, 'styles', 'appStyles.js'),
  'utf8'
)
const timerCoreSource = fs.readFileSync(
  path.join(__dirname, 'timerCore.js'),
  'utf8'
)

test('timer start and restart are not blocked by missing alarm permissions', () => {
  assert.match(timerFlowHookSource, /start continuing with missing permissions/)
  assert.match(timerFlowHookSource, /restart continuing with missing permissions/)
  assert.doesNotMatch(timerFlowHookSource, /start blocked by missing permissions/)
  assert.doesNotMatch(timerFlowHookSource, /restart blocked by missing permissions/)
})

test('permission guide does not force reopen after user dismisses it', () => {
  assert.match(
    permissionHookSource,
    /issues\.length > 0 && showAlert && !permissionGuideDismissed/
  )
  assert.match(permissionGuideModalSource, /icon="close"/)
  assert.match(
    permissionHookSource,
    /setPermissionGuideDismissed\(true\)[\s\S]*setShowPermissionGuide\(false\)/
  )
  const startTimerSection =
    timerFlowHookSource.match(/const startTimer = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  const restartTimerSection =
    timerFlowHookSource.match(/const restartTimer = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.doesNotMatch(
    startTimerSection,
    /setPermissionGuideDismissed\(false\)/
  )
  assert.doesNotMatch(
    restartTimerSection,
    /setPermissionGuideDismissed\(false\)/
  )
})

test('App shell delegates settings and permission guide modals to dedicated components', () => {
  assert.match(appSource, /import SettingsModal from '\.\/src\/components\/SettingsModal'/)
  assert.match(appSource, /import PermissionGuideModal from '\.\/src\/components\/PermissionGuideModal'/)
  assert.match(appSource, /import TimerScreen from '\.\/src\/components\/TimerScreen'/)
  assert.doesNotMatch(appSource, /<Modal[\s\S]*开启可靠提醒/)
  assert.doesNotMatch(appSource, /<Modal[\s\S]*配置时间/)
  assert.doesNotMatch(appSource, /后台\/锁屏提醒权限可按需开启/)
})

test('App shell imports shared styles instead of defining a giant inline StyleSheet', () => {
  assert.match(appSource, /import styles from '\.\/src\/styles\/appStyles'/)
  assert.doesNotMatch(appSource, /const styles = StyleSheet\.create\(/)
  assert.match(appStylesSource, /const styles = StyleSheet\.create\(/)
})

test('permission guide presents progressive background and lock-screen reminder copy', () => {
  assert.match(timerCoreSource, /步骤 1 后台提醒/)
  assert.match(timerCoreSource, /步骤 2 锁屏提醒/)
  assert.match(timerCoreSource, /需要开启「悬浮窗」权限/)
  assert.match(timerCoreSource, /需要再开启「后台弹出界面」和「锁屏显示」/)
  assert.doesNotMatch(appSource, /当前还需开启/)
})

test('permission guide keeps lock-screen reminder concise without manual confirmation controls', () => {
  assert.doesNotMatch(permissionGuideModalSource, /我已开启「后台弹出界面」/)
  assert.doesNotMatch(permissionGuideModalSource, /我已开启「锁屏显示」/)
  assert.doesNotMatch(permissionGuideModalSource, /我已完成设置/)
  assert.doesNotMatch(permissionGuideModalSource, /我已从系统设置返回，重新检测/)
  assert.match(permissionGuideModalSource, />\s*重新检测\s*</)
})

test('permission guide removes step number from lock-screen reminder when overlay is enabled', () => {
  assert.match(
    permissionHookSource,
    /hasPendingBackgroundReminder = permissionScenarioCards\.some\([\s\S]*card\.id === 'backgroundReminder'[\s\S]*!card\.completed/
  )
  assert.match(
    permissionHookSource,
    /visiblePermissionScenarioCards = permissionScenarioCards[\s\S]*filter\([\s\S]*card => hasPendingBackgroundReminder \|\| card\.id === 'lockScreenReminder'[\s\S]*\)/
  )
  assert.match(
    permissionGuideModalSource,
    /card\.id === 'lockScreenReminder' && !hasPendingBackgroundReminder[\s\S]*\? '锁屏提醒'[\s\S]*: card\.title/
  )
  assert.match(
    permissionHookSource,
    /shouldShowPermissionRecheckButton =[\s\S]*currentPermissionIssue\?\.id === 'overlay'/
  )
})

test('permission guide falls back to lock-screen instructions after automatic issues are clear', () => {
  assert.match(
    permissionHookSource,
    /currentPermissionIssue \|\| \{[\s\S]*id: 'lockScreenReminder'[\s\S]*action: 'openOverlaySettings'/
  )
  assert.match(
    permissionGuideModalSource,
    /onOpenSetting\(permissionGuidePrimaryIssue\)/
  )
})

test('permission guide stays open after overlay permission is enabled', () => {
  assert.doesNotMatch(
    appSource,
    /showPermissionGuide && !missingOverlayPermission/
  )
  assert.match(
    permissionHookSource,
    /alarmPermissionIssues\.length > 0[\s\S]*!permissionGuideDismissed[\s\S]*!showLogScreen[\s\S]*setShowPermissionGuide\(true\)/
  )
})

test('home screen keeps a persistent Android permission entry', () => {
  assert.match(timerScreenSource, /Platform\.OS === 'android'/)
  assert.match(timerScreenSource, /permissionBanner/)
  assert.match(timerScreenSource, /permissionBannerIcon/)
  assert.match(timerScreenSource, /后台\/锁屏提醒权限可按需开启/)
  assert.match(timerScreenSource, />\s*开启\s*</)
  assert.doesNotMatch(
    timerScreenSource,
    /后台提醒建议先开启悬浮窗；锁屏提醒里的后台弹出界面和锁屏显示可以按需补充。/
  )
})

test('persistent permission entry opens the guide without resetting dismissed state', () => {
  const bannerSection =
    timerScreenSource.match(
      /<View style=\{styles\.permissionBanner\}>[\s\S]*?<\/View>\n      \)/
    )?.[0] || ''

  assert.match(bannerSection, /onOpenPermissionGuide/)
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
    timerFlowHookSource,
    /const phases = useMemo\(\(\) => buildPhases\(settings\), \[settings\]\)/
  )
  assert.match(settingsHookSource, /const fillTestSettings = __DEV__/)
  assert.match(settingsModalSource, /showTestSettings && onFillTestSettings/)
  assert.match(settingsModalSource, /填入测试值 0\.11 分钟/)
})

test('scheduled reminder refs are cleared only after cancel attempts succeed', () => {
  const cancelSection =
    timerFlowHookSource.match(/const cancelScheduledNotification = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  const stopTimerSection =
    timerFlowHookSource.match(/const stopTimer = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
  const pauseTimerSection =
    timerFlowHookSource.match(/const pauseTimer = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(cancelSection, /let didCancel = true/)
  assert.match(cancelSection, /didCancel = false/)
  assert.match(cancelSection, /if \(didCancel\) \{[\s\S]*scheduledNotificationId\.current = null[\s\S]*scheduledPhaseRef\.current = null[\s\S]*phaseDeadlineRef\.current = null/)
  assert.match(cancelSection, /return didCancel/)
  assert.doesNotMatch(stopTimerSection, /phaseDeadlineRef\.current = null/)
  assert.doesNotMatch(pauseTimerSection, /phaseDeadlineRef\.current = null/)
})
