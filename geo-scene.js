(function(root){
  'use strict';
  const Flight=root.CaseMapFlight;
  const C=root.Cesium;
  const aerial=[
    {file:'assets/geo/orlando-region.webp',bounds:[-81.8,28.23,-81,28.84]},
    {file:'assets/geo/orlando-park.webp',bounds:[-81.4945,28.4965,-81.474,28.5165]}
  ];
  const localCoverage=(lat,lon)=>aerial.some(({bounds:[w,s,e,n]})=>lat>=s&&lat<=n&&lon>=w&&lon<=e);
  class GeoScene {
    constructor(node) {
      if(!C)throw Error('CesiumJS 未加载');
      this.widget=new C.CesiumWidget(node,{
        baseLayer:false,terrainProvider:new C.EllipsoidTerrainProvider(),sceneMode:C.SceneMode.SCENE3D,
        useDefaultRenderLoop:false,baseLayerPicker:false,skyBox:false,scene3DOnly:true,msaaSamples:1,
        contextOptions:{webgl:{alpha:false,preserveDrawingBuffer:true,antialias:false}}
      });
      this.scene=this.widget.scene;
      this.scene.backgroundColor=C.Color.fromCssColorString('#080d18');
      this.scene.screenSpaceCameraController.enableInputs=false;
      this.scene.globe.enableLighting=true;
      this.scene.globe.dynamicAtmosphereLighting=false;
      this.scene.globe.showGroundAtmosphere=true;
      this.scene.globe.lightingFadeOutDistance=200000000;
      this.scene.fog.enabled=false;
      this.scene.msaaSamples=1;
      this.scene.postProcessStages.fxaa.enabled=false;
      this.widget.clock.shouldAnimate=false;
      this.widget.clock.currentTime=C.JulianDate.fromIso8601('2024-08-12T17:30:00Z');
      this.aerial=false;
      this.loaded=false;
    }
    async use(flight) {
      this.flight=flight;
      this.aerial=localCoverage(flight.lat,flight.lon);
      this.scene.imageryLayers.removeAll();
      this.loaded=false;
      const layers=[{file:'assets/earth.webp',bounds:[-180,-90,180,90]},...(this.aerial?aerial:[])];
      const providers=await Promise.all(layers.map(layer=>C.SingleTileImageryProvider.fromUrl(layer.file,{
        rectangle:C.Rectangle.fromDegrees(...layer.bounds)
      })));
      providers.forEach(p=>{this.scene.imageryLayers.addImageryProvider(p);});
      this.loaded=true;
    }
    step(time) {
      this.widget.resize();
      const {lat,lon,height,heading,pitch}=Flight.sample(this.flight.frames,time);
      this.scene.camera.setView({
        destination:C.Cartesian3.fromDegrees(lon,lat,this.aerial?height:Math.max(height,300000)),
        orientation:{heading:Flight.radians(heading),pitch:Flight.radians(pitch),roll:0}
      });
      this.widget.render();
    }
    async readyFrame(time) {
      if(!this.loaded)throw Error('地理图层未加载');
      this.step(time);
      const deadline=performance.now()+18000;
      while(!this.scene.globe.tilesLoaded) {
        if(performance.now()>deadline)throw Error('Cesium 图层就绪超时');
        await new Promise(requestAnimationFrame);
        this.widget.render();
      }
    }
    paint(ctx,w,h) { ctx.drawImage(this.scene.canvas,0,0,w,h); }
    get credit(){return this.aerial?'NASA Blue Marble · USDA NAIP / USGS The National Map':'NASA Earth Observatory · Blue Marble';}
    destroy(){this.widget.destroy();}
  }
  root.CaseMapGeoScene={GeoScene,localCoverage};
})(globalThis);
