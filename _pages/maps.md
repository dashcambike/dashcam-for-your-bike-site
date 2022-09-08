---
layout: page
title: Pittsburgh Hazard Map
include_in_header: false
include_in_footer: false
order: 3
---

<h1>Pittsburgh Bicycle Hazard Map</h1>
Each of these reports has been sent to the City of Pittsburgh via 311.

<h1>Contribute to this map</h1>
1. Download our app for <a href="https://play.google.com/store/apps/details?id=com.dashcambike.dashcamapp">Android</a> or <a href="https://apps.apple.com/us/app/dashcam-for-your-bike/id1577996345?uo=4">iPhone</a> and record every ride.
2. When you encounter a hazard in Pittsburgh, tap the screen to add a marker.
3. When you finish your ride, return to the marker, hit Share, then hit Report To 311.
<a href="/311/">See detailed instructions here</a>.

Not in Pittsburgh? <a href="https://forms.gle/HHFisHhgsHxaMvFi8" target="_blank">Request this feature in your city</a>.

<div id="map"></div>

<div id="description">
<h1>Download Dashcam for your Bike</h1>
Turn your smartphone into a high-quality dashcam with our app, and report hazards to your city:
</div>

{% include downloadnow.html %}
 
<link href="https://api.mapbox.com/mapbox-gl-js/v2.10.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v2.10.0/mapbox-gl.js"></script>
<style>
    .container {
        max-width: 100vw;
    }
    #map {
        left: 0px;
        width: 100%;
        height: 700px;
    }
    .mapboxgl-popup
    {
        max-width: 500px;
        min-width: 300px;
        font: 12px/20px 'Helvetica Neue', Arial, Helvetica, sans-serif;
    }
    .mapboxgl-popup-content
    {
        min-height: 250px;
    }
    .popupTitle
    {
        font-weight: 600;
        font-size: 1.5em;
    }
    .mapboxgl-popup-close-button
    {
        font-size: 2em;
        margin-right: 5px;
    }
</style>

<script>
/*
Change to point to the Staging URL if needed.
CDN helps JSONs load faster, automatically resizes images to reduce bandwidth, and costs less than hitting firebase endpoints.
*/
const cdnUrl = "https://dashcambikeprod-1ced4.kxcdn.com/o/";
//const cdnUrl = "https://dashcambikestaging-1ced4.kxcdn.com/o/";

mapboxgl.accessToken = 'pk.eyJ1IjoiZGFzaGNhbWJpa2UiLCJhIjoiY2w3cnozZDN0MGp5cTNubzAwbHF0NGIyaCJ9.PKvOiY3srXhJhl-cp17-Og';
mapboxgl.clearStorage();

// A terribly hacky way of caching for at most one hour (while images cache for 7 days)
const currentUTCHourForCacheControl = (new Date()).getUTCHours();

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v10',
    center: [-79.968, 40.45],
    zoom: 12
});
 
map.on('style.load', () => {
map.setFog({});
});
 
map.on('load', () => {
    // Add a geojson point source.
    // Heatmap layers also work with a vector tile source.
    map.addSource('hazards', {
        'type': 'geojson',
        //'data': '/assets/hazardreports.geojson',
        'data': cdnUrl + 'GeoJsons%2Fpittsburgh.geojson?alt=media&utcHourForCacheControl=' + currentUTCHourForCacheControl,
        cluster: false,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50 // Radius of each cluster when clustering points (defaults to 50)
    });

    map.addLayer(
        {
            'id': 'hazards-heat',
            'type': 'heatmap',
            'source': 'hazards',
            'maxzoom': 15,
            'paint': {
                // Increase the heatmap color weight weight by zoom level
                // heatmap-intensity is a multiplier on top of heatmap-weight
                'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    9, 1,
                    13, 3
                ],
                // Color ramp for heatmap.  Domain is 0 (low) to 1 (high).
                // Begin color ramp at 0-stop with a 0-transparancy color
                // to create a blur-like effect.
                'heatmap-color': [
                    'interpolate',
                     ['linear'],
                     ['heatmap-density'],
                     0,
                     'rgba(33,102,172,0)',
                     0.2,
                     'rgb(103,169,207)',
                     0.4,
                     'rgb(209,229,240)',
                     0.6,
                     'rgb(253,219,199)',
                     0.8,
                     'rgb(239,138,98)',
                     1,
                     'rgb(178,24,43)'
                ],
                // Adjust the heatmap radius by zoom level
                'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 2,
                    9, 20
                ],
                // Transition from heatmap to circle layer by zoom level
                'heatmap-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    12, 1,
                    15, 0
                ]
            }
        },
        'waterway-label'
    );

    map.addLayer(
        {
            'id': 'hazards-point',
            'type': 'circle',
            'source': 'hazards',
            'minzoom': 7,
            'paint': {
                'circle-color': [
                    'match',
                    ['get', 'HazardName'],
                    "Car parked in bike lane",
                    'rgb(123, 0, 48)',
                    "Dangerous driving",
                    'rgb(189, 0, 78)',
                    "Obstruction in bike lane",
                    'rgb(54, 0, 123)',
                    "Pothole",
                    'rgb(33, 83, 65)',
                    /* other or cluster: same as car parked in bike lane */ 'rgb(123, 0, 48)'

                ],
                'circle-stroke-color': 'white',
                'circle-stroke-width': 1,
                // Transition from heatmap to circle layer by zoom level
                'circle-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7,
                    0,
                    8,
                    1
                ]
            }
        },
        'waterway-label'
    );
});

function makeDateString(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);

    // 12-hour format
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;

    // Leading zero for minutes < 10
    let minutes = date.getMinutes();
    if (minutes < 10)
    {
        minutes = '0' + minutes;
    }

    // Day of week
    const weekdayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const day = weekdayNames[date.getDay()];

    // Month with name
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = monthNames[date.getMonth()];


    return `${day}, ${month} ${date.getDate()}, ${date.getFullYear()} at ${hours}:${minutes} ${ampm}`;
}

function getDescriptionFor(featureProperties) {
console.log(featureProperties)
    const filepath = featureProperties.ImageOrVideoFilepath;
    const url = cdnUrl + filepath + "?alt=media&width=400";
    const hazardName = featureProperties.HazardName;
    const tweetURL = featureProperties.TweetURL != undefined ? featureProperties.TweetURL : "https://twitter.com/dashcam311";
    const address = featureProperties.ApproxAddress != undefined ? featureProperties.ApproxAddress : "";
    const dateStr = makeDateString(featureProperties.Timestamp);


    let heading = `<p class="popupTitle"><a href=\"${tweetURL}\" target=\"_blank\">${hazardName}</a></p>`;
    heading += `<p>${address}<br/>On ${dateStr}</p>`
    if (filepath.endsWith(".mp4"))
    {
        return heading + `<p><video width=\"100%\" controls autoplay><source src=\"${url}\" type=\"video/mp4\"/></video></p>`;
    }
    else if (filepath.endsWith(".png"))
    {
        return heading + `<p><a href=\"${tweetURL}\" target=\"_blank\"><img src=\"${url}\" width="100%"/></a></p>`;
    }
    else
    {
        console.log("Invalid image");
        return heading;
    }
}


// When a click event occurs on a feature in the places layer, open a popup at the
// location of the feature, with description HTML from its properties.
map.on('click', 'hazards-point', (e) => {
    // Copy coordinates array.
    const coordinates = e.features[0].geometry.coordinates.slice();
    const description = getDescriptionFor(e.features[0].properties);
     
    // Ensure that if the map is zoomed out such that multiple
    // copies of the feature are visible, the popup appears
    // over the copy being pointed to.
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }
     
    new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map);
});
     
// Change the cursor to a pointer when the mouse is over the places layer.
map.on('mouseenter', 'hazards-point', () => {
    map.getCanvas().style.cursor = 'pointer';
});
     
// Change it back to a pointer when it leaves.
map.on('mouseleave', 'hazards-point', () => {
    map.getCanvas().style.cursor = '';
});
</script>
