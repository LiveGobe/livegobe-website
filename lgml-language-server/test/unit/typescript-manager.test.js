/**
 * Unit tests for TypeScript Manager
 */

const { createTypeScriptManager } = require('../../src/analysis/typescript-manager');
const { getLogger } = require('../../src/logging/logger');

describe('TypeScriptManager', () => {
  let tsManager;
  const mockLogger = getLogger();

  beforeEach(() => {
    tsManager = createTypeScriptManager({});
  });

  afterEach(() => {
    tsManager.removeFile('test.js');
  });

  describe('createTypeScriptManager()', () => {
    it('should create manager instance', () => {
      expect(tsManager).toBeDefined();
      expect(typeof tsManager.addFile).toBe('function');
      expect(typeof tsManager.getCompletions).toBe('function');
      expect(typeof tsManager.getHover).toBe('function');
      expect(typeof tsManager.getDefinition).toBe('function');
      expect(typeof tsManager.getSignature).toBe('function');
    });
  });

  describe('addFile()', () => {
    it('should add file to TypeScript service', () => {
      const code = 'var x = 5; var y = x + 10;';
      tsManager.addFile('test.js', code);

      // Should not throw
      expect(tsManager).toBeDefined();
    });

    it('should handle empty files', () => {
      tsManager.addFile('empty.js', '');
      expect(tsManager).toBeDefined();
    });

    it('should update existing file', () => {
      tsManager.addFile('test.js', 'var x = 5;');
      tsManager.addFile('test.js', 'var x = 10; var y = x + 5;');

      // Should not throw
      expect(tsManager).toBeDefined();
    });

    it('should increment version on file update', () => {
      const code = 'var x = 5;';
      tsManager.addFile('test.js', code);
      const stats1 = tsManager.getStats();
      const version1 = stats1.files[0].version;

      tsManager.addFile('test.js', code + ' var y = 10;');
      const stats2 = tsManager.getStats();
      const version2 = stats2.files[0].version;

      expect(version2).toBeGreaterThan(version1);
    });
  });

  describe('getCompletions()', () => {
    it('should return completions', async () => {
      const code = 'var x = 5;\nx.';
      tsManager.addFile('test.js', code);

      const completions = await tsManager.getCompletions('test.js', 1, 2);

      expect(Array.isArray(completions)).toBe(true);
    });

    it('should return completion items with proper structure', async () => {
      const code = 'var x = 5;\nvar y = ';
      tsManager.addFile('test.js', code);

      const completions = await tsManager.getCompletions('test.js', 1, 8);

      if (completions.length > 0) {
        const item = completions[0];
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('kind');
        expect(item).toHaveProperty('detail');
        expect(item).toHaveProperty('sortText');
        expect(item).toHaveProperty('insertText');
      }
    });

    it('should handle undefined file gracefully', async () => {
      const completions = await tsManager.getCompletions('nonexistent.js', 0, 0);
      expect(completions).toEqual([]);
    });
  });

  describe('getType()', () => {
    it('should return type information', async () => {
      const code = 'var x = 5; x';
      tsManager.addFile('test.js', code);

      const typeInfo = await tsManager.getType('test.js', 0, 11);

      if (typeInfo) {
        expect(typeInfo).toHaveProperty('type');
        expect(typeInfo).toHaveProperty('kind');
      }
    });

    it('should return null for undefined symbols', async () => {
      const code = '';
      tsManager.addFile('test.js', code);

      const typeInfo = await tsManager.getType('test.js', 0, 0);
      expect(typeInfo).toBeNull();
    });

    it('should handle undefined file gracefully', async () => {
      const typeInfo = await tsManager.getType('nonexistent.js', 0, 0);
      expect(typeInfo).toBeNull();
    });
  });

  describe('getHover()', () => {
    it('should return hover information', async () => {
      const code = 'var x = 5; x + 10;';
      tsManager.addFile('test.js', code);

      const hover = await tsManager.getHover('test.js', 0, 10);

      expect(hover === null || typeof hover === 'object').toBe(true);
    });

    it('should format hover content correctly', async () => {
      const code = 'var x: number = 5; x';
      tsManager.addFile('test.js', code);

      const hover = await tsManager.getHover('test.js', 0, 20);

      if (hover) {
        expect(hover).toHaveProperty('contents');
      }
    });
  });

  describe('getDefinition()', () => {
    it('should handle definition requests', async () => {
      const code = 'var x = 5; x + 10;';
      tsManager.addFile('test.js', code);

      const definition = await tsManager.getDefinition('test.js', 0, 10);

      // Should return definition or null
      expect(definition === null || typeof definition === 'object').toBe(true);
    });

    it('should return null for undefined file', async () => {
      const definition = await tsManager.getDefinition('nonexistent.js', 0, 0);
      expect(definition).toBeNull();
    });
  });

  describe('getSignature()', () => {
    it('should handle signature requests', async () => {
      const code = 'function add(a: number, b: number): number { return a + b; } add(';
      tsManager.addFile('test.js', code);

      const signature = await tsManager.getSignature('test.js', 0, code.length - 1);

      // Should return signature or null
      expect(signature === null || typeof signature === 'object').toBe(true);
    });

    it('should return null for undefined file', async () => {
      const signature = await tsManager.getSignature('nonexistent.js', 0, 0);
      expect(signature).toBeNull();
    });
  });

  describe('removeFile()', () => {
    it('should remove file from tracking', () => {
      const code = 'var x = 5;';
      tsManager.addFile('test.js', code);

      let stats = tsManager.getStats();
      expect(stats.filesTracked).toBeGreaterThan(0);

      tsManager.removeFile('test.js');
      stats = tsManager.getStats();

      expect(stats.files.find(f => f.uri === 'test.js')).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('should return statistics', () => {
      const code = 'var x = 5;';
      tsManager.addFile('test.js', code);

      const stats = tsManager.getStats();

      expect(stats).toHaveProperty('filesTracked');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('files');
      expect(Array.isArray(stats.files)).toBe(true);
    });

    it('should track file size correctly', () => {
      const code = 'var x = 5;';
      tsManager.addFile('test.js', code);

      const stats = tsManager.getStats();
      const file = stats.files.find(f => f.uri === 'test.js');

      expect(file.size).toBe(code.length);
    });
  });

  describe('getDocumentSymbols()', () => {
    it('should return document symbols', async () => {
      const code = 'function myFunc() {} var x = 5;';
      tsManager.addFile('test.js', code);

      const symbols = await tsManager.getDocumentSymbols('test.js');

      expect(Array.isArray(symbols)).toBe(true);
    });

    it('should return empty array for undefined file', async () => {
      const symbols = await tsManager.getDocumentSymbols('nonexistent.js');
      expect(symbols).toEqual([]);
    });
  });
});
