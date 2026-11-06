# 时间天气固件 — Moddable + TypeScript

这是 `fw/clock`。板端用 **TypeScript**（经 Moddable XS）跑在 ESP32-S3 上。  
桌面模拟器用 **PIU** 画时钟；真机同样走 PIU + Cardputer-Adv ST7789 / TCA8418 键盘 / ES8311 扬声器。

单词拼写是另一个固件 `fw/words`，用 `./do.sh flash words` 烧。两个固件不会打进同一个包。

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
./do.sh flash words    # 换成单词拼写固件
```

### Wi-Fi / NTP（真机对时）

板端默认无 RTC，需 Wi-Fi + SNTP。**优先在设备上用键盘配置**（TCA8418）：

1. 无已存账号时开机进入 `SSID` → `Password`（`Enter` 确认，`Del` 退格）
2. **`Esc`**（`Fn`+`` ` ``，或 `Ctrl`+`[`）取消编辑，回到时钟（不改已存账号）
3. 写入 Preference（掉电保留），自动连网并对时
4. 时钟界面按 **`W`** 重新配置

### 声音 / 整点报时

时钟界面（Preference 持久化，默认开）：

| 键 | 作用 |
|----|------|
| **`S`** | 总声音开关（关则静音；开则每秒滴答） |
| **`H`** | 整点报时开关（需声音开；`:00` 三声和弦，替代该秒滴答） |
| **`-` / `=`** | 音量 0–10（默认 6；掉电保存） |
| **`C`** | 倒计时：数码管 `__:__:__`；时/分满 2 位自动跳下格；秒输完需 **`Enter`** 开始；`Esc` 退出 |
| **`A`** | 闹钟：数码管 `__:__`（时:分）；时满 2 位跳分；分 **`Enter`** 保存（北京时间，掉电保留）；时位空 `Del` 关闭；响铃 `Esc` 关；顶栏显示 `YYYY-MM-DD MO AL:HH:MM` |
| **`T`** | 立即刷新天气（Open-Meteo；默认福清；底栏 `农历 XX℃ YY%`；超长自动左右滚动） |
| **`Enter`** | 功能列表：`j`/`k` 或 `,`/`.` 上下，Enter 进入，Esc 回时钟 |
| **`?`** | 只看当前功能的帮助。时钟、列表、倒计时、闹钟各一页。`j`/`k` 翻页，Esc 返回。配网输入时 `?` 仍是字符 |

屏上会短暂显示 `Snd:… Hour:… Vol:N`；联网后每 20 分钟自动拉温湿度。城市经纬度在 `fw/clock/manifest.json` 的 `weatherLat` / `weatherLon`。

### 功能列表

时钟界面 **Enter** 打开。列表里有：倒计时、闹钟、刷新天气、Wi-Fi、声音开关、整点报时。各界面不再常驻按键说明；在当前界面按 **`?`** 只看这一功能的帮助。`C` / `A` / `T` / `W` / `S` / `H` 仍可在时钟界面直接用。

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
| 闹钟：`A` → 时:分 → `Enter` 保存 |
| 功能列表：时钟界面 **Enter**；`?` 只打开当前功能的帮助。单词拼写是另一个固件 |
| ESP32-S3 USB 下载 + ST7789 |
