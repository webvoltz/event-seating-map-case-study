-- Reference design: atomic, all-or-nothing seat hold.
--
-- Redis runs a script to completion before serving any other command, so the
-- check and the write below cannot interleave with another buyer's request.
-- That is the whole concurrency guarantee: no locks, no retries, no races.
--
-- Every key shares the hash tag {evt:<eventId>}, so one event's keys live in
-- one Redis Cluster slot and the script stays legal under clustering.
--
-- KEYS[1]  {evt:E}:sold          SET   seats already sold (mirror of Postgres)
-- KEYS[2]  {evt:E}:cart:<token>  SET   seats this cart holds
-- KEYS[3]  {evt:E}:expiry        ZSET  seatId -> expiresAt, read by the reaper
-- KEYS[4]  {evt:E}:seq           INT   per-event sequence for live deltas
-- KEYS[5..] {evt:E}:hold:<seatId> STR  owner token, with a TTL
--
-- ARGV[1] cart token   ARGV[2] hold ttl ms   ARGV[3] max seats per cart
-- ARGV[4..] seat ids, same order as KEYS[5..]
--
-- Returns {1, expiresAt, seq} | {0, conflictingSeatIds...} | {-1} (cart limit)

local soldKey, cartKey, expiryKey, seqKey = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local token = ARGV[1]
local ttl = tonumber(ARGV[2])
local maxSeats = tonumber(ARGV[3])
local n = #KEYS - 4

-- One clock for every app server: Redis's own.
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

-- Phase 1: check everything, write nothing.
local result = {0}
local fresh = 0
for i = 1, n do
  local seatId = ARGV[3 + i]
  if redis.call('SISMEMBER', soldKey, seatId) == 1 then
    result[#result + 1] = seatId
  else
    local owner = redis.call('GET', KEYS[4 + i])
    if owner and owner ~= token then
      result[#result + 1] = seatId
    elseif not owner then
      fresh = fresh + 1
    end
  end
end
if #result > 1 then
  return result -- any conflict rejects the whole block
end

if redis.call('SCARD', cartKey) + fresh > maxSeats then
  return {-1}
end

-- The cart expires when it was first opened. Adding seats doesn't extend it.
local remaining = redis.call('PTTL', cartKey)
if remaining <= 0 then remaining = ttl end
local expiresAt = now + remaining

-- Phase 2: write everything.
for i = 1, n do
  local seatId = ARGV[3 + i]
  redis.call('SET', KEYS[4 + i], token, 'PX', remaining)
  redis.call('SADD', cartKey, seatId)
  redis.call('ZADD', expiryKey, expiresAt, seatId)
end
redis.call('PEXPIRE', cartKey, remaining)

local seq = redis.call('INCR', seqKey)
return {1, expiresAt, seq}
