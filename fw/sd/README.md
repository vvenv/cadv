# SD 卡固件

这是启动器。芯片一次只跑一个程序；卡上的 `cadv/` 可以放很多个。设备不扫卡上的其它目录。

卡是 Cardputer-Adv 侧面的 microSD，FAT。SPI2，和屏幕的 SPI3 分开：CS 12、MOSI 14、CLK 40、MISO 39。挂在 `/sdcard`，只打开 `cadv/`。读失败不会格式化卡。

列表是 `cadv/*.bin`。旁边的 `cadv/<id>.txt` 是屏幕上的名字。**Enter / 空格** 先问一次，再按才写入另一块闪存并重启。**BS / Esc / Fn+H** 取消或重新扫描。

载入之后，在那个固件里按 **Fn+BS** 回到这个启动器。

闪存被分成两半，每一半大约 1.9MB。镜像更大就载不进去。卡上的份数不受这个限制。第一次使用，或 USB 烧过别的固件之后，要再烧一次启动器，分区才在：

```bash
./do.sh flash
```

把卡插到电脑后：

```bash
./do.sh sd              # 列出 cadv/
./do.sh sd fw           # 全部固件（不含启动器自己）
./do.sh sd fw clock     # 只要时间天气 → cadv/clock.bin
./do.sh sd file ./a.txt # 其它文件也放进 cadv/
```

没有现成镜像会先编译，不烧进芯片。`CADV_SD=/Volumes/名字` 指定卡。`CADV_SD_BUILD=1` 先重编再拷。

桌面模拟用 `fw/sd/sample` 当卡，里面已经有一个 `cadv/`。`./do.sh sim sd`。模拟器不能真的载入。
