import './style.css'
import {createClient} from 'genlayer-js'
import {chain, explorer, reader, read, waitForFinality} from './chain.js'
import {drawMap} from './map.js'
import deployment from './deployment-v2.json'
import demo from './demo-v2.json'

const $ = id => document.getElementById(id)
const {address} = deployment
const get = (method, args) => read(address, method, args)
const txUrl = hash => explorer + '/transactions/' + hash
const walletPattern = /^0x[0-9a-f]{40}$/i
const slugPattern = /^[a-z0-9][a-z0-9-]{2,39}$/
const status = value => { $('status').textContent = value }
const percent = bps => (bps / 100).toLocaleString('en-US', {maximumFractionDigits:2}) + '%'
const proof = new Map()
let active, player, progress, index = 0, selection, attempt
let busy = false

drawMap($('world'))
$('contract').href = explorer + '/address/' + address
$('contract').textContent = 'V2 Studionet ↗'

function deepLink(key, subject) {
  const url = new URL(location.href)
  url.search = new URLSearchParams({host:key[0], expedition:key[1]})
  if (subject) url.searchParams.set('player', subject)
  url.hash = subject ? 'results' : 'play'
  return url
}

function matchesDemo() {
  return active?.key[0] === demo.host && active?.key[1] === demo.slug
}

function attemptHash(subject, round) {
  if (matchesDemo()) {
    const label = demo.players.indexOf(subject)
    if (label !== -1) return demo.transactions[(label === 0 ? 'a_' : 'b_') + (round === 0 ? 'first' : 'complete')]?.hash
  }
  return proof.get([...active.key, subject, round].join('/'))
}

function pick(sector) {
  selection = sector
  for (const button of $('sectors').children) button.setAttribute('aria-pressed', String(button.dataset.sector === sector))
  $('selection').textContent = sector ? 'Selected sector · ' + sector : 'Pick one of the 12 sectors.'
  controls()
}

for (const hemisphere of ['N','S']) {
  for (let zone = 1; zone <= 6; zone++) {
    const sector = hemisphere + zone
    const button = document.createElement('button')
    const label = document.createElement('span')
    label.textContent = sector
    button.type = 'button'
    button.dataset.sector = sector
    button.append(label)
    const min = -180 + (zone - 1) * 60
    button.setAttribute('aria-label', sector + ', longitude ' + min + '° to ' + (min + 60) + '°')
    button.addEventListener('click', () => pick(sector))
    $('sectors').append(button)
  }
}

function controls() {
  for (const button of document.querySelectorAll('form button, #examples button, #trail button, #connect, #share-result')) {
    button.disabled = busy
  }
  for (const button of $('sectors').children) button.disabled = busy || !active || Boolean(attempt)
  $('submit').disabled = busy || !active || !selection || Boolean(attempt)
  $('next').disabled = busy
  $('share').disabled = busy || !active
}

function placeLink(event) {
  return 'https://earthquake.usgs.gov/earthquakes/eventpage/' + event.event + '/executive'
}

function renderTrail() {
  $('trail').replaceChildren(...Array.from({length:active.total}, (_, round) => {
    const button = document.createElement('button')
    button.textContent = 'Checkpoint ' + (round + 1) + (round < (progress?.played ?? 0) ? ' ✓' : '')
    if (round === index) button.setAttribute('aria-current','step')
    button.addEventListener('click', () => run(async () => {
      if (round > (progress?.played ?? 0)) throw Error('Complete the current checkpoint before moving forward.')
      await showCheckpoint(round)
    }))
    return button
  }))
}

async function showCheckpoint(round) {
  index = round
  const [event, answer] = await Promise.all([
    get('get_expedition_event', [...active.key, round]),
    player ? get('get_attempt', [...active.key, player, round]) : null,
  ])
  if (!event) throw Error('Checkpoint evidence is unavailable.')
  attempt = answer
  pick(answer?.guess)
  renderTrail()
  $('date').textContent = new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(event.time)
  $('magnitude').textContent = (event.magnitude_tenths / 10).toFixed(1)
  $('depth').textContent = (event.depth_tenths / 10).toFixed(1) + ' km'
  $('stamp').className = 'stamp'
  $('stamp').textContent = '◎'
  $('epicenter').hidden = true
  $('source').hidden = true
  $('transaction').hidden = true
  $('next').hidden = !answer || round + 1 >= active.total
  for (const button of $('sectors').children) button.className = ''
  if (!answer) {
    $('result').textContent = 'Checkpoint ' + (round + 1) + ' of ' + active.total
    $('explain').textContent = 'Use the seismic clues to choose the epicenter sector.'
    return
  }
  $('stamp').classList.add(answer.correct ? 'win' : 'loss')
  $('stamp').textContent = answer.correct ? '✓' : '×'
  $('result').textContent = answer.correct ? 'Epicenter charted' : 'Off the fault'
  $('explain').textContent = event.place + ' · actual ' + event.sector + ' · your plot ' + answer.guess +
    ' · ' + (event.lat_milli / 1000) + '°, ' + (event.lon_milli / 1000) + '°'
  $('source').href = placeLink(event)
  $('source').hidden = false
  const hash = attemptHash(player, round)
  if (hash) {
    $('transaction').href = txUrl(hash)
    $('transaction').hidden = false
  }
  const marker = $('epicenter')
  marker.style.left = ((event.lon_milli + 180000) / 3600) + '%'
  marker.style.top = ((90000 - event.lat_milli) / 1800) + '%'
  marker.hidden = false
  for (const button of $('sectors').children) {
    if (button.dataset.sector === event.sector) button.className = 'correct'
    else if (button.dataset.sector === answer.guess) button.className = 'incorrect'
  }
}

async function showPlayer(subject, requestedRound) {
  const [state, passport, result] = await Promise.all([
    get('get_player_progress',[...active.key,subject]),
    get('get_passport',[active.key[0],subject]),
    get('get_expedition_result',[...active.key,subject]),
  ])
  player = subject
  progress = state
  $('player').value = subject
  const stamps = passport?.stamps ?? 0
  const played = passport?.played ?? 0
  $('score').textContent = stamps + ' correct / ' + played + ' host events · ' +
    percent(played ? Math.floor(10000 * stamps / played) : 0) + ' · ' + stamps + ' stamps · ' +
    (passport?.completed.length ?? 0) + ' completed expeditions'
  $('history').replaceChildren(...(passport?.completed ?? []).map(slug => {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = deepLink([active.key[0],slug],subject)
    link.textContent = slug.replaceAll('-', ' ')
    item.append(link)
    return item
  }))
  $('results').hidden = !result
  if (result) {
    $('result-title').textContent = result.title
    $('result-summary').textContent = result.status + ' · ' + result.total + ' events · ' + result.correct +
      ' correct · ' + result.wrong + ' incorrect · ' + percent(result.accuracy_bps) + ' · ' + subject
    $('result-rounds').replaceChildren(...result.rounds.map(({observation:event, attempt:answer}, round) => {
      const item = document.createElement('li')
      item.textContent = event.place + ' · ' + event.event + ' · your plot ' + answer.guess +
        ' · actual ' + event.sector + ' · ' + (answer.correct ? 'Correct' : 'Incorrect')
      const source = document.createElement('a')
      source.href = placeLink(event)
      source.textContent = 'USGS ↗'
      item.append(source)
      const hash = attemptHash(subject, round)
      if (hash) {
        const tx = document.createElement('a')
        tx.href = txUrl(hash)
        tx.textContent = 'Plot transaction ↗'
        item.append(tx)
      }
      return item
    }))
  }
  await showCheckpoint(requestedRound ?? Math.min(state?.played ?? 0, active.total - 1))
  status(result ? 'Finalized expedition result loaded.' : 'Finalized player progress loaded.')
}

async function openExpedition(host, slug, subject, updateHistory = true) {
  if (!walletPattern.test(host) || !slugPattern.test(slug)) throw Error('Enter a valid host wallet and expedition key.')
  const key = [host.toLowerCase(), slug]
  const expedition = await get('get_expedition', key)
  if (!expedition) throw Error('No finalized expedition exists for that host and key.')
  active = {key, total:expedition.total}
  player = null
  progress = null
  $('results').hidden = true
  $('score').textContent = ''
  $('history').replaceChildren()
  $('player').value = ''
  $('lookup-host').value = key[0]
  $('lookup-slug').value = key[1]
  $('round-title').textContent = expedition.title
  $('round-label').textContent = expedition.status + ' · HOST ' + key[0]
  $('examples').hidden = !matchesDemo()
  $('round-proof').hidden = !matchesDemo()
  if (matchesDemo()) $('round-proof').href = txUrl(demo.transactions.open.hash)
  if (updateHistory) history.replaceState(null, '', deepLink(key,subject))
  if (subject) await showPlayer(subject)
  else {
    await showCheckpoint(0)
    status('Expedition ready. Open your wallet to play or inspect a public result.')
  }
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
  if (BigInt(await reader.request({method:'eth_gasPrice',params:[]})) !== 0n) throw Error('Nonzero gas price on Stable Studionet.')
  status('Review the transaction in your wallet.')
  const hash = await signer.client.writeContract({address, functionName:method, args, value:0n, leaderOnly:false})
  $('transaction').href = txUrl(hash)
  $('transaction').hidden = false
  status('Submitted · awaiting consensus.')
  await waitForFinality(hash, stage => status('Consensus · ' + stage))
  return hash
}

async function run(action) {
  if (busy) return
  busy = true
  controls()
  try {
    await action()
  } catch (error) {
    status(error.shortMessage ?? error.message ?? String(error))
  } finally {
    busy = false
    controls()
  }
}

function bind(id, event, action) {
  $(id).addEventListener(event, e => {
    e.preventDefault()
    run(action)
  })
}

bind('open','submit',() => openExpedition($('lookup-host').value.trim(),$('lookup-slug').value.trim()))
bind('create','submit',async () => {
  const slug = $('slug').value.trim()
  const title = $('title').value.trim()
  const ids = $('event').value.split(',').map(id => id.trim())
  if (!slugPattern.test(slug) || !title || ids.length < 2 || ids.length > 5 ||
      ids.some(id => !/^[a-z0-9]{4,24}$/.test(id)) || new Set(ids).size !== ids.length) {
    throw Error('Enter a title, a valid key and two to five distinct event IDs.')
  }
  const signer = await wallet()
  const hash = await write(signer,'open_expedition',[slug,title,ids.join(',')])
  await openExpedition(signer.account,slug)
  $('round-proof').href = txUrl(hash)
  $('round-proof').hidden = false
  status('Expedition finalized. Copy the expedition link to share it.')
})
bind('connect','click',async () => {
  if (!active) throw Error('Open an expedition first.')
  const signer = await wallet()
  await showPlayer(signer.account)
})
bind('submit','click',async () => {
  const signer = await wallet()
  if (signer.account === active.key[0]) throw Error('Hosts cannot submit their own expedition.')
  const state = await get('get_player_progress',[...active.key,signer.account])
  if ((state?.played ?? 0) !== index) {
    await showPlayer(signer.account)
    return status('Loaded your current checkpoint. Select its sector to submit.')
  }
  const round = index
  const hash = await write(signer,'plot',[...active.key,round,selection])
  proof.set([...active.key,signer.account,round].join('/'),hash)
  await showPlayer(signer.account,round)
})
bind('next','click',() => showCheckpoint(index + 1))
bind('win','click',() => showPlayer(demo.players[0],0))
bind('miss','click',() => showPlayer(demo.players[1],0))
bind('passport','submit',async () => {
  if (!active) throw Error('Open an expedition first.')
  const subject = $('player').value.trim().toLowerCase()
  if (!walletPattern.test(subject)) throw Error('Enter a valid player wallet.')
  await showPlayer(subject)
})
bind('share','click',async () => {
  await navigator.clipboard.writeText(String(deepLink(active.key)))
  status('Expedition link copied.')
})
bind('share-result','click',async () => {
  await navigator.clipboard.writeText(String(deepLink(active.key,player)))
  status('Public result link copied.')
})

const params = new URLSearchParams(location.search)
if (params.has('round') && !params.has('expedition')) {
  location.replace('./archive.html' + location.search + location.hash)
} else {
  const subject = params.get('player')?.toLowerCase()
  run(() => openExpedition(params.get('host') ?? demo.host, params.get('expedition') ?? demo.slug,
    walletPattern.test(subject ?? '') ? subject : undefined, false))
}
