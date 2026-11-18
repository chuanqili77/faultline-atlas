import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {createAccount, createClient} from 'genlayer-js'
import {chain, reader, read, waitForFinality} from '../chain.js'

const {address} = JSON.parse(await readFile(new URL('../deployment-v2.json', import.meta.url)))
const host = createAccount()
const players = [createAccount(), createAccount()]
const slug = 'pacific-to-anatolia'
const title = 'Pacific to Anatolia'
const key = [host.address.toLowerCase(), slug]
const events = ['us6000m0xl', 'us6000jllz']
const transactions = {}
assert.equal(Number(await reader.getChainId()), 61999)
assert.equal(BigInt(await reader.request({method:'eth_gasPrice',params:[]})), 0n)

async function step(label, account, functionName, args, reason) {
  const client = createClient({chain, account})
  const hash = await client.writeContract({address, functionName, args, value:0n, leaderOnly:false})
  transactions[label] = {hash, functionName, args, sender:account.address.toLowerCase(), ...(reason && {reason})}
  console.log(label, hash)
  const finalized = waitForFinality(hash)
  if (!reason) return finalized
  await assert.rejects(finalized, new RegExp(reason))
  const tx = await reader.getTransaction({hash})
  const leader = [tx.consensus_data?.leader_receipt].flat().find(item => item?.mode === 'leader')
  assert.equal(tx.status, 7)
  assert.equal(tx.result, 6)
  assert.equal(leader.execution_result, 'ERROR')
  assert.equal(leader.result.payload, reason)
}

await step('open', host, 'open_expedition', [slug, title, events.join(',')])
const expedition = await read(address, 'get_expedition', key)
assert.deepEqual(expedition, {status:'OPEN',title,total:2})
for (const [index, event] of events.entries()) {
  assert.equal((await read(address, 'get_expedition_event', [...key, index])).event, event)
}
await Promise.all([
  step('a_first', players[0], 'plot', [...key, 0, 'N6']),
  step('b_first', players[1], 'plot', [...key, 0, 'S2']),
  step('duplicate_event', host, 'open_expedition', ['duplicate-check', 'Duplicate check', events[0] + ',' + events[0]], 'DUPLICATE_EVENT'),
])
const a = players[0].address.toLowerCase()
const b = players[1].address.toLowerCase()
assert.equal(await read(address, 'get_expedition_result', [...key, a]), null)
assert.equal((await read(address, 'get_player_progress', [...key, b])).correct, 0)
await Promise.all([
  step('invalid_index', players[0], 'plot', [...key, 8, 'N4'], 'EVENT_NOT_IN_EXPEDITION'),
  step('replay', players[1], 'plot', [...key, 0, 'N6'], 'ATTEMPT_ALREADY_RECORDED'),
])
await Promise.all([
  step('a_complete', players[0], 'plot', [...key, 1, 'N4']),
  step('b_complete', players[1], 'plot', [...key, 1, 'N4']),
])
for (const [player, correct] of [[a, 2], [b, 1]]) {
  const result = await read(address, 'get_expedition_result', [...key, player])
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.correct, correct)
  assert.equal(result.wrong, 2 - correct)
  assert.equal(result.accuracy_bps, correct * 5000)
  assert.deepEqual(await read(address, 'get_passport', [key[0], player]), {completed:[slug], played:2, stamps:correct})
}
const proof = {address, host:key[0], slug, players:[a,b], transactions}
await writeFile(new URL('../demo-v2.json', import.meta.url), JSON.stringify(proof, null, 2) + '\n')
console.log('Both finalized results and passports reproduced.')
