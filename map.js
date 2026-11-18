import {feature} from 'topojson-client'
import world from 'world-atlas/land-110m.json'

export function drawMap(canvas) {
  const {width, height} = canvas
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#162a2d'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#294347'
  ctx.lineWidth = 1
  for (let x = 0; x < width; x += width / 24) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y < height; y += height / 12) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  const land = feature(world, world.objects.land)
  ctx.fillStyle = '#678879'
  ctx.strokeStyle = '#9db6a3'
  for (const item of land.features) {
    const polygons = item.geometry.type === 'Polygon' ? [item.geometry.coordinates] : item.geometry.coordinates
    for (const polygon of polygons) {
      ctx.beginPath()
      for (const ring of polygon) {
        ring.forEach(([lon, lat], index) => {
          const x = (lon + 180) * width / 360
          const y = (90 - lat) * height / 180
          if (index) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        ctx.closePath()
      }
      ctx.fill('evenodd')
      ctx.stroke()
    }
  }
}
