import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {reader, read} from '../chain.js'

const load = path => readFile(new URL(path, import.meta.url), 'utf8')
const [deployment, demo, source] = await Promise.all([
  load('../deployment.json').then(JSON.parse),
  load('../demo.json').then(JSON.parse),
  load('../contracts/faultline_atlas.py'),
])
const {address} = deployment
assert.equal(address, demo.address)
assert.equal(Number(await reader.getChainId()), 61999)
assert.equal(await reader.getContractCode(address), source)
const key = [demo.host, demo.slug]
const round = await read(address, 'get_round', key)
assert.equal(round.magnitude_tenths, 75)
const checks = [
  ['opened', demo.host, 'open_round', 'us6000m0xl'],
  ['charted', demo.players[0], 'plot', 'N6'],
  ['missed', demo.players[1], 'plot', 'S2'],
  ['replay', demo.players[1], 'plot', 'N6', 'ATTEMPT_ALREADY_RECORDED'],
]
for (const [label, sender, method, argument, reason] of checks) {
  const tx = await reader.getTransaction({hash:demo.hashes[label]})
  const leader = [tx.consensus_data?.leader_receipt].flat().find(item => item?.mode === 'leader')
  assert.ok(tx.status === 7 || tx.statusName === 'FINALIZED')
  assert.ok([6, 'MAJORITY_AGREE'].includes(tx.result))
  assert.equal(tx.from_address.toLowerCase(), sender)
  assert.equal(tx.to_address.toLowerCase(), address.toLowerCase())
  assert.ok(leader.calldata.readable.includes(JSON.stringify(method)))
  assert.ok(leader.calldata.readable.includes(JSON.stringify(argument)))
  assert.ok(leader.calldata.readable.includes(JSON.stringify(demo.slug)))
  assert.equal(leader.execution_result, reason ? 'ERROR' : 'SUCCESS')
  if (reason) assert.equal(leader.result.payload, reason)
  console.log(label, leader.execution_result, reason ?? '')
}
for (const [index, player] of demo.players.entries()) {
  const result = await read(address, 'get_attempt', [...key, player])
  assert.equal(result.correct, index === 0)
  assert.equal(result.evidence.sector, 'N6')
  assert.equal(result.evidence.event, 'us6000m0xl')
  assert.deepEqual(await read(address, 'get_passport', [demo.host, player]), {
    played:1, stamps:index === 0 ? 1 : 0,
  })
}
console.log('Deployed source, four finalized receipts and both passport outcomes verified.')
