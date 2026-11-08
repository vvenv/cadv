# 基座

常驻芯片。一次只跑一个程序；卡上的 `cadv/` 可以放很多个。设备不扫卡上的其它目录。

卡是 Cardputer-Adv 侧面的 microSD，FAT。SPI2，和屏幕的 SPI3 分开：CS 12、MOSI 14、CLK 40、MISO 39。挂在 `/sdcard`，只打开 `cadv/`。读失败不会格式化卡。

列表是 `cadv/*.bin`。旁边的 `cadv/<id>.txt` 是屏幕上的名字。标题上有卡的剩余空间。镜像超过大约 1.9MB 时，名字前面加「超」，写不进槽。子目录（例如拼写固件用的 `cadv/words/junior.bin`、录音 `cadv/rec/`）不进列表。**K/J** 上下，**Enter** 先问一次，再按才写入另一块闪存并重启。**BS** 取消或重新扫描。**Fn+[`** / **Fn+]** 调背光。

载入之后，在那个固件里按 **Fn+BS** 回到这个基座。

闪存被分成两半，每一半大约 1.9MB。镜像更大就载不进去。卡上的份数不受这个限制。第一次使用，或 USB 烧过别的固件之后，要再烧一次基座，分区才在：

```bash
./do.sh flash
```

把卡插到电脑，或让板子跑着基座并用 USB 连上电脑：

```bash
./do.sh sd              # 列出 cadv/
./do.sh sd fw           # 全部固件（不含基座自己）
./do.sh sd fw clock     # 只要时钟 → cadv/clock.bin
./do.sh sd file ./a.txt # 其它文件也放进 cadv/
```

没插卡时走板子上的 USB 串口，文件由基座写进卡。这要求芯片里是 `./do.sh flash` 烧进去的这一版基座。`CADV_SD=/Volumes/名字` 指定插在电脑上的卡。`CADV_PORT=` 指定串口。`CADV_LINK=device` 强制走板子，`CADV_LINK=0` 只认电脑上的卡。`CADV_SD_BUILD=1` 每个都先重编再拷。上传全部时，过时的镜像会直接重编。

桌面模拟用 `fw/sd/sample` 当卡，里面已经有一个 `cadv/`。`./do.sh sim sd`。模拟器不能真的载入。
