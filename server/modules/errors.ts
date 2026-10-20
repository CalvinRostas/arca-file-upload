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
