const { describe, it, mock } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const https = require('https');
const plugin = require('../index');

function makeApp() {
  const calls = { debug: [], error: [] };
  return {
    debug: (...args) => calls.debug.push(args),
    error: (...args) => calls.error.push(args),
    resourcesApi: {
      register: mock.fn(),
      unRegister: mock.fn(),
    },
    _calls: calls,
  };
}

describe('signalkRainViewerPlugin', () => {
  it('should return a plugin object with id, name, description', () => {
    const app = makeApp();
    const p = plugin(app);
    assert.ok(p.id);
    assert.ok(p.name);
    assert.ok(p.description);
    assert.strictEqual(p.id, 'signalk-rainviewer-charts');
  });

  it('should have a schema', () => {
    const app = makeApp();
    const p = plugin(app);
    assert.ok(p.schema);
    assert.strictEqual(p.schema.type, 'object');
    assert.ok(p.schema.properties.opacity);
    assert.ok(p.schema.properties.refreshInterval);
  });

  it('should have start and stop functions', () => {
    const app = makeApp();
    const p = plugin(app);
    assert.strictEqual(typeof p.start, 'function');
    assert.strictEqual(typeof p.stop, 'function');
  });

  it('start() should not throw', () => {
    const app = makeApp();
    const p = plugin(app);
    assert.doesNotThrow(() => p.start());
  });

  it('start() should not throw and set debug message', () => {
    const app = makeApp();
    const p = plugin(app);
    p.start();
    p.stop();
    assert.ok(app._calls.debug.length > 0);
  });

  it('stop() should clear the interval', () => {
    const app = makeApp();
    const p = plugin(app);
    p.start();
    p.stop();
    // Calling stop twice should be harmless
    assert.doesNotThrow(() => p.stop());
  });

  it('stop() should not throw when called without start', () => {
    const app = makeApp();
    const p = plugin(app);
    assert.doesNotThrow(() => p.stop());
  });

  it('should register the chart provider on fetch success', { timeout: 5000 }, async () => {
    const app = makeApp();
    const p = plugin(app);

    const originalGet = https.get;
    https.get = (url, cb) => {
      const res = new EventEmitter();
      const data = JSON.stringify({
        host: 'https://tile.rainviewer.com',
        radar: { past: [{ time: 1000, path: '/v/2/radar/1000' }] },
      });
      res.headers = { 'content-type': 'application/json' };
      process.nextTick(() => {
        res.emit('data', Buffer.from(data));
        res.emit('end');
      });
      cb(res);
      return { on: () => {} };
    };

    p.start();
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(app.resourcesApi.register.mock.callCount(), 1);
    const provider = app.resourcesApi.register.mock.calls[0].arguments[1];
    assert.strictEqual(provider.type, 'charts');

    p.stop();
    https.get = originalGet;
  });
});

describe('findLatestFrame', () => {
  it('should return the frame with the highest time', () => {
    const data = {
      radar: {
        past: [
          { time: 100, path: '/v1' },
          { time: 300, path: '/v3' },
          { time: 200, path: '/v2' },
        ],
      },
    };
    const result = plugin.findLatestFrame(data);
    assert.strictEqual(result.time, 300);
    assert.strictEqual(result.path, '/v3');
  });

  it('should return null if no frames', () => {
    assert.strictEqual(plugin.findLatestFrame({ radar: { past: [] } }), null);
  });

  it('should handle missing data gracefully', () => {
    assert.strictEqual(plugin.findLatestFrame(null), null);
    assert.strictEqual(plugin.findLatestFrame({}), null);
    assert.strictEqual(plugin.findLatestFrame({ radar: {} }), null);
  });
});

describe('buildTileUrl', () => {
  it('should construct the correct tile URL', () => {
    const url = plugin.buildTileUrl('https://tile.rainviewer.com', '/v/2/radar/1000');
    assert.strictEqual(url, 'https://tile.rainviewer.com/v/2/radar/1000/256/{z}/{x}/{y}/7/1_1.png');
  });
});

describe('createProvider', () => {
  it('should return a charts provider', () => {
    const ref = { current: 'https://tile.url/{z}/{x}/{y}.png' };
    const provider = plugin.createProvider(ref);
    assert.strictEqual(provider.type, 'charts');
    assert.ok(provider.methods.listResources);
    assert.ok(provider.methods.getResource);
    assert.ok(provider.methods.setResource);
    assert.ok(provider.methods.deleteResource);
  });

  it('listResources should return the chart when URL is set', async () => {
    const ref = { current: 'https://tile.url/1000/256/{z}/{x}/{y}/7/1_1.png' };
    const provider = plugin.createProvider(ref);
    const resources = await provider.methods.listResources();
    assert.ok(resources['rainviewer-radar']);
    assert.strictEqual(resources['rainviewer-radar'].identifier, 'rainviewer-radar');
  });

  it('listResources should return empty object when no URL', async () => {
    const ref = { current: null };
    const provider = plugin.createProvider(ref);
    const resources = await provider.methods.listResources();
    assert.deepStrictEqual(resources, {});
  });

  it('getResource should return the chart when URL is set', async () => {
    const ref = { current: 'https://tile.url/1000/256/{z}/{x}/{y}/7/1_1.png' };
    const provider = plugin.createProvider(ref);
    const resource = await provider.methods.getResource('rainviewer-radar');
    assert.strictEqual(resource.name, 'RainViewer Radar');
  });

  it('getResource should throw for unknown id', async () => {
    const ref = { current: 'https://tile.url/1000/256/{z}/{x}/{y}/7/1_1.png' };
    const provider = plugin.createProvider(ref);
    await assert.rejects(
      () => provider.methods.getResource('unknown'),
      /Resource unknown not found/
    );
  });

  it('getResource should throw when no URL', async () => {
    const ref = { current: null };
    const provider = plugin.createProvider(ref);
    await assert.rejects(
      () => provider.methods.getResource('rainviewer-radar'),
      /not yet available/
    );
  });

  it('setResource should throw', async () => {
    const ref = { current: null };
    const provider = plugin.createProvider(ref);
    await assert.rejects(
      () => provider.methods.setResource(),
      /read-only/
    );
  });

  it('deleteResource should throw', async () => {
    const ref = { current: null };
    const provider = plugin.createProvider(ref);
    await assert.rejects(
      () => provider.methods.deleteResource(),
      /read-only/
    );
  });
});
