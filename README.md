# Cardputer ADV 时钟（TypeScript）

在 M5Stack Cardputer-Adv 上用 **Moddable + TypeScript** 显示时钟：Wi-Fi NTP 校时（默认中国时区 `CST-8`）、键盘配网、天气、闹钟、倒计时、整点报时。时钟界面 **Enter** 打开功能列表。单词补充完整用 `../alice/data` 的词库。

Cardputer-Adv **没有独立 RTC 芯片**，断电后时间会丢失，需要联网重新校时。

## 目录

| 路径 | 用途 |
|------|------|
| `do.sh` | 常用命令入口（检查 / 模拟 / 烧录） |
| `app/` | 板端 TypeScript 应用 |
| `scripts/` | Moddable 环境、字体生成 |
| `third_party/moddable` | 本机 Moddable SDK（gitignore） |

## 快捷命令

```bash
./do.sh            # 交互菜单（↑↓ / j k 选择，回车确认）
./do.sh ts-check   # Moddable + ESP-IDF 工具是否就绪
./do.sh ts-sim     # 桌面跑时钟
./do.sh ts-flash   # 烧到 ESP32-S3（USB Serial/JTAG；插上再烧）
./do.sh help       # 全部子命令
```

`ts-sim` / `ts-flash` 发现词库或字体过期会先问要不要生成。`CADV_REFRESH=1` 直接生成，`CADV_REFRESH=0` 跳过。

烧录前：电源 **OFF** → 按住 **G0** → 插 USB → 松开。

## 首次使用

详见 `app/README.md`。板端无已存账号时：SSID → Enter → Password → Enter。凭证存 Preference。`W` 重配 Wi‑Fi。

可选预置 Wi-Fi：

```bash
cp app/wifi.local.json.example app/wifi.local.json
./do.sh ts-flash
```

本机已装好：`third_party/moddable`、`~/esp32/esp-idf-v6.1`、Espressif tools + `python@3.12` venv。`ts-check` 全绿即可烧。
