# Cardputer ADV（TypeScript）

在 M5Stack Cardputer-Adv 上用 **Moddable + TypeScript** 跑固件。一次只烧一个固件。板子上的程序互相独立，设置也分开存。每个固件都有四档背光（**Fn+[`** 暗、**Fn+]** 亮）、30 秒无操作后变暗或熄屏，电池低于 3.40V 时顶栏显示「低电」。Stamp-S3A 那颗灯跟背光同一路电（数据在 G21）：背光亮着时，录音是红，正在扫描是蓝，其余时间若低电则是琥珀；背光关掉时灯也灭。

时钟：Wi-Fi NTP 校时（默认中国时区 `CST-8`）、键盘配网、天气、闹钟、倒计时、整点报时。时钟界面 **Enter / 空格** 打开功能列表。Cardputer-Adv **没有独立 RTC**，断电后要重新对时。

拼写：用 `../alice/data` 的小学词库（闽教版小学）作内置默认。开机就是填空。没在填字时 **Enter / 空格** 打开功能列表；正在填则交卷。列表里可切 **来源**（内置 / 卡上 `cadv/words/*.bin`，`junior.bin` 为「初中」）、词库、乱序和音标。`./do.sh sd fw words` 会拷上镜像和 `fw/words` 里除内置外的词库；只要词库用 `./do.sh sd bank`。不会自动盖过内置。

查词：输入英文，看这一条的词性、中文和音标。词在卡上 `cadv/dict/lex.bin`（小学和初中合成一份）。释义最多 8 个字，有词性时写在前面（`n. 名字`），和拼写是同一条。这里 **`j` `k` 是字母**；上下用 **`,` `.`**，或 **`Fn`+`K`/`J`**。`./do.sh sd fw dict` 会把镜像和词库一起拷上。只传词库：菜单 SD → 上传词库，选查词或全部；或 `./do.sh sd bank dict`。

时钟和拼写按键相同：`BS` / `Esc` / `←` 回退，`Enter` / 空格确认，`j` `k` 或 `,` `.` 上下，`?` 或 `/` 帮助，`-` `=` 音量。板子没有方向键：`Fn`+`H`/`J`/`K`/`L` 是 ←↓↑→。配网时空格仍是字符。

键盘把按键发给已连接的手机或 Mac，不打开本机菜单。本机只留 **Fn+/** 帮助、**Fn+Tab** 清除配对、**Fn+BS** 回启动器。名字是 `CADV KB`。说明在 `fw/kb/README.md`。

SD 卡：设备只看卡上的 `cadv/`。里面放各固件的镜像，开机选一个，再按一次就写进另一块闪存并重启。芯片一次只跑一个；卡上可以放很多。从载入的固件回到启动器：按住 **Fn+BS**。先 `./do.sh flash` 把启动器烧进芯片。卡插在电脑上时直接拷文件；卡留在板子里、USB 接着并且启动器在跑时，同一条上传命令经串口写入。

## 目录

| 路径 | 用途 |
|------|------|
| `do.sh` | 选固件、模拟、烧录 |
| `fw/<id>/` | 一个固件。`label` 是菜单上的名字，`manifest.json` 是入口 |
| `shared/` | 屏幕、键盘、喇叭、公共字体。每个固件都 include |
| `scripts/` | 词库和字体生成 |
| `third_party/moddable` | 本机 Moddable SDK（gitignore） |

水平：读板上 BMI270，平放显示二维气泡，立边切成一维管。**G** 置零，**R** 清除。说明在 `fw/level/README.md`。

设备：芯片、主频、闪存、内存、Wi-Fi / 蓝牙地址、分区、启动原因、运行时间、片内温度、电池电压。键盘、BMI270、ES8311 各探一次。**K/J** 翻页，每秒刷新。说明在 `fw/info/README.md`。

现在有这些固件：

| 目录 | 菜单名 | 做什么 |
|------|--------|--------|
| `fw/clock` | 时钟 | 时钟、天气、四个闹钟、勿扰、秒表、番茄钟、月历、世界时间、城市搜索、手动校时 |
| `fw/words` | 拼写 | 填空，可只练错过的词 |
| `fw/dict` | 查词 | 输入英文，看词性、中文和音标 |
| `fw/kb` | 键盘 | 把按键发给已配对的手机或 Mac |
| `fw/level` | 水平 | 加速度气泡，角速度和倾斜峰值 |
| `fw/info` | 设备 | 芯片、电池、卡空间、麦克风、姿态 |
| `fw/sd` | SD 卡 | 启动器。从卡上的 `cadv/` 载入别的固件 |
| `fw/rec` | 录音 | 麦克风录成 `cadv/rec/*.wav`，再播放 |
| `fw/note` | 记事 | 编辑 `cadv/*.txt`。17 字节以内可出二维码 |
| `fw/calc` | 计算 | 四则、百分、正负、十六进制、单位换算、随机串 |
| `fw/scan` | 扫描 | 听 Wi-Fi 热点和蓝牙广播，不连接 |
| `fw/metro` | 节拍 | 喇叭打拍 |
| `fw/tune` | 调音 | 麦克风测音名和音分 |
| `fw/step` | 计步 | BMI270 计步，按日记步幅估算距离 |
| `fw/count` | 计数 | 手动点计或听响声计数，可改步长，数值会记住 |
| `fw/piano` | 钢琴 | 键盘弹一个八度 |

## 再加一个固件

建一个目录即可，不用改 `do.sh`：

```text
fw/新名字/
  label            # 一行，菜单里显示的名字
  manifest.json    # include ../../shared/manifest.json，再列出本固件的模块
  main.ts          # Application.template 必须放在这个文件
```

`./do.sh` 会扫 `fw/*/manifest.json`。新固件用 `./do.sh sd fw 新名字` 放进卡，不烧进芯片。

## 快捷命令

```bash
./do.sh                 # 交互菜单。Esc、← 或 BS 返回上一级。烧录不再选固件
./do.sh flash           # 烧启动器到芯片，然后回到菜单
./do.sh sim clock       # 桌面模拟某一个
./do.sh sd              # 列出卡上的 cadv/。没插卡时问板子
./do.sh sd fw           # 把全部固件拷进 cadv/（不含启动器）
./do.sh sd fw clock     # 只拷时钟
./do.sh sd file ./a.txt # 把文件拷进 cadv/
./do.sh ts-check        # Moddable + ESP-IDF 是否就绪；并扫 Piu commandList 风险
./do.sh help
```

Port 七段/圆盘绘制会撑爆 Piu 默认的 `commandListLength`（1024 字节），表现为有背光黑屏。`ts-check` 与编镜像前会跑 `scripts/check-piu-lists.mjs`；桌面模拟若溢出会打印 `command list overflowed`。

构建或模拟时会自动判断：词库或字体比源文件旧就重做。只有选中拼写或查词时才检查词库。`CADV_REFRESH=0` 跳过，`CADV_REFRESH=ask` 改回先问。

上传一个固件时，镜像比 `fw/<id>` 或 `shared` 旧会先问要不要重编，回车即编。上传全部，或一次传多个时，过时的直接重编。`CADV_SD_BUILD=1` 每个都重编，`CADV_SD_BUILD=0` 仍用旧镜像，`CADV_SD_BUILD=ask` 改回逐个询问。没有镜像时直接编译。这不烧进芯片。

烧录前：电源 **OFF** → 按住 **G0** → 插 USB → 松开。烧完按 **RESET**。

## 首次使用

安装步骤在 `fw/clock/README.md`。时钟固件无已存账号时：SSID → Enter → Password → Enter。凭证存在 Preference。`W` 重配 Wi‑Fi。

可选预置 Wi-Fi（只给时钟固件）：

```bash
cp fw/clock/wifi.local.json.example fw/clock/wifi.local.json
./do.sh sd fw clock
```

本机已装好：`third_party/moddable`、`~/esp32/esp-idf-v6.1`、Espressif tools + `python@3.12` venv。`ts-check` 全绿即可烧。
