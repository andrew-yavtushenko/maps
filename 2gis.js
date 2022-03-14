var myMap;
let currentPointType = 'human';

const myMarkers = [];
const DEFAULT_BEAM_COLOR = '#3388ff';
const DEFAULT_DISTANCE = 500;
let MAX_LAT = 0;
let MAX_LONG = 0;

const normalizeAngle = (angle) => {
  if (angle < 0) {
    return angle + 360;
  }
  return angle
}

const getTriangleCoordinates = (lat, long, angle, dist = DEFAULT_DISTANCE, antena_angle = 110) => {

  const points = new Array();

  if (angle == 'a' || angle == 'A') {
    angle = 0
    antena_angle = 360
  } else {
    points.push([lat, long]);
  }

  for (let calculated_antena = 0 - antena_angle / 2; calculated_antena <= antena_angle / 2; calculated_antena += 5) {
    points.push([lat + dist * Math.cos(normalizeAngle(angle + calculated_antena) * Math.PI / 180) / (6371200 * Math.PI / 180),
      long + dist * Math.sin(normalizeAngle(angle + calculated_antena) * Math.PI / 180) / Math.cos(lat * Math.PI / 180) / (6371200 * Math.PI / 180)
    ]);
  }

  return points;
}


const initButtons = () => {
  Array.from(document.querySelectorAll('#points__select button')).forEach((button) => {
      button.addEventListener('click', (event) => {
        currentPointType = button.id;
        document.querySelector('#points__select').setAttribute('data-current-mode', button.id)
      })
  })
}
const putBaseStationPoint = (point, pointId) => {
  const color = ('color' in point) ? point.color : DEFAULT_BEAM_COLOR;
  const altText = ('text' in point) ? point.text : '';
  const wholetext = `<b>CellID: ${ pointId } <\/b><br>${ altText}<br> Координати ${point.lat}, ${point.long}`;
  const distance = ('distance' in point) ? point.distance : DEFAULT_DISTANCE;

  DG.marker([point.lat, point.long], {
    icon: DG.icon({
        iconUrl: 'signal.png',
        iconSize: [64, 64],
    })
  }).addTo(myMap).bindTooltip(wholetext, {
    permanent: true
  }).openTooltip().addEventListener('click', (e) => {
    e.target.toggleTooltip();
  });
  const poly = DG.polygon(getTriangleCoordinates(point.lat, point.long, point.angle, distance), {
    color: color
  }).addTo(myMap).bindPopup(wholetext);
  poly.lat = point.lat
  poly.long = point.long
  poly.angle = point.angle
  poly.distance = distance
  poly.on('click', (e) => {
    let new_distance = poly.distance + 250;
    if (new_distance > 5000) {
      new_distance = DEFAULT_DISTANCE;
    }
    poly.setLatLngs(getTriangleCoordinates(poly.lat, poly.long, poly.angle, new_distance));
    poly.distance = new_distance
  });
}

const putAuxPoint = (point, pointId) => {
  var altText = ('text' in point) ? point.text : '';
  DG.marker([point.lat, point.long], {
    icon: getIconForAuxPoint(point.type),
    pointId: pointId,
  }).addTo(myMap).bindTooltip(altText, {
    permanent: true,
    direction: 'right',
    offset: DG.point(16, 0)
  }).openTooltip().addEventListener('click', onAuxPointClick);
}

const getIconForAuxPoint = (type) => {
  switch (type) {
    case 'catch':
    case 'car':
      return L.divIcon({html: '&#x1F697;', iconSize: [32, 32]});
      break;
    case 'catch2':
    case 'home':
      return L.divIcon({html: '&#x11F3E0;', iconSize: [32, 32]});
      break;
    case 'tank':
      return L.divIcon({html: '&#x1F680;', iconSize: [32, 32]});
      break;
    case 'human':
      return L.divIcon({html: '&#x1F977;', iconSize: [32, 32]});
      break;
    default:
      return L.divIcon({html: '&#x1F4CC;', iconSize: [32, 32]});
      break;
  }
}

const onAuxPointClick = (e) => {
  if (currentPointType === 'remove') {
    e.target.remove();
    removePointFromUrl(e.target.options.pointId);
  } else {
    e.target.toggleTooltip();
  }
}

const addPointToUrl = (point, pointId) => {
  let input = location.hash.substr(1);
  let wholeSettings = decodeURIComponent(input);
  const points = JSON.parse(wholeSettings);
  points[pointId] = point;
  location.hash = encodeURIComponent(JSON.stringify(points));
}

const removePointFromUrl = (pointId) => {
  let input = location.hash.substr(1);
  let wholeSettings = decodeURIComponent(input);
  const points = JSON.parse(wholeSettings);
  delete points[pointId];
  location.hash = encodeURIComponent(JSON.stringify(points));
}

const fitMapToBounds = (map) => {
  const validPoints = Object.values(map._targets).filter(point => point.getLatLng && point.getLatLng());
  const group = L.featureGroup(validPoints);
  const bounds = group.getBounds();
  map.fitBounds(bounds);
}

const initAll = () => {
    // Добавил возможность добавлять еще один тип обьектов - catch
    // О том что это отдельный тип говорит поле type
    // Название обьекта (anything) игнорируется
    // В поле text надо добавлять сразу текст в html
    // Пример:
    // "anything": {"type": "catch", "lat": 49.98572159,"long": 36.23633359, "text": "<b>IMEI: XXXXXX<br>IMSI: XXXXX<br>Rx\\Tx: -110/-110<br>Дата: 2011-11-11<br>Час: 26:28:29</b>"}}


    // Полный пример
    // kaidannik.com/map.html#{"53007773": {"lac": 10035,"lat": 49.98572159,"long": 36.25222397,"angle": 310, "distance":1000 },"53005073": {"lac": 10035,"lat": 49.99861145,"long": 36.23333359,"angle": 310, "color":"#e00201", "text": "VooDaFoone or any text you want to add"},"anything": {"type": "catch", "lat": 49.98572159,"long": 36.23633359, "text": "<b>IMEI: XXXXXX<br>IMSI: XXXXX<br>Rx\\Tx: -110/-110<br>Дата: 2011-11-11<br>Час: 26:28:29</b>"}}


    let input = location.hash.substr(1);
    let wholeSettings = decodeURIComponent(input);
    const points = JSON.parse(wholeSettings);

    // Определяем зону видимости
    Object.values(points).forEach((point) => {
      if (MAX_LAT > point.lat || MAX_LAT == 0) {
        MAX_LAT = point.lat;
      }
      if (MAX_LONG > point.long || MAX_LONG == 0) {
        MAX_LONG = point.long;
      }
    });

    const initMap = () => {
      myMap = DG.map('mapid', {
        center: [MAX_LAT, MAX_LONG],
        zoom: 13,
      });

      DG.control.ruler().addTo(myMap);
      DG.control.location().addTo(myMap);
      DG.control.traffic().addTo(myMap);

      myMap.on('click', (e) => {
        const type = currentPointType === 'remove' ? 'human' : currentPointType;
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        const pointId = `${type}_${lat}_${lng}`;
        const point = {
          lat: lat,
          long: lng,
          text: `GPS: ${lat}, ${lng}`,
          type
        };
        putAuxPoint(point, pointId)
        addPointToUrl(point, pointId);
      });

      Object.keys(points).forEach((pointId) => {
        const point = points[pointId];
        const pointType = point.type || 'bs';
        if (pointType == 'bs') {
          putBaseStationPoint(point, pointId);
        } else {
          putAuxPoint(point, pointId);
        }
      })

      fitMapToBounds(myMap)
    }

    // Icon
    DG.then(initMap);
    initButtons();
}
(initAll)();