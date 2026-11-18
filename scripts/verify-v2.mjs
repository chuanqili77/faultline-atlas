import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {reader, read, waitForFinality} from '../chain.js'

const load = path => readFile(new URL(path, import.meta.url), 'utf8')
const [deployment, demo, source] = await Promise.all([
  load('../deployment-v2.json').then(JSON.parse),
  load('../demo-v2.json').then(JSON.parse),
  load('../contracts/faultline_atlas_v2.py'),
])
const {address} = deployment
assert.equal(address, demo.address)
assert.equal(Number(await reader.getChainId()), 61999)
assert.equal(await reader.getContractCode(address), source)
const provision = await waitForFinality(deployment.hash)
assert.equal(provision.data.contract_address.toLowerCase(), address.toLowerCase())
const key = [demo.host, demo.slug]
const expedition = await read(address, 'get_expedition', key)
assert.equal(expedition.status, 'OPEN')
assert.equal(expedition.total, 2)
for (const [label, entry] of Object.entries(demo.transactions)) {
  const tx = await reader.getTransaction({hash:entry.hash})
  const leader = [tx.consensus_data?.leader_receipt].flat().find(item => item?.mode === 'leader')
  assert.ok(tx.status === 7 || tx.statusName === 'FINALIZED')
  assert.ok([6,'MAJORITY_AGREE'].includes(tx.result))
  assert.equal(tx.from_address.toLowerCase(), entry.sender)
  assert.equal(tx.to_address.toLowerCase(), address.toLowerCase())
  assert.ok(leader.calldata.readable.includes(JSON.stringify(entry.functionName)))
  for (const arg of entry.args) assert.ok(leader.calldata.readable.includes(JSON.stringify(arg)))
  assert.equal(leader.execution_result, entry.reason ? 'ERROR' : 'SUCCESS')
  if (entry.reason) assert.equal(leader.result.payload, entry.reason)
  console.log(label, leader.execution_result, entry.reason ?? '')
}
for (const [index, player] of demo.players.entries()) {
  const score = index === 0 ? 2 : 1
  const result = await read(address, 'get_expedition_result', [...key, player])
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.correct, score)
  assert.equal(result.accuracy_bps, score * 5000)
  assert.deepEqual(result.rounds.map(round => round.observation.event), ['us6000m0xl','us6000jllz'])
  assert.deepEqual(await read(address,'get_passport',[demo.host,player]), {
    played:2, stamps:score, completed:[demo.slug],
  })
}
console.log('V2 deployed source, eight finalized receipts and both passports verified.')
