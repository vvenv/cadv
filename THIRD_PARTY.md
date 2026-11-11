# 第三方说明

本仓库自己的代码见根目录 [LICENSE](LICENSE)（MIT）。下面这些依赖不进 git，或带有自己的许可；用本项目前请自行核对。

## 构建时需要（不随仓库发布）

| 依赖 | 用途 | 许可 / 备注 |
|------|------|-------------|
| [Moddable SDK](https://github.com/Moddable-OpenSource/moddable) | 编译、模拟、烧录 TypeScript 固件 | 见其 `licenses/`；本地放在 `third_party/moddable`（已 gitignore） |
| [ESP-IDF](https://github.com/espressif/esp-idf)（文档按 v6.1） | ESP32-S3 工具链 | Apache-2.0 等；本机路径用环境变量 `IDF_PATH` |
| [fontbm](https://github.com/vladimirgamalyan/fontbm) | 栅格化点阵字体 | MIT；`scripts/gen-ui-font.sh` 可自动下载到 `third_party/bin/` |

## 词库相关

| 依赖 | 用途 | 备注 |
|------|------|------|
| [Alice](https://github.com/vvenv/alice) | 拼写 / 查词的教材词表来源 | MIT；与本仓同级克隆为 `../alice` 后跑 `scripts/gen-wordbank.mjs` |
| [ECDICT](https://github.com/skywind3000/ECDICT) | 音标与释义补充 | 生成脚本会下载到 `.cache/`；重新分发词库时请保留其许可要求 |
| 教材词表（如闽教版小学等） | 内置 / 卡上词库内容 | 版权归原教材方；本仓不提供重新分发教材全文的授权，请自行判断用途 |

## 已嵌入的字体资源（`shared/fonts/`）

| 资源 | 来源 | 备注 |
|------|------|------|
| `UI-Bold-20.*`、`Word-Bold-48.*`、`Word-Bold-32.*` | [Source Han Sans](https://github.com/adobe-fonts/source-han-sans)（思源黑体）Bold | SIL Open Font License；重新生成见 `scripts/gen-ui-font.sh` |
| `Ipa-Bold-20.*` | 当前由 **Arial Bold**（系统字体）栅格化音标 | Arial 是专有字体。开源分发上这是已知问题，计划换成可自由再分发的字体 |

## 运行时网络服务

| 服务 | 用途 |
|------|------|
| [Open-Meteo](https://open-meteo.com/) | 时钟固件天气与城市搜索（无需 API Key） |
| `ntp.aliyun.com` / `ntp.tencent.com` | 时钟固件校时 |
