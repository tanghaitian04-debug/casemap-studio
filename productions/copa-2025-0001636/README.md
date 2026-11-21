# Hubbard 案件两条动画

- `Chicago_Geographic_Location.mp4` 32 秒
- `Hubbard_Case_2D_Reconstruction.mp4` 116 秒
- 两条均为无声 1920×1080、30 FPS、H.264、yuv420p，MP4 索引前置。Cesium 三维图层在云端以 1280×720 渲染，字幕、标注与最终视频画布为 1920×1080。

## 素材与定位

地球使用 NASA Goddard Blue Marble Next Generation（2004 年 4 月）。芝加哥区域和街区使用 USDA NAIP / USGS The National Map 正射航拍。湖面空白拼片做了颜色补缀和色调衔接。航拍是地理背景，与案发画面无关。地标、道路及建筑轮廓来自 © OpenStreetMap contributors，依 ODbL 提供，参见 https://www.openstreetmap.org/copyright 。建筑为轮廓拉伸体，使用 OSM 现有高度或按层数换算的近似高度。酒店官网点与 OSM 酒店楼体标记位置不同，建筑标记使用楼体内 OSM 点。Plaza 440 的住宅塔楼与酒店所在的较低楼体使用 OSM 分开标注的建筑部件。在酒店上方回到正射图以衔接下一镜。

- NASA 资源与使用说明见 https://svs.gsfc.nasa.gov/12564/ 和 https://www.nasa.gov/nasa-brand-center/images-and-media/
- USDA NAIP 公有领域底图见 https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer
- 酒店已核对 Marriott 官网及 CPD 报告。
- 便利店门牌核对 7-Eleven 门店官网与芝加哥市门店记录（门店编号 33908）。
- 事实顺序以 COPA 初步通报、公开报告及原始录像为依据。逐镜视频文件和片内时码见 `sources/Evidence.csv`。

## 尚未核实的空间和时间信息

| 段落 | 画面采用的处理 |
| --- | --- |
| 首次接触 | 54 W Hubbard 为警员追捕报告所列起点。具体首次会面大堂与报告起点的空间关系未确定。 |
| 后巷 | 垃圾箱和追赶可见，未锁定全部巷段、垃圾箱位置、喊话与每次施放的对应坐标。小图只表达移动与相对关系。 |
| 便利店 | 官方门店地址为 451 N State St。BWC 1 可看到警员穿过临街门，Williams 的确切离店门、店内转折及全程路线未确定。 |
| 街面 | COPA 档案标示 POD 和第三方镜头拍到枪击前电击。未逐次定位施放点、编号、命中情况或影响。 |
| 酒店 | 原始录像可见街面及经酒店入口进入。没有将全部 GPS 路径连成实线。 |
| 电梯区 | 按录像呈现电梯内外关系。角色图标间距、方向基准、警员相对站位均属非按比例示意。 |
| 最后数秒 | 采用 BWC 2 电梯重开前后约 04:25.8–04:28.5 作为相对时间参照，并用 BWC 1 核对动作顺序。电击和开枪提示为聚合事件标记。片内约点有取帧误差，未把任何设备时钟当作官方确认的绝对时间。 |
| 现场救助 | 依据 BWC 与案例报告呈现过程，具体医疗动作和各警员移动路径留为示意。 |

## 渲染

Node 22、Python 3.12（Pillow、NumPy）、Chromium、FFmpeg、字体 Noto Sans CJK SC。

```bash
npm ci
npx playwright install --with-deps chromium --only-shell
python scripts/prepare_assets.py
node scripts/render.mjs geo --preview
CASEMAP_NATIVE_2D=1 node scripts/render.mjs reconstruction --preview
node scripts/render.mjs geo
CASEMAP_NATIVE_2D=1 node scripts/render.mjs reconstruction
bash scripts/qa.sh geo
bash scripts/qa.sh reconstruction
```

源码包若已有 `geo/` 底图、地图数据和派生数据，可直接渲染。当前原始资料未打包，证据索引提供公开链接。标准 GitHub Actions 配置见 `workflow/hubbard-render.yml`。在仓库中将该文件放至 `.github/workflows/hubbard-render.yml` 可启用分支渲染。
