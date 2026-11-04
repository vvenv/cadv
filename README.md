# Cardputer ADV 时钟固件

在 M5Stack Cardputer / Cardputer-Adv 上通过 Wi-Fi NTP 校时，并在屏幕显示当前时间（默认中国时区 `CST-8`）。

Cardputer-Adv **没有独立 RTC 芯片**，断电后时间会丢失，需要联网重新校时。

## 目录

| 路径 | 用途 |
|------|------|
| `do.sh` | 常用命令入口（编译 / 烧录 / 模拟） |
| `firmware/` | 设备固件源码（`src/main.cpp`） |
| `firmware_arduino/CardputerClock/` | 同上内容，供 Arduino CLI 烧录 |
| `sim/` | SDL 宿主：编译并运行 `firmware/src`（不是另一套 UI） |
| `ts-hello/` | Moddable + TypeScript 最小 Hello（ESP32-S3） |

## 快捷命令

```bash
./do.sh            # 交互菜单（↑↓ / j k 选择，回车确认）
./do.sh flash      # 编译并烧录（自动找串口）
./do.sh sim        # 启动 SDL 模拟器
./do.sh monitor    # 串口监视
./do.sh help       # 全部子命令
```


烧录前：电源 **OFF** → 按住 **G0** → 插 USB → 松开。

## 本机模拟（不用烧录）

`sim/` 用 M5GFX SDL 打开 Cardputer-Adv 尺寸窗口（240×135），**直接编译运行 `firmware/src/main.cpp`**。Wi-Fi / NVS / 键盘由 `sim/lib/cadv_host` 提供主机桩（时间用本机时钟，NTP 服务器不访问）。

**能测：** 与固件同一套 UI / 状态机 / 按键逻辑（R 重校时、W 配网）  
**不能测：** 真实 Wi-Fi / DNS / SNTP、物理键盘矩阵 / I2C

```bash
./do.sh sim
```

窗口被挡住时看 Dock。`Ctrl+L` / `Ctrl+R` 旋转预览；普通 `R` / `W` 交给固件。

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

## TypeScript（实验）

板端 TS 走 [Moddable](https://github.com/Moddable-OpenSource/moddable)，见 `ts-hello/README.md`。

```bash
./do.sh ts-check   # 是否已装 MODDABLE / mcconfig
./do.sh ts-sim     # 桌面跑 Hello
./do.sh ts-flash   # 烧到 ESP32-S3
```

当前只有串口 `trace`，**未接** Cardputer 屏/键盘；完整时钟仍用 Arduino 固件。
