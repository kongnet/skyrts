local key, num = KEYS[1], ARGV[1]
local data = redis.call('hmget', key, 'avg', 'm2', 'count') -- 取上次平均值
local avg = data[1]
local m2 = data[2]
local count = data[3] -- 计数累加
if(avg == false) 
then 
    avg = 0
    m2 = 0
    count = 0
    local first = num -- 首次次进入
    redis.call('hset', key, 'first', first)
else
end
local last = num -- 最后一次进入
local lastDiff = (num - avg) 
avg = (avg * count + num) / (count + 1) -- online算法求新平均值
m2 = m2 + lastDiff * (num - avg) -- online算法求新二阶中心距 std = sqrt(m2/count)
redis.call('hmset', key, 'avg', avg, 'last', last, 'm2', m2, 'count',count + 1)