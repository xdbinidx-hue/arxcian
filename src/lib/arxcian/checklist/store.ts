import { EMPTY, type State, type Command, type Snapshot } from './protocol.ts'

type Redis = { get<T>(key: string): Promise<T | null>; eval<T>(script: string, keys: string[], args: string[]): Promise<T> }
export const KEY = 'arxcian:checklist:albin:v1'
// Redis on toimitusjono ja Kanban-tilan lukukopio. Varsinainen tehtävä on
// Hermes SQLite -kannassa; selain ei kuittaa jonopyyntöä tehdyksi.
export const SUBMIT = `
local state = cjson.decode(redis.call('GET', KEYS[1]) or ARGV[2])
local command = cjson.decode(ARGV[1])
local receipt = redis.call('GET', KEYS[2])
if receipt then
 local old = cjson.decode(receipt)
 if old.fingerprint ~= ARGV[3] then return {409, 'Tunniste on jo käytetty eri pyyntöön.'} end
 return {200, receipt}
end
if state.pending ~= cjson.null then return {409, 'Edellinen pyyntö odottaa käsittelyä.'} end
if command.op == 'add' then
 if state.snapshot == cjson.null then return {409, 'Aloita tehtävä Telegramissa.'} end
 local snapshot = cjson.decode(state.snapshot)
 if snapshot.id == cjson.null then return {409, 'Aloita tehtävä Telegramissa.'} end
 if snapshot.revision ~= command.revision then return {409, 'Tehtävä on muuttunut. Päivitä näkymä.'} end
end
state.pending = command
local accepted = cjson.encode({fingerprint=ARGV[3], command=command})
redis.call('SET', KEYS[1], cjson.encode(state))
redis.call('SET', KEYS[2], accepted)
return {202, accepted}
`
export const EXCHANGE = `
local state = cjson.decode(redis.call('GET', KEYS[1]) or ARGV[1])
local snapshot = cjson.decode(ARGV[2])
if state.snapshot ~= cjson.null and snapshot.revision < cjson.decode(state.snapshot).revision then
 return {409, 'Kanban-tila on lukukopiota vanhempi. Tarkista kanta.'}
end
state.snapshot = ARGV[2]
state.syncedAt = tonumber(ARGV[3])
local ack = cjson.decode(ARGV[4])
if ack ~= cjson.null and state.pending ~= cjson.null and ack.id == state.pending.id then
 state.last = ack
 state.pending = cjson.null
end
redis.call('SET', KEYS[1], cjson.encode(state))
return {200, cjson.encode(state.pending)}
`
export function store(redis: Redis) {
  return {
    async read(): Promise<State> {
      const raw = await redis.get<Omit<State, 'snapshot'> & { snapshot: string | null }>(KEY)
      return raw ? { ...raw, snapshot: raw.snapshot ? JSON.parse(raw.snapshot) : null } : { ...EMPTY }
    },
    async submit(command: Command, fingerprint: string): Promise<[number, string]> {
      return redis.eval(SUBMIT, [KEY, `${KEY}:request:${command.id}`], [JSON.stringify(command), JSON.stringify(EMPTY), fingerprint])
    },
    async exchange(snapshot: Snapshot, ack: { id: string; error: string | null } | null): Promise<[number, string]> {
      return redis.eval(EXCHANGE, [KEY], [JSON.stringify(EMPTY), JSON.stringify(snapshot), String(Date.now()), JSON.stringify(ack)])
    },
  }
}
