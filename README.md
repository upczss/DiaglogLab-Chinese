# DialogLab—Chinese

面向中文使用者的 DialogLab 适配版，用于配置多角色场景、编排对话、预览人工介入，以及回放和分析对话。

> 本项目基于 [Erzhen Hu 等作者的 DialogLab](https://github.com/ecruhue/DialogLab) 修改，是社区中文适配版本，并非原作者官方中文版。原项目采用 MIT 许可证，原作者版权声明和许可全文保留在 [LICENSE](LICENSE) 中。

## 中文适配内容

- 对话编排（Authoring）中的角色、群组、场景、片段配置与提示汉化。
- 对话验证（Verification）中的记录、时间轴、图表及问答提示汉化。
- 场景描述、对话提示词、对话生成和分析回答增加中文输出要求。
- 增加 DeepSeek 接入，并保留原有 OpenAI、Gemini 支持。
- 改进人工控制模式的候选介入审核、重新生成和继续对话流程。
- 改进中文流式文本处理，以及密钥弹窗和验证界面的浅色样式。

参与者姓名、模型标识和配置中的内部枚举值保留原格式；已有自定义内容不会自动翻译。

## 安装与启动

需要 Node.js 22 或更高版本、npm 和至少一种受支持模型服务的 API key。详细步骤、Windows 命令、关闭流程和常见问题见 **[安装与运行指南](docs/安装与运行.md)**。

在两个终端中分别运行：

```powershell
# 终端一：在仓库根目录执行
cd server
npm ci
Copy-Item .env.example .env  # 仅首次创建；已有 .env 时不要覆盖
# 在本地编辑 .env，填入自己的密钥
npm start
```

```powershell
# 终端二：在仓库根目录执行
cd client
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

打开 <http://localhost:5173>，选择模型服务并按需要配置密钥。首次安装之后，后续启动无需重复安装依赖或复制环境文件。在两个终端中分别按 `Ctrl+C` 停止服务。

## 使用和当前限制

1. 在「对话编排」创建场景，添加角色，配置群组及对话片段。
2. 输入中文场景描述或对话要求，先以少量轮次运行验证。
3. 使用「人工控制」前，标记人类参与者并开启片段介入设置；它审核候选介入，不代表每一轮都需要手动输入。
4. 对话完成后导出，再到「对话验证」查看记录与分析。

- **语音目前仍使用 Google TTS**，阿里百炼 TTS 尚未接入。没有 Google key 时可取消「语音」，使用文字对话及无音频导出。
- 模型调用、语音合成需要各自的服务权限、余额和网络连接；模型标识及可用性以服务商实际提供为准。
- 验证页的「刷新统计」沿用原项目模拟行为，不会重新计算指标；累计发言曲线为简化展示，不宜当作精确行为测量。
- 仅针对本机开发使用整理。远程部署需另行配置 API 地址、CORS、认证和密钥管理；不能把当前版本直接作为多人公共服务部署。

## 文档

- [安装与运行指南](docs/安装与运行.md)
- [安全与密钥说明](SECURITY.md)
- [第三方组件与素材说明](THIRD_PARTY_NOTICES.md)

## 致谢、许可与论文引用

原项目：[ecruhue/DialogLab](https://github.com/ecruhue/DialogLab)；中文适配维护：[upczss](https://github.com/upczss)。

本仓库代码在 [MIT 许可证](LICENSE) 下发布。第三方库、角色模型和示例素材仍适用各自的许可条款，不因本仓库许可证而改变。

原论文：[DialogLab（UIST 2025）](https://dl.acm.org/doi/10.1145/3746059.3747696)。研究中使用原系统或其方法时，请引用原论文；本项目不替代原论文署名。

```bibtex
@inproceedings{dialoglab2025,
  author = {Hu, Erzhen and Chen, Yanhe and Li, Mingyi and Phadnis, Vrushank and Xu, Pingmei and Qian, Xun and Olwal, Alex and Kim, David and Heo, Seongkook and Du, Ruofei},
  title = {DialogLab: Configuring and Orchestrating Multi-Agent Conversations},
  booktitle = {Proceedings of the 38th Annual ACM Symposium on User Interface Software and Technology (UIST '25)},
  year = {2025},
  publisher = {Association for Computing Machinery},
  doi = {10.1145/3746059.3747696}
}
```
