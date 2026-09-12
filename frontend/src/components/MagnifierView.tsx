import { useEffect, useRef, useState } from 'react'
import { magnifierSourceRect } from '../lib/magnifier'

const VIEW = 160
const DEFAULT_MAGNIFICATION = 5

interface Props {
  imageUrl: string | null
  cursor: [number, number] | null
  imageW: number
  imageH: number
  magnification?: number
}

export function MagnifierView({
  imageUrl,
  cursor,
  imageW,
  imageH,
  magnification = DEFAULT_MAGNIFICATION,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!imageUrl) {
      setImage(null)
      return
    }
    const img = new window.Image()
    img.src = imageUrl
    img.onload = () => setImage(img)
    return () => {
      img.onload = null
    }
  }, [imageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, VIEW, VIEW)
    if (image && cursor && imageW > 0 && imageH > 0) {
      const { sx, sy, sw, sh } = magnifierSourceRect(
        imageW,
        imageH,
        cursor,
        magnification,
        VIEW,
      )
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, VIEW, VIEW)
    }
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(80, 0)
    ctx.lineTo(80, VIEW)
    ctx.moveTo(0, 80)
    ctx.lineTo(VIEW, 80)
    ctx.stroke()
  }, [image, cursor, imageW, imageH, magnification])

  return (
    <canvas
      ref={canvasRef}
      width={VIEW}
      height={VIEW}
      className="h-[160px] w-[160px] shrink-0 rounded border border-slate-700 bg-slate-900"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}
