const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const timerFlowHookSource = fs.readFileSync(
  path.join(__dirname, 'hooks', 'useTimerFlow.js'),
  'utf8'
)

test('active phase completion requests native alarm presentation before in-app fallback', () => {
  assert.match(timerFlowHookSource, /presentAlarmNow\('熬中药提醒', completionMessage\)/)
  assert.match(
    timerFlowHookSource,
    /await cancelScheduledNotification\(\)[\s\S]*presentAlarmNow\('熬中药提醒', completionMessage\)/
  )
  assert.match(timerFlowHookSource, /requesting native alarm presentation from active app/)
  assert.match(timerFlowHookSource, /failed to present native alarm from active app/)
  assert.doesNotMatch(timerFlowHookSource, /shouldShowInAppFallbackAlert/)
})
