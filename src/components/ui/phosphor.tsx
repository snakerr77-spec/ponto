// Phosphor — Originkit

"use client"

import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"

interface Props {
    background?: string
    baseColor?: string
    spectrum?: number
    size?: number
    distance?: number
    turbulence?: number
    brightness?: number
    speed?: number
    style?: CSSProperties
}

type Vec3 = [number, number, number]

const MAX_DPR = 1

const REF_RADIUS = 3

const REF_EXPOSURE = 3e4

const TIME_RATE = 1

const TAU = 6.283185307179586

function clamp01(v: number) {
    return v < 0 ? 0 : v > 1 ? 1 : v
}

function clamp(v: number, lo: number, hi: number) {
    return v < lo ? lo : v > hi ? hi : v
}

function num(v: unknown, fallback: number): number {
    return typeof v === "number" && isFinite(v) ? v : fallback
}

function hueToRgb(p: number, q: number, t: number) {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
}

function parseColor(input: string | undefined, fallback: Vec3): Vec3 {
    if (!input) return fallback
    let s = String(input).trim()
    if (s.startsWith("var(")) {
        const comma = s.indexOf(",")
        if (comma < 0) return fallback
        s = s.slice(comma + 1, s.lastIndexOf(")")).trim()
    }
    if (s[0] === "#") {
        const hex = s.slice(1)
        const full =
            hex.length === 3 || hex.length === 4
                ? hex
                      .slice(0, 3)
                      .split("")
                      .map((c) => c + c)
                      .join("")
                : hex.slice(0, 6)
        const n = parseInt(full, 16)
        if (!isFinite(n)) return fallback
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    }
    const m = s.match(/^(rgba?|hsla?)\s*\(([^)]+)\)$/i)
    if (!m) return fallback
    const parts = m[2].split(/[,\s/]+/).filter((p) => p.length > 0)
    if (parts.length < 3) return fallback
    if (m[1].toLowerCase().startsWith("rgb")) {
        const raw = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])]
        if (!raw.every((v) => isFinite(v))) return fallback
        const scale = (text: string, v: number) => (text.indexOf("%") >= 0 ? v / 100 : v / 255)
        return [
            clamp01(scale(parts[0], raw[0])),
            clamp01(scale(parts[1], raw[1])),
            clamp01(scale(parts[2], raw[2])),
        ]
    }
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360
    const sat = clamp01(parseFloat(parts[1]) / 100)
    const li = clamp01(parseFloat(parts[2]) / 100)
    if (!isFinite(h) || !isFinite(sat) || !isFinite(li)) return fallback
    if (sat === 0) return [li, li, li]
    const q = li < 0.5 ? li * (1 + sat) : li + sat - li * sat
    const p = 2 * li - q
    return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
}

const VERT_SRC = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG_SRC = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;

uniform vec3  uBg;
uniform vec3  uBase;
uniform float uSpread;
uniform float uRadius;
uniform float uDist;
uniform float uTurb;
uniform float uGain;

vec3 tanh3(vec3 x) {
    vec3 e = exp(-2.0 * abs(x));
    return sign(x) * (1.0 - e) / (1.0 + e);
}

void main() {
    vec3 dir = normalize(vec3(2.0 * gl_FragCoord.xy - uRes, 1.0 - uRes.y));

    vec3 acc = vec3(0.0);
    float z = 0.0;
    float d = 0.0;
    float s = 0.0;

    for (int i = 0; i < 80; i++) {
        vec3 p = z * dir;

        vec3 a = normalize(cos(vec3(1.0, 2.0, 0.0) + uTime - d * 8.0));

        p.z += uDist;

        a = a * dot(a, p) - cross(a, p);

        for (float k = 2.0; k < 10.0; k += 1.0) {
            a += uTurb * sin(a * k + uTime).yzx / k;
        }

        s = a.y;

        d = max(1e-6, 0.1 * abs(length(p) - uRadius) + 0.04 * abs(s));
        z += d;

        acc += (cos(s + vec3(0.0, 1.0, 2.0) * uSpread) + 1.0) / d * z;
    }

    vec3 glow = tanh3(acc * uBase * uGain);

    float cover = max(max(glow.r, glow.g), glow.b);
    gl_FragColor = vec4(uBg * (1.0 - cover) + glow, 1.0);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Phosphor shader:", gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
    }
    return shader
}

function __OriginkitBase_Phosphor(props: Props) {
    const {
        background = "#000000",
        baseColor = "#FFFFFF",
        spectrum = 100,
        size = 200,
        distance = 12,
        turbulence = 49,
        brightness = 176,
        speed = 100,
        style,
    } = props

    const rootRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const propsRef = useRef(props)
    propsRef.current = props

    useEffect(() => {
        const root = rootRef.current
        const canvas = canvasRef.current
        if (!root || !canvas) return

        const gl = canvas.getContext("webgl", {
            antialias: false,
            alpha: false,
            depth: false,
            preserveDrawingBuffer: false,
        })
        if (!gl) {
            console.error("Phosphor: WebGL unavailable")
            return
        }

        const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
        if (!vs || !fs) return

        const program = gl.createProgram()
        if (!program) return
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Phosphor link:", gl.getProgramInfoLog(program))
            return
        }
        gl.useProgram(program)

        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const posLoc = gl.getAttribLocation(program, "aPos")
        gl.enableVertexAttribArray(posLoc)
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

        const loc = (name: string) => gl.getUniformLocation(program, name)
        const uRes = loc("uRes")
        const uTime = loc("uTime")
        const uBg = loc("uBg")
        const uBase = loc("uBase")
        const uSpread = loc("uSpread")
        const uRadius = loc("uRadius")
        const uDist = loc("uDist")
        const uTurb = loc("uTurb")
        const uGain = loc("uGain")

        let cssWidth = root.offsetWidth || 1
        let cssHeight = root.offsetHeight || 1
        const resizeObserver = new ResizeObserver(() => {
            cssWidth = root.offsetWidth || 1
            cssHeight = root.offsetHeight || 1
        })
        resizeObserver.observe(root)

        const reduceMotion =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches

        let raf = 0
        let last = performance.now()
        let clock = 0

        const render = (now: number) => {
            raf = requestAnimationFrame(render)

            const dt = clamp((now - last) / 1000, 0, 0.05)
            last = now

            const p = propsRef.current
            const still = reduceMotion ? 0 : 1
            const rate = (clamp(num(p.speed, 50), 0, 100) / 50) * TIME_RATE

            clock = (clock + dt * still * rate) % TAU

            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
            const bufferWidth = Math.max(1, Math.round(cssWidth * dpr))
            const bufferHeight = Math.max(1, Math.round(cssHeight * dpr))
            if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
                canvas.width = bufferWidth
                canvas.height = bufferHeight
                gl.viewport(0, 0, bufferWidth, bufferHeight)
            }

            const bg = parseColor(p.background, [0, 0, 0])
            const base = parseColor(p.baseColor, [1, 1, 1])

            gl.uniform2f(uRes, bufferWidth, bufferHeight)
            gl.uniform1f(uTime, clock)
            gl.uniform3f(uBg, bg[0], bg[1], bg[2])
            gl.uniform3f(uBase, base[0], base[1], base[2])
            gl.uniform1f(uSpread, clamp(num(p.spectrum, 100), 0, 100) / 100)
            gl.uniform1f(uRadius, (clamp(num(p.size, 100), 20, 200) / 100) * REF_RADIUS)
            gl.uniform1f(uDist, clamp(num(p.distance, 5), 2, 20))
            gl.uniform1f(uTurb, clamp(num(p.turbulence, 100), 0, 200) / 100)
            gl.uniform1f(uGain, clamp(num(p.brightness, 100), 10, 400) / 100 / REF_EXPOSURE)

            gl.drawArrays(gl.TRIANGLES, 0, 3)
        }

        raf = requestAnimationFrame(render)

        return () => {
            cancelAnimationFrame(raf)
            resizeObserver.disconnect()
            gl.deleteBuffer(buffer)
            gl.deleteProgram(program)
            gl.deleteShader(vs)
            gl.deleteShader(fs)

        }
    }, [])

    return (
        <div
            ref={rootRef}
            style={{
                minWidth: 1200,
                minHeight: 800,
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",
                isolation: "isolate",
                background,
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                }}
            />
        </div>
    )
}

const __originkitPresetProps = {
  "baseColor": "#23236E"
};

export default function Phosphor(props: Record<string, unknown>) {
  return <__OriginkitBase_Phosphor {...(__originkitPresetProps as Record<string, unknown>)} {...props} />;
}