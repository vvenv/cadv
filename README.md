# Cardputer ADV 时钟固件

在 M5Stack Cardputer / Cardputer-Adv 上通过 Wi-Fi NTP 校时，并在屏幕显示当前时间（默认中国时区 `CST-8`）。

Cardputer-Adv **没有独立 RTC 芯片**，断电后时间会丢失，需要联网重新校时。

## 目录

| 路径 | 用途 |
|------|------|
| `firmware_arduino/CardputerClock/` | 设备固件（Arduino CLI 烧录） |
| `sim/` | 本机 SDL 模拟器（调 UI / 字号，不烧录） |

## 本机模拟（不用烧录）

用 M5GFX 的 SDL 后端在 Mac 上开一个 Cardputer-Adv 尺寸窗口，跑主机本地时间。

**能测：** 布局、字号、颜色、刷新节奏  
**不能测：** Wi-Fi / NTP / Cardputer 物理键盘矩阵

```bash
# 依赖（已装可跳过）
brew install sdl2
export PATH="$HOME/Library/Python/3.9/bin:$PATH"
export HOMEBREW_PREFIX=/opt/homebrew

cd sim
pio run -e native_cardputer_adv
.pio/build/native_cardputer_adv/program
```

窗口被挡住时看 Dock。键盘 `L` / `R` 可旋转预览画面。

## 烧录到设备

```bash
# 电源 OFF → 按住 G0 → 插 USB → 松 G0
arduino-cli compile --fqbn m5stack:esp32:m5stack_cardputer \
  --libraries "$HOME/Documents/Arduino/libraries" \
  firmware_arduino/CardputerClock

arduino-cli upload -p /dev/cu.usbmodem3101 \
  --fqbn m5stack:esp32:m5stack_cardputer \
  firmware_arduino/CardputerClock
```

端口：`ls /dev/cu.usbmodem*`。

## 首次使用

1. SSID → Enter  
2. Password → Enter  

凭证存 NVS。`R` 重校时，`W` 重配 Wi‑Fi。

## 可选：编译期 Wi-Fi

编辑 `firmware_arduino/CardputerClock/config.h`：

```cpp
#define WIFI_SSID "你的SSID"
#define WIFI_PASSWORD "你的密码"
```
