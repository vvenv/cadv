# 单词拼写固件

开机就是填空。词库优先读 SD 卡上的 `cadv/words/wordbank.bin`，没有或坏了再用固件里的那份。词表来自 `../alice/data` 的小学词表（闽教版小学）。顶栏是中文释义：优先 `../alice/assets/data/library.json` 里带释义的词条，没有再取 `ecdict-meta.json` 的第一条。底栏音标、出题乱序可在功能列表里开关。判对或判错时顶栏短暂换成「正确」或「不对」。7 个字母以内用大字，更长的词缩小。卡上的词库放在 `cadv/words/` 子目录，避免启动器把 `wordbank.bin` 当成固件。

| 键 | 作用 |
|----|------|
| 字母 | 填空。输满即判断 |
| **Enter / 空格** | 没填字时打开功能列表。有字则交卷，没填满也可以 |
| **BS / Esc / ←** | 删掉刚填的一个字母。`←` 是模拟器左方向键，板子上是 `Fn`+`H`。列表和帮助里这三个键回到上一页 |
| **`[` / `]`** | 难度：易约 1/3，中约 1/2，难是整个词 |
| **`\`** | 换词库 |
| **`,` / `.`** | 上一题 / 下一题。`Fn`+`K` / `Fn`+`J` 相同 |
| **`-` / `=`** | 音量 |
| **`?` / `/`** | 当前界面的帮助 |

```bash
./do.sh flash words
./do.sh sim words
./do.sh sd fw words          # 镜像 + cadv/words/wordbank.bin
./do.sh sd file ./wordsdir   # 目录名须为 words，内含 wordbank.bin → cadv/words/
```

构建或模拟时会自动判断词库和字体是否过期并重做。也可手动：`./do.sh gen-words`，再 `./do.sh gen-font`。`gen-words` 会同时写出 `fw/words/sample/cadv/words/wordbank.bin` 供桌面模拟。
