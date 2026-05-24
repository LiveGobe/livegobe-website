/**
 * Unit tests for Module Resolver
 */

const { createModuleResolver } = require('../../src/modules/resolver');
const { createCacheStrategy } = require('../../src/wiki-api/cache-strategy');
const { getLogger } = require('../../src/logging/logger');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

describe('ModuleResolver', () => {
  let resolver;
  let mockAdapter;
  const mockLogger = getLogger();

  beforeEach(() => {
    mockAdapter = new MockAdapter(axios);
    const config = {
      wikiApi: {
        baseUrl: 'http://localhost:8080/api',
        version: 'v2',
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 50,
      },
      cache: {
        moduleCacheTTL: 60000,
        maxCacheSize: 104857600,
      }
    };

    const cacheStrategy = createCacheStrategy(config, mockLogger);
    resolver = createModuleResolver(config, cacheStrategy, mockLogger);
  });

  afterEach(() => {
    mockAdapter.reset();
  });

  describe('resolveModule()', () => {
    it('should resolve module from API', async () => {
      const moduleContent = 'exports.test = function() { return 5; }';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: moduleContent }
      });

      const result = await resolver.resolveModule('test-wiki', 'Items', 'module');

      expect(result).toBeDefined();
      expect(result.wiki).toBe('test-wiki');
      expect(result.moduleName).toBe('Items');
      expect(result.exists).toBe(true);
      expect(result.content).toBe(moduleContent);
    });

    it('should normalize module names', async () => {
      const moduleContent = 'exports.test = 5;';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: moduleContent }
      });

      // Should strip Module: prefix
      const result = await resolver.resolveModule('test-wiki', 'Module:Items', 'module');

      expect(result.moduleName).toBe('Items');
    });

    it('should cache resolution results', async () => {
      const moduleContent = 'exports.test = 5;';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: moduleContent }
      });

      const result1 = await resolver.resolveModule('test-wiki', 'Items', 'module');
      const result2 = await resolver.resolveModule('test-wiki', 'Items', 'module');

      expect(result1).toEqual(result2);
      // Should only make one API call (second comes from cache)
      expect(mockAdapter.history.get.length).toBe(1);
    });

    it('should handle non-existent modules', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:NonExistent').reply(404);

      const result = await resolver.resolveModule('test-wiki', 'NonExistent', 'module');

      expect(result).toBeDefined();
      expect(result.exists).toBe(false);
    });

    it('should handle data modules', async () => {
      const dataContent = JSON.stringify({ items: [1, 2, 3] });
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Data:Items').reply(200, {
        page: { content: dataContent }
      });

      const result = await resolver.resolveModule('test-wiki', 'Items', 'data');

      expect(result).toBeDefined();
      expect(result.content).toBe(dataContent);
    });
  });

  describe('resolveModulesBatch()', () => {
    it('should resolve multiple modules', async () => {
      mockAdapter
        .onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
          page: { content: 'exports.items = [];' }
        })
        .onGet('/v2/wikis/test-wiki/pages/Module:User').reply(200, {
          page: { content: 'exports.user = {};' }
        });

      const refs = [
        { ref: 'Items', type: 'module' },
        { ref: 'User', type: 'module' }
      ];

      const results = await resolver.resolveModulesBatch('test-wiki', refs);

      expect(results).toHaveLength(2);
      expect(results[0].moduleName).toBe('Items');
      expect(results[1].moduleName).toBe('User');
    });

    it('should not fail if one module fails', async () => {
      mockAdapter
        .onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
          page: { content: 'exports.items = [];' }
        })
        .onGet('/v2/wikis/test-wiki/pages/Module:Missing').reply(404);

      const refs = [
        { ref: 'Items', type: 'module' },
        { ref: 'Missing', type: 'module' }
      ];

      const results = await resolver.resolveModulesBatch('test-wiki', refs);

      expect(results).toHaveLength(2);
      expect(results[0].exists).toBe(true);
      expect(results[1].exists).toBe(false);
    });
  });

  describe('getModuleDependencies()', () => {
    it('should extract require() calls', async () => {
      const moduleContent = 'var items = require("Module:Items"); var users = require("Module:User");';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Main').reply(200, {
        page: { content: moduleContent }
      });

      const dependencies = await resolver.getModuleDependencies('test-wiki', 'Main');

      expect(Array.isArray(dependencies)).toBe(true);
      expect(dependencies.length).toBeGreaterThanOrEqual(2);
      expect(dependencies.some(d => d.ref.includes('Items'))).toBe(true);
      expect(dependencies.some(d => d.ref.includes('User'))).toBe(true);
    });

    it('should extract requireData() calls', async () => {
      const moduleContent = 'var items = requireData("items.json"); var users = requireData("users");';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Main').reply(200, {
        page: { content: moduleContent }
      });

      const dependencies = await resolver.getModuleDependencies('test-wiki', 'Main');

      expect(Array.isArray(dependencies)).toBe(true);
      expect(dependencies.some(d => d.type === 'data')).toBe(true);
    });

    it('should extract variable references in require calls', async () => {
      const moduleContent = 'var moduleName = "Items"; var mod = require("Module:" + moduleName);';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Main').reply(200, {
        page: { content: moduleContent }
      });

      const dependencies = await resolver.getModuleDependencies('test-wiki', 'Main');

      expect(Array.isArray(dependencies)).toBe(true);
    });

    it('should handle modules with no dependencies', async () => {
      const moduleContent = 'var x = 5; var y = x + 10; return y;';
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Simple').reply(200, {
        page: { content: moduleContent }
      });

      const dependencies = await resolver.getModuleDependencies('test-wiki', 'Simple');

      expect(Array.isArray(dependencies)).toBe(true);
      expect(dependencies.length).toBe(0);
    });
  });

  describe('moduleExists()', () => {
    it('should return true for existing module', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: 'exports.test = 5;' }
      });

      const exists = await resolver.moduleExists('test-wiki', 'Items');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent module', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:NonExistent').reply(404);

      const exists = await resolver.moduleExists('test-wiki', 'NonExistent');

      expect(exists).toBe(false);
    });
  });

  describe('cache behavior', () => {
    it('should respect cache TTL', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: 'exports.test = 5;' }
      });

      await resolver.resolveModule('test-wiki', 'Items', 'module');

      // Cache should prevent second API call
      await resolver.resolveModule('test-wiki', 'Items', 'module');

      expect(mockAdapter.history.get.length).toBe(1);
    });

    it('should allow cache invalidation', async () => {
      mockAdapter
        .onGet('/v2/wikis/test-wiki/pages/Module:Items')
        .reply(200, { page: { content: 'first version' } });

      const result1 = await resolver.resolveModule('test-wiki', 'Items', 'module');

      // Simulate change and invalidate
      resolver.invalidateModule('test-wiki', 'Items');

      mockAdapter
        .onGet('/v2/wikis/test-wiki/pages/Module:Items')
        .reply(200, { page: { content: 'second version' } });

      const result2 = await resolver.resolveModule('test-wiki', 'Items', 'module');

      expect(result1.content).toBe('first version');
      expect(result2.content).toBe('second version');
    });
  });

  describe('edge cases', () => {
    it('should handle circular dependencies', async () => {
      const aContent = 'var b = require("Module:B");';
      const bContent = 'var a = require("Module:A");';

      mockAdapter
        .onGet('/v2/wikis/test-wiki/pages/Module:A').reply(200, {
          page: { content: aContent }
        })
        .onGet('/v2/wikis/test-wiki/pages/Module:B').reply(200, {
          page: { content: bContent }
        });

      const depsA = await resolver.getModuleDependencies('test-wiki', 'A');
      const depsB = await resolver.getModuleDependencies('test-wiki', 'B');

      expect(Array.isArray(depsA)).toBe(true);
      expect(Array.isArray(depsB)).toBe(true);
    });

    it('should handle very large modules', async () => {
      const largeContent = 'var x = ' + JSON.stringify({
        data: Array(1000).fill({ id: 1, name: 'test' })
      }) + ';';

      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Large').reply(200, {
        page: { content: largeContent }
      });

      const result = await resolver.resolveModule('test-wiki', 'Large', 'module');

      expect(result.exists).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should handle special characters in module names', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Test-Items-v2').reply(200, {
        page: { content: 'exports.test = 5;' }
      });

      const result = await resolver.resolveModule('test-wiki', 'Test-Items-v2', 'module');

      expect(result.moduleName).toBe('Test-Items-v2');
    });
  });
});
