/*
Change to point to the Staging URL if needed.
CDN helps JSONs load faster, automatically resizes images to reduce bandwidth, and costs less than hitting firebase endpoints.
Note: these caches will not refresh with a browser hard refresh; if you update the geojson and need to see
those updates reflected live, use incognito or change currentUTCHourForCacheControl in the URL
*/
const cdnUrl = "https://dashcambikeprod-1ced4.kxcdn.com/o/";
//const cdnUrl = "https://dashcambikestaging-1ced4.kxcdn.com/o/";

// Used for filtering and for consistent data
const hazardTypes = {
    "Car parked in bike lane": {
        "color": "rgb(123, 0, 48)",
        isVisible: true,
    },
    "Dangerous driving": {
        "color": "rgb(189, 0, 78)",
        isVisible: true,
    },
    "Obstruction in bike lane": {
        "color": "rgb(54, 0, 123)",
        isVisible: true,
    },
    "Pothole": {
        "color": "rgb(33, 83, 65)",
        isVisible: true,
    },
    "Other": {
        /* other or cluster: same as car parked in bike lane */ 
        "color": "rgb(123, 0, 48)",
        isVisible: true,
    }
};
let filteredHour = {
    'doSpecifyHour': false,
    'hourSpecified': -1,

    'doSpecifyDayOfWeek': false,
    'dayOfWeekSpecified': -1
};


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

function getFilterForHazardType()
{
    // If the "other" category is visible:
    //      match ALL '!=' filters
    // Otherwise:
    //      match ANY '==' filters
    const isOtherVisible = hazardTypes["Other"].isVisible;
    let filters = isOtherVisible ? ['all'] : ["any"];
    
    for (const [hazardName, hazardTypeData] of Object.entries(hazardTypes)) {
        if (hazardName == "Other") continue;

        if (!isOtherVisible && hazardTypeData.isVisible)
        {
            // If other is hidden, search only for those equal to the visible hazards
            filters.push(['==', ['string', ['get', 'HazardName']], hazardName]);
        }
        else if (isOtherVisible && !hazardTypeData.isVisible)
        {
            // If other is shown, remove anything not matching unchecked types
            filters.push(['!=', ['string', ['get', 'HazardName']], hazardName]);
        }
    }

    if (filters.length == 1)
    {
        return null;
    }

    return filters;
}

function getFilterForHourAndUpdateUI()
{
    // Set slider interactivity
    document.getElementById('timeslider').disabled = !filteredHour.doSpecifyHour;

    if (!filteredHour.doSpecifyHour)
    {
        document.getElementById('active-hour').innerText = "Time";
        return null;
    }

    const hour = filteredHour.hourSpecified * 1; // convert to int?

    const filters = ['==', ['number', ['get', 'Hour']], hour];

    // converting 0-23 hour to AMPM format
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 ? hour % 12 : 12;

    // update text in the UI
    document.getElementById('active-hour').innerText = "Hour: " + hour12 + ampm;

    return filters;
}

function getFilterForDayOfWeek()
{
    if (!filteredHour.doSpecifyDayOfWeek)
    {
        return null;
    }

    if (filteredHour.dayOfWeekSpecified == "weekend")
    {
        return ["any",
                    ['==', ['number', ['get', 'DayOfWeek']], 0],
                    ['==', ['number', ['get', 'DayOfWeek']], 6]
                ];
    }
    else
    {
        return ["all",
                    ['!=', ['number', ['get', 'DayOfWeek']], 0],
                    ['!=', ['number', ['get', 'DayOfWeek']], 6]
                ];
    }
}

function applyFilter(map) {
    let filters = [
        getFilterForHazardType(),
        getFilterForHourAndUpdateUI(),
        getFilterForDayOfWeek()
    ];

    // Remove unneeded filters
    filters = filters.filter(f => f != null);

    let finalFilter = null; // nb setFilter to null removes the filter
    if (filters.length == 1)
    {
        finalFilter = filters[0];
    }
    else if (filters.length > 1)
    {
        finalFilter = ['all'];
        for (const filter of filters)
        {
            finalFilter.push(filter);
        }
    }

    map.setFilter('hazards-point', finalFilter);
    map.setFilter('hazards-heatmap', finalFilter);
}

function buildMap() {
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
                'id': 'hazards-heatmap',
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
                        12, 15
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

        const filterGroupType = document.getElementById('filter-group-type');
        for (const [hazardName, hazardTypeData] of Object.entries(hazardTypes)) {
            const labelId = 'filter-' + hazardName;
            // Add checkbox and label elements for the layer.
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = labelId;
            input.checked = true;
            filterGroupType.appendChild(input);

            const label = document.createElement('label');
            label.textContent = hazardName;
            label.setAttribute('for', labelId);
            filterGroupType.appendChild(label);

            // When the checkbox changes, update the visibility of the layer.
            input.addEventListener('change', (e) => {
                hazardTypes[hazardName].isVisible = e.target.checked;
                applyFilter(map);
            });
        }

        const filterGroupTime = document.getElementById('filter-group-time');
        document.getElementById('timeslider').addEventListener('input', (event) => {
            filteredHour.hourSpecified = event.target.value;
            applyFilter(map);
        });
        document.getElementById('singlehourfilters').addEventListener('change', (event) => {
            const useSingleHour = event.target.value;
            filteredHour.doSpecifyHour = useSingleHour == 'specifichour'
            filteredHour.hourSpecified = document.getElementById('timeslider').value;
            applyFilter(map);
        });
        document.getElementById('dayofweekfilters').addEventListener('change', (event) => {
            const day = event.target.value;
            filteredHour.doSpecifyDayOfWeek = day != 'all';
            filteredHour.dayOfWeekSpecified = day;
            applyFilter(map);
        });
    });

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
}

buildMap();
