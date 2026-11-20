// Small shared basics (types and log scrubbing) used by pass.ts, pay.ts and the functions.
export type Env = Record<string, string | undefined>;
export type RpcResult = { data: unknown; error: { message: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
export type Log = (msg: string, fields?: Record<string, unknown>) => void;

/** Short, safe text for logs: no long tokens or phone numbers. */
export function scrub(text: unknown, max = 200): string {
  return String(text ?? '')
    .replace(/[A-Za-z0-9_-]{20,}/g, '…')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
