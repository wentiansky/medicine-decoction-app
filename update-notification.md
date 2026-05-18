# 通知闹钟增强实施方案

> 目标是在"后台解锁 + 无悬浮窗权限 + 通知兜底"场景下，把提醒体验收敛成接近系统闹钟：`heads-up` 只负责抢占展示，不单独发声振；持续铃声和振动只由通知栏中的提醒会话负责；通知栏折叠态右侧直接显示"停止"按钮（不可行时降级为标准 action），用户无需展开通知即可停止提醒。

## 关键设计决策（施行前必须确定）

本方案依赖以下三个已决策的设计点，后续代码实现以这些决策为准：

| 决策点 | 选择 | 理由 |
|--------|------|------|
| **Heads-up 静音机制** | **拆成两条 NotificationChannel**：`CHANNEL_ID`（现有闹钟渠道，给 ongoing 通知用）+ 新增 `CHANNEL_ID_SILENT_HEADS_UP`（静音高优先级渠道，给首次 heads-up 用） | Android 8+ 上渠道级 `enableVibration(true)` + `setSound(DEFAULT_ALARM_ALERT_URI, ...)` 的优先级很高，单次 builder 级 `setSilent(true)` 无法稳定压过渠道配置，尤其在 MIUI/ColorOS 等厂商 ROM 上。拆 channel 是唯一可稳定保证 heads-up 静音的方式。 |
| **通知 ID 策略** | **拆成两个 ID**：`NOTIFICATION_ID`（ongoing 提醒通知，由 service 托管）+ `NOTIFICATION_ID_HEADS_UP = 2002`（首次 heads-up，一次性） | 若共用同一个 ID，`startForeground()` 会立即把刚发出的 alert 通知覆盖成 ongoing 通知，导致 heads-up 横幅一闪而过甚至样式异常。拆 ID 后 heads-up 独立存在直至用户划掉或超时，ongoing 通知独立驻留，互不干扰。 |
| **折叠态停止按钮** | **主方案：自定义 compact RemoteViews 右侧按钮。降级方案：标准 `addAction("停止")` 兜底。两个同时存在。** | 自定义 RemoteViews 不能稳定保证在所有 ROM/字体/锁屏场景下右侧按钮可见。若系统忽略自定义折叠态布局，标准 action 仍提供可达的停止入口，确保功能不丢失。 |

未确定以上三点前不要开始写代码。

## 1. 本次目标

### 1.1 功能目标

1. 到点后仍然弹出 `heads-up`，但通过独立的静音渠道保证其不发声振。
2. `heads-up` 和 ongoing 通知使用不同的 notification ID，避免 `startForeground()` 覆盖掉 heads-up。
3. 持续铃声和振动只由 `AlarmNotificationService + AlarmSignalController` 负责。
4. 通知栏保留一条"提醒进行中"的通知（ongoing，不可划掉）。
5. 折叠态通知右侧显示"停止"按钮（自定义 RemoteViews 主方案 + 标准 `addAction` 降级方案并行）。
6. 点击"停止"后：
   - 停止铃声
   - 停止振动
   - 取消当前提醒通知（ongoing ID 和 heads-up ID 都取消）
   - 结束 `AlarmNotificationService`

### 1.2 影响范围控制

本次只增强以下链路：

1. `AndroidAlarmReceiver` 中的 `notification-first-heads-up`

本次尽量不影响以下链路的提醒行为：

1. 前台应用内提醒 `AlarmAlertActivity`
2. 锁屏提醒 / 全屏提醒
3. 已开启悬浮窗权限时的 `AlarmOverlayService`
4. JS 侧 `useTimerFlow` 的调度与取消逻辑

> **注意**：虽然上述链路的主提醒行为不变，但由于本次新增了 `NOTIFICATION_ID_HEADS_UP`，以下已有收口也必须同步更新，负责在结束提醒时额外取消 heads-up 通知 ID：
> - `AlarmAlertActivity.kt` — `onCreate` / `onNewIntent` 中增加取消 `NOTIFICATION_ID_HEADS_UP`
> - `AndroidAlarmModule.kt` — `cancelAlarm()` 中增加取消 `NOTIFICATION_ID_HEADS_UP`
>
> 若这两个入口不更新，拆 ID 后会留下残余 heads-up 通知（顶部横幅或通知栏残留）。

## 2. 问题归因

### 2.1 双重声振的根因

当前通知兜底场景里有两套声振来源叠加：

1. `AndroidAlarmReceiver.postAlarmNotification(...)` 发出的首次 `heads-up` 通知本身带 `DEFAULT_ALL / vibrate`
2. `AlarmNotificationService` 启动后，`AlarmSignalController.start()` 再启动一套持续铃声和振动

所以用户会感知到：

1. 到点瞬间通知先响一轮
2. service 立即又开始持续响
3. 两套效果在前几秒发生叠加

### 2.2 “停止按钮默认不可见”的根因

当前使用的是标准通知 action：

1. `NotificationCompat.Builder.addAction(...)`

标准 action 是否在折叠态展示，完全受系统模板和厂商 ROM 控制：

1. 有的机型会直接显示
2. 有的机型需要展开后才显示
3. 不能保证“按钮固定在右侧且始终可见”

所以如果要稳定实现“通知消息右侧直接有停止按钮”，不能只依赖标准 action，必须改成自定义折叠态 `RemoteViews`。

## 3. 总体方案

### 3.1 核心原则

1. `heads-up` 只负责展示，不负责发声振 —— 通过独立的静音渠道实现。
2. `heads-up` 和 ongoing 通知使用不同的 notification ID，互不覆盖。
3. 持续提醒只保留一套声振来源：`AlarmNotificationService + AlarmSignalController`。
4. "停止"交互使用自定义折叠态右侧按钮作为主方案，标准 action 作为降级兜底。
5. 不改动前台、锁屏、悬浮窗三条既有主链路。

### 3.2 实现策略

分成三个子改动：

1. 新增静音 heads-up 渠道 + 拆分通知 ID
2. 静音首次 `heads-up`
3. 自定义通知折叠态布局

对应职责划分：

1. `AndroidAlarmReceiver`
   - 仍发首次 `heads-up`，使用静音渠道和独立的通知 ID (`NOTIFICATION_ID_HEADS_UP`)
   - 该通知实例不附带通知级声振
   - 同时启动 `AlarmNotificationService`

2. `AlarmNotificationService`
   - 负责持续铃声和振动
   - 负责前台通知驻留（使用 `NOTIFICATION_ID` 和原有闹钟渠道）
   - 负责"停止"按钮（自定义 RemoteViews 主方案 + addAction 降级方案）
   - 停止时同时取消两个通知 ID

3. `AlarmNotificationActionReceiver`
   - 响应通知右侧"停止"按钮点击（主方案）
   - 同时响应标准 action 点击（降级方案）
   - 取消两个通知 ID
   - 停止 service

## 4. 行为设计

### 4.1 到点时序

场景：应用切后台、设备解锁、无悬浮窗权限。

目标时序：

1. `AndroidAlarmReceiver` 收到闹钟广播
2. 发送一次高优先级 `heads-up`，使用以下策略：
   - 独立静音渠道 `CHANNEL_ID_SILENT_HEADS_UP`（不发声振）
   - 独立通知 ID `NOTIFICATION_ID_HEADS_UP = 2002`（不与 ongoing 冲突）
   - 保留 `PRIORITY_MAX` + `CATEGORY_ALARM` 以争取 heads-up 弹出
3. 同时启动 `AlarmNotificationService`
4. `AlarmNotificationService`
   - `startForeground(NOTIFICATION_ID, ...)` 使用原有闹钟渠道 `CHANNEL_ID`
   - `AlarmSignalController.start()`
   - 发布"提醒进行中"通知（ongoing + 自定义 RemoteViews 右侧按钮 + addAction 兜底）
5. 用户划掉 `heads-up`
   - 只影响顶部横幅（`NOTIFICATION_ID_HEADS_UP` 的通知被清除）
   - 不影响 `AlarmNotificationService`
   - 不影响持续铃声和振动
6. 用户点击通知上的"停止"（无论走 RemoteViews 还是 addAction）
   - 取消 `NOTIFICATION_ID_HEADS_UP`（如果还在）
   - 取消 `NOTIFICATION_ID`
   - 停止 service
   - 停止铃声与振动

### 4.2 预期体验

1. 首次提醒只看见一个 `heads-up`，不发声振
2. 不出现通知声振和 service 声振叠加
3. 通知栏里始终有一条"提醒进行中"通知（ongoing）
4. 折叠态右侧直接显示"停止"按钮（ROM 不支持时降级为标准 action，展开通知可操作）

## 5. 文件调整方案

### 5.1 新增文件

1. `android/app/src/main/res/layout/notification_alarm_compact.xml`
   - 自定义折叠态通知布局
   - 右侧放"停止"按钮

2. `android/app/src/main/res/layout/notification_alarm_expanded.xml`
   - 自定义展开态通知布局
   - 与折叠态保持视觉一致
   - 可以保留更完整文案

3. `android/app/src/main/res/drawable/bg_notification_stop_button.xml`
   - 停止按钮背景

4. `android/app/src/main/res/values/colors.xml`
   - 如现有颜色资源不足，补充按钮/文字所需颜色

说明：

1. 若项目已有可复用颜色资源，优先复用，不必强行新增。

### 5.2 修改文件

1. `android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt`
   - 新增 `CHANNEL_ID_SILENT_HEADS_UP` 静音渠道常量
   - 新增 `NOTIFICATION_ID_HEADS_UP = 2002` 常量
   - 在 `ensureNotificationChannel(...)` 中创建静音渠道
   - 调整 `postAlarmNotification(...)` 使 heads-up 使用静音渠道和独立 ID

2. `android/app/src/main/java/com/medicinedecoction/app/AlarmNotificationService.kt`
   - 使用 `NOTIFICATION_ID` + `CHANNEL_ID`（原有闹钟渠道）
   - 改为使用自定义 `RemoteViews`（主方案）
   - 同时保留标准 `addAction("停止")` 作为降级兜底
   - 停止时同时取消两个通知 ID
   - 保留持续声振与通知驻留职责

3. `android/app/src/main/java/com/medicinedecoction/app/AlarmNotificationActionReceiver.kt`
   - 响应自定义布局里停止按钮的 `setOnClickPendingIntent`
   - 同时响应标准 action 的 `ACTION_STOP_NOTIFICATION_ALARM`
   - 取消两个通知 ID

4. `android/app/src/main/java/com/medicinedecoction/app/AlarmAlertActivity.kt`
   - `onCreate` / `onNewIntent` 中增加 `NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID_HEADS_UP)`
   - 确保进入提醒页后不会残留一次性 heads-up 通知

5. `android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmModule.kt`
   - `cancelAlarm()` 中增加 `NotificationManagerCompat.from(reactContext).cancel(NOTIFICATION_ID_HEADS_UP)`
   - 确保 JS 侧取消闹钟后不会残留 heads-up 通知

6. `android/app/src/main/AndroidManifest.xml`
   - 确认 `AlarmNotificationService`
   - 确认 `AlarmNotificationActionReceiver`

7. `src/androidAlarmNative.test.js`
   - 更新原生实现断言

## 6. 详细设计

### 6.1 `AndroidAlarmReceiver`：把 `heads-up` 改成静音 + 独立 ID

#### 当前问题点

1. `heads-up` 通知和 ongoing 通知共用 `CHANNEL_ID`，该渠道已启用 `enableVibration(true)` + `setSound(DEFAULT_ALARM_ALERT_URI, ...)`。在 Android 8+ 上渠道级配置优先级很高，单次 builder 级 `setSilent(true)` 无法稳定压过渠道配置，尤其在厂商 ROM 上。
2. `heads-up` 通知和 ongoing 通知共用 `NOTIFICATION_ID`，导致 `startForeground()` 立即覆盖掉 heads-up，横幅一闪而过。

#### 修改方案

**渠道层：新增静音 heads-up 渠道**

在 `ensureNotificationChannel(...)` 中新增:

```kotlin
const val CHANNEL_ID_SILENT_HEADS_UP = "medicine-decoction-silent-heads-up"
```

渠道配置：
- `IMPORTANCE_HIGH` —— 保留 heads-up 弹出能力
- `enableVibration(false)` —— 渠道级不振动
- `setSound(null, null)` —— 渠道级不发声
- 不设置 `DEFAULT_ALL` —— 不触发任何默认声振

> **为什么必须拆渠道？** Android 8+ 上 NotificationChannel 的声振配置是 "merged" 语义，不是 "builder 可覆盖渠道" 语义。渠道如果已经 enableVibration(true) + setSound(...)，即使 builder 调用 setSilent(true) 或 clearVibrate()，部分 ROM 仍可能因为渠道配置而让通知发声振。拆成独立静音渠道是唯一能稳定保证 heads-up 不发声振的方式。

**通知 ID 层：拆成两个 ID**

```kotlin
const val NOTIFICATION_ID_HEADS_UP = 2002
```

- `NOTIFICATION_ID = 2001`：ongoing 提醒通知，由 `AlarmNotificationService` 通过 `startForeground()` 管理
- `NOTIFICATION_ID_HEADS_UP = 2002`：首次 heads-up，由 `postAlarmNotification(...)` 一次性发出，用户划掉即清除

> **为什么必须拆 ID？** 若共用同一个 ID，`startForeground()` 会把刚发出的 heads-up 通知立即替换成 ongoing 版本。这会导致 heads-up 横幅展示时间极短（甚至不可见），在不同 ROM 上行为也不一致。

#### 具体行为

在通知兜底场景下，`postAlarmNotification(...)` 改为：

1. 仍保留：
   - `PRIORITY_MAX`
   - `CATEGORY_ALARM`
   - `VISIBILITY_PUBLIC`
2. 使用新渠道和 ID：
   - `channelId = CHANNEL_ID_SILENT_HEADS_UP`
   - `notificationId = NOTIFICATION_ID_HEADS_UP`
3. 不设置任何声振：
   - 不调用 `setDefaults(NotificationCompat.DEFAULT_ALL)`
   - 不调用 `setVibrate(...)`
   - 不调用 `setSound(...)`
4. 仅依靠高优先级和 alarm category 争取 `heads-up` 弹出

#### 目的

1. `heads-up` 稳定弹出但静音
2. service 启动后 ongoing 通知不被 heads-up 覆盖
3. 两个通知独立存在，互不干扰

### 6.2 `AlarmNotificationService`：成为唯一声振来源

#### 保留职责

1. `startForeground(...)`
2. `AlarmSignalController.start()`
3. 生成 ongoing 通知
4. 在 `onDestroy()` 中停止声振

#### 不再依赖的东西

1. 不指望通知实例本身发声振
2. 不需要通知级 `DEFAULT_ALL`

#### 通知配置建议

service 通知保留：

1. `setOngoing(true)`
2. `setAutoCancel(false)`
3. `setOnlyAlertOnce(true)`
4. `setCategory(NotificationCompat.CATEGORY_ALARM)`
5. `setVisibility(NotificationCompat.VISIBILITY_PUBLIC)`

说明：

1. `setOnlyAlertOnce(true)` 仍然保留，避免 service 更新通知时再触发额外系统提示。

### 6.3 “停止按钮默认显示在右侧”的实现方式

#### 现实约束

只用标准 `addAction(...)`，无法稳定保证：

1. 按钮在折叠态可见
2. 按钮在通知右侧
3. 各 ROM 展示一致

#### 主方案 + 降级方案（必须两套并行）

**主方案：自定义 RemoteViews**

1. 折叠态：`RemoteViews(notification_alarm_compact.xml)`
2. 展开态：`RemoteViews(notification_alarm_expanded.xml)`
3. 使用 `NotificationCompat.DecoratedCustomViewStyle()`
4. 右侧按钮通过 `RemoteViews.setOnClickPendingIntent(R.id.notification_stop_button, stopPendingIntent)` 绑定

**降级方案：标准 addAction**

同时保留 `addAction(0, “停止”, stopPendingIntent)`，原因：

1. 自定义 RemoteViews 不能保证在所有 ROM/字体/锁屏场景下折叠态右侧按钮可见
2. 某些系统会压缩、重绘或忽略自定义折叠态布局，尤其在锁屏/小屏/大字体下
3. 标准 action 作为兜底：即使自定义按钮不显示，用户展开通知后仍可看到并点击“停止”操作
4. 两个点击入口指向同一个 `stopPendingIntent`，功能等价，不会冲突

**说明**：不推荐只做其一。只做 RemoteViews 可能在某些 ROM 上用户找不到停止入口；只做 addAction 则失去了折叠态直达的核心体验提升。

#### 折叠态布局要求

`notification_alarm_compact.xml` 的目标结构：

1. 左侧：标题 + 简短正文
2. 右侧：固定一个“停止”按钮
3. 整体高度控制在系统折叠态可接受范围内

建议结构：

1. 根布局使用横向 `LinearLayout` 或 `ConstraintLayout`
2. 左侧文案区域可压缩
3. 右侧按钮宽度固定
4. 按钮文字短，只保留“停止”

#### 展开态布局要求

`notification_alarm_expanded.xml`：

1. 保留完整正文
2. 右侧或底部保留同样的“停止”操作
3. 视觉风格与折叠态统一

#### 点击事件绑定

在 `AlarmNotificationService` 中：

1. `RemoteViews.setOnClickPendingIntent(R.id.notification_stop_button, stopPendingIntent)` —— 主方案
2. `addAction(0, “停止”, stopPendingIntent)` —— 降级方案

两个入口共享同一个 `stopPendingIntent`，都指向 `AlarmNotificationActionReceiver`。

### 6.4 `AlarmNotificationActionReceiver`：同时清理两个通知 ID

保持简单：

1. 接收停止按钮点击（RemoteViews 或 addAction）
2. 取消 `NOTIFICATION_ID_HEADS_UP`（如果 heads-up 尚未被划掉）
3. 取消 `NOTIFICATION_ID`（ongoing 提醒通知）
4. 停止 `AlarmNotificationService`
5. 记录日志

说明：

1. 这里不需要再发二次跳转
2. 继续避免“为了 stop 又反向拉起 service”
3. 必须同时取消两个 ID，否则未清除的那个会残留通知

## 7. UI 方案细节

### 7.1 折叠态通知布局建议

目标：一眼看清“提醒内容 + 停止按钮”。

建议内容：

1. 标题：`熬中药提醒`
2. 正文：当前阶段完成提示，尽量单行或双行截断
3. 右侧按钮：`停止`

布局原则：

1. 按钮始终固定在右侧
2. 文本区域可省略，不挤掉按钮
3. 折叠态高度不要做得过高，否则更容易被系统裁剪

### 7.2 视觉与可用性建议

1. “停止”按钮使用高对比度背景
2. 文本长度短，避免右侧按钮被压缩
3. 点击热区足够大
4. 按钮与整条通知点击区域分离，避免误触打开 App

## 8. 实施步骤

### 步骤 1：新增静音 heads-up 渠道 + 拆分通知 ID

修改 `AndroidAlarmReceiver.kt`：

1. 新增 `CHANNEL_ID_SILENT_HEADS_UP` 常量
2. 新增 `NOTIFICATION_ID_HEADS_UP = 2002` 常量
3. 在 `ensureNotificationChannel(...)` 中创建静音渠道：
   - `IMPORTANCE_HIGH`，`enableVibration(false)`，`setSound(null, null)`
4. 在 `notification-first-heads-up` 场景中：
   - `postAlarmNotification(...)` 使用 `CHANNEL_ID_SILENT_HEADS_UP` 渠道
   - 使用 `NOTIFICATION_ID_HEADS_UP` 作为通知 ID
   - 不设置 `DEFAULT_ALL`、`setVibrate`、`setSound`
5. 保持 `AlarmNotificationService.start(...)` 不变

### 步骤 2：新增通知布局资源

新增：

1. `notification_alarm_compact.xml` —— 折叠态自定义布局
2. `notification_alarm_expanded.xml` —— 展开态自定义布局
3. `bg_notification_stop_button.xml` —— 停止按钮背景

### 步骤 3：把通知 service 改成自定义布局 + 降级兜底

修改 `AlarmNotificationService.kt`：

1. 新增 `createCompactRemoteViews(...)`
2. 新增 `createExpandedRemoteViews(...)`
3. 使用 `DecoratedCustomViewStyle()` 设置自定义视图（主方案）
4. 同时保留 `addAction(0, “停止”, stopPendingIntent)`（降级方案）
5. 两个入口指向同一个 `stopPendingIntent`

### 步骤 4：绑定停止按钮点击 + 双 ID 清理

修改 `AlarmNotificationActionReceiver.kt`：

1. 取消 `NOTIFICATION_ID_HEADS_UP`
2. 取消 `NOTIFICATION_ID`
3. 停止 `AlarmNotificationService`

### 步骤 5：补测试

更新 `src/androidAlarmNative.test.js`，重点校验：

1. 存在 `CHANNEL_ID_SILENT_HEADS_UP` 渠道常量
2. 存在 `NOTIFICATION_ID_HEADS_UP` 常量
3. 静音渠道不设置振动和声音
4. 通知兜底场景使用静音渠道和独立 ID
5. `AlarmNotificationService` 使用自定义 `RemoteViews`
6. `AlarmNotificationService` 同时保留标准 `addAction` 作为降级
7. 停止按钮通过 `setOnClickPendingIntent(...)` 绑定
8. 停止入口同时取消两个通知 ID

## 9. 测试方案

### 9.1 自动化校验

优先执行轻量测试：

1. `npm test -- src/androidAlarmNative.test.js`
2. 如果脚本不支持单文件，则执行 `npm test`

### 9.2 手工回归

#### 场景 A：后台解锁 + 无悬浮窗权限

步骤：

1. 关闭悬浮窗权限
2. 启动倒计时
3. 切后台并保持解锁
4. 等待到点

预期：

1. 有 `heads-up`
2. 不再出现双重声振
3. 持续声振只来自 service
4. 通知栏中有 ongoing 提醒
5. 折叠态右侧直接能看到“停止”
6. 点击“停止”后，通知、铃声、振动一起结束

#### 场景 B：后台解锁 + 有悬浮窗权限

预期：

1. 继续走 overlay
2. 不启动通知兜底 service
3. 不受本次修改影响

#### 场景 C：锁屏 / 息屏

预期：

1. 继续走锁屏提醒链路
2. 不因本次改造丢失锁屏提醒能力

#### 场景 D：前台应用内

预期：

1. 继续由 `AlarmAlertActivity` 负责
2. 不出现新的重复声振

### 9.3 ROM 验证重点

需要特别观察：

1. MIUI / HyperOS
2. ColorOS / Realme UI
3. One UI
4. 原生 Android 14 / 15

验证点：

1. 折叠态右侧按钮是否按预期显示
2. 自定义通知布局是否被系统裁剪
3. `heads-up` 静音后是否仍能稳定弹出

## 10. 风险与注意事项

### 10.1 `heads-up` 静音后可能存在 ROM 差异

部分 ROM 对“高优先级但静音”的 `heads-up` 展示策略更严格。

应对方式：

1. 使用独立静音渠道 `CHANNEL_ID_SILENT_HEADS_UP`（而非单条通知静音），从渠道级保证不发声振
2. 保持 `IMPORTANCE_HIGH`、`CATEGORY_ALARM`、`PRIORITY_MAX` 以争取 heads-up 弹出
3. 若特定 ROM 上静音高优先级渠道仍然无法弹出 heads-up，则接受该 ROM 退化为“无 heads-up、但 ongoing + 持续声振仍正常工作”，或单独评估是否需要走全屏 / Activity 路线，不要再往 channel 内塞振动提示
4. 以真机回归验证为准

### 10.2 自定义通知布局的兼容性

自定义 `RemoteViews` 能提升“右侧按钮默认可见”的可控性，但仍要注意：

1. 不同 ROM 的折叠态可用宽度不同
2. 按钮文案不能过长
3. 布局不能过高、过复杂

### 10.3 双通知 ID 的管理

`NOTIFICATION_ID_HEADS_UP`（2002）和 `NOTIFICATION_ID`（2001）是两个独立 ID：

1. heads-up 由 `AndroidAlarmReceiver.postAlarmNotification(...)` 一次性发出
2. ongoing 由 `AlarmNotificationService.startForeground(...)` 管理
3. 停止时必须同时取消两个 ID，否则残留的通知无法清除
4. 两个 ID 永不冲突，也不与其他链路（overlay 用 `NOTIFICATION_ID`）冲突，因为 `AlarmNotificationService.start()` 在 overlay 路径不会启动

### 10.4 降级方案不可省略

自定义 RemoteViews 不能作为唯一的停止入口。必须同时保留标准 `addAction(“停止”, ...)` 作为降级：

1. 主入口：自定义布局右侧按钮（通过 `setOnClickPendingIntent` 绑定）
2. 降级入口：标准 action（系统自动渲染）
3. 两个入口共享同一个 `stopPendingIntent`
4. 不可二选一

## 11. 结论

这次修改的本质是三件事：

1. 把首次 `heads-up` 从“展示 + 声振”改成“只展示”（通过独立静音渠道实现）
2. 把 `heads-up` 和 ongoing 通知拆成两个独立的 notification ID（避免 `startForeground()` 覆盖）
3. 把“停止”从纯标准 action 改成“自定义折叠态右侧按钮（主方案）+ 标准 action（降级方案）”

这样可以同时解决：

1. 首次到点双重声振叠加
2. `startForeground()` 覆盖导致 heads-up 一闪而过
3. 停止按钮只有展开通知后才可见

关键约束（不可妥协）：

1. 必须拆成两条 NotificationChannel：`CHANNEL_ID_SILENT_HEADS_UP`（静音）+ `CHANNEL_ID`（原有闹钟）
2. 必须拆成两个 notification ID：`NOTIFICATION_ID_HEADS_UP = 2002` + `NOTIFICATION_ID = 2001`
3. 必须 RemoteViews + addAction 两套停止入口并行

并且仍然把改动范围限制在通知兜底链路内，尽量不干扰现有前台、锁屏和悬浮窗提醒能力。
