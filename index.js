let CHANNEL = '_rts_.record'
let util = require('./util/util')
let fs = require('fs')
let scripts = {}
let scriptSha1s = {}
let redis = null
let redisSync = null
let defaultFileArr = ['avg', 'max', 'min', 'update_pf']
defaultFileArr.forEach(function (key) {
  scripts[key] = fs.readFileSync(__dirname + '/lua/' + key + '.lua', 'utf-8')
})

function loadScripts (client) {
  //兼容老的模式，在出错的时候再次加载
  for (let scriptName in scripts) {
    ;(function (scriptName) {
      client.script('load', scripts[scriptName], function (err, sha1) {
        if (sha1) scriptSha1s[scriptName] = sha1
      })
    })(scriptName)
  }
}

async function loadDefaultScripts () {
  // 兼容老的
  const multi = redisSync.multi()
  for (let key in scripts) {
    await multi.script('load', scripts[key])
  }
  let results = await multi.exec()
  results.forEach(
    (x, idx) => (scriptSha1s[defaultFileArr[idx]] = results[idx][1])
  )
  //console.log(scriptSha1s)
}

async function loadOneScript (key, filePath) {
  try {
    if (!key) {
      console.log('loadScriptErr:', '必须有脚本的对应的ey')
      return -1
    }
    scripts[key] = fs.readFileSync(filePath, 'utf-8')
    let multi = await redisSync.multi()
    await multi.script('load', scripts[key])
    let results = await multi.exec()
    if (results[0][1]) scriptSha1s[key] = results[0][1]
    return results[0][1]
  } catch (e) {
    console.log('loadScriptErr:', e)
    return -1
  }
}
function evalScript (client, scriptName, keys, args, callback) {
  // console.log(`---------client.script('EXISTS', scriptName)------------${client.script('EXISTS', scriptName)}`)
  if (scriptSha1s[scriptName]) {
    args = [scriptSha1s[scriptName], keys.length]
      .concat(keys || [])
      .concat(args || [])
    if (callback) {
      args.push(callback)
    }
    client.evalsha.apply(client, args)
  } else {
    args = [scripts[scriptName], keys.length]
      .concat(keys || [])
      .concat(args || [])
    if (callback) {
      args.push(callback)
    }
    client.eval.apply(client, args)
  }
}

let aggrvals = {
  h: [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23
  ],
  d: [0, 1, 2, 3, 4, 5, 6]
}

function log (err, results) {
  if (err) console.log(err.stack || err)
}

/**
 * Create a rts instance
 *
 * @param {Object} options
 *          redis:
 *          gran: comma seprate string
 *          points: how many points store
 *          interval: update interval for pflog
 *          prefix: a prefix for all keys
 *
 */
exports = module.exports = async function rts (options) {
  redis = options.redis
  redisSync = options.redisSync

  let granularities = options.gran || '5m, 1h, 1d, 1w'

  let prefix = options.prefix || ''

  let points = options.points || 500

  let interval = options.interval || 60000

  //loadScripts(redis)
  await loadDefaultScripts(redisSync)
  prefix = '_rts_' + prefix

  let keyPFKeys = prefix + ':pfkeys'

  granularities = granularities.split(',').map(util.getUnitDesc)
  let granMap = {}
  granularities.forEach(function (granInfo) {
    granMap[granInfo[1]] = granInfo
  })

  function getGranKey (name, gran, timestamp) {
    let granId = util.getGranId(gran, timestamp)
    return [prefix, name, gran[1], granId].join(':')
  }

  function getAggrGruopKey (name, aggr, timestamp) {
    let gid = util.getAggrGroupId(aggr, timestamp)
    return [prefix, name, 'aggr', gid].join(':')
  }

  function getAggrKey (name, aggr, timestamp) {
    let aggrId = util.getAggrId(aggr, timestamp)
    return getAggrGruopKey(name, aggr, timestamp) + '.' + aggrId
  }

  // some thing's some statics value in some granularity at some time
  function setValue (name, stat, value, gran, timestamp, callback) {
    if (typeof gran === 'string') {
      gran = util.getUnitDesc(gran)
    }
    let key = getGranKey(name, gran, timestamp)
    redis.hset(key, stat, value, callback)
  }

  /**
   * record behavior.
   * @param statistics {Array} sum, max, min, count, avg
   * @param aggregations {Array} dy (day in week each year), hm(hour of day each month).
   *
   */
  function record (
    name,
    num = 1,
    statistics = ['sum', 'avg'],
    aggregations,
    timestamp,
    callback
  ) {
    if (statistics.includes('count')) {
      if (statistics.includes('avg')) {
        statistics = statistics.filter(x => x !== 'count')
      } else {
        statistics.push('avg')
      }
    }
    timestamp = +new Date(timestamp) || Date.now()
    function recordStats (key) {
      statistics &&
        statistics.forEach(function (stat) {
          if (stat === 'sum') {
            multi.hincrbyfloat(key, 'sum', num) // NOTICE: 必须是整数
          } else if (scripts[stat]) {
            evalScript(multi, stat, [key, num], [], function (err, result) {
              try {
                if (err) throw err
                if (result && result.indexOf('ERR') === 0) {
                  // console.log(scripts[stat]);
                  throw new Error(result)
                }
              } catch (e) {
                console.log(`-----------evalScriptERR------------ ${e}`)
                // throw new Error(e)
                // 万一出现问题 从新load一次lua文件
                loadScripts(redis)
              }
            })
          }
        })
    }

    let multi = redis.multi()
    granularities.forEach(function (gran) {
      let key = getGranKey(name, gran, timestamp)
      recordStats(key)
      let unitPeriod = gran[0]
      multi.expire(key, (points * unitPeriod) / 1000)
    })

    if (aggregations) {
      for (let i = 0; i < aggregations.length; i++) {
        let aggr = aggregations[i]
        let key = getAggrKey(name, aggr, timestamp)
        recordStats(key)
      }
    }

    multi.exec(callback || log)
  }

  /**
   * record unique access, like unique user of a period time.
   * @param {string | Array} uniqueId one or some uniqueId to be stats
   */
  function recordUnique (
    name,
    uniqueId,
    statistics,
    aggregations,
    timestamp,
    callback
  ) {
    timestamp = timestamp || Date.now()
    // normal record
    if (statistics) {
      let num = Array.isArray(uniqueId) ? uniqueId.length : 1
      record(name, num, statistics, aggregations, timestamp)
    }
    // record unique
    let multi = redis.multi()
    granularities.forEach(function (gran) {
      let key = getGranKey(name, gran, timestamp)
      let expireTime = util.getExpireTime(gran, timestamp)
      let pfkey = key + ':pf'
      multi.hset(keyPFKeys, pfkey, expireTime)
      if (Array.isArray(uniqueId)) {
        multi.pfadd.apply(multi, [pfkey].concat(uniqueId))
      } else {
        multi.pfadd(pfkey, uniqueId)
      }
      // recordStats(key);
      let unitPeriod = gran[0]
      multi.hincrby(key, 'uni', 0)
      multi.expire(key, (points * unitPeriod) / 1000)
    })
    multi.exec(callback || log)
  }
  /**
   * get results of the stats
   *
   * @param {String} type sum, min, max, avg, count, uni
   */
  async function getStatAsync (
    type,
    name,
    granCode,
    fromDate,
    toDate,
    callback
  ) {
    if (!granCode) throw new Error('granCode is required')
    if (!callback && typeof toDate === 'function') {
      callback = toDate
      toDate = Date.now()
    }
    let gran = granMap[granCode] || util.getUnitDesc(granCode)
    if (!gran) throw new Error('Granualrity is not defined ' + granCode)
    if (fromDate instanceof Date) fromDate = fromDate.getTime()
    if (toDate instanceof Date) toDate = toDate.getTime()

    toDate = toDate || Date.now()
    fromDate = fromDate || toDate - util.getTimePeriod(gran, points)
    let unitPeriod = gran[0]
    let multi = await redisSync.multi()
    if (!multi) throw new Error('redis multi error')
    let _points = []
    for (let d = fromDate; d <= toDate; d += unitPeriod) {
      let key = getGranKey(name, gran, d)
      _points.push(util.getKeyTime(gran, d))
      await multi.hget(key, type)
    }
    let results = await multi.exec()
    let merged = []
    for (let i = 0, l = _points.length, p; i < l; i++) {
      p = _points[i]
      if (Array.isArray(results[i])) {
        merged[i] = [p, Number(results[i][1])]
      } else {
        merged[i] = [p, Number(results[i])]
      }
    }
    return {
      step: unitPeriod,
      unitType: gran[3],
      data: merged
    }
  }
  /**
   * get results of the stats
   *
   * @param {String} type sum, min, max, avg, count, uni
   */
  function getStat (type, name, granCode, fromDate, toDate, callback) {
    if (!granCode) throw new Error('granCode is required')
    if (!callback && typeof toDate === 'function') {
      callback = toDate
      toDate = Date.now()
    }
    let gran = granMap[granCode] || util.getUnitDesc(granCode)
    if (!gran) throw new Error('Granualrity is not defined ' + granCode)
    if (fromDate instanceof Date) fromDate = fromDate.getTime()
    if (toDate instanceof Date) toDate = toDate.getTime()

    toDate = toDate || Date.now()
    fromDate = fromDate || toDate - util.getTimePeriod(gran, points)
    let unitPeriod = gran[0]
    let multi = redis.multi()
    let _points = []
    for (let d = fromDate; d <= toDate; d += unitPeriod) {
      let key = getGranKey(name, gran, d)
      _points.push(util.getKeyTime(gran, d))
      multi.hget(key, type)
    }
    multi.exec(function (err, results) {
      if (err) return callback(err)
      let merged = []
      for (let i = 0, l = _points.length, p; i < l; i++) {
        p = _points[i]
        if (Array.isArray(results[i])) {
          merged[i] = [p, Number(results[i][1])]
        } else {
          merged[i] = [p, Number(results[i])]
        }
      }
      callback(null, {
        step: unitPeriod,
        unitType: gran[3],
        data: merged
      })
    })
  }

  function aggrstat (type, name, aggr, date, callback) {
    if (!callback && typeof date === 'function') {
      callback = date
      date = Date.now()
    }
    let vals = aggrvals[aggr[0]]
    let multi = redis.multi()
    let gkey = getAggrGruopKey(name, aggr, date)
    for (let i = 0, l = vals.length; i < l; i++) {
      let key = gkey + '.' + vals[i]
      multi.hget(key, type)
    }
    multi.exec(function (err, results) {
      if (err) return callback(err)
      callback(
        null,
        results.map(function (result, i) {
          return [i, Number(result)]
        })
      )
    })
  }

  function updateHyperLogLog () {
    redis.hgetall(keyPFKeys, function (err, result) {
      if (err) return log(err)
      let now = Date.now()
      let multi = redis.multi()
      let expireTime, key
      for (let pfkey in result) {
        expireTime = Number(result[pfkey])
        key = pfkey.substring(0, pfkey.length - 3)
        evalScript(multi, 'update_pf', [pfkey, key], [])
        if (expireTime < now) {
          multi.hdel(keyPFKeys, pfkey)
          multi.del(pfkey)
        }
      }
      multi.exec(log)
    })
  }

  let updateTimer = setInterval(updateHyperLogLog, interval)

  function stop () {
    clearInterval(updateTimer)
  }

  return {
    record,
    recordUnique,
    stat: getStat, // deprecated
    getStat,
    getStatAsync,
    aggrstat,
    unique: getStat.bind(null, 'uni'),
    uni: getStat.bind(null, 'uni'),
    sum: getStat.bind(null, 'sum'),
    count: getStat.bind(null, 'count'),
    avg: getStat.bind(null, 'avg'),
    max: getStat.bind(null, 'max'),
    min: getStat.bind(null, 'min'),
    aggrsum: aggrstat.bind(null, 'sum'),
    aggrcount: aggrstat.bind(null, 'count'),
    aggravg: aggrstat.bind(null, 'avg'),
    aggrmax: aggrstat.bind(null, 'max'),
    aggrmin: aggrstat.bind(null, 'min'),
    setValue,
    getTimePeriod: util.getTimePeriod,
    stop,
    loadScripts,
    loadOneScript,
    scriptSha1s,
    scripts
  }
}

exports.getTimePeriod = util.getTimePeriod
