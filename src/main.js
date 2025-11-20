import './style.css'

const START_DATE = new Date('2015-11-01');
const END_DATE = new Date('2025-01-01');
const TOTAL_MONTHS = 110;

let state = {
  isPlaying: false,
  currentMonthIndex: 0, 
  showAll: false, 
  heatmapEnabled: false,
  hotspotsEnabled: false, 
  data: null 
};

let animationInterval;

const EHSA_COLOR_MAP = {
    'New Hot Spot': '#D84315', 
    'Consecutive Hot Spot': '#E57373',
    'Intensifying Hot Spot': '#B71C1C',
    'Persistent Hot Spot': '#610000',
    'Sporadic Hot Spot': '#D7CCC8',
    
    'Sporadic Cold Spot': '#CFD8DC',
    'Oscillating Cold Spot': '#E1F5FE',

    'No Pattern Detected': '#374151',
};

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', 
  center: [118.0, -2.5], 
  zoom: 4,
  attributionControl: false
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

map.on('load', () => {
  console.log("Map loaded. Fetching data...");
  
  Papa.parse('EQ_2015_2025_25.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function(results) {
      processData(results.data);
    },
  });

  loadEmergingHotspots();
  generateHotspotLegend();

  document.getElementById('toggle-hotspots').checked = state.hotspotsEnabled;
});

function processData(csvData) {
  const features = csvData
    .filter(row => row.latitude && row.longitude && row.time)
    .map(row => {
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [row.longitude, row.latitude]
        },
        properties: {
          mag: row.mag || 0,
          depth: row.depth || 0,
          time: new Date(row.time).getTime(), 
          place: row.place
        }
      };
    });

  state.data = { type: 'FeatureCollection', features: features };
  initLayers();
  updateUI();
}

function generateHotspotColorMatch() {
    const matchExpression = ['match', ['get', 'PATTERN']];
    for (const [pattern, color] of Object.entries(EHSA_COLOR_MAP)) {
        matchExpression.push(pattern, color);
    }
    matchExpression.push('#4B5563'); 
    return matchExpression;
}

function loadEmergingHotspots() {
  fetch('emerging_hotspots.geojson')
    .then(res => {
        if(!res.ok) throw new Error("No hotspot file");
        return res.json();
    })
    .then(geojson => {
        map.addSource('hotspots-source', { type: 'geojson', data: geojson });
        
        const fillPattern = generateHotspotColorMatch();

        map.addLayer({
            'id': 'hotspots-layer',
            'type': 'fill',
            'source': 'hotspots-source',
            'layout': { 'visibility': state.hotspotsEnabled ? 'visible' : 'none' }, 
            'paint': {
                'fill-color': fillPattern,
                'fill-opacity': 0.6,
                'fill-outline-color': '#ffffff'
            }
        });
    })
    .catch(e => console.log("Hotspot layer waiting for file...", e));
}

function generateHotspotLegend() {
    const container = document.getElementById('hotspot-legend-items');
    container.innerHTML = ''; 

    const patterns = Object.entries(EHSA_COLOR_MAP);
    
    patterns.forEach(([pattern, color]) => {
        const item = document.createElement('div');
        item.className = 'flex items-center space-x-2 text-xs py-0.5';
        item.innerHTML = `
            <div class="w-3 h-3 rounded-sm border border-slate-400" style="background-color: ${color};"></div>
            <span>${pattern}</span>
        `;
        container.appendChild(item);
    });
}

function initLayers() {
  map.addSource('earthquakes', {
    type: 'geojson',
    data: state.data
  });

  map.addLayer({
    id: 'eq-points',
    type: 'circle',
    source: 'earthquakes',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        4, 2,
        10, ['interpolate', ['linear'], ['get', 'mag'], 3, 4, 8, 20]
      ],
      'circle-color': [
        'interpolate', ['linear'], ['get', 'mag'],
        3, '#fef0d9',
        5, '#fdcc8a',
        6, '#fc8d59',
        7, '#d7301f'
      ],
      'circle-opacity': 0.7,
      'circle-stroke-width': 0,
    }
  });

  map.addLayer({
    id: 'eq-heatmap',
    type: 'heatmap',
    source: 'earthquakes',
    layout: { visibility: 'none' }, 
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(33,102,172,0)',
        0.2, 'rgb(103,169,207)',
        0.4, 'rgb(209,229,240)',
        0.6, 'rgb(253,219,199)',
        0.8, 'rgb(239,138,98)',
        1, 'rgb(178,24,43)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
      'heatmap-opacity': 0.8
    }
  });

  filterDataByDate();
}


function getMonthRange(monthIndex) {
    const start = new Date(START_DATE);
    start.setMonth(start.getMonth() + monthIndex);
    
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    return { start: start.getTime(), end: end.getTime(), label: start.toLocaleString('default', { month: 'long', year: 'numeric' }) };
}

function filterDataByDate() {
    if (!map.getSource('earthquakes')) return;

    if (state.showAll) {
        map.setFilter('eq-points', null);
        map.setFilter('eq-heatmap', null);
        
        updateStats(state.data.features);
        document.getElementById('current-date-display').innerText = "2015 - 2025 (All)";
    } else {
        const { start, end, label } = getMonthRange(state.currentMonthIndex);
        
        const filter = ['all', 
            ['>=', 'time', start],
            ['<', 'time', end]
        ];

        map.setFilter('eq-points', filter);
        map.setFilter('eq-heatmap', filter);
        
        document.getElementById('current-date-display').innerText = label;

        const visibleFeatures = state.data.features.filter(f => f.properties.time >= start && f.properties.time < end);
        updateStats(visibleFeatures);
    }
}

function updateStats(features) {
    const count = features.length;
    const maxMag = features.length > 0 ? Math.max(...features.map(f => f.properties.mag)).toFixed(1) : 0;
    
    document.getElementById('stat-count').innerText = count.toLocaleString();
    document.getElementById('stat-max-mag').innerText = maxMag;
}

function updateUI() {
}

const slider = document.getElementById('time-slider');
slider.addEventListener('input', (e) => {
    if (state.showAll) return;
    state.currentMonthIndex = parseInt(e.target.value);
    filterDataByDate();
});

document.getElementById('btn-monthly').addEventListener('click', () => {
    state.showAll = false;
    document.getElementById('btn-monthly').classList.replace('bg-slate-700', 'bg-gfw-accent'); // Active style
    document.getElementById('btn-monthly').classList.add('text-white');
    
    document.getElementById('btn-all').classList.remove('bg-slate-700', 'text-white');
    document.getElementById('btn-all').classList.add('text-slate-400');
    
    document.getElementById('timeline-container').classList.remove('opacity-50', 'pointer-events-none');
    filterDataByDate();
});

document.getElementById('btn-all').addEventListener('click', () => {
    state.showAll = true;
    pauseAnimation();
    
    document.getElementById('btn-all').classList.add('bg-slate-700', 'text-white');
    document.getElementById('btn-monthly').classList.remove('bg-gfw-accent', 'text-white');
    
    document.getElementById('timeline-container').classList.add('opacity-50', 'pointer-events-none');
    filterDataByDate();
});

document.getElementById('toggle-heatmap').addEventListener('change', (e) => {
    const visibility = e.target.checked ? 'visible' : 'none';
    
    if (map.getLayer('eq-heatmap')) {
        map.setLayoutProperty('eq-heatmap', 'visibility', visibility);
    }
});

document.getElementById('toggle-hotspots').addEventListener('change', (e) => {
    const visibility = e.target.checked ? 'visible' : 'none';
    state.hotspotsEnabled = e.target.checked;
    if (map.getLayer('hotspots-layer')) {
        map.setLayoutProperty('hotspots-layer', 'visibility', visibility);
        document.getElementById('hotspot-legend-container').classList.toggle('hidden', !e.target.checked);
    } else if (e.target.checked) {
        console.error("Error: Hotspot layer not loaded. Ensure 'emerging_hotspots.geojson' is in the project folder!");
        alert("Error loading layer. Ensure 'emerging_hotspots.geojson' is in the project folder!");
    }
});

document.getElementById('hotspot-legend-container').classList.toggle('hidden', !state.hotspotsEnabled);

const btnPlay = document.getElementById('play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

btnPlay.addEventListener('click', () => {
    if (state.isPlaying) pauseAnimation();
    else startAnimation();
});

function startAnimation() {
    state.isPlaying = true;
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');

    animationInterval = setInterval(() => {
        state.currentMonthIndex++;
        if (state.currentMonthIndex > TOTAL_MONTHS) state.currentMonthIndex = 0;
        
        slider.value = state.currentMonthIndex;
        filterDataByDate();
    }, 800);
}

function pauseAnimation() {
    state.isPlaying = false;
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    clearInterval(animationInterval);
}

const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebar-close');
const sidebarToggle = document.getElementById('sidebar-toggle');
const timeline = document.getElementById('timeline-container');

sidebarClose.addEventListener('click', () => {
    sidebar.classList.add('-translate-x-full');
    sidebarToggle.classList.remove('hidden');
    timeline.style.paddingLeft = '0';
});

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.remove('-translate-x-full');
    sidebarToggle.classList.add('hidden');
    timeline.style.paddingLeft = '20rem';
});