var LargeLots = LargeLots || {};
var LargeLots = {

  map: null,
  map_centroid: [41.8787248907554, -87.7055433591891],
  defaultZoom: 14,
  lastClickedLayer: null,
  geojson: null,
  marker: null,
  locationScope: 'Chicago',
  boundingBox: {
    'bottom': 41.74378003152462,
    'top': 41.807788914288814,
    'right': -87.57219314575195,
    'left': -87.69750595092773
  },

  initialize: function() {

      if (!LargeLots.map) {
        LargeLots.map = L.map('map', {
          center: LargeLots.map_centroid,
          zoom: LargeLots.defaultZoom,
          scrollWheelZoom: false
        });
      }
      // render a map!
      L.Icon.Default.imagePath = '/images/'

      L.tileLayer('https://{s}.tiles.mapbox.com/v3/datamade.hn83a654/{z}/{x}/{y}.png', {
          attribution: '<a href="http://www.mapbox.com/about/maps/" target="_blank">Terms &amp; Feedback</a>'
      }).addTo(LargeLots.map);

      LargeLots.info = L.control({position: 'bottomright'});

      LargeLots.info.onAdd = function (map) {
          this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
          this.update();
          return this._div;
      };

      // method that we will use to update the control based on feature properties passed
      LargeLots.info.update = function (props) {
        var date_formatted = '';
        if (props) {
          var info = '';
          if(props.street_number){
              info += "<h4>" + LargeLots.formatAddress(props) + "</h4>";
              info += "<p>PIN: " + props.pin14 + "<br />";
          }
          if (props.zoning_classification){
              info += "Zoned: " + props.zoning_classification + "<br />";
          }
          if (props.sq_ft){
              info += "Sq Ft: " + props.sq_ft + "<br />";
          }
          this._div.innerHTML  = info;
        }
      };

      LargeLots.info.clear = function(){
          this._div.innerHTML = '';
      }

      LargeLots.info.addTo(LargeLots.map);

      var fields = "pin14,zoning_classification,ward,street_name,street_dir,street_number,street_type,city_owned,residential"
      var layerOpts = {
          user_name: 'datamade',
          type: 'cartodb',
          cartodb_logo: false,
          sublayers: [
              {
                  sql: "select * from egp_parcels where city_owned='T' and residential='T'",
                  cartocss: $('#egp-styles').html().trim(),
                  interactivity: fields
              },
              {
                  sql: 'select * from east_garfield_park',
                  cartocss: "#east_garfield_park{polygon-fill: #ffffcc;polygon-opacity: 0.2;line-color: #FFF;line-width: 3;line-opacity: 1;}"
              }
          ]
      }
      cartodb.createLayer(LargeLots.map, layerOpts)
        .addTo(LargeLots.map)
        .done(function(layer) {
            LargeLots.lotsLayer = layer.getSubLayer(0);
            LargeLots.lotsLayer.setInteraction(true);
            LargeLots.lotsLayer.on('featureOver', function(e, latlng, pos, data, subLayerIndex) {
              $('#map div').css('cursor','pointer');
              LargeLots.info.update(data);
            });
            LargeLots.lotsLayer.on('featureOut', function(e, latlng, pos, data, subLayerIndex) {
              $('#map div').css('cursor','inherit');
              LargeLots.info.clear();
            });
            LargeLots.lotsLayer.on('featureClick', function(e, pos, latlng, data){
                LargeLots.getOneParcel(data['pin14']);
            });
            window.setTimeout(function(){
                if($.address.parameter('pin')){
                    LargeLots.getOneParcel($.address.parameter('pin'))
                }
            }, 1000)
        }).error(function(e) {
        //console.log('ERROR')
        //console.log(e)
      });
      $("#search_address").val(LargeLots.convertToPlainString($.address.parameter('address')));
      LargeLots.addressSearch();
      $('.toggle-parcels').on('click', function(e){
          if($(e.target).is(':checked')){
              $(e.target).prop('checked', true)
          } else {
              $(e.target).prop('checked', false);
          }
          LargeLots.toggleParcels()
      })
  },

  toggleParcels: function(){
      var checks = []
      $.each($('.toggle-parcels'), function(i, box){
          if($(box).is(':checked')){
              checks.push($(box).attr('id'))
          }
      });
      var sql = 'select * from egp_parcels where ';
      var clauses = []
      if(checks.indexOf('applied') >= 0){
          clauses.push('status = 1')
      }
      if(checks.indexOf('available') >= 0){
          clauses.push('status = 0')
      }
      if(clauses.length > 0){
          clauses = clauses.join(' or ');
          sql += clauses;
      } else {
          sql = 'select * from egp_parcels where status not in (0,1)'
      }
      LargeLots.lotsLayer.setSQL(sql);
  },

  formatAddress: function (prop) {
    return prop.street_number + " " + prop.street_dir + " " + prop.street_name + " " + prop.street_type;
  },

  getOneParcel: function(pin14){
      if (LargeLots.lastClickedLayer){
        LargeLots.map.removeLayer(LargeLots.lastClickedLayer);
      }
      var sql = new cartodb.SQL({user: 'datamade', format: 'geojson'});
      sql.execute('select * from egp_parcels where pin14 = cast({{pin14}} as text)', {pin14:pin14})
        .done(function(data){
            var shape = data.features[0];
            LargeLots.lastClickedLayer = L.geoJson(shape);
            LargeLots.lastClickedLayer.addTo(LargeLots.map);
            LargeLots.lastClickedLayer.setStyle({fillColor:'#f7fcb9', weight: 2, fillOpacity: 1, color: '#000'});
            LargeLots.map.setView(LargeLots.lastClickedLayer.getBounds().getCenter(), 17);
            LargeLots.selectParcel(shape.properties);
        }).error(function(e){console.log(e)});
  },

  selectParcel: function (props){
      var address = LargeLots.formatAddress(props);
      var info = "<img class='img-responsive img-thumbnail' src='http://cookviewer1.cookcountyil.gov/Jsviewer/image_viewer/requestImg.aspx?" + props.pin14 + "=' />\
        <table class='table table-bordered table-condensed'><tbody>\
          <tr><td>Address</td><td>" + address + "</td></tr>\
          <tr><td>PIN</td><td>" + props.pin14 + " (<a target='_blank' href='http://cookcountypropertyinfo.com/Pages/PIN-Results.aspx?PIN=" + props.pin14 + "'>info</a>)</td></tr>";
      if (props.zoning_classification){
          info += "<tr><td>Zoned</td><td> Residential (<a href='http://secondcityzoning.org/zone/" + props.zoning_classification + "' target='_blank'>" + props.zoning_classification + "</a>)</td></tr>";
      }
      if (props.sq_ft){
          info += "<tr><td>Sq ft</td><td>" + LargeLots.addCommas(props.sq_ft) + "</td></tr>";

      }
      info += "<tr><td colspan='2'><button type='button' id='lot_apply' data-pin='" + props.pin14 + "' data-address='" + address + "' href='#' class='btn btn-success'><i class='fa fa-check'></i> Apply for this lot</button></td></tr>"
      info += "</tbody></table>";
      $.address.parameter('pin', props.pin14)
      $('#lot-info').html(info);

      $("#lot_apply").on("click", function(){
        if ($("#id_lot_1_address").val() == "") {
          $("#id_lot_1_address").val($(this).data('address'));
          $("#id_lot_1_pin").val($(this).data('pin'));
        }
        else {
          $("#id_lot_2_address").val($(this).data('address'));
          $("#id_lot_2_pin").val($(this).data('pin'));
        }

        $(".panel-heading").ScrollTo({offsetTop: "70px"});
      });
  },

  addressSearch: function (e) {
    if (e) e.preventDefault();
    var searchRadius = $("#search_address").val();
    if (searchRadius != '') {

      var raw_address = $("#search_address").val().toLowerCase();
      raw_address = raw_address.replace(" n ", " north ");
      raw_address = raw_address.replace(" s ", " south ");
      raw_address = raw_address.replace(" e ", " east ");
      raw_address = raw_address.replace(" w ", " west ");

      if(LargeLots.locationScope && LargeLots.locationScope.length){
        var checkaddress = raw_address.toLowerCase();
        var checkcity = LargeLots.locationScope.split(",")[0].toLowerCase();
        if(checkaddress.indexOf(checkcity) == -1){
          raw_address += ", " + LargeLots.locationScope;
        }
      }

      $.address.parameter('address', encodeURIComponent(raw_address));

      var s = document.createElement("script");
      s.type = "text/javascript";
      s.src = "http://nominatim.openstreetmap.org/search/" + encodeURIComponent(raw_address) + "?format=json&bounded=1&viewbox=" + LargeLots.boundingBox['left'] + "," + LargeLots.boundingBox['top'] + "," + LargeLots.boundingBox['right'] + "," + LargeLots.boundingBox['bottom'] + "&json_callback=LargeLots.returnAddress";
      document.body.appendChild(s);
      //&bounded=1&viewbox=" + LargeLots.boundingBox['left'] + "," + LargeLots.boundingBox['top'] + "," + LargeLots.boundingBox['right'] + "," + LargeLots.boundingBox['bottom'] + "
    }
  },

  returnAddress: function (response){

    if(!response.length){
      $('#modalGeocode').modal('show');
      return;
    }

    var first = response[0];

    LargeLots.map.setView([first.lat, first.lon], 17);

    if (LargeLots.marker)
      LargeLots.map.removeLayer( LargeLots.marker );

    var defaultIcon = L.icon({
        iconUrl: 'images/marker-icon.png',
        shadowUrl: 'images/marker-shadow.png',
        shadowAnchor: [0, 0]
      });
    LargeLots.marker = L.marker([first.lat, first.lon]).addTo(LargeLots.map);
  },

  //converts a slug or query string in to readable text
  convertToPlainString: function (text) {
    if (text == undefined) return '';
    return decodeURIComponent(text);
  },

  addCommas: function(nStr) {
    nStr += '';
    x = nStr.split('.');
    x1 = x[0];
    x2 = x.length > 1 ? '.' + x[1] : '';
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
      x1 = x1.replace(rgx, '$1' + ',' + '$2');
    }
    return x1 + x2;
  }

}
