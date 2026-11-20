# 地图与地球数据署名

- `demo-map.webp` 由本项目的 `tools/make_assets.py` 程序生成。道路、建筑与事件均为虚构。
- `earth.webp` 来自 NASA Earth Observatory 的 [Blue Marble Next Generation 2004 年 7 月全球地表](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/)。原始 5400×2700 JPEG 重采样为 2048×1024 WebP。数据由 NASA Goddard Space Flight Center 的 Reto Stöckli 等制作。画面保留 NASA Earth Observatory 署名。使用遵循 [NASA 媒体指引](https://www.nasa.gov/nasa-brand-center/images-and-media/)。
- 用户导入的图片有独立的使用和署名条款，请填写原资料要求的准确署名。

## V2 影片与地理镜头

- `geo/orlando-region.webp` 和 `geo/orlando-park.webp` 为 USDA NAIP 航拍，由 [USGS The National Map](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer) 提供。原服务说明其 NAIP 影像属于公有领域。图像按 WGS84 严格边界导出后缩放为 WebP。塞入地球引擎的边界分别为 `[-81.8, 28.23, -81, 28.84]` 和 `[-81.4945, 28.4965, -81.474, 28.5165]`。具体原始飞行日期未从镶嵌数据推定。
- [City of Orlando · Bill Frederick Park at Turkey Lake](https://www.orlando.gov/Parks-the-Environment/Directory/Bill-Frederick-Park-At-Turkey-Lake) 验证了演示公园和公共停车设施。所示动画车辆是原创技术验证，与实际警务或事件无关。
- `simulation.mp4` 由 `scripts/make-simulation.mjs` 用本仓库地图、对象及程序化合成环境声生成。画面含可见「原创模拟录像 · 虚构」标识。V2 示例的文字与分镜由 `scripts/film-demo.mjs` 生成，没有使用用户提供的参考视频帧、人物、标志或声音。
- CesiumJS 依赖按 npm 包的 Apache-2.0 许可分发。第三方库的许可文本随构建产物中的 Cesium 数据保留。
