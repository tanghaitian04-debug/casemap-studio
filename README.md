# CaseMap Studio V1.0 — 执法案件地图动画生成器

一套可直接运行的、面向案件纪录片地图示意动画的开源工具。支持**旋转地球开场、地图缩放与旋转、警员/嫌疑人路径、车辆移动、警示和枪口闪光、中文字幕、浏览器预览、视频录制及 FFmpeg MP4 输出**。

> **重要：** 默认示例是**完全虚构的原创地图与事件**。本工具不会自动获取 Google Earth 卫星图，也不会从案情文本中自动核实真实地理位置。制作真实案件时，必须自行确认位置、时间、身份、影像使用权及署名，并保留画面中的“案件过程示意动画”说明。

## 功能状态

| 功能 | V1 状态 | 说明 |
|---|---|---|
| 地球旋转 | 可用 | 程序生成的地球纹理 + 球面投影，非 Google Earth 3D 飞行 |
| 俯视地图 | 可用 | 默认虚构地图；可导入自有卫星截图 JPG/PNG |
| 镜头 | 可用 | 时间关键帧：中心位置、缩放、旋转 |
| 人物/车辆 | 可用 | 路径点、自动插值、方向、颜色、可选头像 |
| 枪战/警示 | 可用 | 视觉示意特效，不模拟真实弹道 |
| 中文字幕 | 可用 | JSON 时间轴字幕；浏览器预览 |
| 网页编辑器 | 可用 | 无需登录，无后端，支持手机浏览器 |
| 浏览器导出 | 可用（依浏览器） | 优先 MP4，不支持时导出 WebM；可能受手机性能影响 |
| FFmpeg 导出 | 可用 | Linux/Windows/macOS、GitHub Actions 输出 H.264 MP4 |
| Codex 自动制作 | 工作流已配置 | Codex 按案件描述修改项目 JSON，需接入自己的 Codex 会话 |
| 自动下载 Google Earth 地图 | 不提供 | 不绕过影像使用条款，不冒充官方 API |
| 实时 AI 生成 | 未集成 | 浏览器未接入 AI API，避免误导和密钥泄露 |

## 一、打开网页编辑器

将整个项目上传 GitHub 仓库后，可以通过 **GitHub Pages** 托管（Settings → Pages → Source: GitHub Actions），工作流 `.github/workflows/pages.yml` 会部署静态网页。

本地运行：

```bash
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

编辑方法：

1. 左侧修改标题、时长、开场时间，或上传自有地图图片。
2. 左侧选择警员/嫌疑人/车辆，拖动时间轴到目标秒数。
3. 点击地图增加路径点；拖动已有路径点修改位置。
4. 右侧为对象添加“枪口闪光”或“警示标记”事件。
5. 右侧设置镜头缩放、旋转、中心 X/Y，点击“添加镜头”；也可“将镜头对准选中对象”。
6. 右上角“保存 JSON”保存项目。网页本机自动保存草稿（浏览器存储清除后不可恢复，建议定期导出 JSON）。
7. 右上角“导出视频”使用浏览器 MediaRecorder；不同浏览器支持的容器格式可能不同。**稳定的 MP4 请使用下文 FFmpeg/GitHub Actions**。

**注意：** 通过 GitHub Pages 打开网页时，地图图片上传只保存在浏览器草稿及导出的 JSON 中，不会自动提交到 GitHub。请不要将涉及隐私、未经授权的地图或人像提交到公开仓库。

## 二、Python / FFmpeg 生成 MP4

系统要求：Python 3.10+，FFmpeg，`pip install -r requirements.txt`。Linux 建议安装 Noto CJK 字体以显示中文。

```bash
python render.py --project examples/demo.json --check
python render.py --project examples/demo.json --preview 10 --output out/frame.png
python render.py --project examples/demo.json --output out/case-map.mp4
```

加入已获授权的解说音频：

```bash
python render.py --project examples/demo.json --audio narration.mp3 --output out/case-map-with-voice.mp4
```

`--audio` 会在渲染结束后用 FFmpeg 合成；音频过短时输出会按最短轨道截断。视频默认 H.264/yuv420p，可导入剪映、Premiere 等软件。

## 三、完全通过手机 + Codex Cloud + GitHub Actions

1. 在 GitHub **新建一个空仓库**，例如 `casemap-studio`。本包不自动修改你现有的其他仓库。
2. 上传本项目全部文件（保留 `.github/workflows` 文件夹）。在 Codex Cloud 连接这个新仓库。
3. 打开网页版编辑器，在右侧输入案件描述，点击“复制 Codex 生成指令”，粘贴给 Codex。也可以直接告诉 Codex：`阅读 AGENTS.md，按我提供的案情创建 examples/case.json，验证并提交。`
4. Codex 提交后，GitHub 的 **Actions → Render CaseMap MP4 → Run workflow**，在 `project_path` 输入 `examples/case.json`（默认 `examples/demo.json`）。
5. 等待渲染工作流完成，在该次运行的 **Artifacts** 中下载 `casemap-mp4`，里面是 H.264 MP4。
6. 将 MP4 导入剪映与执法记录仪视频、中文解说、音效合成。

GitHub Actions 工作流会安装 Python 依赖、FFmpeg 和中文字体。首次执行需要允许仓库运行 Actions；仓库私有/公开及 GitHub Pages 权限取决于你的账号设置。

## 四、项目 JSON 格式

参考 `examples/demo.json`。所有对象坐标使用 **0–1 归一化坐标**，`(0,0)` 为地图左上角，`(1,1)` 为右下角。时间单位是秒。

```json
{
  "version": 1,
  "title": "案件名称",
  "duration": 16,
  "fps": 30,
  "size": [1280, 720],
  "intro": {"duration": 3.7, "latitude": 29, "start_longitude": -145, "end_longitude": -81},
  "map": {"image": "assets/demo-map.jpg", "credit": "地图来源及署名"},
  "camera": [{"t": 0, "x": 0.5, "y": 0.5, "zoom": 1.0, "rotation": 0}],
  "actors": [{"id": "officer", "name": "警员", "kind": "officer", "color": "#42c5ef", "points": [{"t": 4, "x": 0.3, "y": 0.8}, {"t": 8, "x": 0.6, "y": 0.6}]}],
  "events": [{"t": 7.5, "actor": "officer", "type": "alert"}],
  "captions": [{"start": 4, "end": 8, "text": "警员向建筑入口移动"}]
}
```

`kind` 支持 `officer`、`suspect`、`person`、`car`；`events.type` 支持 `alert`、`gunfire`。`gunfire` 可设置 `direction`（角度，画面右方为 0°、下方为 90°）。`map.image` 和 `actor.avatar` 可以是项目内相对路径或浏览器导出的 `data:image/...;base64,...`；渲染器不会下载远程 URL。真实地图应自行确认合法使用及署名。

## 五、项目结构

```
index.html, styles.css, engine.js, app.js   # 静态网页编辑器和 Canvas 动画引擎
render.py                                    # Python/FFmpeg 视频渲染器
examples/demo.json                          # 虚构演示项目
assets/demo-map.jpg, assets/earth.png       # 原创示例素材
assets/preview-globe.png, preview-chase.png # 示例帧
AGENTS.md                                    # Codex 工作规则
.github/workflows/render.yml                # 云端 MP4 渲染
.github/workflows/pages.yml                 # GitHub Pages 静态部署
tests/test_render.py                        # 自动测试
```

## 版权与真实性

- 仅使用有权使用的地图、人像、视频和声音；遵守相应平台的署名与再利用规则。
- “模拟追逐路线”不等于真实证据，未知位置、时间、射击方向必须标注为示意，不能编造。
- 原创示例地图不代表真实地点，地图上的建筑、道路和人员均为虚构。
- 枪口闪光是简单视觉符号，不用于推断真实弹道或案件事实。

## 后续可扩展

可在不改变 V1 JSON 结构的前提下，增加 Earth Studio 片段导入、地图地理坐标标注、语音时间码同步、角色轨迹贝塞尔曲线、镜头转场预设、字幕 SRT 导入、案件资料引用清单及批量模板生成。
