# CADV

给 [M5Stack Cardputer-Adv](https://docs.m5stack.com/en/core/Cardputer-Adv) 用的一组小程序。用 **Moddable + TypeScript** 写，跑在板上的 ESP32-S3。

芯片里只常驻一个「基座」。时钟、拼写、键盘这些都放在 microSD 的 `cadv/` 目录里，开机选一个再载入。一次只跑一个，设置也分开存。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 你需要什么

- Cardputer-Adv
- 一张 FAT 格式的 microSD
- 一台能编 Moddable 的电脑（当前脚本主要按 macOS + Homebrew 写）
- [Moddable SDK](https://github.com/Moddable-OpenSource/moddable)
- [ESP-IDF](https://docs.espressif.com/projects/esp-idf/en/v6.1/esp32s3/)（文档按 **v6.1** / `esp32s3`）
- Node.js、Python 3.12

想从教材词表重新生成「拼写 / 查词」词库时，还要把 [Alice](https://github.com/vvenv/alice) 克隆到本仓旁边（同级目录名 `alice`）。只烧别的固件、不重做词库，可以不装 Alice。

## 第一次上手

1. 克隆本仓库。把 Moddable 放到 `third_party/moddable`，或任意位置并设置环境变量 `MODDABLE`。
2. 装好 ESP-IDF，设置 `IDF_PATH`。需要时跑 `source "$IDF_PATH/export.sh"`。
3. 可选：`./scripts/setup-moddable-env.sh` 往 `~/.zshrc` 写入 `MODDABLE` / `IDF_PATH`（按本仓实际路径，不再写死某个人的目录）。
4. 在仓库根目录跑 `./do.sh ts-check`，确认工具链和 Piu 检查都过。
5. 烧基座进芯片：电源 **OFF** → 按住 **G0** → 插 USB → 松开 → `./do.sh flash` → 按 **RESET**。
6. 把程序拷到卡上，例如时钟：`./do.sh sd fw clock`。卡可以插在电脑上直接拷；也可以卡留在板子里、基座在跑时走串口上传。

时钟第一次用、还没存过 Wi‑Fi 时：屏幕上输入 SSID → Enter → 密码 → Enter。凭证存在板子 Preference 里。想预置账号（可选）：

```bash
cp fw/clock/wifi.local.json.example fw/clock/wifi.local.json
# 编辑 ssid / password，这个文件已 gitignore，别提交
./do.sh sd fw clock
```

更细的时钟说明见 [`fw/clock/README.md`](fw/clock/README.md)。

## 怎么用

| 你想做 | 命令 |
|--------|------|
| 打开菜单 | `./do.sh` |
| 烧基座到芯片 | `./do.sh flash` |
| 桌面模拟某个程序 | `./do.sh sim clock` |
| 看卡上 `cadv/` | `./do.sh sd` |
| 把某个程序拷进卡 | `./do.sh sd fw clock` |
| 把全部程序拷进卡（不含基座） | `./do.sh sd fw` |
| 只传词库 | `./do.sh sd bank` |
| 检查工具链 | `./do.sh ts-check` |
| 打发布用的整片镜像（M5Burner / M5Launcher） | `./do.sh burner [id]` |
| 模拟器截图，做 M5Burner 封面 | `./do.sh shot [id]` |
| 帮助 | `./do.sh help` |

板子上：从任意已载入的程序回到基座，按住 **Fn+BS**。各程序共用几套习惯：

- 背光四档：**Fn+[** 暗、**Fn+]** 亮；大约 30 秒不动会变暗或熄屏
- 电量低于约 3.40V 时顶栏会提示低电
- **Fn+T** 换配色主题，所有程序共用一套
- 多数界面：`BS` / `Esc` / `←` 返回，`Enter` / 空格确认，`?`（Shift+/）或 **Fn+空格** 帮助，`-` `=` 音量
- 上下移动：`K`/`J`，或照键帽上印的箭头按 `;`（↑）`.`（↓）；网格里 `,`（←）`/`（→）左右移动
- `Fn`+`H`/`J`/`K`/`L` 当作 ←↓↑→
- `M` 切换模式；打字、摩斯这类每个字母都是输入的程序改用 **Tab**
- `R` 重置；会丢数据的（计数、计步、骰子记录、声级统计）要连按两次 `R R`，删除是 `D D`
- `?` 也是输入的程序（JS、蓝牙键盘）只认 **Fn+空格** 帮助

## 现在有哪些程序

| 目录 | 菜单名 | 做什么 |
|------|--------|--------|
| `fw/base` | 基座 | 从卡上的 `cadv/` 载入别的程序 |
| `fw/clock` | 时钟 | 校时、天气、闹钟、秒表、番茄钟、月历等 |
| `fw/words` | 拼写 | 填空练词；默认可用来自 Alice 的小学词表 |
| `fw/dict` | 查词 | 输入英文，看词性、中文、音标 |
| `fw/kb` | 键盘 | BLE 键盘，名字 `CADV KB` |
| `fw/level` | 水平 | BMI270 气泡水平 |
| `fw/info` | 设备 | 芯片、电池、传感器自检 |
| `fw/usb` | 优盘 | 侧面 microSD 经 USB-OTG 挂到电脑 |
| `fw/rec` | 录音 | 录到 `cadv/rec/*.wav` |
| `fw/note` | 记事 | 编辑 `cadv/*.txt`，短内容可出二维码 |
| `fw/calc` | 计算 | 四则、换算、随机串 |
| `fw/scan` | 扫描 | 听周围 Wi‑Fi / 蓝牙，不连接 |
| `fw/metro` | 节拍 | 喇叭打拍 |
| `fw/tune` | 调音 | 麦克风测音名和音分 |
| `fw/step` | 计步 | BMI270 计步 |
| `fw/count` | 计数 | 手动或听响声计数 |
| `fw/piano` | 钢琴 | 键盘弹一个八度 |
| `fw/remote` | 遥控 | 红外发射管当电视遥控（三星、LG、索尼、飞利浦） |
| `fw/type` | 打字 | 打字练习，算速度、正确率和易错键 |
| `fw/morse` | 摩斯 | 发报，或按 Koch 法练抄收；喇叭和板载灯同步 |
| `fw/dice` | 骰子 | 摇一摇掷骰子、抛硬币、抽 1–100 |
| `fw/db` | 分贝 | 麦克风测声级，带走势图（未校准，可手调） |
| `fw/game` | 游戏 | 贪吃蛇、2048、方块 |
| `fw/noise` | 助眠 | 白噪音、粉红、褐噪音、雨声、海浪，带定时 |
| `fw/timer` | 计时 | 倒计时；立起开始、放平暂停 |

每个目录里通常有自己的 `README.md`。

## 仓库结构

| 路径 | 用途 |
|------|------|
| `do.sh` | 选程序、模拟、烧录、往卡上拷文件 |
| `fw/<id>/` | 一个程序：`label` 是菜单名，`icon` 是基座里的图标，`manifest.json` 是入口 |
| `shared/` | 屏幕、键盘、喇叭、公共字体 |
| `scripts/` | 词库、字体生成；发布：`burner_publish.py`（M5Burner）、`make_site.py`（网页烧录页 + 卡上文件包）、`sim-shot.swift`（截图） |
| `shared/sim/` | 模拟器里的 Cardputer-Adv 外壳（240×135），`do.sh sim` 自动用 |
| `web/` | 网页烧录页模板，`.github/workflows/release.yml` 打 `v*` tag 时发到 GitHub Pages |
| `third_party/` | 本机 SDK 等（gitignore，不进仓库） |

## 再加一个程序

建一个目录即可，不用改 `do.sh`：

```text
fw/新名字/
  label            # 一行，菜单里显示的名字
  icon             # 基座里的图标，可不放（格式见 fw/base/README.md）
  manifest.json    # include ../../shared/manifest.json，再列出本程序的模块
  main.ts          # Application.template 必须放在这个文件
```

`main.ts` 里照别的程序写上 `bindFwTheme("新名字")` 和 `confirmBoot()`。少了后者，程序每次重启都会退回基座。

`./do.sh` 会扫 `fw/*/manifest.json`。新程序用 `./do.sh sd fw 新名字` 放进卡，不要指望它自动烧进芯片。

## 词库

拼写默认带一份内置小学词表；查词用卡上的 `cadv/dict/lex.bin`。重新生成依赖旁边的 Alice 数据：

```bash
# 同级目录：
#   ../alice
#   ./cadv   ← 你在这里
./do.sh sd bank        # 或构建拼写 / 查词时自动检查是否过期
```

教材词表版权归原方，见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 许可

本仓库代码：[MIT](LICENSE)。第三方工具、字体、词表说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。
