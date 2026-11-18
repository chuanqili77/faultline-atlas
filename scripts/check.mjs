import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {createAccount, createClient} from 'genlayer-js'
import {chain, reader, read, waitForFinality} from '../chain.js'

const {address} = JSON.parse(await readFile(new URL('../deployment.json', import.meta.url)))
const host = createAccount()
const players = [createAccount(), createAccount()]
const slug = 'winter-shock'
const key = [host.address.toLowerCase(), slug]
const hashes = {}
assert.equal(Number(await reader.getChainId()), 61999)
assert.equal(BigInt(await reader.request({method:'eth_gasPrice',params:[]})), 0n)

async function submit(label, account, functionName, args) {
  const client = createClient({chain, account})
  const hash = await client.writeContract({address, functionName, args, value:0n, leaderOnly:false})
  hashes[label] = hash
  console.log(label, hash)
  await waitForFinality(hash, stage => console.log(label, stage))
}

await submit('opened', host, 'open_round', [slug, 'us6000m0xl'])
assert.equal((await read(address, 'get_round', key)).magnitude_tenths, 75)
await Promise.all([
  submit('charted', players[0], 'plot', [...key, 'N6']),
  submit('missed', players[1], 'plot', [...key, 'S2']),
])
for (const [index, account] of players.entries()) {
  const args = [...key, account.address.toLowerCase()]
  const result = await read(address, 'get_attempt', args)
  assert.equal(result.correct, index === 0)
  assert.equal(result.evidence.event, 'us6000m0xl')
  assert.equal(result.evidence.sector, 'N6')
  assert.deepEqual(await read(address, 'get_passport', [key[0], args[2]]), {played:1, stamps:index === 0 ? 1 : 0})
}
await assert.rejects(submit('replay', players[1], 'plot', [...key, 'N6']), /ATTEMPT_ALREADY_RECORDED/)
assert.deepEqual(await read(address, 'get_passport', [key[0], players[1].address]), {played:1, stamps:0})
const proof = {address, host:key[0], slug, players:players.map(a => a.address.toLowerCase()), hashes}
const json = JSON.stringify(proof, null, 2)
console.log(json)
await writeFile(new URL('../demo.json', import.meta.url), json + '\n')
