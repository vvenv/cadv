# Cardputer ADV（TypeScript）

在 M5Stack Cardputer-Adv 上用 **Moddable + TypeScript** 跑固件。一次只烧一个固件：时间天气是一个，单词拼写是另一个。板子上的程序互相独立，设置也分开存。

时间天气：Wi-Fi NTP 校时（默认中国时区 `CST-8`）、键盘配网、天气、闹钟、倒计时、整点报时。时钟界面 **Enter** 打开功能列表。Cardputer-Adv **没有独立 RTC**，断电后要重新对时。

单词拼写：用 `../alice/data` 的小学词库（人教版小学、闽教版小学），不带中文释义。开机就是填空，**Esc** 打开功能列表。

## 目录

| 路径 | 用途 |
|------|------|
| `do.sh` | 选固件、模拟、烧录 |
| `fw/<id>/` | 一个固件。`label` 是菜单上的名字，`manifest.json` 是入口 |
| `shared/` | 屏幕、键盘、喇叭、公共字体。每个固件都 include |
| `scripts/` | 词库和字体生成 |
| `third_party/moddable` | 本机 Moddable SDK（gitignore） |

现在有 `fw/clock`（时间天气）和 `fw/words`（单词拼写）。

## 再加一个固件

建一个目录即可，不用改 `do.sh`：

```text
fw/新名字/
  label            # 一行，菜单里显示的名字
  manifest.json    # include ../../shared/manifest.json，再列出本固件的模块
  main.ts          # Application.template 必须放在这个文件
```

`./do.sh` 会扫 `fw/*/manifest.json`。然后 `./do.sh flash 新名字`。

## 快捷命令

```bash
./do.sh                 # 交互菜单。Esc、← 或 BS 返回上一级；烧录和模拟会再让你选固件
./do.sh flash clock     # 烧时间天气
./do.sh flash words     # 烧单词拼写
./do.sh sim clock       # 桌面模拟某一个
./do.sh ts-check        # Moddable + ESP-IDF 是否就绪
./do.sh help
```

字体过期会先问要不要生成。只有选中的固件用到 `wordbank.bin` 时才重做词库。`CADV_REFRESH=1` 直接生成，`CADV_REFRESH=0` 跳过。

烧录前：电源 **OFF** → 按住 **G0** → 插 USB → 松开。烧完按 **RESET**。

## 首次使用

安装步骤在 `fw/clock/README.md`。时间天气固件无已存账号时：SSID → Enter → Password → Enter。凭证存在 Preference。`W` 重配 Wi‑Fi。

可选预置 Wi-Fi（只给时间天气固件）：

```bash
cp fw/clock/wifi.local.json.example fw/clock/wifi.local.json
./do.sh flash clock
```

本机已装好：`third_party/moddable`、`~/esp32/esp-idf-v6.1`、Espressif tools + `python@3.12` venv。`ts-check` 全绿即可烧。
