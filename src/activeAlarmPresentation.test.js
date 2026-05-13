const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'App.js'),
  'utf8'
)

test('active phase completion requests native alarm presentation before in-app fallback', () => {
  assert.match(appSource, /presentAlarmNow\('熬中药提醒', completionMessage\)/)
  assert.match(appSource, /requesting native alarm presentation from active app/)
  assert.match(appSource, /failed to present native alarm from active app/)
  assert.doesNotMatch(appSource, /shouldShowInAppFallbackAlert/)
})
