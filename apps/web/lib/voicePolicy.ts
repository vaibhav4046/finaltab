/**
 * Worst-case AssemblyAI usage reserved before a temporary token is minted.
 * The matching hard limit is repeated in the database migration and locked by
 * a regression test; neither the browser nor a route request can raise it.
 */
export const VOICE_STT_RESERVATION_SECONDS = 180;
