(function(root) {
  'use strict';
  const DEG=Math.PI/180;
  const limit=85.05112878;
  const mercator=lat=>Math.log(Math.tan(Math.PI/4+lat*DEG/2));
  const unmercator=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)/DEG;
  const valid=b=>!!b && [b.west,b.east,b.south,b.north].every(Number.isFinite) &&
    b.west>=-180 && b.east<=180 && b.east>b.west && b.north>b.south &&
    (b.projection==='mercator' ? b.south>=-limit && b.north<=limit :
      b.projection==='geographic' && b.south>=-90 && b.north<=90);
  function location(b,x,y) {
    const {west,east,north,south,projection}=b;
    const lon=west+(east-west)*x;
    const lat=projection==='mercator'?
      unmercator(mercator(north)+(mercator(south)-mercator(north))*y):north+(south-north)*y;
    return {lat,lon};
  }
  function pixel(b,lat,lon) {
    const fn=b.projection==='mercator'?mercator:x=>x;
    if(lat<b.south || lat>b.north || lon<b.west || lon>b.east)return null;
    return {x:(lon-b.west)/(b.east-b.west),y:(fn(lat)-fn(b.north))/(fn(b.south)-fn(b.north))};
  }
  function distance(a,b) {
    const h=Math.sin((b.lat-a.lat)*DEG/2)**2+Math.cos(a.lat*DEG)*Math.cos(b.lat*DEG)*
      Math.sin((b.lon-a.lon)*DEG/2)**2;
    return 12742017.6*Math.asin(Math.sqrt(Math.min(1,h)));
  }
  const cities=[
    ['California','Los Angeles',34.0522,-118.2437],['California','San Francisco',37.7749,-122.4194],
    ['California','San Diego',32.7157,-117.1611],['California','Sacramento',38.5816,-121.4944],
    ['Illinois','Chicago',41.8781,-87.6298],['New York','New York',40.7128,-74.006],
    ['Florida','Miami',25.7617,-80.1918],['Florida','Orlando',28.5383,-81.3792],
    ['Florida','Tampa',27.9506,-82.4572],['Texas','Houston',29.7604,-95.3698],
    ['Texas','Dallas',32.7767,-96.797],['Texas','Austin',30.2672,-97.7431],
    ['Texas','San Antonio',29.4241,-98.4936],['Washington','Seattle',47.6062,-122.3321],
    ['Georgia','Atlanta',33.749,-84.388],['Nevada','Las Vegas',36.1699,-115.1398],
    ['Colorado','Denver',39.7392,-104.9903],['Arizona','Phoenix',33.4484,-112.074],
    ['Massachusetts','Boston',42.3601,-71.0589],['Pennsylvania','Philadelphia',39.9526,-75.1652],
    ['Michigan','Detroit',42.3314,-83.0458],['Minnesota','Minneapolis',44.9778,-93.265],
    ['Oregon','Portland',45.5152,-122.6784],['Ohio','Columbus',39.9612,-82.9988],
    ['District of Columbia','Washington',38.9072,-77.0369]
  ];
  function findCity(state,city) {
    const n=s=>s.trim().toLowerCase();
    const matches=cities.filter(([name,place])=>(!n(state)||n(state)===n(name)) && n(city)===n(place));
    return matches.length===1?matches[0]:null;
  }
  const api={valid,location,pixel,distance,cities,findCity};
  if(typeof module==='object')module.exports=api;
  else root.CaseMapGeo=api;
})(globalThis);
