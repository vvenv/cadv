# JS

在 Cardputer 上直接敲 JavaScript。输入一行按 Enter 就运行，结果显示在下面：绿色是值，红色是错误，暗色是 `undefined`。括号、字符串、模板没写完时按 Enter 会换到 `..` 行接着写。

每个字母都是输入，所以帮助在 **Fn+空格**，移动都用 Fn：

| 键 | 作用 |
|----|------|
| **Enter** | 运行这一行。括号没关就接着写 |
| **Fn+K / Fn+J** | 上一条 / 下一条历史 |
| **Fn+H / Fn+L** | 光标左右 |
| **Shift+Fn+K / J** | 往上 / 往下翻看输出 |
| **BS** | 退格，按住连删 |
| **Esc** | 清空这一行；行是空的就取消没写完的多行输入 |
| **Fn+空格** | 帮助（模拟器里用 Tab） |
| **Fn+BS** | 回选应用（会先停掉所有定时） |

可以直接用：

- `let` / `const` / `class` 在最外层会改成 `var`，下一行还能用。函数声明本来就保留。
- `_` 是上一个结果。`{a: 1}` 单独一行当对象看，不当代码块。
- `print(...)`、`console.log(...)` 打到屏幕上，`clear()` 清屏，`inspect(x)` 返回显示用的字符串。
- `setTimeout` / `setInterval` / `clearTimeout` 能用，回调里抛的错只打印，不会重启。`stopAll()` 停掉所有定时。
- Promise 会先显示 `Promise {<pending>}`，等它有结果了再打印 `=> 值`。
- `import("timer")` 这类动态导入只能拿到固件里编进去的模块。

清单里写了 `"strip": []`：XS 的内建对象一个都不裁，所以敲进去的 `reduce`、`Map`、`Proxy`、正则都能用。镜像大约 1.4 MB。

屏幕字体是 JetBrains Mono Bold 20px（和其它固件的 UI 字一样大），只有 ASCII（每行 19 列，一屏 6 行）。中文和其它非 ASCII 字符显示成 `?`，字符串本身没变。重新生成字体：`./scripts/gen-code-font.sh`。

已知限制：

- 死循环（`while (true) {}`）会卡住，看门狗触发后重启。
- 内存用完时 XS 会中止，设备重启。别一次造很大的数组。
- 历史只留在内存里，最多 40 条，重启就没了。
- 不支持顶层 `await`，用 `.then(print)`。

```bash
./do.sh sim repl
./do.sh sd fw repl
```
