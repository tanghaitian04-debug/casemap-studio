# CaseMap Studio 开发说明

保持 JSON version 1 兼容。项目坐标归一化到 0–1，时间用秒。预览和云端导出共用 engine.js。校验和脚本匹配在 project.js 和 script.js。

案件时间、移动路线、物件身份、公示照片和地图授权以用户核实的资料为准。未知路线标为示意，保留画面提示和版权署名。默认示例为松湾市虚构案例。

提交前执行 npm run lint、npm test、npm run build。浏览器可用时执行 npm run test:browser。验证成片执行 npm run test:video，容器无浏览器时使用 CASEMAP_TEST_NATIVE=1。工作流仅部署 casemap-studio。
