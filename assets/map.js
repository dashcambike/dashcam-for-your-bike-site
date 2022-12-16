/*eslint no-undef: "error"*/
/*
Change to point to the Staging URL if needed.
CDN helps JSONs load faster, automatically resizes images to reduce bandwidth, and costs less than hitting firebase endpoints.
Note: these caches will not refresh with a browser hard refresh; if you update the geojson and need to see
those updates reflected live, use incognito or change currentUTCHourForCacheControl in the URL
*/
//const cdnUrl = "https://dashcamstaging.b-cdn.net/o/";
const cdnUrl = "https://dashcamprod.b-cdn.net/o/";

/**
  * Contains both filtering data, and requested colors
  * for each data type. Note: the requested colors are ignored currently. (TODO)
  */
const hazardTypes = {
    "Car parked in bike lane": {
        hazardIcon: 'car-15',
        hazardColor: "rgb(123, 0, 48)",
        isVisible: true,
    },
    "Obstruction in bike lane": {
        hazardIcon: 'information-15',
        hazardColor: "rgb(54, 0, 123)",
        isVisible: true,
    },
    "Dangerous driving": {
        hazardIcon: 'fire-station-15',
        hazardColor: "rgb(189, 0, 78)",
        isVisible: true,
    },
    "Pothole": {
        hazardIcon: 'information-15',
        hazardColor: "rgb(33, 83, 65)",
        isVisible: true,
    },
    "Other": {
        /* also used for clusters */ 
        hazardIcon: 'information-15',
        hazardColor: "rgb(123, 0, 48)",
        isVisible: true,
    }
};

/**
  * Data reflecting the state of UI filter options:
  * Are we filtering by a specific hour or weekday/weekend?
  * If so, what?
  */
let filteredTime = {
    'doSpecifyHour': false,
    'hourSpecified': -1,

    'doSpecifyDayOfWeek': false,
    'dayOfWeekSpecified': "all", // or "weekend", or "weekday"

    'doSelectRange': false,
    'startDate': new Date(),
    'endDate': new Date(),
};

/**
  * The most-recently-opened mapboxGL Popup
  */
let lastOpenedPopup = null;

function fixPopupPositionAfterLoad()
{
    if (lastOpenedPopup == null)
    {
        return;
    }

    lastOpenedPopup.setLngLat(lastOpenedPopup.getLngLat());
}

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


    let popupBody = "<div class=\"popup-body\">";
    popupBody += `<p class="popup-title"><a href="${tweetURL}" target="_blank">${hazardName}</a></p>`;
    popupBody += `<p>${address}<br/>On ${dateStr}</p>`;
    if (filepath.endsWith(".mp4"))
    {
        popupBody += `<p><video width="100%" controls autoplay><source src="${url}" type="video/mp4"></video></p>`;
    }
    else if (filepath.endsWith(".png"))
    {
        popupBody += `<p><a href="${tweetURL}" target="_blank"><img class="image-loading" src="${url}" width="100%" onload="fixPopupPositionAfterLoad()"/></a></p>`;
    }
    else
    {
        console.log("Invalid image");
    }
    popupBody += "</div>";
    return popupBody;
}

function getFilterForHazardTypeAndUpdateUI()
{
    // If the "other" category is visible:
    //      match ALL '!=' filters
    // Otherwise:
    //      match ANY '==' filters
    const isOtherVisible = hazardTypes["Other"].isVisible;
    let filters = isOtherVisible ? ['all'] : ["any"];
    
    let numVisible = 0;
    let lastSeenVisible = "";

    for (const [hazardName, hazardTypeData] of Object.entries(hazardTypes)) {
        if (hazardTypeData.isVisible)
        {
            ++numVisible;
            lastSeenVisible = hazardName;
        }
        if (hazardName == "Other")
        {
            continue;
        }

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

    if (numVisible == Object.keys(hazardTypes).length)
    {
        document.getElementById('active-hazard-types').innerText = "All hazard types";
    }
    else if (numVisible == 1)
    {
        document.getElementById('active-hazard-types').innerText = lastSeenVisible;
    }
    else
    {
        document.getElementById('active-hazard-types').innerText = numVisible + " hazard types";
    }

    if (filters.length == 1)
    {
        return null;
    }

    return filters;
}

function UpdateHeaderTextForFilteredDateTime()
{
    let text;
    if (filteredTime.doSpecifyHour)
    {
        const hour = filteredTime.hourSpecified * 1; // convert to int?

        // converting 0-23 hour to AMPM format
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 ? hour % 12 : 12;

        text = "At " + hour12 + ampm;
    }
    else
    {
        text = "Any time"
    }

    if (filteredTime.doSelectRange)
    {
        text += " in range";
    }

    document.getElementById('active-hour').innerText = text;
}

function getFilterForTimeAndUpdateUI()
{
    // Set slider interactivity
    document.getElementById('timeslider').disabled = !filteredTime.doSpecifyHour;

    if (!filteredTime.doSpecifyHour)
    {
        return null;
    }

    const hour = filteredTime.hourSpecified * 1; // convert to int?
    return ['==', ['number', ['get', 'Hour']], hour];
}

function getFilterForDayOfWeek()
{
    if (!filteredTime.doSpecifyDayOfWeek)
    {
        return null;
    }

    if (filteredTime.dayOfWeekSpecified == "weekend")
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

function getFilterForRangeAndUpdateUI()
{
    // Set interactivity
    document.getElementById('startDate').disabled = !filteredTime.doSelectRange;
    document.getElementById('endDate').disabled = !filteredTime.doSelectRange;

    if (!filteredTime.doSelectRange)
    {
        return null;
    }

    let startTimestamp = filteredTime.startDate;
    let endTimestamp = filteredTime.endDate;

    return ["all",
                ['>=', ['number', ['get', 'Timestamp']], startTimestamp.getTime() / 1000],
                ['<=', ['number', ['get', 'Timestamp']], endTimestamp.getTime() / 1000]
            ];
}

function applyFilter(map) {
    let filters = [
        getFilterForHazardTypeAndUpdateUI(),
        getFilterForTimeAndUpdateUI(),
        getFilterForDayOfWeek(),
        getFilterForRangeAndUpdateUI()
    ];
    UpdateHeaderTextForFilteredDateTime();

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

// doChangeStartDateIfInvalidRange: true means the start date will move if the range is invalid;
//                                  false means the end date will move.
function makeDateRangeValidAndSetFilteredTime(doChangeStartDateIfInvalidRange)
{
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    if (!endDate.value)
    {
        endDate.valueAsDate = new Date();
    }
    if (!startDate.value)
    {
        startDate.valueAsDate = new Date();
    }
    if (startDate.value >= endDate.value)
    {
        if (doChangeStartDateIfInvalidRange)
        {
            const fixedDate = new Date(endDate.valueAsDate);
            fixedDate.setDate(endDate.valueAsDate.getDate() - 7);
            startDate.valueAsDate = fixedDate;
        }
        else
        {
            const fixedDate = new Date(startDate.valueAsDate);
            fixedDate.setDate(startDate.valueAsDate.getDate() + 7);
            endDate.valueAsDate = fixedDate;
        }
    }

    filteredTime.startDate = startDate.valueAsDate;
    filteredTime.endDate = endDate.valueAsDate;
}

function buildMap() {
    mapboxgl.accessToken = 'pk.eyJ1IjoiZGFzaGNhbWJpa2UiLCJhIjoiY2w3cnozZDN0MGp5cTNubzAwbHF0NGIyaCJ9.PKvOiY3srXhJhl-cp17-Og';
    mapboxgl.clearStorage();

    // A terribly hacky way of caching for at most one hour (while images cache for 7 days)
    const date = new Date();
    const currentUTCHourForCacheControl = date.getDate() + "-" + date.getUTCHours();

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
                'maxzoom': 18,
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
                        15, 1,
                        18, 0,
                    ]
                }
            },
            'waterway-label'
        );

        let iconLayoutProps = [ 'match', ['get', 'HazardName'] ];
        let iconPaintProps = [ 'match', ['get', 'HazardName'] ];
        for (const [hazardName, hazardTypeData] of Object.entries(hazardTypes)) {
            if (hazardName == "Other") continue;
            iconLayoutProps.push(hazardName);
            iconLayoutProps.push(hazardTypeData.hazardIcon);

            iconPaintProps.push(hazardName);
            iconPaintProps.push(hazardTypeData.hazardColor);
        }
        iconLayoutProps.push(hazardTypes['Other'].hazardIcon);
        iconPaintProps.push(hazardTypes['Other'].hazardColor);

        map.addLayer(
            {
                'id': 'hazards-point',
                'type': 'symbol',
                'source': 'hazards',
                'minzoom': 12,
                'layout': {
                    'icon-image': iconLayoutProps,
                    'icon-allow-overlap': true,
                    'icon-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        12,
                        1,
                        20,
                        3
                    ],
                },
                'paint': {
                    // Transition from heatmap by zoom level
                    'icon-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        12,
                        0.5,
                        13,
                        1
                    ],
                    'icon-halo-color': iconPaintProps
                }
            },
            'waterway-label'
        );

        const filterGroupType = document.getElementById('filter-details-hazard-type');
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

            // Handle toggle of hazard types
            input.addEventListener('change', (e) => {
                hazardTypes[hazardName].isVisible = e.target.checked;
                applyFilter(map);
            });
        }

        // Handle Hour slider
        document.getElementById('timeslider').addEventListener('input', (event) => {
            filteredTime.hourSpecified = event.target.value;
            applyFilter(map);
        });

        // Handle Hour enabled/disabled toggle
        document.getElementById('filter-details-hour').addEventListener('change', (event) => {
            const useSingleHour = event.target.value;
            if (useSingleHour != 'specifichour' && useSingleHour != 'anytime')
            {
                // event is a mouse up or something
                return;
            }
            filteredTime.doSpecifyHour = useSingleHour == 'specifichour'
            filteredTime.hourSpecified = document.getElementById('timeslider').value;
            applyFilter(map);
        });

        // Handle Range enable/disable toggle
        document.getElementById('filter-details-range').addEventListener('change', (event) => {
            const useRange = event.target.value;
            if (useRange != 'alldays' && useRange != 'specificrange')
            {
                // event is a mouse up or something
                return;
            }
            filteredTime.doSelectRange = useRange == 'specificrange'

            makeDateRangeValidAndSetFilteredTime();
            applyFilter(map);
        });
        
        // Handle range start date
        document.getElementById('startDate').addEventListener('change', (event) => {
            makeDateRangeValidAndSetFilteredTime(false);
            applyFilter(map);
        });

        // Handle range end date
        document.getElementById('endDate').addEventListener('change', (event) => {
            makeDateRangeValidAndSetFilteredTime(true);
            applyFilter(map);
        });

        // Handle Day of Week toggle
        document.getElementById('filter-details-day-of-week').addEventListener('change', (event) => {
            const day = event.target.value;
            filteredTime.doSpecifyDayOfWeek = day != 'all';
            filteredTime.dayOfWeekSpecified = day;

            if (!filteredTime.doSpecifyDayOfWeek)
            {
                text = "Any day of week";
            }
            else
            {
                text = "Only " + day + "s";
            }
            document.getElementById('active-day-of-week').innerText = text;

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
         
        const options = {}
        if (Math.min(window.screen.width, window.screen.height) < 768)
        {
            // Center the map on mobile / small screens to ensure popup is visible
            const verticalShift = window.innerHeight * 0.1;
            map.flyTo({center: coordinates, padding: {top: 0, bottom:0, left: 0, right: 0}});
            options['anchor'] = 'center';
        }
        lastOpenedPopup = new mapboxgl.Popup(options)
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

function toggleFilter(myDivSuffix) {
    const detailsDivBaseName = 'filter-details-';
    const chevronDivBaseName = 'chevron-';
    const validDivs = ['hour', 'day-of-week', 'hazard-type'];

    const myDetailsDiv = detailsDivBaseName + myDivSuffix;
    const myChevronDiv = chevronDivBaseName + myDivSuffix;
    const alreadyOpen = document.getElementById(myDetailsDiv).style.display == 'block';

    for (const divSuffix of validDivs)
    {
        document.getElementById(detailsDivBaseName + divSuffix).style.display = 'none';
        document.getElementById(chevronDivBaseName + divSuffix).classList.remove('fa-circle-chevron-down');
        document.getElementById(chevronDivBaseName + myDivSuffix).classList.add('fa-circle-chevron-right');
    }

    if (!alreadyOpen)
    {
        document.getElementById(myDetailsDiv).style.display = 'block';
        document.getElementById(myChevronDiv).classList.add('fa-circle-chevron-down');
    }
}

buildMap();
