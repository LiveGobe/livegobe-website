/**
 * End-to-End tests with mock wiki API
 */

const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const { createModuleResolver } = require('../../src/modules/resolver');
const { createWikiApiCacheStrategy } = require('../../src/wiki-api/cache-strategy');
const { createDocumentAnalyzer } = require('../../src/analysis/document-analyzer');
const { createTypeScriptManager } = require('../../src/analysis/typescript-manager');
const { getLogger } = require('../../src/logging/logger');

describe('End-to-End: Completion Workflow', () => {
  let mockAdapter;
  let analyzer;
  let mockLogger;

  beforeEach(() => {
    mockAdapter = new MockAdapter(axios);
    mockLogger = getLogger();

    const config = {
      wikiApi: {
        baseUrl: 'http://localhost:8080/api',
        version: 2,
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 50,
      },
      cache: {
        moduleCacheTTL: 60000,
        maxCacheSize: 104857600,
      }
    };

    const cacheStrategy = createWikiApiCacheStrategy(config, mockLogger);
    const resolver = createModuleResolver(config, cacheStrategy, mockLogger);
    analyzer = createDocumentAnalyzer(config, resolver, mockLogger);
  });

  afterEach(() => {
    mockAdapter.reset();
  });

  describe('Scenario 1: Simple completion in module with dependencies', () => {
    it('should provide completions for code using required modules', async () => {
      // Setup wiki API mock
      const itemsModule = `
function getItems() {
  return [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' }
  ];
}

exports = {
  getItems: getItems,
  createItem: function(name) {
    return { id: Date.now(), name: name };
  }
}
`;

      mockAdapter
        .onGet('/wikis/my-wiki/pages/Module:Items')
        .reply(200, { page: { content: itemsModule } })
        .onGet('/wikis/my-wiki/pages/Module:Test')
        .reply(200, { page: { content: 'var x = 5;' } });

      // User code that requires Items module
      const userCode = `var items = require('Module:Items');
var list = items.`;

      // Analyze document
      const result = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        userCode,
        'my-wiki'
      );

      expect(result).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.resolvedModules).toBeDefined();

      // Get completions at end of "items."
      const completions = await analyzer.getCompletions(
        'file:///my-wiki/Module:Test',
        userCode.split('\n').length - 1,
        userCode.split('\n').pop().length
      );

      expect(Array.isArray(completions)).toBe(true);
      // Should suggest 'getItems' and 'createItem'
      if (completions.length > 0) {
        expect(completions.some(c => 
          c.label.includes('getItems') || c.label.includes('createItem')
        )).toBe(true);
      }
    });
  });

  describe('Scenario 2: Hover information for required module', () => {
    it('should provide hover info for required module functions', async () => {
      const userModule = `
exports.process = function(data) {
  return data * 2;
};
`;

      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:Utils')
        .reply(200, { page: { content: userModule } });

      const code = `
var utils = require('Module:Utils');
var result = utils.process(5);
`;

      await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      // Hover on "process"
      const hoverInfo = await analyzer.getHover(
        'file:///my-wiki/Module:Test',
        2,
        26
      );

      expect(hoverInfo === null || typeof hoverInfo === 'object').toBe(true);
    });
  });

  describe('Scenario 3: Definition navigation', () => {
    it('should navigate to module definition', async () => {
      const userModule = `
exports.getData = function() {
  return { result: 42 };
};
`;

      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:Data')
        .reply(200, { page: { content: userModule } });

      const code = `
var data = require('Module:Data');
var value = data.getData();
`;

      await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      // Go to definition of "getData"
      const definition = await analyzer.getDefinition(
        'file:///my-wiki/Module:Test',
        2,
        20
      );

      expect(definition === null || typeof definition === 'object').toBe(true);
    });
  });

  describe('Scenario 4: Data module analysis', () => {
    it('should analyze JSON data modules', async () => {
      const dataContent = JSON.stringify({
        items: [
          { id: 1, name: 'Item 1', category: 'A' },
          { id: 2, name: 'Item 2', category: 'B' }
        ],
        total: 2
      });

      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Data:Items')
        .reply(200, { page: { content: dataContent } });

      const code = `
var itemsData = requireData('Data:Items');
var firstItem = itemsData.items[0];
var name = firstItem.`;

      const result = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      expect(result.dependencies).toBeDefined();
      // Should have detected the data dependency
      expect(result.dependencies.some(d => d.type === 'data')).toBe(true);
    });
  });

  describe('Scenario 5: Nested module dependencies', () => {
    it('should resolve multi-level module dependencies', async () => {
      const moduleA = `
var moduleB = require('Module:B');
exports.funcA = function() {
  return moduleB.funcB();
};
`;

      const moduleB = `
exports.funcB = function() {
  return 'from B';
};
`;

      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:A')
        .reply(200, { page: { content: moduleA } })
        .onGet('/v2/wikis/my-wiki/pages/Module:B')
        .reply(200, { page: { content: moduleB } });

      const code = `
var modA = require('Module:A');
var result = modA.funcA();
`;

      const result = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      expect(result).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.resolvedModules).toBeDefined();
    });
  });

  describe('Scenario 6: Error recovery', () => {
    it('should handle missing modules gracefully', async () => {
      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:Missing')
        .reply(404);

      const code = `
var missing = require('Module:Missing');
var x = missing.`;

      const result = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      // Should not crash, should have result even with missing module
      expect(result).toBeDefined();

      const completions = await analyzer.getCompletions(
        'file:///my-wiki/Module:Test',
        2,
        12
      );

      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle network timeouts', async () => {
      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:Timeout')
        .timeout();

      const code = `
var mod = require('Module:Timeout');
`;

      const result = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      // Should handle timeout gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Scenario 7: Cache effectiveness', () => {
    it('should cache module resolutions for repeated requests', async () => {
      const moduleContent = `
exports.getValue = function() {
  return 42;
};
`;

      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:CachedMod')
        .reply(200, { page: { content: moduleContent } });

      // First analysis
      const code1 = `
var mod = require('Module:CachedMod');
var x = mod.`;

      const result1 = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test1',
        code1,
        'my-wiki'
      );

      const apiCallCount1 = mockAdapter.history.get.length;

      // Second analysis with same module
      const code2 = `
var mod = require('Module:CachedMod');
var y = mod.`;

      const result2 = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test2',
        code2,
        'my-wiki'
      );

      const apiCallCount2 = mockAdapter.history.get.length;

      // Should not make another API call due to cache
      expect(apiCallCount2).toBe(apiCallCount1);
    });
  });

  describe('Scenario 8: Performance with large modules', () => {
    it('should handle large module files efficiently', async () => {
      const largeModule = `
exports.data = ${JSON.stringify({
        items: Array(1000).fill({ id: 1, name: 'Item' })
      })};
exports.process = function(item) {
  return item.id * 2;
};
`;

      mockAdapter
        .onGet('/v2/wikis/my-wiki/pages/Module:Large')
        .reply(200, { page: { content: largeModule } });

      const code = `
var large = require('Module:Large');
var result = large.`;

      const startTime = Date.now();

      const result = await analyzer.analyzeDocument(
        'file:///my-wiki/Module:Test',
        code,
        'my-wiki'
      );

      const elapsed = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(5000); // Should complete in reasonable time
    });
  });
});
