// Vitest stand-in for Next's "server-only" marker. The real module only
// exists inside Next's bundler; unit tests run in plain Node, which IS the
// server side, so the guard is satisfied by construction.
export {};
