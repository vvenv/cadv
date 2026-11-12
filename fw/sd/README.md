# 基座

常驻芯片。一次只跑一个程序；卡上的 `cadv/` 可以放很多个。设备不扫卡上的其它目录。

卡是 Cardputer-Adv 侧面的 microSD，FAT。SPI2，和屏幕的 SPI3 分开：CS 12、MOSI 14、CLK 40、MISO 39。挂在 `/sdcard`，只打开 `cadv/`。读失败不会格式化卡。

列表是 `cadv/*.bin`。旁边的 `cadv/<id>.txt` 是屏幕上的名字，`cadv/<id>.icon` 是图标。启动界面是横向图标格：每个固件一个图标和名称，一页 4×2，多了翻页。标题上有卡的剩余空间。镜像超过大约 1.9MB 时角上标「超」，写不进槽。子目录（例如拼写固件用的 `cadv/words/junior.bin`、录音 `cadv/rec/`）不进列表。照键帽箭头 **,** / **/** 左右、**;** / **.**（或 **K/J**）上下一行移动；按字母跳到 id 以它开头的下一个程序（H/J/K/L 留给移动）。**Enter** 写入另一块闪存并重启，进度条走的时候按 **BS** 取消。下次回到基座会停在上回载入的那个程序上。其余时候 **BS** 重新扫描。**Fn+[`** / **Fn+]** 调背光。

图标由各固件自己带：源文件是 `fw/<id>/icon`，`./do.sh sd fw` 把它和镜像一起拷成 `cadv/<id>.icon`。改图标不用重烧基座：`./do.sh sd icon` 只传图标（可以写 id），不碰镜像；然后在基座里按 **BS** 重新扫描。没有图标文件的显示成一块芯片。

图标画在 28×28 的格子上，原点在中心，单位可以带 .5。一行一个形状，`#` 后面是注释：

```text
rect x y w h            # 实心矩形，(x, y) 是左上角
frame x y w h           # 空心矩形
line x0 y0 x1 y1        # 线
disc x y r              # 实心圆
oval x y rx ry          # 实心椭圆
ring x y r [top|bottom] [wedge]   # 圆环；只要上半或下半；wedge>0 收成向上张开的扇形
crescent x y r bx by br # 圆减去另一个圆，月牙
```

行尾加 `red`，这个形状在没选中时画成红色（录音的红点）。认不出的行会跳过。最多 32 个形状。

载入之后，在那个固件里按 **Fn+BS** 回到这个基座。

选的程序和上次载入的是同一个镜像（比较镜像末尾的 SHA-256）时，不再重写闪存，直接启动，标题显示「启动」。卡上的镜像换过，就照常写入。

程序启动后要跑满约 3 秒才算「起来了」（`confirmBoot()`，每个 `main.ts` 都调一次；基座自己立刻确认）。在这之前重启或崩溃，bootloader 会自动退回基座，标题显示「上回没跑起来」。这靠 `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`，配在 `shared/manifest.json` 里，所以改完要 `./do.sh flash` 重烧一次基座（bootloader 跟着它一起烧）。新加的程序也要在 `main.ts` 里调用 `confirmBoot()`，否则它每次重启都会退回基座。

闪存被分成两半，每一半大约 1.9MB。镜像更大就载不进去。卡上的份数不受这个限制。第一次使用，或 USB 烧过别的固件之后，要再烧一次基座，分区才在：

```bash
./do.sh flash
```

把卡插到电脑，或让板子跑着基座并用 USB 连上电脑：

```bash
./do.sh sd              # 列出 cadv/
./do.sh sd fw           # 全部固件（不含基座自己）
./do.sh sd fw clock     # 只要时钟 → cadv/clock.bin
./do.sh sd icon         # 只传图标，不传镜像
./do.sh sd file ./a.txt # 其它文件也放进 cadv/
```

没插卡时走板子上的 USB 串口，文件由基座写进卡。这要求芯片里是 `./do.sh flash` 烧进去的这一版基座。`CADV_SD=/Volumes/名字` 指定插在电脑上的卡。`CADV_PORT=` 指定串口。`CADV_LINK=device` 强制走板子，`CADV_LINK=0` 只认电脑上的卡。`CADV_SD_BUILD=1` 每个都先重编再拷。上传全部时，过时的镜像会直接重编。

桌面模拟用 `fw/sd/sample` 当卡，里面已经有一个 `cadv/`。`./do.sh sim sd`。模拟器不能真的载入。
