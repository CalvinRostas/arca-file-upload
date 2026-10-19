import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { DomainError } from '../modules/errors'

/**
 * Every API route uses this instead of `defineEventHandler`. It is the single place
 * where domain errors become HTTP errors (ADR-0005).
 */
export function defineApiHandler<T>(handler: (event: H3Event<EventHandlerRequest>) => Promise<T> | T): EventHandler<EventHandlerRequest, Promise<T>> {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      if (error instanceof DomainError) {
        throw createError({
          statusCode: error.status,
          message: error.message,
          data: { code: error.code },
        })
      }
      throw error
    }
  })
}
