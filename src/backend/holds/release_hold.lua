-- Reference design: release seats, but only the ones this cart still owns.
--
-- Compare-and-delete in one step. Without the ownership check, a slow request
-- from an expired cart could delete a hold that a different buyer has since taken.
--
-- KEYS[1] {evt:E}:cart:<token>  KEYS[2] {evt:E}:expiry  KEYS[3] {evt:E}:seq
-- KEYS[4..] {evt:E}:hold:<seatId>
-- ARGV[1] cart token   ARGV[2..] seat ids, same order as KEYS[4..]
--
-- Returns {seq, releasedSeatIds...}

local cartKey, expiryKey, seqKey = KEYS[1], KEYS[2], KEYS[3]
local token = ARGV[1]
local released = {}

for i = 4, #KEYS do
  local seatId = ARGV[i - 2]
  if redis.call('GET', KEYS[i]) == token then
    redis.call('DEL', KEYS[i])
    redis.call('SREM', cartKey, seatId)
    redis.call('ZREM', expiryKey, seatId)
    released[#released + 1] = seatId
  end
end

if #released == 0 then
  return {0}
end

local seq = redis.call('INCR', seqKey)
table.insert(released, 1, seq)
return released
