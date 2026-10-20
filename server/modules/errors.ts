/**
 * Typed domain errors. Modules throw these; `defineApiHandler` maps them to HTTP once.
 * Modules never import h3 — they stay framework-free and testable on their own.
 */
export abstract class DomainError extends Error {
  abstract readonly status: number
  /** Stable machine-readable code the client can switch on. */
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** Also used for "exists but isn't yours" — other Owners' items are never acknowledged. */
export class NotFound extends DomainError {
  readonly status = 404
  readonly code = 'not_found'
}

export class Unauthenticated extends DomainError {
  readonly status = 401
  readonly code = 'unauthenticated'
  constructor(message = 'Sign in required') {
    super(message)
  }
}

export class Forbidden extends DomainError {
  readonly status = 403
  readonly code = 'forbidden'
  constructor(message = 'Not allowed') {
    super(message)
  }
}

export class InvalidInput extends DomainError {
  readonly status = 400
  readonly code = 'invalid_input'
}

export class Conflict extends DomainError {
  readonly status = 409
  readonly code: string = 'conflict'
}

export class InviteInvalid extends DomainError {
  readonly status = 410
  readonly code = 'invite_invalid'
  constructor() {
    super('This invite link is invalid, expired, or already used')
  }
}

export class SetupAlreadyDone extends Conflict {
  override readonly code = 'setup_done'
  constructor() {
    super('Arca already has an admin')
  }
}

/** A sibling already has this name (names are unique per Folder, ignoring case). */
export class NameConflict extends Conflict {
  override readonly code = 'name_conflict'
  constructor(readonly itemName: string) {
    super(`Something named “${itemName}” is already in this folder`)
  }
}

export class InvalidMove extends DomainError {
  readonly status = 400
  readonly code = 'invalid_move'
}

export class TagNameTaken extends Conflict {
  override readonly code = 'tag_name_taken'
  constructor(name: string) {
    super(`You already have a tag called “${name}”`)
  }
}

/** A Share link that can't be used: unknown, revoked, its target in Trash, expired, or used up. */
export class ShareUnavailable extends DomainError {
  readonly status: number
  readonly code: string
  constructor(readonly reason: 'gone' | 'expired' | 'used-up') {
    super(
      reason === 'expired'
        ? 'This link has expired'
        : reason === 'used-up'
          ? 'This link has reached its download limit'
          : 'This link isn’t available',
    )
    this.status = reason === 'gone' ? 404 : 410
    this.code = reason === 'gone' ? 'share_unavailable' : reason === 'expired' ? 'share_expired' : 'share_used_up'
  }
}

export class SharePasswordRequired extends DomainError {
  readonly status = 401
  readonly code = 'password_required'
  constructor() {
    super('This link is protected with a password')
  }
}

export class WrongSharePassword extends DomainError {
  readonly status = 401
  readonly code = 'wrong_password'
  constructor() {
    super('That password isn’t right')
  }
}

export class TooManyAttempts extends DomainError {
  readonly status = 429
  readonly code = 'too_many_attempts'
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min.`)
  }
}
