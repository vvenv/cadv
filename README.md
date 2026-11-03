# Cardputer ADV 时钟固件

在 M5Stack Cardputer / Cardputer-Adv 上通过 Wi-Fi NTP 校时，并在屏幕显示当前时间（默认中国时区 `CST-8`）。

Cardputer-Adv **没有独立 RTC 芯片**，断电后时间会丢失，需要联网重新校时。

## 依赖

- PlatformIO (`pio`)
- USB-C 数据线（需支持数据传输）

## 烧录

1. 侧边电源拨到 **OFF**
2. 按住 **G0**，插入 USB-C，再松开 G0（进入下载模式）
3. 执行：

```bash
cd firmware
pio run -t upload --upload-port /dev/cu.usbmodem3101
```

端口名以本机实际为准：`ls /dev/cu.usbmodem*`。

## 首次使用

设备无预置 Wi-Fi 时，会提示用键盘输入：

1. SSID → Enter
2. Password → Enter

凭证保存在 NVS，下次开机自动连接。

### 快捷键

| 键 | 作用 |
|----|------|
| `R` | 重新 NTP 校时 |
| `W` | 重新配置 Wi-Fi |

## 可选：编译期写入 Wi-Fi

编辑 `firmware/include/config.h`：

```cpp
#define WIFI_SSID "你的SSID"
#define WIFI_PASSWORD "你的密码"
```

## 串口监视

```bash
cd firmware
pio device monitor -b 115200 --port /dev/cu.usbmodem3101
```
