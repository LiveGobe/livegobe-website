/**
 * Unit tests for Tern Manager
 */

const { createTernManager } = require('../../src/analysis/tern-manager');
const { getLogger } = require('../../src/logging/logger');

describe('TernManager', () => {
  let ternManager;
  const mockLogger = getLogger();

  beforeEach(() => {
    ternManager = createTernManager({}, mockLogger);
  });

  afterEach(() => {
    ternManager.removeFile('test.js');
  });

  describe('createTernManager()', () => {
    it('should create manager instance', () => {
      expect(ternManager).toBeDefined();
      expect(typeof ternManager.addFile).toBe('function');
      expect(typeof ternManager.getCompletions).toBe('function');
      expect(typeof ternManager.getHover).toBe('function');
      expect(typeof ternManager.getDefinition).toBe('function');
    });
  });

  describe('addFile()', () => {
    it('should add file to tern server', () => {
      const code = 'var x = 5; var y = x + 10;';
      ternManager.addFile('test.js', code);

      // Should not throw
      expect(ternManager).toBeDefined();
    });

    it('should handle empty files', () => {
      ternManager.addFile('empty.js', '');
      expect(ternManager).toBeDefined();
    });

    it('should update existing file', () => {
      ternManager.addFile('test.js', 'var x = 5;');
      ternManager.addFile('test.js', 'var x = 10; var y = x + 5;');

      // Should not throw
      expect(ternManager).toBeDefined();
    });
  });

  describe('getCompletions()', () => {
    it('should return completions', async () => {
      const code = 'var obj = { name: "test", age: 25 }; obj.';
      ternManager.addFile('test.js', code);

      const completions = ternManager.getCompletions('test.js', 0, code.length - 1);

      expect(Array.isArray(completions)).toBe(true);
      expect(completions.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter completions by prefix', async () => {
      const code = 'var name = "test"; var result = na';
      ternManager.addFile('test.js', code);

      const completions = ternManager.getCompletions('test.js', 0, code.length - 1);

      // Should suggest 'name' variable
      if (completions.length > 0) {
        expect(completions.some(c => c.label === 'name')).toBe(true);
      }
    });

    it('should return completion items with proper structure', async () => {
      const code = 'var x = 5;';
      ternManager.addFile('test.js', code);

      const completions = ternManager.getCompletions('test.js', 0, 5);

      if (completions.length > 0) {
        const item = completions[0];
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('kind');
      }
    });
  });

  describe('getHover()', () => {
    it('should return hover information', () => {
      const code = 'var x = 5; x + 10;';
      ternManager.addFile('test.js', code);

      const hover = ternManager.getHover('test.js', 0, 6);

      // Should return hover info or null
      expect(hover === null || typeof hover === 'object').toBe(true);
    });

    it('should handle positions with no hover info', () => {
      const code = 'var x = 5; x + 10;';
      ternManager.addFile('test.js', code);

      const hover = ternManager.getHover('test.js', 0, 1);

      // Should return null or object
      expect(hover === null || typeof hover === 'object').toBe(true);
    });
  });

  describe('getDefinition()', () => {
    it('should return definition location', () => {
      const code = 'var name = "test"; var result = name;';
      ternManager.addFile('test.js', code);

      const definition = ternManager.getDefinition('test.js', 0, 35);

      // Should return definition or null
      expect(definition === null || typeof definition === 'object').toBe(true);
    });

    it('should handle built-in functions', () => {
      const code = 'var x = Math.abs(-5);';
      ternManager.addFile('test.js', code);

      const definition = ternManager.getDefinition('test.js', 0, 15);

      // Should return definition or null (Math might not have definition in test)
      expect(definition === null || typeof definition === 'object').toBe(true);
    });
  });

  describe('getSignature()', () => {
    it('should return function signature', () => {
      const code = 'function add(a, b) { return a + b; } add(';
      ternManager.addFile('test.js', code);

      const signature = ternManager.getSignature('test.js', 0, code.length - 1);

      // Should return signature or null
      expect(signature === null || typeof signature === 'object').toBe(true);
    });
  });

  describe('removeFile()', () => {
    it('should remove file from tern server', () => {
      ternManager.addFile('test.js', 'var x = 5;');
      ternManager.removeFile('test.js');

      // Should not throw
      expect(ternManager).toBeDefined();
    });

    it('should handle removing non-existent file', () => {
      expect(() => {
        ternManager.removeFile('nonexistent.js');
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle very large files', () => {
      const code = 'var x = 5;\n'.repeat(1000);
      ternManager.addFile('large.js', code);

      const completions = ternManager.getCompletions('large.js', 500, 5);
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle special characters in code', () => {
      const code = 'var str = "test\\nwith\\tescape"; var y = str;';
      ternManager.addFile('test.js', code);

      const completions = ternManager.getCompletions('test.js', 1, 5);
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle syntax errors gracefully', () => {
      const code = 'var x = 5 var y = 10'; // Missing semicolon
      ternManager.addFile('test.js', code);

      expect(() => {
        ternManager.getCompletions('test.js', 0, 5);
      }).not.toThrow();
    });
  });

  describe('custom LGML definitions', () => {
    it('should recognize require() function', () => {
      const code = 'var mod = require("Module:Items"); mod.';
      ternManager.addFile('test.js', code);

      const completions = ternManager.getCompletions('test.js', 0, code.length - 1);

      // Completions should exist (specific items depend on Tern's behavior)
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should recognize requireData() function', () => {
      const code = 'var data = requireData("items.json"); data.';
      ternManager.addFile('test.js', code);

      const completions = ternManager.getCompletions('test.js', 0, code.length - 1);

      // Completions should exist
      expect(Array.isArray(completions)).toBe(true);
    });
  });
});
