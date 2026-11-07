# 时间天气固件 — Moddable + TypeScript

这是 `fw/clock`。板端用 **TypeScript**（经 Moddable XS）跑在 ESP32-S3 上。  
桌面模拟器用 **PIU** 画时钟；真机同样走 PIU + Cardputer-Adv ST7789 / TCA8418 键盘 / ES8311 扬声器。

拼写是另一个固件 `fw/words`，用 `./do.sh flash words` 烧。两个固件不会打进同一个包。

## 一次安装（本机尚未装过时）

按官方文档安装 Moddable SDK + ESP32 工具链：

- https://github.com/Moddable-OpenSource/moddable  
- https://moddable.com/documentation/devices/esp32  

装完后 shell 里应有：

```bash
echo $MODDABLE   # 指向 Moddable 仓库根目录
command -v mcconfig
```

本仓库已装到 `third_party/moddable`；也可用：

```bash
./scripts/setup-moddable-env.sh   # 写入 ~/.zshrc（含 python@3.12 PATH + IDF 镜像）
# 或手动：
export MODDABLE="$HOME/vvenv/cadv/third_party/moddable"
export PATH="/opt/homebrew/opt/python@3.12/bin:$MODDABLE/build/bin/mac/release:$PATH"
export IDF_PATH="$HOME/esp32/esp-idf-v6.1"
export IDF_GITHUB_ASSETS="dl.espressif.com/github_assets"  # 工具包走乐鑫 CDN
source "$IDF_PATH/export.sh"      # 烧录 ESP32 前需要
```

首次装 ESP-IDF 工具（仅一次）：

```bash
export PATH="/opt/homebrew/opt/python@3.12/bin:$PATH"
export IDF_PATH="$HOME/esp32/esp-idf-v6.1"
export IDF_GITHUB_ASSETS="dl.espressif.com/github_assets"
cd "$IDF_PATH" && ./install.sh esp32s3
```

## 构建

在仓库根目录：

```bash
./do.sh sim clock      # 桌面模拟时间天气
./do.sh flash clock    # 烧到 ESP32-S3（下载模式同 Cardputer）
./do.sh flash words    # 换成拼写固件
```

### Wi-Fi / NTP（真机对时）

板端默认无 RTC，需 Wi-Fi + SNTP。**优先在设备上用键盘配置**（TCA8418）：

1. 无已存账号时开机进入 `SSID` → `Password`（`Enter` 确认，`BS` 退格，空格是字符）
2. 密码页输入为空时 **`BS`** 回到 SSID；SSID 为空时 **`BS`** 回到时钟。**`Esc`** 或 **`Fn`+`H`**（`←`）从任一页直接取消，回到时钟（不改已存账号）。`Esc` 也可以是 `Fn`+`` ` `` 或 `Ctrl`+`[`
3. 写入 Preference（掉电保留），自动连网并对时
4. 时钟界面按 **`W`** 重新配置

### 声音 / 整点报时

时钟界面（Preference 持久化，默认开）：

| 键 | 作用 |
|----|------|
| **`S`** | 总声音开关（关则静音；开则每秒滴答） |
| **`H`** | 整点报时开关（需声音开；`:00` 三声和弦，替代该秒滴答） |
| **`-` / `=`** | 音量 0–10（默认 6；掉电保存） |
| **`C`** | 倒计时：数码管 `__:__:__`；时/分满 2 位自动跳下格；秒位 **`Enter`** 开始；`BS` 退格，时位空再按回到时钟；`Esc` 直接退出；进行中 `BS` 即停 |
| **`A`** | 四个闹钟。列表里 **D** 在每天 / 工作日 / 周末 / 关之间转。编辑时分后 **Enter** 保存。响铃时 **Enter** 贪睡 5 分钟，**BS** 停止 |
| **`T`** | 立即刷新天气（Open-Meteo；默认福清；底栏 `农历 XX℃ YY%`；超长自动左右滚动） |
| **`Enter`** | 功能列表：`K`/`J` 上下，确认进入，`BS` 回时钟 |
| **`Fn`+`[` / `]`** | 背光四档。30 秒不动就降到最暗，按键唤醒 |
| **`?`** | 只看当前功能的帮助。上下翻页，`BS` 关掉。配网输入时仍是字符 |

屏上会短暂显示 `Snd:… Hour:… Vol:N`；联网后每 20 分钟自动拉温湿度。城市经纬度在 `fw/clock/manifest.json` 的 `weatherLat` / `weatherLon`。

### 功能列表

时钟界面 **Enter** 打开。列表里有：倒计时、闹钟、秒表、番茄钟、月历、世界时间、城市、手动校时、勿扰、刷新天气、Wi-Fi、声音、整点报时。

秒表：**Enter** 开始或停，`.` 计次，停下后 **R** 清零。番茄钟 25 分钟工作、5 分钟休息，阶段换的时候响一声。月历用 **K/J** 换月。世界时间固定五座城市：北京、东京、伦敦、纽约、洛杉矶。城市用键盘输入，经 Open-Meteo 搜到经纬度后记住，天气改查这座城市；没设过仍用福清。手动校时只在还没对上网络时间时写进去，断电就丢。勿扰的起止相同或是负数时等于关掉。

顶栏有电池百分比和 Wi-Fi 信号。电池不高于 3.40V 时前面加「低电」。键盘那条边朝下时，表盘转 180°。`C` / `A` / `T` / `W` / `S` / `H` 仍可在时钟界面直接用。

单词补充完整在 `fw/words`，`./do.sh flash words` 单独烧。词库只取 `../alice/data` 里的小学词表，不带中文释义。

也可预置 Wi-Fi（可选，烧录时写入 config；设备上仍可改）：

```bash
cp fw/clock/wifi.local.json.example fw/clock/wifi.local.json
./do.sh flash clock
# 或 WIFI_SSID=… WIFI_PASSWORD=… ./do.sh flash clock
```

```bash
cd fw/clock
mcconfig -d -m -dn                          # 本机模拟
mcconfig -d -m -dn -p esp32/esp32s3_cdc     # Cardputer Adv
```

## 功能范围

| 有 |
|----|
| TS 编译进固件 |
| PIU + **7 段数码管时钟**（上：`YYYY-MM-DD MO AL:HH:MM`，下：`农历 XX℃ YY%`；思源黑体 Bold 20px，超长左右滚动） |
| Cardputer **Adv** 键盘配网（TCA8418）+ Preference |
| Wi-Fi + SNTP（`ntp.aliyun.com`） |
| ES8311 扬声器：`S` 声音 / `H` 整点报时 |
| 倒计时：`C` → 时分秒 |
| 四个闹钟、勿扰、秒表、番茄钟、月历、五个世界时间、城市搜索、未对时时手动校时、姿态翻转、电池和信号 |
| 功能列表：时钟界面 **Enter / 空格**；`?` 或 `/` 只打开当前功能的帮助。拼写是另一个固件 |
| ESP32-S3 USB 下载 + ST7789 |
