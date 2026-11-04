# ts-hello — Moddable + TypeScript 最小骨架

板端用 **TypeScript**（经 Moddable XS）跑在 ESP32-S3 上。  
桌面模拟器用 **PIU** 画 Hello + 实时时钟；真机同样走 PIU（默认模拟屏，**尚未**接到 Cardputer ST7789 / 键盘）。

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
./do.sh ts-sim      # 桌面模拟器（mac），看 xsbug / 控制台 trace
./do.sh ts-flash    # 烧到 ESP32-S3（下载模式同 Cardputer）
```

或手动：

```bash
cd ts-hello
mcconfig -d -m -dn                          # 本机
mcconfig -d -m -dn -p esp32/esp32s3_cdc     # Cardputer USB Serial/JTAG（do.sh ts-flash 用这个）
```

## 范围说明

| 有 | 没有 |
|----|------|
| TS 编译进固件 | 键盘 TCA8418 |
| PIU + **7 段数码管时钟**（Port 画 a–g） | Wi-Fi / NTP |
| ESP32-S3 USB 下载 + ST7789（Cardputer ADV 引脚） | |

完整 Cardputer-Adv UI 仍以 `firmware_arduino/`（C++）为主；本目录只验证「板端 TS」链路。
