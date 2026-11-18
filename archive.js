import './style.css'
import {createClient} from 'genlayer-js'
import {chain, explorer, reader, read, waitForFinality} from './chain.js'
import {drawMap} from './map.js'
import deployment from './deployment.json'
import demo from './demo.json'

const $ = id => document.getElementById(id)
const {address} = deployment
const walletPattern = /^0x[0-9a-f]{40}$/i
const roundPattern = /^[a-z0-9][a-z0-9-]{2,39}$/
const status = value => { $('status').textContent = value }
const get = (method, args) => read(address, method, args)
const txUrl = hash => explorer + '/transactions/' + hash
let active
let selection
let settled
let busy = false

drawMap($('world'))
$('contract').href = explorer + '/address/' + address

function roundUrl(key) {
  const url = new URL(location.href)
  url.search = new URLSearchParams({host:key[0], round:key[1]})
  url.hash = 'play'
  return url.href
}

function resetResult() {
  settled = false
  $('stamp').className = 'stamp'
  $('stamp').textContent = '◎'
  $('result').textContent = 'Awaiting a plot'
  $('explain').textContent = 'Choose a sector on the grid. Your wallet gets one plot per round.'
  $('score').textContent = ''
  $('source').hidden = true
  $('transaction').hidden = true
  $('epicenter').hidden = true
  for (const button of $('sectors').children) button.className = ''
}

function updateControls() {
  for (const button of document.querySelectorAll('form button, #examples button')) button.disabled = busy
  for (const button of $('sectors').children) button.disabled = busy || !active
  $('submit').disabled = busy || !active || !selection || settled
  $('share').disabled = busy || !active
}

function select(sector) {
  selection = sector
  for (const button of $('sectors').children) button.setAttribute('aria-pressed', String(button.dataset.sector === sector))
  $('selection').textContent = sector ? 'Selected sector · ' + sector : 'Pick one of the 12 sectors.'
  updateControls()
}

for (const hemisphere of ['N', 'S']) {
  for (let zone = 1; zone <= 6; zone++) {
    const sector = hemisphere + zone
    const button = document.createElement('button')
    const label = document.createElement('span')
    label.textContent = sector
    button.type = 'button'
    button.dataset.sector = sector
    button.append(label)
    const min = -180 + (zone - 1) * 60
    button.setAttribute('aria-label', sector + ', ' + (hemisphere === 'N' ? 'north' : 'south') +
      ', longitude ' + min + ' to ' + (min + 60) + ' degrees')
    button.addEventListener('click', () => {
      resetResult()
      select(sector)
      status('Sector ' + sector + ' selected. Lock it when you’re ready.')
    })
    $('sectors').append(button)
  }
}

async function openRound(host, slug, updateHistory = true) {
  if (!walletPattern.test(host) || !roundPattern.test(slug)) throw Error('Enter a valid host wallet and round key.')
  const key = [host.toLowerCase(), slug]
  const round = await get('get_round', key)
  if (!round) throw Error('No finalized round exists for this host and key.')
  active = key
  resetResult()
  select(null)
  if (updateHistory) history.replaceState(null, '', roundUrl(key))
  $('lookup-host').value = key[0]
  $('lookup-slug').value = slug
  $('round-title').textContent = slug.replaceAll('-', ' ')
  $('round-label').textContent = 'FIELD CHART · HOST ' + key[0].slice(0, 7) + '…' + key[0].slice(-4)
  $('round-label').title = key[0]
  $('date').textContent = new Intl.DateTimeFormat('en-GB', {dateStyle:'medium', timeZone:'UTC'}).format(round.time)
  $('magnitude').textContent = (round.magnitude_tenths / 10).toFixed(1)
  $('depth').textContent = (round.depth_tenths / 10).toFixed(1) + ' km'
  const demoRound = key[0] === demo.host && slug === demo.slug
  $('examples').hidden = !demoRound
  $('round-proof').hidden = !demoRound
  if (demoRound) $('round-proof').href = txUrl(demo.hashes.opened)
  status('Round ready. Pick a sector or replay a finalized example.')
}

async function showPlot(player, hash) {
  const [result, passport] = await Promise.all([
    get('get_attempt', [...active, player]), get('get_passport', [active[0], player]),
  ])
  if (!result || !passport) throw Error('No finalized plot is available for this player.')
  const item = result.evidence
  resetResult()
  select(result.guess)
  settled = true
  const marker = $('epicenter')
  marker.style.left = ((item.lon_milli + 180000) / 3600) + '%'
  marker.style.top = ((90000 - item.lat_milli) / 1800) + '%'
  marker.hidden = false
  for (const button of $('sectors').children) {
    if (button.dataset.sector === item.sector) button.className = 'correct'
    else if (button.dataset.sector === result.guess) button.className = 'incorrect'
  }
  $('stamp').classList.add(result.correct ? 'win' : 'loss')
  $('stamp').textContent = result.correct ? '✓' : '×'
  $('result').textContent = result.correct ? 'Epicenter charted' : 'Off the fault'
  $('explain').textContent = item.place + ' · ' + item.sector + '. Your plot: ' + result.guess + '.'
  $('score').textContent = passport.stamps + ' stamp(s) · ' + passport.played + ' plot(s)'
  $('source').href = 'https://earthquake.usgs.gov/earthquakes/eventpage/' + item.event + '/executive'
  $('source').hidden = false
  if (hash) {
    $('transaction').href = txUrl(hash)
    $('transaction').hidden = false
  }
  status('Finalized plot for ' + player + '.')
  updateControls()
}

async function wallet() {
  const provider = window.ethereum
  if (!provider) throw Error('Install or open an EIP-1193 browser wallet to sign.')
  const [account] = await provider.request({method:'eth_requestAccounts'})
  if (!walletPattern.test(account ?? '')) throw Error('No wallet account selected.')
  const chainId = '0xf22f'
  if (Number(await provider.request({method:'eth_chainId'})) !== chain.id) {
    try {
      await provider.request({method:'wallet_switchEthereumChain', params:[{chainId}]})
    } catch (error) {
      if ((error.data?.originalError?.code ?? error.code) !== 4902) throw error
      await provider.request({
        method:'wallet_addEthereumChain',
        params:[{chainId, chainName:'GenLayer Stable Studionet', nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18},rpcUrls:['https://studio.genlayer.com/api'],blockExplorerUrls:[explorer]}],
      })
      await provider.request({method:'wallet_switchEthereumChain', params:[{chainId}]})
    }
  }
  const guarded = {
    async request(request) {
      if (request.method === 'eth_sendTransaction') {
        const [selected] = await provider.request({method:'eth_accounts'})
        if (selected?.toLowerCase() !== account.toLowerCase() ||
            Number(await provider.request({method:'eth_chainId'})) !== chain.id) {
          throw Error('Wallet account or network changed before signing.')
        }
      }
      return provider.request(request)
    },
  }
  return {account:account.toLowerCase(), client:createClient({chain, account, provider:guarded})}
}

async function write(signer, method, args) {
  if (BigInt(await reader.request({method:'eth_gasPrice',params:[]})) !== 0n) {
    throw Error('Stable Studionet is reporting a nonzero gas price.')
  }
  status('Review the transaction in your wallet.')
  const hash = await signer.client.writeContract({address, functionName:method, args, value:0n, leaderOnly:false})
  $('transaction').href = txUrl(hash)
  $('transaction').hidden = false
  status('Submitted. Waiting for consensus.')
  await waitForFinality(hash, stage => status('Consensus · ' + stage))
  return hash
}

function bind(id, event, action) {
  $(id).addEventListener(event, e => {
    e.preventDefault()
    run(action)
  })
}

async function run(action) {
  if (busy) return
  busy = true
  updateControls()
  try {
    await action()
  } catch (error) {
    status(error.shortMessage ?? error.message ?? String(error))
  } finally {
    busy = false
    updateControls()
  }
}

bind('share', 'click', async () => {
  try {
    await navigator.clipboard.writeText(roundUrl(active))
    status('Round link copied. Share it with your group.')
  } catch {
    status('Share this round with this link: ' + roundUrl(active))
  }
})
bind('submit', 'click', async () => {
  const signer = await wallet()
  if (active[0] === signer.account) throw Error('Hosts cannot plot on their own rounds.')
  const prior = await get('get_attempt', [...active, signer.account])
  if (prior) return showPlot(signer.account)
  const hash = await write(signer, 'plot', [...active, selection])
  await showPlot(signer.account, hash)
})
bind('create', 'submit', async () => {
  const slug = $('slug').value.trim()
  const event = $('event').value.trim()
  if (!roundPattern.test(slug) || !/^[a-z0-9]{4,24}$/.test(event)) throw Error('Check the round key and USGS event ID.')
  const signer = await wallet()
  const hash = await write(signer, 'open_round', [slug, event])
  await openRound(signer.account, slug)
  $('transaction').href = txUrl(hash)
  $('transaction').hidden = false
  status('Round opened on-chain. Copy the round link to invite your group.')
})
bind('open', 'submit', () => openRound($('lookup-host').value.trim(), $('lookup-slug').value.trim()))
bind('win', 'click', () => showPlot(demo.players[0], demo.hashes.charted))
bind('miss', 'click', () => showPlot(demo.players[1], demo.hashes.missed))

const params = new URLSearchParams(location.search)
const host = params.get('host') ?? demo.host
const slug = params.get('round') ?? demo.slug
if (host && slug) run(() => openRound(host, slug, params.has('round')))
else status('Open or host a round to start.')
updateControls()
