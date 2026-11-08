# USB 盘

把 Cardputer-Adv 侧面的 microSD 通过 USB 挂到电脑上，当作可移动磁盘。用来直接打开 `cadv/rec/*.wav` 等文件，不必拔卡。

本固件用 **USB-OTG TinyUSB MSC**（不是平时的 USB-Serial-JTAG）。卡走 SPI2（CS 12、MOSI 14、CLK 40、MISO 39），扇区读写交给电脑。挂给电脑时固件自己不再走 FatFS。

| 键 | 作用 |
|----|------|
| **?** | 帮助 |
| **Fn+[`** / **Fn+]** | 暗 / 亮 |
| **Fn+BS** | 停盘并回启动器 |

用完先在电脑上**弹出**磁盘，再按 **Fn+BS**。与录音等占卡固件不要同时用。

SPI 模式偏慢，适合拷录音等小文件。

```bash
./do.sh sd fw usb
./do.sh flash usb   # 调试时可直接烧进芯片
```
