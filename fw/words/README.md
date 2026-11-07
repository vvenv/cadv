# 拼写固件

开机就是填空。默认用固件里的闽教版小学词库。卡上 `cadv/words/*.bin` 可在功能列表的 **来源** 里切换（`junior.bin` 显示为「初中」）；不会自动盖过内置。词表来自 `../alice/data`。顶栏是词性和中文释义，词性在前，如 `n. 名字`：优先 `../alice/assets/data/library.json` 里带释义的词条，没有再取 `ecdict-meta.json` 的第一条。底栏音标、出题乱序可在功能列表里开关。判对或判错时顶栏短暂换成「正确」或「不对」。错过的词会记下，最多 40 个，再答对就去掉。功能列表里的「错题」可以只练这些。底栏还有今天做了几题、连续答对、这一轮对错。**Fn+[`** / **Fn+]** 调背光，30 秒不动熄屏。7 个字母以内用大字，更长的词缩小。卡上的词库放在 `cadv/words/` 子目录，避免启动器把 `*.bin` 当成固件。

| 键 | 作用 |
|----|------|
| 字母 | 填空。输满即判断 |
| **Enter** | 没填字时打开功能列表。有字则交卷，没填满也可以 |
| **BS** | 删掉刚填的一个字母。列表和帮助里回到上一页 |
| **`[` / `]`** | 难度：易约 1/3，中约 1/2，难是整个词 |
| **`\`** | 换词库 |
| **`,` / `.`** | 上一题 / 下一题 |
| **`-` / `=`** | 音量 |
| **`?`** | 当前界面的帮助 |

```bash
./do.sh flash words
./do.sh sim words
./do.sh sd fw words          # 镜像 + fw/words 下可选词库 → cadv/words/
./do.sh sd bank              # 只传词库（菜单选；或 sd bank junior / all）
./do.sh sd file ./wordsdir   # 目录名须为 words，内含 *.bin → cadv/words/
```

构建或模拟时会自动判断词库和字体是否过期并重做。也可手动：`./do.sh gen-words`，再 `./do.sh gen-font`。`gen-words` 写出闪存用的 `wordbank.bin`、卡上用的 `junior.bin`，以及 `fw/words/sample/cadv/words/junior.bin` 供桌面模拟。
