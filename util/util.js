// vim: sw=4
exports.normalPeriod = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  M: 30 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000
}

exports.getUnitDesc = function (str) {
  str = str.trim()
  let match = str.match(/(\d+)([smhdwMy])/)
  if (!match) throw new Error('Bad period descriptor:' + str)
  let num = parseInt(match[1]) || 1
  let unit = match[2]
  let period = num * exports.normalPeriod[unit]
  return [period, str, num, unit]
}

function getFixedTime (timestamp) {
  let d = new Date()
  // return timestamp;
  return timestamp - d.getTimezoneOffset() * 60 * 1000
}

function restoreFixedTime (timestamp) {
  let d = new Date()
  // return timestamp;
  return timestamp + d.getTimezoneOffset() * 60 * 1000
}

// the time point on the report
exports.getKeyTime = function (unitDesc, timestamp) {
  if (!timestamp) timestamp = Date.now()
  let num = unitDesc[2]
  let unit = unitDesc[3]
  let period = unitDesc[0]
  let v
  if (unit === 'y') {
    let year = (new Date(timestamp)).getFullYear()
    year = year - year % num
    v = (new Date(year, 0, 1)).getTime()
  } else if (unit === 'M') {
    let d = new Date(timestamp)
    year = d.getFullYear()
    let month = d.getMonth()
    month = month - month % num
    v = (new Date(year, month, 1)).getTime()
    // TODO week
  } else {
    timestamp = getFixedTime(timestamp)
    v = timestamp - (timestamp % period)
    v = restoreFixedTime(v)
  }
  return v
}

exports.getExpireTime = function (unitDesc, timestamp) {
  if (!timestamp) timestamp = Date.now()
  let num = unitDesc[2]
  let unit = unitDesc[3]
  let period = unitDesc[0]
  let v
  if (unit === 'y') {
    let year = (new Date(timestamp)).getFullYear()
    year = year - year % num
    v = (new Date(year + 1, 0, 1)).getTime()
  } else if (unit === 'M') {
    let d = new Date(timestamp)
    year = d.getFullYear()
    let month = d.getMonth()
    month = month - month % num
    v = (new Date(year, month + 1, 1)).getTime()
    // TODO week
  } else {
    timestamp = getFixedTime(timestamp)
    v = timestamp - (timestamp % period) + period
    v = restoreFixedTime(v)
  }
  return v
}

exports.getGranId = function (unitDesc, timestamp) {
  if (!timestamp) timestamp = Date.now()
  let num = unitDesc[2]
  let unit = unitDesc[3]
  let period = unitDesc[0]
  let v
  let d = new Date(timestamp)
  if (unit === 'y') {
    v = d.getFullYear() / num
  } else if (unit === 'M') {
    v = (d.getFullYear() * 100 + d.getMonth() + 1) / num
    // TODO week
  } else {
    timestamp = getFixedTime(timestamp)
    v = timestamp / period
  }
  return Math.floor(v)
}

exports.getAggrId = function (desc, timestamp) {
  let d = timestamp ? new Date(timestamp) : new Date()
  if (desc[0] === 'h') {
    return d.getHours()
  } else if (desc[0] === 'd') {
    return d.getDay()
  }
  throw new Error('unknow aggr desc ' + desc)
}

exports.getAggrGroupId = function (desc, timestamp) {
  let v = 'all'
  let d = new Date(timestamp)
  if (desc[1] === 'm') {
    v = d.getFullYear() * 100 + d.getMonth()
  } else if (desc[1] === 'q') {
    v = d.getFullYear() * 10 + Math.ceil(d.getMonth() / 3)
  } else if (desc[1] === 'y') {
    v = d.getFullYear()
  }
  return desc + '.' + v
}

exports.getTimePeriod = function (gran, points) {
  if (typeof gran === 'string') {
    gran = exports.getUnitDesc(gran)
  }
  return points * gran[0]
}
