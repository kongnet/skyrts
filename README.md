# skyrts
## redis实时统计系统

* 按分钟，小时，天，周，月，年统计
* 按每（分钟、小时等）每小时，天，周，月，年聚合

``` javascript
const rts = require('skyrts')
const Pack = require('./package.json')

  rts({
    redis: redis,// 异步redis引用
    redisAsync: redis, // 同步redis引用
    gran: '5m, 1h, 1d, 1w, 1M, 1y', // 维度的梯度
    points: 1000, // 多少点循环记录
    prefix: Pack.name // 需要一个前缀，区分多项目
  })
```