# SD 卡固件

开机扫一遍卡上的目录和文件，并打开每个文件读开头。列表里 **Enter** 再按块把选中的文件读出来。后面从卡上加载固件，用的就是这套读取。

卡是 Cardputer-Adv 侧面的 microSD，FAT。SPI2，和屏幕的 SPI3 分开：

| 信号 | GPIO |
|------|------|
| CS | 12 |
| MOSI | 14 |
| CLK | 40 |
| MISO | 39 |

挂在 `/sdcard`。读失败不会格式化卡。

| 键 | 作用 |
|----|------|
| **j k , .** 或 **Fn+K / Fn+J** | 上下 |
| **Enter / 空格** | 读取当前文件。目录只标成目录 |
| **BS / Esc / Fn+H** | 列表里重新扫描。帮助页里回到列表 |
| **? / /** | 本页按键 |
| 行首 **!** | 这个文件没打开 |

一次最多列出 400 项。标题上的 `+` 表示后面还有。文件名太长时显示末尾。

桌面模拟没有读卡器。`fw/sd/sample` 当作卡：

```bash
./do.sh flash sd
./do.sh sim sd
```

`./do.sh sim` 发现 `sample/` 时，会把模拟器的文件根指到这个目录。

把卡插到电脑（FAT / exFAT）后，可以从这边把镜像和文件放上去。固件镜像是已经编译好的 `xs_esp32.bin`，拷成 `fw/<id>.bin`，不烧进芯片。没有现成镜像时会先编译。

```bash
./do.sh sd                 # 列出卡上的文件
./do.sh sd fw clock        # → fw/clock.bin
./do.sh sd fw clock words
./do.sh sd file ./a.txt    # 拷到卡根目录，目录会整份拷
```

多张卡，或系统没认出来：`CADV_SD=/Volumes/名字`。要先重编再拷：`CADV_SD_BUILD=1 ./do.sh sd fw clock`。
