# skyrts

## redis 实时统计系统

- 按分钟，小时，天，周，月，年统计
- 按每（分钟、小时等）每小时，天，周，月，年聚合

```javascript
const rts = require('skyrts')
const Pack = require('./package.json')

rts({
  redis: redis, // 异步redis引用
  redisSync: redis, // 同步redis引用
  gran: '5m, 1h, 1d, 1w, 1M, 1y', // 维度的梯度
  points: 1000, // 多少点循环记录，默认500个点
  prefix: Pack.name // 需要一个前缀，区分多项目
})
```

- 如果需要 按季度记录，gran 中增加 3M
- 如果要经常统计全局总值，gran 中增加 9999y 9999 年

### 主要方法

```javaScript
// 埋点
rts.record(name, num = 1, statistics = ['sum', 'avg'], aggregations, timestamp, callback)
```

- 异步记录函数，一般常用此方法
- name 准备存放的字符串，最终形式是 '_rts_'+options.prefix + name
- num 默认 1 sum+=1 否则 sum+=num
- statistics 默认统计 count 计数，sum 总和，avg 平均值
- aggregations {Array} dy (day in week each year), hm(hour of day each month) null 就不处理聚合
- timestamp 可以补历史记录，默认是当前服务器时间长整型
- callback 一般不用

```javaScript
// 去重埋点 标准误差为0.81%
rts.recordUnique(name, uniqueId, statistics, aggregations, timestamp, callback)
```

- 异步唯一值记录函数，一般常用此方法，记录后不会立刻生效，会在 options.interval || 60000 60 秒刷新唯一值
- name 准备存放的字符串，最终形式是 '_rts_'+options.prefix + name
- uniqueId 唯一标识字符串，可以为数组形式，多个唯一值
- statistics 默认为空 记录唯一值，如果是 ['sum', 'avg']形式 调用普通 record 函数
- aggregations {Array} dy (day in week each year), hm(hour of day each month) null 就不处理聚合
- timestamp 可以补历史记录，默认是当前服务器时间长整型

```javaScript
// 异步获取埋点时间序列
rts.getStat(type, name, granCode, fromDate, toDate, callback)
```

- 不常用，看下面同步方法

```javaScript
// 同步获取埋点时间序列
await rts.getStatAsync(type, name, granCode, fromDate, toDate)
```

- type sum, min, max, avg, count, uni 唯一值情况
- name key 的名称
- granCode 开始 rts 设置的 gran: '5m, 1h, 1d, 1w, 1M, 1y'
- fromDate 开始时间 Date 类型
- toDate 结束时间 Date 类型
- 可以使用 meeko 中的 data.offset()

```javaScript
const offset = function (interval, number) {
  /**
   * @function [dateAdd&offset]
   * @description 日期偏移操作.
   * @memberof Date_prototype#
   * @param {string} interval - 年月日时分秒周季 yMdhnswq.
   * @param {int} number - 时间间隔 可正负.
   * @return {string} 返回 得到日期年月日等加数字后的日期.
   * @example
   * $.now().offset('y',-1)
   * // 2018-6-1 10:19:01
   */
}
```
