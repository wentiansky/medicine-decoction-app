const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const timerFlowHookSource = fs.readFileSync(
  path.join(__dirname, 'hooks', 'useTimerFlow.js'),
  'utf8'
)

test('active phase completion does not present a second alarm from JavaScript', () => {
  const finishCurrentPhaseSection =
    timerFlowHookSource.match(/const finishCurrentPhase = async \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(finishCurrentPhaseSection, /phase finished/)
  assert.match(finishCurrentPhaseSection, /completePhase\(phaseToComplete\)/)
  assert.doesNotMatch(finishCurrentPhaseSection, /presentAlarmNow/)
  assert.doesNotMatch(finishCurrentPhaseSection, /requesting native alarm presentation from active app/)
  assert.doesNotMatch(finishCurrentPhaseSection, /failed to present native alarm from active app/)
  assert.doesNotMatch(finishCurrentPhaseSection, /Alert\.alert\('熬中药提醒', completionMessage\)/)
  assert.doesNotMatch(finishCurrentPhaseSection, /await cancelScheduledNotification\(\)/)
})
