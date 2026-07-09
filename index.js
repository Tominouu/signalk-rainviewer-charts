const https = require('https');
const http = require('http');

const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const RESOURCE_ID = 'rainviewer-radar';
const CHART_NAME = 'RainViewer Radar';
const MAX_ZOOM = 7;
const BOUNDS = [-180, -80, 180, 80];
const DEFAULT_OPACITY = 0.65;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse JSON'));
          }
        });
      })
      .on('error', reject);
  });
}

function findLatestFrame(data) {
  const frames = data?.radar?.past;
  if (!frames || frames.length === 0) {
    return null;
  }
  return frames.reduce((a, b) => (a.time > b.time ? a : b));
}

function buildTileUrl(host, path) {
  return `${host}${path}/256/{z}/{x}/{y}/7/1_1.png`;
}

function createProvider(tileUrlRef) {
  return {
    type: 'charts',
    methods: {
      async listResources() {
        const url = tileUrlRef.current;
        if (!url) {
          return {};
        }
        return {
          [RESOURCE_ID]: {
            name: CHART_NAME,
            identifier: RESOURCE_ID,
            description: 'Live weather radar overlay from RainViewer',
            url,
            minzoom: 0,
            maxzoom: MAX_ZOOM,
            bounds: BOUNDS,
            defaultOpacity: DEFAULT_OPACITY
          }
        };
      },
      async getResource(id) {
        if (id === RESOURCE_ID) {
          const url = tileUrlRef.current;
          if (!url) {
            throw new Error('RainViewer data not yet available');
          }
          return {
            name: CHART_NAME,
            identifier: RESOURCE_ID,
            description: 'Live weather radar overlay from RainViewer',
            url,
            minzoom: 0,
            maxzoom: MAX_ZOOM,
            bounds: BOUNDS,
            defaultOpacity: DEFAULT_OPACITY
          };
        }
        throw new Error(`Resource ${id} not found`);
      },
      async setResource() {
        throw new Error('RainViewer charts are read-only');
      },
      async deleteResource() {
        throw new Error('RainViewer charts are read-only');
      }
    }
  };
}

function signalkRainViewerPlugin(app) {
  const tileUrlRef = { current: null };
  let refreshTimer = null;

  async function refreshTileUrl() {
    try {
      const data = await fetchJson(RAINVIEWER_URL);
      const frame = findLatestFrame(data);
      if (!frame) {
        app.debug('No RainViewer radar frames available');
        return;
      }
      tileUrlRef.current = buildTileUrl(data.host, frame.path);
      app.debug(`RainViewer tile URL updated`);
    } catch (err) {
      app.error(`Failed to fetch RainViewer data: ${err.message}`);
    }
  }

  const plugin = {
    id: 'signalk-rainviewer-charts',
    name: 'RainViewer Weather Radar',
    description: 'Provides live RainViewer weather radar tiles as chart resources'
  };

  plugin.refreshTileUrl = refreshTileUrl;

  plugin.schema = {
    type: 'object',
    properties: {
      opacity: {
        type: 'number',
        default: DEFAULT_OPACITY,
        title: 'Default tile opacity'
      },
      refreshInterval: {
        type: 'number',
        default: REFRESH_INTERVAL_MS / 1000 / 60,
        title: 'Refresh interval (minutes)'
      }
    }
  };

  plugin.start = function (options) {
    app.debug('Starting RainViewer charts plugin');
    refreshTileUrl().then(() => {
      try {
        app.resourcesApi.register('signalk-rainviewer-charts', createProvider(tileUrlRef));
        app.debug('RainViewer chart provider registered');
      } catch (e) {
        app.error(`Failed to register chart provider: ${e.message}`);
      }
    }).catch((err) => {
      app.error(`Initial RainViewer fetch failed: ${err.message}`);
    });
    refreshTimer = setInterval(refreshTileUrl, REFRESH_INTERVAL_MS);
  };

  plugin.stop = function () {
    app.debug('Stopping RainViewer charts plugin');
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    try {
      app.resourcesApi.unRegister('signalk-rainviewer-charts');
    } catch (e) {
      app.debug('Error unregistering provider');
    }
  };

  return plugin;
}

module.exports = signalkRainViewerPlugin;
module.exports.findLatestFrame = findLatestFrame;
module.exports.buildTileUrl = buildTileUrl;
module.exports.createProvider = createProvider;
module.exports.fetchJson = fetchJson;
