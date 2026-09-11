import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getSetting, setSetting, deleteSetting } from './settings'

const PIN_KEY = 'lock.pin' // stored as "saltHex:hashHex"
const IDLE_KEY = 'lock.idleMinutes'
const DEFAULT_IDLE_MINUTES = 10
const KEY_LENGTH = 32

function hashPin(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, KEY_LENGTH)
}

export function isPinSet(): boolean {
  return getSetting(PIN_KEY) !== undefined
}

/**
 * The PIN itself is never stored — only scrypt(pin, salt) alongside the
 * salt, as one "saltHex:hashHex" string. This is a UI-level deterrent, not
 * encryption; see the plan's Global Constraints.
 */
export function setPin(pin: string): void {
  const salt = randomBytes(16)
  const hash = hashPin(pin, salt)
  setSetting(PIN_KEY, `${salt.toString('hex')}:${hash.toString('hex')}`)
}

export function clearPin(): void {
  deleteSetting(PIN_KEY)
}

export function verifyPin(pin: string): boolean {
  const stored = getSetting(PIN_KEY)
  if (!stored) return false
  const [saltHex, hashHex] = stored.split(':')
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = hashPin(pin, salt)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function getIdleMinutes(): number {
  const v = getSetting(IDLE_KEY)
  return v ? Number(v) : DEFAULT_IDLE_MINUTES
}

export function setIdleMinutes(n: number): void {
  setSetting(IDLE_KEY, String(Math.max(1, Math.round(n))))
}
