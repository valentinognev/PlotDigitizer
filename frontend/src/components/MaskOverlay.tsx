import { useEffect, useState } from 'react'
import { Image as KonvaImage } from 'react-konva'

interface Props {
  url: string
  width: number
  height: number
  opacity: number
}

export function MaskOverlay({ url, width, height, opacity }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = url
    return () => {
      img.onload = null
    }
  }, [url])

  if (!image) return null
  return (
    <KonvaImage image={image} width={width} height={height} opacity={opacity} listening={false} />
  )
}
