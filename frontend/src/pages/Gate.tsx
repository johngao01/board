import {useEffect, useRef, useState} from 'react'
import type {CSSProperties, FormEvent, RefObject} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'

const GATE_STORAGE_KEY = 'board-gate-unlocked'

export function buildTimePassword(date: Date) {
    const day = `${date.getDate()}`.padStart(2, '0')
    const hour = `${date.getHours()}`.padStart(2, '0')
    const minute = `${date.getMinutes()}`.padStart(2, '0')
    return `${day}${hour}${minute}`
}

export function isGateUnlocked() {
    return sessionStorage.getItem(GATE_STORAGE_KEY) === '1'
}

export function unlockGate() {
    sessionStorage.setItem(GATE_STORAGE_KEY, '1')
}

interface PupilProps {
    size?: number
    maxDistance?: number
    pupilColor?: string
    forceLookX?: number
    forceLookY?: number
}

function Pupil({
                   size = 12,
                   maxDistance = 5,
                   pupilColor = '#2d2d2d',
                   forceLookX,
                   forceLookY,
               }: PupilProps) {
    const [mouseX, setMouseX] = useState(0)
    const [mouseY, setMouseY] = useState(0)
    const pupilRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            setMouseX(event.clientX)
            setMouseY(event.clientY)
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    const calculatePupilPosition = () => {
        if (!pupilRef.current) {
            return {x: 0, y: 0}
        }

        if (forceLookX !== undefined && forceLookY !== undefined) {
            return {x: forceLookX, y: forceLookY}
        }

        const pupil = pupilRef.current.getBoundingClientRect()
        const pupilCenterX = pupil.left + pupil.width / 2
        const pupilCenterY = pupil.top + pupil.height / 2

        const deltaX = mouseX - pupilCenterX
        const deltaY = mouseY - pupilCenterY
        const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance)

        const angle = Math.atan2(deltaY, deltaX)
        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance,
        }
    }

    const pupilPosition = calculatePupilPosition()

    return (
        <div
            ref={pupilRef}
            className="gate-pupil"
            style={
                {
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: pupilColor,
                    transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
                } as CSSProperties
            }
        />
    )
}

interface EyeBallProps {
    size?: number
    pupilSize?: number
    maxDistance?: number
    eyeColor?: string
    pupilColor?: string
    isBlinking?: boolean
    forceLookX?: number
    forceLookY?: number
}

function EyeBall({
                     size = 48,
                     pupilSize = 16,
                     maxDistance = 10,
                     eyeColor = '#ffffff',
                     pupilColor = '#2d2d2d',
                     isBlinking = false,
                     forceLookX,
                     forceLookY,
                 }: EyeBallProps) {
    const [mouseX, setMouseX] = useState(0)
    const [mouseY, setMouseY] = useState(0)
    const eyeRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            setMouseX(event.clientX)
            setMouseY(event.clientY)
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    const calculatePupilPosition = () => {
        if (!eyeRef.current) {
            return {x: 0, y: 0}
        }

        if (forceLookX !== undefined && forceLookY !== undefined) {
            return {x: forceLookX, y: forceLookY}
        }

        const eye = eyeRef.current.getBoundingClientRect()
        const eyeCenterX = eye.left + eye.width / 2
        const eyeCenterY = eye.top + eye.height / 2

        const deltaX = mouseX - eyeCenterX
        const deltaY = mouseY - eyeCenterY
        const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance)

        const angle = Math.atan2(deltaY, deltaX)
        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance,
        }
    }

    const pupilPosition = calculatePupilPosition()

    return (
        <div
            ref={eyeRef}
            className="gate-eye-ball"
            style={
                {
                    width: `${size}px`,
                    height: isBlinking ? '2px' : `${size}px`,
                    backgroundColor: eyeColor,
                } as CSSProperties
            }
        >
            {!isBlinking ? (
                <div
                    className="gate-eye-core"
                    style={
                        {
                            width: `${pupilSize}px`,
                            height: `${pupilSize}px`,
                            backgroundColor: pupilColor,
                            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
                        } as CSSProperties
                    }
                />
            ) : null}
        </div>
    )
}

function calculatePosition(
    ref: RefObject<HTMLDivElement | null>,
    mouseX: number,
    mouseY: number,
) {
    if (!ref.current) {
        return {faceX: 0, faceY: 0, bodySkew: 0}
    }

    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 3

    const deltaX = mouseX - centerX
    const deltaY = mouseY - centerY

    return {
        faceX: Math.max(-15, Math.min(15, deltaX / 20)),
        faceY: Math.max(-10, Math.min(10, deltaY / 30)),
        bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
    }
}

export function GatePage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [showPassword, setShowPassword] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [mouseX, setMouseX] = useState(0)
    const [mouseY, setMouseY] = useState(0)
    const [isPurpleBlinking, setIsPurpleBlinking] = useState(false)
    const [isBlackBlinking, setIsBlackBlinking] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)
    const [isPurplePeeking, setIsPurplePeeking] = useState(false)
    const next = searchParams.get('next') || '/'
    const safeNext = next.startsWith('/') ? next : '/'

    const purpleRef = useRef<HTMLDivElement>(null)
    const blackRef = useRef<HTMLDivElement>(null)
    const yellowRef = useRef<HTMLDivElement>(null)
    const orangeRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            setMouseX(event.clientX)
            setMouseY(event.clientY)
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    useEffect(() => {
        let cancelled = false

        const scheduleBlink = () => {
            const delay = Math.random() * 4000 + 3000
            const blinkTimeout = window.setTimeout(() => {
                if (cancelled) {
                    return
                }

                setIsPurpleBlinking(true)
                window.setTimeout(() => {
                    if (cancelled) {
                        return
                    }
                    setIsPurpleBlinking(false)
                    scheduleBlink()
                }, 150)
            }, delay)

            return blinkTimeout
        }

        const timeout = scheduleBlink()
        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        const scheduleBlink = () => {
            const delay = Math.random() * 4000 + 3000
            const blinkTimeout = window.setTimeout(() => {
                if (cancelled) {
                    return
                }

                setIsBlackBlinking(true)
                window.setTimeout(() => {
                    if (cancelled) {
                        return
                    }
                    setIsBlackBlinking(false)
                    scheduleBlink()
                }, 150)
            }, delay)

            return blinkTimeout
        }

        const timeout = scheduleBlink()
        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [])

    useEffect(() => {
        if (!isTyping) {
            setIsLookingAtEachOther(false)
            return
        }

        setIsLookingAtEachOther(true)
        const timer = window.setTimeout(() => setIsLookingAtEachOther(false), 800)
        return () => window.clearTimeout(timer)
    }, [isTyping])

    useEffect(() => {
        if (!(password.length > 0 && showPassword)) {
            setIsPurplePeeking(false)
            return
        }

        const peekTimer = window.setTimeout(() => {
            setIsPurplePeeking(true)
            window.setTimeout(() => {
                setIsPurplePeeking(false)
            }, 800)
        }, Math.random() * 3000 + 2000)

        return () => window.clearTimeout(peekTimer)
    }, [password, showPassword, isPurplePeeking])

    const purplePos = calculatePosition(purpleRef, mouseX, mouseY)
    const blackPos = calculatePosition(blackRef, mouseX, mouseY)
    const yellowPos = calculatePosition(yellowRef, mouseX, mouseY)
    const orangePos = calculatePosition(orangeRef, mouseX, mouseY)

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError('')
        setIsLoading(true)

        await new Promise((resolve) => window.setTimeout(resolve, 250))

        if (email === 'john' && password === buildTimePassword(new Date())) {
            unlockGate()
            navigate(safeNext, {replace: true})
            return
        }

        setError('邮箱或密码不正确')
        setIsLoading(false)
    }

    return (
        <main className="gate-page">
            <section className="gate-card gate-card-modern">
                <div className="gate-left-panel">
                    <div className="gate-brand">
                        <div className="gate-brand-mark">◔</div>
                        <span>Board Compass</span>
                    </div>

                    <div className="gate-left-glow gate-left-glow-top"/>
                    <div className="gate-left-glow gate-left-glow-bottom"/>
                    <div className="gate-character-stage">
                        <div className="gate-character-wrap">
                            <div
                                ref={purpleRef}
                                className="gate-actor gate-actor-purple"
                                style={
                                    {
                                        height: isTyping || (password.length > 0 && !showPassword) ? '440px' : '400px',
                                        transform:
                                            password.length > 0 && showPassword
                                                ? 'skewX(0deg)'
                                                : isTyping || (password.length > 0 && !showPassword)
                                                    ? `skewX(${purplePos.bodySkew - 12}deg) translateX(40px)`
                                                    : `skewX(${purplePos.bodySkew}deg)`,
                                    } as CSSProperties
                                }
                            >
                                <div
                                    className="gate-actor-eyes gate-actor-eyes-purple"
                                    style={
                                        {
                                            left:
                                                password.length > 0 && showPassword
                                                    ? '20px'
                                                    : isLookingAtEachOther
                                                        ? '55px'
                                                        : `${45 + purplePos.faceX}px`,
                                            top:
                                                password.length > 0 && showPassword
                                                    ? '35px'
                                                    : isLookingAtEachOther
                                                        ? '65px'
                                                        : `${40 + purplePos.faceY}px`,
                                        } as CSSProperties
                                    }
                                >
                                    <EyeBall
                                        size={18}
                                        pupilSize={7}
                                        maxDistance={5}
                                        isBlinking={isPurpleBlinking}
                                        forceLookX={
                                            password.length > 0 && showPassword
                                                ? isPurplePeeking
                                                    ? 4
                                                    : -4
                                                : isLookingAtEachOther
                                                    ? 3
                                                    : undefined
                                        }
                                        forceLookY={
                                            password.length > 0 && showPassword
                                                ? isPurplePeeking
                                                    ? 5
                                                    : -4
                                                : isLookingAtEachOther
                                                    ? 4
                                                    : undefined
                                        }
                                    />
                                    <EyeBall
                                        size={18}
                                        pupilSize={7}
                                        maxDistance={5}
                                        isBlinking={isPurpleBlinking}
                                        forceLookX={
                                            password.length > 0 && showPassword
                                                ? isPurplePeeking
                                                    ? 4
                                                    : -4
                                                : isLookingAtEachOther
                                                    ? 3
                                                    : undefined
                                        }
                                        forceLookY={
                                            password.length > 0 && showPassword
                                                ? isPurplePeeking
                                                    ? 5
                                                    : -4
                                                : isLookingAtEachOther
                                                    ? 4
                                                    : undefined
                                        }
                                    />
                                </div>
                            </div>

                            <div
                                ref={blackRef}
                                className="gate-actor gate-actor-black"
                                style={
                                    {
                                        transform:
                                            password.length > 0 && showPassword
                                                ? 'skewX(0deg)'
                                                : isLookingAtEachOther
                                                    ? `skewX(${blackPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
                                                    : isTyping || (password.length > 0 && !showPassword)
                                                        ? `skewX(${blackPos.bodySkew * 1.5}deg)`
                                                        : `skewX(${blackPos.bodySkew}deg)`,
                                    } as CSSProperties
                                }
                            >
                                <div
                                    className="gate-actor-eyes gate-actor-eyes-black"
                                    style={
                                        {
                                            left:
                                                password.length > 0 && showPassword
                                                    ? '10px'
                                                    : isLookingAtEachOther
                                                        ? '32px'
                                                        : `${26 + blackPos.faceX}px`,
                                            top:
                                                password.length > 0 && showPassword
                                                    ? '28px'
                                                    : isLookingAtEachOther
                                                        ? '12px'
                                                        : `${32 + blackPos.faceY}px`,
                                        } as CSSProperties
                                    }
                                >
                                    <EyeBall
                                        size={16}
                                        pupilSize={6}
                                        maxDistance={4}
                                        isBlinking={isBlackBlinking}
                                        forceLookX={password.length > 0 && showPassword ? -4 : isLookingAtEachOther ? 0 : undefined}
                                        forceLookY={password.length > 0 && showPassword ? -4 : isLookingAtEachOther ? -4 : undefined}
                                    />
                                    <EyeBall
                                        size={16}
                                        pupilSize={6}
                                        maxDistance={4}
                                        isBlinking={isBlackBlinking}
                                        forceLookX={password.length > 0 && showPassword ? -4 : isLookingAtEachOther ? 0 : undefined}
                                        forceLookY={password.length > 0 && showPassword ? -4 : isLookingAtEachOther ? -4 : undefined}
                                    />
                                </div>
                            </div>

                            <div
                                ref={orangeRef}
                                className="gate-actor gate-actor-orange"
                                style={{transform: password.length > 0 && showPassword ? 'skewX(0deg)' : `skewX(${orangePos.bodySkew}deg)`}}
                            >
                                <div
                                    className="gate-pupil-row gate-pupil-row-orange"
                                    style={
                                        {
                                            left: password.length > 0 && showPassword ? '50px' : `${82 + orangePos.faceX}px`,
                                            top: password.length > 0 && showPassword ? '85px' : `${90 + orangePos.faceY}px`,
                                        } as CSSProperties
                                    }
                                >
                                    <Pupil
                                        size={12}
                                        maxDistance={5}
                                        forceLookX={password.length > 0 && showPassword ? -5 : undefined}
                                        forceLookY={password.length > 0 && showPassword ? -4 : undefined}
                                    />
                                    <Pupil
                                        size={12}
                                        maxDistance={5}
                                        forceLookX={password.length > 0 && showPassword ? -5 : undefined}
                                        forceLookY={password.length > 0 && showPassword ? -4 : undefined}
                                    />
                                </div>
                            </div>

                            <div
                                ref={yellowRef}
                                className="gate-actor gate-actor-yellow"
                                style={{transform: password.length > 0 && showPassword ? 'skewX(0deg)' : `skewX(${yellowPos.bodySkew}deg)`}}
                            >
                                <div
                                    className="gate-pupil-row gate-pupil-row-yellow"
                                    style={
                                        {
                                            left: password.length > 0 && showPassword ? '20px' : `${52 + yellowPos.faceX}px`,
                                            top: password.length > 0 && showPassword ? '35px' : `${40 + yellowPos.faceY}px`,
                                        } as CSSProperties
                                    }
                                >
                                    <Pupil
                                        size={12}
                                        maxDistance={5}
                                        forceLookX={password.length > 0 && showPassword ? -5 : undefined}
                                        forceLookY={password.length > 0 && showPassword ? -4 : undefined}
                                    />
                                    <Pupil
                                        size={12}
                                        maxDistance={5}
                                        forceLookX={password.length > 0 && showPassword ? -5 : undefined}
                                        forceLookY={password.length > 0 && showPassword ? -4 : undefined}
                                    />
                                </div>
                                <div
                                    className="gate-yellow-mouth"
                                    style={
                                        {
                                            left: password.length > 0 && showPassword ? '10px' : `${40 + yellowPos.faceX}px`,
                                            top: password.length > 0 && showPassword ? '88px' : `${88 + yellowPos.faceY}px`,
                                        } as CSSProperties
                                    }
                                />
                            </div>
                        </div>
                    </div>

                </div>

                <div className="gate-panel gate-panel-modern">
                    <div className="gate-panel-inner">
                        <div className="gate-header">
                            <h1>Welcome back!</h1>
                            <p>Please enter your details</p>
                        </div>

                        <form className="gate-form gate-form-modern" onSubmit={handleSubmit}>
                            <div className="gate-field">
                                <label className="gate-label" htmlFor="gate-email">
                                    UserName
                                </label>
                                <input
                                    id="gate-email"
                                    type="text"
                                    value={email}
                                    autoComplete="off"
                                    onChange={(event) => setEmail(event.target.value)}
                                    onFocus={() => setIsTyping(true)}
                                    onBlur={() => setIsTyping(false)}
                                    required
                                />
                            </div>

                            <div className="gate-field">
                                <label className="gate-label" htmlFor="gate-password">
                                    Password
                                </label>
                                <div className="gate-password-wrap">
                                    <input
                                        id="gate-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        autoComplete="off"
                                        onFocus={() => setIsTyping(true)}
                                        onBlur={() => setIsTyping(false)}
                                        onChange={(event) => setPassword(event.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="gate-toggle"
                                        onClick={() => setShowPassword((value) => !value)}
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>


                            {error ? <div className="gate-error">{error}</div> : null}

                            <button className="gate-submit" type="submit" disabled={isLoading}>
                                {isLoading ? 'Signing in...' : 'Log in'}
                            </button>
                        </form>
                    </div>
                </div>
            </section>
        </main>
    )
}
