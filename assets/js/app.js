/*** Begin custom input control for adding local file ***/
L.Control.AddFile = L.Control.extend({
  onAdd: function(map) {
    fileInput = L.DomUtil.create("input", "hidden");
    fileInput.type = "file";
    fileInput.accept = ".mbtiles, .geojson, .kml, .gpx";
    fileInput.style.display = "none";
    
    fileInput.addEventListener("change", function () {
      showLoader();

      const file = fileInput.files[0];
      const name = file.name.split(".").slice(0, -1).join(".");

      if (file.name.endsWith(".mbtiles")) {
        loadRaster(file, name);
      } else if (file.name.endsWith(".geojson") || file.name.endsWith(".kml") || file.name.endsWith(".gpx")) {
        const format = file.name.split(".").pop();
        loadVector(file, name, format);
      } else {
        alert("MBTiles, GeoJSON, KML, and GPX files supported.");
        hideLoader();
      }
      this.value = "";
    }, false);
    
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    div.innerHTML = "<a class='leaflet-bar-part leaflet-bar-part-single file-control-btn' title='Load File' onclick='fileInput.click();'><i id='loading-icon' class='fas fa-map-marked-alt'></i></a>";
    return div
  }
});

L.control.addfile = function(opts) {
  return new L.Control.AddFile(opts);
}
/*** end custom control ***/

const map = L.map("map", {
  zoomSnap: 0,
  maxZoom: 22,
  zoomControl: false
}).fitWorld();
map.attributionControl.setPrefix(null);

const baseLayers = {
  "Streets": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.@2xpng", {
    maxNativeZoom: 18,
    maxZoom: map.getMaxZoom(),
    attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attribution">CARTO</a>',
  }).addTo(map),

  "Aerial": L.tileLayer.wms("https://orthos.dhses.ny.gov/ArcGIS/services/Latest/MapServer/WMSServer", {
    layers: "0,1,2,3,4",
    format: "image/png",
    transparent: true,
    maxNativeZoom: 18,
    maxZoom: map.getMaxZoom(),
    attribution: "<a href='https://gis.ny.gov/gateway/mg/webserv/webserv.html' class='external'>NYSDOP</a>"
  }),
  
  "Topo": L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {
    maxNativeZoom: 16,
    maxZoom: map.getMaxZoom(),
    attribution: "USGS",
  }),

  "Charts": L.tileLayer("https://tileservice.charts.noaa.gov/tiles/50000_1/{z}/{x}/{y}.png", {
    maxNativeZoom: 18,
    maxZoom: map.getMaxZoom(),
    attribution: "NOAA",
  }),

  "None": L.tileLayer("", {
    maxZoom: map.getMaxZoom()
  })
};

const selectLayer = L.featureGroup(null).addTo(map);

const overlayLayers = {};

const controls = {
  layerCtrl: L.control.layers(baseLayers, null, {
    collapsed: true,
    position: "topright"
  }).addTo(map),

  locateCtrl: L.control.locate({
    icon: "fa fa-crosshairs",
    setView: "untilPan",
    cacheLocation: true,
    position: "topleft",
    flyTo: false,
    keepCurrentZoomLevel: true,
    circleStyle: {
      interactive: false
    },
    markerStyle: {
      interactive: false
    },
    locateOptions: {
      enableHighAccuracy: true/*,
      maxZoom: 19*/
    },
    onLocationError: function(e) {
      alert(e.message);
    }
  }).addTo(map),

  fileCtrl: L.control.addfile({
    position: "topleft"
  }).addTo(map),

  scaleCtrl: L.control.scale({
    metric: false,
    position: "bottomright"
  })
};

function loadVector(file, name, format) {
  const reader = new FileReader();
  let geojson = null;

  reader.onload = function(e) {
    if (format == "geojson") {
      geojson = JSON.parse(reader.result);
    } else if (format == "kml") {
      const kml = (new DOMParser()).parseFromString(reader.result, "text/xml");
      geojson = toGeoJSON.kml(kml, {styles: true});
    } else if (format == "gpx") {
      const gpx = (new DOMParser()).parseFromString(reader.result, "text/xml");
      geojson = toGeoJSON.gpx(gpx);
    }

    const layer = L.geoJSON(geojson, {
      renderer: L.canvas({
        padding: 0.5,
        tolerance: 10
      }),
      style: function (feature) {
        return {
          color: feature.properties["stroke"] ? feature.properties["stroke"] : "#3388ff",
          opacity: feature.properties["stroke-opacity"] ? feature.properties["stroke-opacity"] : 1.0,
          weight: feature.properties["stroke-width"] ? feature.properties["stroke-width"] : 3,
          fillColor: feature.properties["fill"] ? feature.properties["fill"] : "#3388ff",
          fillOpacity: feature.properties["fill-opacity"] ? feature.properties["fill-opacity"] : 0.2,
        };
      },
      pointToLayer: function (feature, latlng) {
        if (format == "kml") {
          return L.circleMarker(latlng, {
            radius: 6
          }); 
        } else {
          return L.marker(latlng);
        }
      },
      onEachFeature: function (feature, layer) {
        let table = "<div style='overflow:auto;'><table>";
        
        if (feature && feature.geometry) {
          if (feature.geometry.type.includes("LineString")) {
            const length = turf.length(layer.toGeoJSON(), {units: "miles"});
            table += `<tr><th>LENGTH</th><td>${length.toFixed(1)} Miles</td></tr>`;
          } else if (feature.geometry.type === "Polygon") {
            const sqMeters = turf.area(layer.toGeoJSON());
            const acres = (sqMeters / 4046.86);
            const area = (acres < 640) ? (acres.toFixed(1) + " Acres") : ((sqMeters / 2589990).toFixed(1) + " Sq. Miles");
            table += `<tr><th>AREA</th><td>${area}</td></tr>`;
          }
        }

        const styleProps = ["styleUrl", "styleHash", "styleMapHash", "stroke", "stroke-opacity", "stroke-width", "opacity", "fill", "fill-opacity", "icon", "scale"];
        for (const key in feature.properties) {
          if (feature.properties.hasOwnProperty(key) && styleProps.indexOf(key) == -1) {
            table += "<tr><th>" + key.toUpperCase() + "</th><td>" + formatProperty(feature.properties[key]) + "</td></tr>";
          }
        }
        table += "</table></div>";
        layer.bindPopup(table, {
          maxHeight: 300,
          maxWidth: 250
        });
        layer.on({
          popupclose: function (e) {
            selectLayer.clearLayers();
          },
          click: function (e) {
            selectLayer.clearLayers();
            selectLayer.addLayer(L.geoJSON(layer.toGeoJSON(), {
              style: {
                color: "#00FFFF",
                weight: 5
              },
              pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, {
                  radius: 6,
                  color: "#00FFFF"
                }); 
              }
            }))
          }
        });
      }
      
    }).addTo(map);

    addLayer(layer, name);
    overlayLayers[L.Util.stamp(layer)] = layer;
    zoomToLayer(L.Util.stamp(layer));
  }

  reader.readAsText(file);
}

function loadRaster(file, name) {
  const reader = new FileReader();

  reader.onload = function(e) {
    const layer = L.tileLayer.mbTiles(reader.result, {
      autoScale: true,
      fitBounds: true,
      updateWhenIdle: false
    }).on("databaseloaded", function(e) {
      name = (layer.options.name ? layer.options.name : name);
      addLayer(layer, name);
    }).addTo(map);
    overlayLayers[L.Util.stamp(layer)] = layer;
  }

  reader.readAsArrayBuffer(file);
}

function addLayer(layer, name) {
  hideLoader();
  controls.layerCtrl.addOverlay(layer, `
    <span class="layer-name" id="${L.Util.stamp(layer)}">
      ${name}
    </span>
    <span class="layer-buttons">
      <span style="display: ${layer instanceof L.GeoJSON ? 'none' : 'unset'}"><a class="layer-btn" href="#" onclick="changeOpacity(${L.Util.stamp(layer)}); return false;"><i class="fas fa-adjust"></i></a></span>
      <a class="layer-btn" href="#" onclick="zoomToLayer(${L.Util.stamp(layer)}); return false;"><i class="fas fa-expand-arrows-alt"></i></a>
      <a class="layer-btn" href="#" onclick="removeLayer(${L.Util.stamp(layer)}, '${name}'); return false;"><i class="fas fa-trash" style="color: red"></i></a>
    </span>
    <div style="clear: both;"></div>
  `);
}

function zoomToLayer(id) {
  const layer = overlayLayers[id];
  if (!map.hasLayer(layer)) {
    map.addLayer(overlayLayers[id]);
  }
  if (layer.options.bounds) {
    map.fitBounds(layer.options.bounds);
  }
  else {
    map.fitBounds(layer.getBounds());
  }
}

function removeLayer(id, name) {
  const cfm = confirm(`Remove ${name}?`);
  if (cfm == true) {
    const layer = overlayLayers[id];
    if (!map.hasLayer(layer)) {
      map.addLayer(overlayLayers[id]);
    }
    map.removeLayer(layer);
    controls.layerCtrl.removeLayer(layer);
  }
}

function changeOpacity(id) {
  const layer = overlayLayers[id];
  if (!map.hasLayer(layer)) {
    map.addLayer(overlayLayers[id]);
  }
  let value = layer.options.opacity;
  if (value > 0.2) {
    layer.setOpacity((value-0.2).toFixed(1));  
  } else {
    layer.setOpacity(1);
  }
}

function formatProperty(value) {
  if (typeof value == "string" && (value.indexOf("http") === 0 || value.indexOf("https") === 0)) {
    return "<a href='" + value + "' target='_blank'>" + value + "</a>";
  } else {
    return value;
  }
}

function showLoader() {
  document.getElementById("loading-icon").classList.remove("fa-map-marked-alt");
  document.getElementById("loading-icon").classList.add("fa-spinner", "fa-spin");
}

function hideLoader() {
  document.getElementById("loading-icon").classList.remove("fa-spin", "fa-spinner");
  document.getElementById("loading-icon").classList.add("fa-map-marked-alt");
}

function goOffline() {
  const layers = Object.keys(baseLayers);
  for (const layer of layers) {
    if (layer == "None") {
      map.addLayer(baseLayers[layer]);
    } else {
      map.removeLayer(baseLayers[layer]);
    }
  }
}

map.once("locationfound", function(e) {
  map.fitBounds(e.bounds, {maxZoom: 18});
});

window.addEventListener("offline",  function(event) {
  goOffline();
});

initSqlJs({
  locateFile: function() {
    return "assets/vendor/sqljs-1.1.0/sql-wasm.wasm";
  }
}).then(function(SQL){
  
});

controls.locateCtrl.start();
navigator.onLine ? null : goOffline();