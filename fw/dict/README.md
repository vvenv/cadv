# 查词

输入英文，看这一条的中文和音标。词库在卡上 `cadv/dict/lex.bin`，不进闪存。和单词拼写同一批小学、初中词，重复的只留一条，按字母排。释义最多 8 个字。

没插卡，或卡上没有这个文件，中间显示「无词库」。输入对不上任何词，显示「没有」。

`j` `k` 是字母。上下用 `,` `.`，或 `Fn`+`K` / `J`。`BS` 删一个字母，`Esc` 清空。

```bash
./do.sh sim dict
./do.sh sd fw dict
./do.sh sd bank dict
```

`sd fw dict` 会把镜像和 `lex.bin` 一起拷到卡上。只传词库：菜单 SD → 上传词库，选查词或全部。模拟读 `fw/dict/sample`。
