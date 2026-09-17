import { MeshGradient } from '@paper-design/shaders-react'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

export type MeshGradientGhostProps = {
  compact?: boolean
  className?: string
}

export function MeshGradientSVG({ compact = false, className = '' }: MeshGradientGhostProps) {
  const colors = ['#d7d8e4', '#adb8dc', '#8fa9e5', '#d6afd2', '#6f8fd1']
  const rootRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const targetRef = useRef({ x: 0, y: 0 })
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return

      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = e.clientX - centerX
      const dy = e.clientY - centerY
      const distance = Math.max(1, Math.hypot(dx, dy))

      // Compact sidebar ghost gets a more visible eye range so it clearly
      // follows the cursor even at the smaller rendered size.
      const maxOffset = compact ? 11 : 9
      const strength = Math.min(maxOffset, 2.5 + distance * 0.07)

      targetRef.current = {
        x: (dx / distance) * strength,
        y: (dy / distance) * strength,
      }

      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          setEyeOffset(targetRef.current)
          rafRef.current = null
        })
      }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [compact])

  const clipId = compact ? 'shapeClipCompact' : 'shapeClipMain'

  return (
    <motion.div
      ref={rootRef}
      className={`ghost-shell ${compact ? 'ghost-compact' : ''} ${className}`}
      animate={{ y: [0, compact ? -3 : -6, 0] }}
      transition={{ duration: 2.65, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="231" height="289" viewBox="0 0 231 289" className="ghost-svg">
        <defs>
          <clipPath id={clipId}>
            <path d="M230.809 115.385V249.411C230.809 269.923 214.985 287.282 194.495 288.411C184.544 288.949 175.364 285.718 168.26 280C159.746 273.154 147.769 273.461 139.178 280.23C132.638 285.384 124.381 288.462 115.379 288.462C106.377 288.462 98.1451 285.384 91.6055 280.23C82.912 273.385 70.9353 273.385 62.2415 280.23C55.7532 285.334 47.598 288.411 38.7246 288.462C17.4132 288.615 0 270.667 0 249.359V115.385C0 51.6667 51.6756 0 115.404 0C179.134 0 230.809 51.6667 230.809 115.385Z" />
          </clipPath>
        </defs>
        <foreignObject width="231" height="289" clipPath={`url(#${clipId})`}>
          <div style={{ width: '100%', height: '100%' }}>
            <MeshGradient colors={colors} className="ghost-gradient" speed={1.15} />
          </div>
        </foreignObject>
        <motion.ellipse
          rx="20" ry="30" fill="#050505"
          animate={{ cx: 80 + eyeOffset.x, cy: 120 + eyeOffset.y }}
          transition={{ duration: 0.045, ease: 'linear' }}
        />
        <motion.ellipse
          rx="20" ry="30" fill="#050505"
          animate={{ cx: 150 + eyeOffset.x, cy: 120 + eyeOffset.y }}
          transition={{ duration: 0.045, ease: 'linear' }}
        />
      </svg>
      <style>{`
        .ghost-shell { width:min(248px, 52vw); margin:0 auto; filter:drop-shadow(0 24px 46px rgba(130,150,225,.14)); }
        .ghost-compact { width:112px; filter:drop-shadow(0 14px 28px rgba(130,150,225,.10)); }
        .ghost-svg { width:100%; height:auto; display:block; }
        .ghost-gradient { width:100%; height:100%; }
      `}</style>
    </motion.div>
  )
}
