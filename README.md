# Cardputer ADV 时钟固件

在 M5Stack Cardputer / Cardputer-Adv 上通过 Wi-Fi NTP 校时，并在屏幕显示当前时间（默认中国时区 `CST-8`）。

Cardputer-Adv **没有独立 RTC 芯片**，断电后时间会丢失，需要联网重新校时。

## 目录

| 路径 | 用途 |
|------|------|
| `do.sh` | 常用命令入口（编译 / 烧录 / 模拟） |
| `firmware_arduino/CardputerClock/` | 设备固件（Arduino CLI 烧录） |
| `sim/` | 本机 SDL 模拟器（调 UI / 字号，不烧录） |

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

用 M5GFX 的 SDL 后端开 Cardputer-Adv 尺寸窗口（240×135），跑主机本地时间。

**能测：** 布局、字号、颜色、刷新节奏  
**不能测：** Wi-Fi / NTP / Cardputer 物理键盘矩阵

```bash
./do.sh sim
```

窗口被挡住时看 Dock。键盘 `L` / `R` 可旋转预览画面。

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
