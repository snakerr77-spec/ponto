"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"

type FontStyle = React.CSSProperties & {
  fontFamily?: string
  fontWeight?: number | string
  fontSize?: number | string
  letterSpacing?: number | string
  lineHeight?: number | string
}

type TransitionValue = {
  type?: string
  stiffness?: number
  damping?: number
  mass?: number
  duration?: number
  delay?: number
  ease?: string | number[]
  staggerChildren?: number
}

type Props = {
  prefix?: string
  texts?: string[]
  font?: FontStyle
  color?: string
  prefixColor?: string
  cursorColor?: string
  cursorBorderColor?: string
  cursorWidth?: number
  cursorHeight?: number
  deletingSpeed?: number
  transition?: TransitionValue
  style?: React.CSSProperties
}

const DEFAULT_TEXTS = ["Leia o ponto real.", "Calcule cada hora."]
const DEFAULT_FONT: FontStyle = {
  fontFamily: '"Arial Rounded MT Bold", "Arial Black", Inter, system-ui, sans-serif',
  fontWeight: 900,
  fontSize: "64px",
  letterSpacing: "-0.07em",
  lineHeight: "0.95em",
  textAlign: "left",
}
const DEFAULT_TRANSITION: TransitionValue = {
  duration: 0.045,
  delay: 1.55,
  ease: "linear",
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

type Phase = "typing" | "holding" | "deleting"

export default function TypewriterText(props: Props) {
  const {
    prefix = "",
    texts = DEFAULT_TEXTS,
    font = DEFAULT_FONT,
    color = "#f4f4f5",
    prefixColor = "#f4f4f5",
    cursorColor = "#cfd1d6",
    cursorBorderColor = "#8e929a",
    cursorWidth = 7,
    cursorHeight = 42,
    deletingSpeed = 28,
    transition = DEFAULT_TRANSITION,
    style,
  } = props

  const typingSpeed = Math.max(20, Math.round((transition.duration ?? 0.045) * 1000))
  const holdDuration = transition.delay ?? 1.55
  const safeTexts = useMemo(() => {
    const list = (texts ?? DEFAULT_TEXTS).map((t) => t.trim()).filter(Boolean)
    return list.length ? list : DEFAULT_TEXTS
  }, [texts])

  const [textIndex, setTextIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("typing")
  const [cursorOn, setCursorOn] = useState(true)
  const currentText = safeTexts[textIndex] ?? safeTexts[0] ?? ""
  const displayed = currentText.slice(0, charIndex)

  useEffect(() => {
    setTextIndex(0)
    setCharIndex(0)
    setPhase("typing")
    setCursorOn(true)
  }, [safeTexts])

  useEffect(() => {
    if (phase !== "holding") {
      setCursorOn(true)
      return
    }
    const id = window.setInterval(() => setCursorOn((prev) => !prev), 500)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCharIndex(currentText.length)
      setPhase("holding")
      return
    }

    let timer: ReturnType<typeof setTimeout>
    const holdMs = holdDuration * 1000
    if (phase === "typing") {
      timer = window.setTimeout(() => {
        if (charIndex < currentText.length) setCharIndex((i) => i + 1)
        else setPhase("holding")
      }, charIndex < currentText.length ? typingSpeed : 0)
    } else if (phase === "holding") {
      timer = window.setTimeout(() => setPhase("deleting"), holdMs)
    } else if (charIndex > 0) {
      timer = window.setTimeout(() => setCharIndex((i) => i - 1), deletingSpeed)
    } else {
      timer = window.setTimeout(() => {
        setTextIndex((i) => (i + 1) % safeTexts.length)
        setPhase("typing")
      }, 0)
    }
    return () => clearTimeout(timer)
  }, [phase, charIndex, currentText, typingSpeed, deletingSpeed, holdDuration, safeTexts.length])

  return (
    <div
      role="text"
      aria-label={`${prefix.replace(/\n/g, " ")}${currentText}`}
      style={{ ...font, width: "100%", color, whiteSpace: "pre-wrap", ...style }}
    >
      {prefix ? <span style={{ color: prefixColor }}>{prefix}</span> : null}
      <span aria-hidden="true" style={{ color }}>
        {displayed}
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            boxSizing: "border-box",
            width: cursorWidth,
            height: cursorHeight,
            marginLeft: "0.08em",
            verticalAlign: "-0.07em",
            backgroundColor: cursorColor,
            border: `1.5px solid ${cursorBorderColor}`,
            borderRadius: 2,
            opacity: cursorOn ? 1 : 0,
          }}
        />
      </span>
    </div>
  )
}
